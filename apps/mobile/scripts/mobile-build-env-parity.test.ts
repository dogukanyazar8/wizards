import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * `EXPO_PUBLIC_*` values are inlined at bundle time, so a variable that the app
 * reads but a build pipeline never exports silently disappears from the APK.
 * That is exactly how native Google sign-in ended up falling back to the browser
 * on real devices while working in the Metro/dev flow, where `.env.local` is
 * read directly. These assertions keep every shipping pipeline in sync with the
 * runtime config.
 */
const MOBILE_ROOT = path.join(__dirname, "..");
const RUNTIME_REQUIRED_PUBLIC_ENV = [
  "EXPO_PUBLIC_WHISPR_API_URL",
  "EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_WHISPR_SOCKET_URL",
  "EXPO_PUBLIC_WHISPR_WEB_URL",
] as const;
const RELEASE_EAS_PROFILES = ["uat", "canary", "production"] as const;

function readMobileFile(relativePath: string) {
  return readFileSync(path.join(MOBILE_ROOT, relativePath), "utf8");
}

describe("mobile build environment parity", () => {
  it("keeps the required public variables actually read by the runtime config", () => {
    const environmentSource = readMobileFile("src/config/environment.ts");

    for (const name of RUNTIME_REQUIRED_PUBLIC_ENV) {
      assert.ok(
        environmentSource.includes(`process.env.${name}`),
        `${name} is no longer read by src/config/environment.ts`,
      );
    }
  });

  it("exports every required variable from the local Android UAT build script", () => {
    const buildScript = readMobileFile("scripts/build-android-uat.ps1");

    // The workspace sync excludes .env files, so the script must supply them.
    assert.match(buildScript, /\$excludedFiles = @\(\s*"\.env",\s*"\.env\.\*"/);

    for (const name of RUNTIME_REQUIRED_PUBLIC_ENV) {
      assert.match(
        buildScript,
        new RegExp(`\\$env:${name}\\s*=`),
        `build-android-uat.ps1 never sets ${name}, so the APK would ship without it`,
      );
    }

    assert.match(
      buildScript,
      /Get-DotEnvValue -MobileRoot \$sourceMobileRoot -Name "EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID"/,
      "the Google client id must still be recovered from the source .env files",
    );
  });

  it("fails release APK builds loudly instead of shipping the browser fallback", () => {
    const packageJson = JSON.parse(readMobileFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const releaseScripts = Object.entries(packageJson.scripts).filter(
      ([name, command]) => name.startsWith("android:") && command.includes("-BuildType release"),
    );

    assert.ok(releaseScripts.length > 0, "no release APK script found");

    for (const [name, command] of releaseScripts) {
      assert.match(
        command,
        /-RequireGoogleSignIn\b/,
        `${name} can produce a release APK without the Google client id`,
      );
    }
  });

  it("declares every required variable in each shipping EAS profile", () => {
    const easConfig = JSON.parse(readMobileFile("eas.json")) as {
      build: Record<string, { env?: Record<string, string> }>;
    };

    for (const profile of RELEASE_EAS_PROFILES) {
      const profileEnv = easConfig.build[profile]?.env ?? {};

      for (const name of RUNTIME_REQUIRED_PUBLIC_ENV) {
        assert.ok(
          typeof profileEnv[name] === "string" && profileEnv[name].length > 0,
          `eas.json build.${profile}.env is missing ${name}`,
        );
      }
    }
  });

  it("only ever configures a Google *web* OAuth client id", () => {
    const easConfig = JSON.parse(readMobileFile("eas.json")) as {
      build: Record<string, { env?: Record<string, string> }>;
    };

    for (const [profile, definition] of Object.entries(easConfig.build)) {
      const clientId = definition.env?.EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID;

      if (clientId !== undefined) {
        assert.ok(
          clientId.endsWith(".apps.googleusercontent.com"),
          `eas.json build.${profile} has a malformed Google client id`,
        );
      }
    }
  });
});

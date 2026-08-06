import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("mobile Gradle memory config", () => {
  it("gives Expo prebuild enough metaspace for the release build", () => {
    const rawConfig = execFileSync(
      process.execPath,
      [expoCli, "config", "--type", "introspect", "--json"],
      {
        cwd: mobileRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          WHISPR_MOBILE_BUILD_ID: "71d4c7520000",
          WHISPR_MOBILE_ENV: "uat",
        },
      },
    );
    const config = JSON.parse(rawConfig) as {
      _internal: {
        modResults: {
          android: {
            gradleProperties: Array<{
              key?: string;
              type: string;
              value?: string;
            }>;
          };
        };
      };
    };
    const gradleJvmArgs = config._internal.modResults.android.gradleProperties.filter(
      (property) => property.type === "property" && property.key === "org.gradle.jvmargs",
    );

    assert.deepEqual(gradleJvmArgs, [
      {
        key: "org.gradle.jvmargs",
        type: "property",
        value: "-Xmx2048m -XX:MaxMetaspaceSize=1024m",
      },
    ]);
  });
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { MOBILE_AUTOMATED_GATES } from "../src/quality/mobile-quality-gate";
import { MOBILE_AUTH_SCREEN_TEST_IDS } from "../src/app/screens/auth/mobile-auth-screen-contract";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const authFlowPath = path.join(repositoryRoot, ".maestro", "phase2-auth-navigation.yml");
const authFlowSource = existsSync(authFlowPath) ? readFileSync(authFlowPath, "utf8") : "";
const loginHelperPath = path.join(repositoryRoot, ".maestro", "helpers", "login-uat.yml");
const loginHelperSource = readFileSync(loginHelperPath, "utf8");

const authTestIdSources: Record<string, { file: string; needle: string }> = {
  "mobile-auth-forgot-back-to-sign-in": {
    file: "src/app/screens/auth/auth-forgot-password-screen.tsx",
    needle: 'testID="mobile-auth-forgot-back-to-sign-in"',
  },
  "mobile-auth-forgot-password-screen": {
    file: "src/app/screens/auth/auth-forgot-password-screen.tsx",
    needle: 'testID="mobile-auth-forgot-password-screen"',
  },
  "mobile-auth-login-forgot-password": {
    file: "src/app/screens/auth/auth-login-screen.tsx",
    needle: 'testID="mobile-auth-login-forgot-password"',
  },
  "mobile-auth-login-register": {
    file: "src/app/screens/auth/auth-login-screen.tsx",
    needle: 'testID="mobile-auth-login-register"',
  },
  "mobile-auth-login-screen": {
    file: "src/app/screens/auth/auth-login-screen.tsx",
    needle: 'testID="mobile-auth-login-screen"',
  },
  "mobile-auth-login-top-bar-back": {
    file: "src/app/screens/auth/auth-login-screen.tsx",
    needle: 'testID="mobile-auth-login-top-bar"',
  },
  "mobile-auth-register-screen": {
    file: "src/app/screens/auth/auth-register-screen.tsx",
    needle: 'testID="mobile-auth-register-screen"',
  },
  "mobile-auth-register-top-bar-back": {
    file: "src/app/screens/auth/auth-register-screen.tsx",
    needle: 'testID="mobile-auth-register-top-bar"',
  },
  "mobile-auth-welcome-screen": {
    file: "src/app/screens/auth/auth-welcome-screen.tsx",
    needle: 'testID="mobile-auth-welcome-screen"',
  },
  "mobile-auth-welcome-sign-in": {
    file: "src/app/screens/auth/auth-welcome-screen.tsx",
    needle: 'testID="mobile-auth-welcome-sign-in"',
  },
  "mobile-auth-welcome-sign-up": {
    file: "src/app/screens/auth/auth-welcome-screen.tsx",
    needle: 'testID="mobile-auth-welcome-sign-up"',
  },
};

const forbiddenFlowPatterns = [
  /\binputText\s*:/i,
  /EXPO_PUBLIC_WHISPR_DEV_LOGIN/i,
  /MAESTRO_UAT_(?:EMAIL|PASSWORD)/i,
  /WHISPR_MOBILE_E2E_(?:EMAIL|PASSWORD)/i,
  /\bturnstileToken\b/i,
  /(?:\/api\/auth|\/auth\/(?:login|register|forgot|password))/i,
  /\bretry\b/i,
  /takeScreenshot\s*:/i,
  /mobile-auth-login-fill-dev-credentials/i,
  /mobile-auth-login-web-sign-in/i,
  /mobile-auth-register-(?:terms|privacy)-link/i,
  /mobile-auth-(?:login|register|forgot)-submit/i,
] as const;

function getAuthFlowIds(source: string) {
  return [...source.matchAll(/\bid:\s*"(mobile-auth-[^"]+)"/g)].map((match) => match[1]);
}

describe("signed-out auth navigation Maestro contract", () => {
  it("keeps every auth route and control in the dedicated public-to-protected navigation flow", () => {
    assert.ok(authFlowSource, ".maestro/phase2-auth-navigation.yml must exist");

    assert.match(
      authFlowSource,
      /^appId:\s*team\.whispr\.mobile\r?\n---\r?\n- launchApp:\r?\n\s+clearState:\s*true\r?\n- openLink:\s*"whispr:\/\/settings"\r?\n- extendedWaitUntil:\r?\n\s+visible:\r?\n\s+id:\s*"mobile-settings-screen"[\s\S]*?- tapOn:\r?\n\s+id:\s*"mobile-bottom-tab-overview"/,
    );

    const flowIds = [...new Set(getAuthFlowIds(authFlowSource))].sort();
    assert.deepEqual(flowIds, Object.keys(authTestIdSources).sort());
    for (const testId of flowIds) {
      const contract = authTestIdSources[testId];
      assert.ok(contract, `No production source contract exists for ${testId}`);
      const source = readFileSync(path.join(process.cwd(), contract.file), "utf8");
      assert.ok(source.includes(contract.needle), `${testId} is missing from ${contract.file}`);
    }

    for (const rootId of MOBILE_AUTH_SCREEN_TEST_IDS) {
      assert.match(authFlowSource, new RegExp(`id:\\s*"${rootId}"`));
    }
    const authTopBarSource = readFileSync(
      path.join(process.cwd(), "src/app/components/kit/auth/auth-top-bar.tsx"),
      "utf8",
    );
    assert.ok(authTopBarSource.includes('testID={testID ? `${testID}-back` : undefined}'));

    assert.match(
      authFlowSource,
      /mobile-auth-welcome-screen[\s\S]*?mobile-auth-welcome-sign-in[\s\S]*?mobile-auth-login-screen[\s\S]*?mobile-auth-login-forgot-password[\s\S]*?mobile-auth-forgot-password-screen[\s\S]*?mobile-auth-forgot-back-to-sign-in[\s\S]*?mobile-auth-login-screen[\s\S]*?mobile-auth-login-register[\s\S]*?mobile-auth-register-screen[\s\S]*?mobile-auth-register-top-bar-back[\s\S]*?mobile-auth-login-screen[\s\S]*?mobile-auth-login-top-bar-back[\s\S]*?mobile-auth-welcome-screen[\s\S]*?mobile-auth-welcome-sign-up[\s\S]*?mobile-auth-register-screen[\s\S]*?mobile-auth-register-top-bar-back[\s\S]*?mobile-auth-welcome-screen/,
    );
    assert.doesNotMatch(authFlowSource, /turnstile|cloudflare/i);
    for (const pattern of forbiddenFlowPatterns) {
      assert.doesNotMatch(authFlowSource, pattern);
    }
  });

  it("keeps the shared UAT helper a signed-in no-op and a transparent signed-out login-surface assertion", () => {
    assert.match(
      loginHelperSource,
      /when:\s*\r?\n\s+visible:\s*\r?\n\s+id:\s*"mobile-settings-web-sign-in-action"/,
    );
    assert.match(
      loginHelperSource,
      /id:\s*"mobile-bottom-tab-overview"[\s\S]*?id:\s*"mobile-auth-welcome-screen"[\s\S]*?id:\s*"mobile-auth-welcome-sign-in"[\s\S]*?id:\s*"mobile-auth-login-screen"/,
    );
    assert.doesNotMatch(loginHelperSource, /mobile-auth-screen/);
    assert.doesNotMatch(loginHelperSource, /(?:development|fill-dev|inputText|turnstileToken|retry)/i);
    assert.doesNotMatch(loginHelperSource, /mobile-auth-(?:login|register|forgot)-submit/);
  });

  it("covers both signed-out helper call contexts before it proves the native login surface", () => {
    assert.match(
      loginHelperSource,
      /when:\s*\r?\n\s+visible:\s*\r?\n\s+id:\s*"mobile-settings-web-sign-in-action"[\s\S]*?id:\s*"mobile-bottom-tab-overview"[\s\S]*?id:\s*"mobile-auth-welcome-screen"/,
    );
    assert.match(
      loginHelperSource,
      /when:\s*\r?\n\s+visible:\s*\r?\n\s+id:\s*"mobile-auth-welcome-screen"[\s\S]*?id:\s*"mobile-auth-welcome-sign-in"[\s\S]*?id:\s*"mobile-auth-login-screen"/,
    );
  });

  it("registers signed-out native auth navigation as an Android Maestro gate", () => {
    assert.ok(
      MOBILE_AUTOMATED_GATES.some(
        (gate) =>
          gate.id === "mobile-maestro-auth-navigation" &&
          gate.command === "maestro test ../../.maestro/phase2-auth-navigation.yml" &&
          /signed-out auth navigation/i.test(gate.purpose),
      ),
    );
  });
});

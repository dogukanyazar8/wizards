import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("mobile dev login helper", () => {
  it("keeps real development credentials out of committed source", () => {
    const authSource = readFileSync(
      resolve(__dirname, "../src/auth/mobile-dev-login.ts"),
      "utf8",
    );
    const containerSource = readFileSync(
      resolve(__dirname, "../src/app/screens/auth/mobile-auth-screen-containers.tsx"),
      "utf8",
    );
    const screenSource = readFileSync(
      resolve(__dirname, "../src/app/screens/auth/auth-login-screen.tsx"),
      "utf8",
    );

    assert.match(authSource, /EXPO_PUBLIC_WHISPR_DEV_LOGIN_EMAIL/);
    assert.match(authSource, /EXPO_PUBLIC_WHISPR_DEV_LOGIN_PASSWORD/);
    assert.match(authSource, /__DEV__/);
    assert.match(authSource, /if \(!isDevelopmentRuntime\(\)\) \{\s*return null;/);
    assert.match(containerSource, /const developmentCredentials = getMobileDevLoginCredentials\(\);/);
    assert.match(screenSource, /onPress=\{handleFillDevelopmentCredentials\}/);
    assert.doesNotMatch(`${authSource}\n${containerSource}\n${screenSource}`, /password:\s*["'`]/i);
    assert.doesNotMatch(`${authSource}\n${containerSource}\n${screenSource}`, /email:\s*["'`]/i);
    assert.doesNotMatch(screenSource, /useState\(developmentCredentials\)/);
  });
});

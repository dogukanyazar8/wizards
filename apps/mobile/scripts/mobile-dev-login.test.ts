import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { getMobileDevLoginCredentials } from "../src/auth/mobile-dev-login";

const DEV_LOGIN_ENV_KEYS = [
  "EXPO_PUBLIC_WHISPR_DEV_LOGIN_EMAIL",
  "EXPO_PUBLIC_WHISPR_DEV_LOGIN_PASSWORD",
  "NODE_ENV",
] as const;

type DevLoginEnvironmentKey = (typeof DEV_LOGIN_ENV_KEYS)[number];

function setDevLoginEnvironment(key: DevLoginEnvironmentKey, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function withControlledDevLoginRuntime(run: () => void) {
  const runtimeGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDevDescriptor = Object.getOwnPropertyDescriptor(runtimeGlobal, "__DEV__");
  const originalEnvironment = Object.fromEntries(
    DEV_LOGIN_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<DevLoginEnvironmentKey, string | undefined>;

  try {
    run();
  } finally {
    for (const key of DEV_LOGIN_ENV_KEYS) {
      setDevLoginEnvironment(key, originalEnvironment[key]);
    }

    if (originalDevDescriptor) {
      Object.defineProperty(runtimeGlobal, "__DEV__", originalDevDescriptor);
    } else {
      delete runtimeGlobal.__DEV__;
    }
  }
}

function setExplicitDevRuntime(value: boolean | undefined) {
  const runtimeGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };

  if (value === undefined) {
    delete runtimeGlobal.__DEV__;
    return;
  }

  Object.defineProperty(runtimeGlobal, "__DEV__", {
    configurable: true,
    value,
    writable: true,
  });
}

describe("mobile dev login helper", () => {
  it("returns credentials only for an explicit development runtime", () => {
    withControlledDevLoginRuntime(() => {
      setDevLoginEnvironment("EXPO_PUBLIC_WHISPR_DEV_LOGIN_EMAIL", "dev@example.com");
      setDevLoginEnvironment("EXPO_PUBLIC_WHISPR_DEV_LOGIN_PASSWORD", "development-password");

      setExplicitDevRuntime(undefined);
      setDevLoginEnvironment("NODE_ENV", undefined);
      assert.equal(getMobileDevLoginCredentials(), null);

      setDevLoginEnvironment("NODE_ENV", "unknown");
      assert.equal(getMobileDevLoginCredentials(), null);

      setExplicitDevRuntime(false);
      assert.equal(getMobileDevLoginCredentials(), null);

      setExplicitDevRuntime(true);
      assert.deepEqual(getMobileDevLoginCredentials(), {
        email: "dev@example.com",
        password: "development-password",
      });

      setDevLoginEnvironment("EXPO_PUBLIC_WHISPR_DEV_LOGIN_EMAIL", undefined);
      assert.equal(getMobileDevLoginCredentials(), null);

      setDevLoginEnvironment("EXPO_PUBLIC_WHISPR_DEV_LOGIN_EMAIL", "dev@example.com");
      setDevLoginEnvironment("EXPO_PUBLIC_WHISPR_DEV_LOGIN_PASSWORD", undefined);
      assert.equal(getMobileDevLoginCredentials(), null);
    });
  });

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

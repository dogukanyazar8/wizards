import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  validateMobileReleaseContract,
  type MobileReleaseProfileConfig,
} from "../src/release/mobile-release-contract";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("mobile release contract", () => {
  it("validates the real EAS build matrix and version alignment", () => {
    const eas = readJson<{ build: Record<string, MobileReleaseProfileConfig> }>(
      resolve(__dirname, "../eas.json"),
    );
    const mobilePackage = readJson<{ version: string }>(resolve(__dirname, "../package.json"));
    const rootPackage = readJson<{ version: string }>(resolve(__dirname, "../../../package.json"));

    const result = validateMobileReleaseContract({
      easBuildProfiles: eas.build,
      packageVersion: mobilePackage.version,
      rootVersion: rootPackage.version,
    });

    assert.deepEqual(result.blockers, []);
    assert.equal(result.budgets.length >= 4, true);
    assert.equal(result.checklist.some((item) => item.includes("permission")), true);
    assert.equal(result.storeReadiness.permissionCount >= 4, true);
    assert.equal(result.checklist.some((item) => item.includes("Store")), true);
  });

  it("blocks production-like profiles that point to HTTP or local hosts", () => {
    const result = validateMobileReleaseContract({
      easBuildProfiles: {
        canary: {
          autoIncrement: true,
          channel: "canary",
          distribution: "internal",
          env: {
            EXPO_PUBLIC_WHISPR_API_URL: "https://whispr.team",
            EXPO_PUBLIC_WHISPR_SOCKET_URL: "https://whispr.team",
            EXPO_PUBLIC_WHISPR_WEB_URL: "https://whispr.team",
            WHISPR_MOBILE_ENV: "canary",
          },
        },
        development: {
          channel: "development",
          developmentClient: true,
          distribution: "internal",
          env: {
            WHISPR_MOBILE_ENV: "development",
          },
        },
        production: {
          autoIncrement: true,
          channel: "production",
          distribution: "store",
          env: {
            EXPO_PUBLIC_WHISPR_API_URL: "http://localhost:3000",
            EXPO_PUBLIC_WHISPR_SOCKET_URL: "https://whispr.team",
            EXPO_PUBLIC_WHISPR_WEB_URL: "https://whispr.team",
            WHISPR_MOBILE_ENV: "production",
          },
        },
        uat: {
          autoIncrement: false,
          channel: "uat",
          distribution: "internal",
          env: {
            EXPO_PUBLIC_WHISPR_API_URL: "https://wizardsweb-uat.up.railway.app",
            EXPO_PUBLIC_WHISPR_SOCKET_URL: "https://wizardsweb-uat.up.railway.app",
            EXPO_PUBLIC_WHISPR_WEB_URL: "https://wizardsweb-uat.up.railway.app",
            WHISPR_MOBILE_ENV: "uat",
          },
        },
      },
      packageVersion: "0.8.15",
      rootVersion: "0.8.15",
    });

    assert.equal(
      result.blockers.some((blocker) =>
        blocker.includes("production EXPO_PUBLIC_WHISPR_API_URL must be an HTTPS non-local URL"),
      ),
      true,
    );
  });
});

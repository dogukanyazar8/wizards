import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileAppUpdateResponse } from "@wizards/types";

import type { MobileUpdateController } from "../src/about/mobile-update-controller";
import { selectMobileUpdateController } from "../src/about/mobile-update-controller-factory";

const controller = {
  capabilities: { canPause: false, isEnabled: true, reportsPercent: false },
} as MobileUpdateController;
const artifact = {
  sha256: "a".repeat(64),
  sizeBytes: 48_200_000,
  url: "https://updates.whispr.team/mobile/uat/releases/v0.9.0/whispr-8200.apk",
  versionCode: 8_200,
} as const;
const decision: MobileAppUpdateResponse = {
  androidArtifact: artifact,
  lastCheckedAt: "2026-07-30T10:00:00.000Z",
  latest: {
    mandatory: false,
    releasedAt: "2026-07-30T09:00:00.000Z",
    version: "0.9.0",
  },
  otaEnabled: true,
  state: "available",
  updateKind: "apk",
};

describe("mobile update controller factory", () => {
  it("selects APK only for newer Android internal builds", () => {
    let receivedVersionCode = 0;
    const result = selectMobileUpdateController({
      buildEnvironment: "uat",
      currentVersionCode: 8_100,
      decision,
      otaController: controller,
      platform: "android",
      createApkController: ({ artifact: value }) => {
        receivedVersionCode = value.versionCode;
        return controller;
      },
    });

    assert.equal(result.kind, "apk");
    assert.equal(receivedVersionCode, 8_200);
  });

  for (const input of [
    { buildEnvironment: "production" as const, platform: "android" as const },
    { buildEnvironment: "uat" as const, platform: "ios" as const },
    {
      buildEnvironment: "canary" as const,
      platform: "android" as const,
      currentVersionCode: 8_200,
    },
  ]) {
    it(`never selects APK for ${JSON.stringify(input)}`, () => {
      let apkCreated = false;
      const result = selectMobileUpdateController({
        buildEnvironment: input.buildEnvironment,
        currentVersionCode: input.currentVersionCode ?? 8_100,
        decision,
        otaController: controller,
        platform: input.platform,
        createApkController: () => {
          apkCreated = true;
          return controller;
        },
      });

      assert.equal(apkCreated, false);
      assert.notEqual(result.kind, "apk");
    });
  }

  it("keeps compatible OTA ahead of APK selection", () => {
    const result = selectMobileUpdateController({
      buildEnvironment: "uat",
      currentVersionCode: 8_100,
      decision: { ...decision, androidArtifact: undefined, updateKind: "ota" },
      otaController: controller,
      platform: "android",
      createApkController: () => {
        throw new Error("APK factory must not run");
      },
    });

    assert.equal(result.kind, "ota");
    assert.equal(result.controller, controller);
  });
});

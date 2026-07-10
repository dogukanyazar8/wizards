import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WHISPR_MOBILE_APP_IDENTITY,
  WHISPR_MOBILE_PERMISSION_DISCLOSURES,
  WHISPR_MOBILE_PRIVACY_REQUIREMENTS,
  getWhisprMobileAndroidPermissions,
  getWhisprMobileIosInfoPlistUsageDescriptions,
  validateMobileStoreReadiness,
} from "../src/release/mobile-store-contract";

describe("mobile store contract", () => {
  it("keeps native app identity stable for store and deep-link releases", () => {
    assert.equal(WHISPR_MOBILE_APP_IDENTITY.name, "Whispr");
    assert.equal(WHISPR_MOBILE_APP_IDENTITY.slug, "whispr-mobile");
    assert.equal(WHISPR_MOBILE_APP_IDENTITY.scheme, "whispr");
    assert.equal(WHISPR_MOBILE_APP_IDENTITY.androidPackage, "team.whispr.mobile");
    assert.equal(WHISPR_MOBILE_APP_IDENTITY.iosBundleIdentifier, "team.whispr.mobile");
  });

  it("keeps permission disclosures user-action scoped", () => {
    assert.equal(WHISPR_MOBILE_PERMISSION_DISCLOSURES.length >= 4, true);

    for (const disclosure of WHISPR_MOBILE_PERMISSION_DISCLOSURES) {
      assert.equal(disclosure.userActionRequired, true);
      assert.match(disclosure.usageDescription, /only when|you choose|you can control/i);
    }
  });

  it("exposes only the Android permissions the product currently needs", () => {
    assert.deepEqual(getWhisprMobileAndroidPermissions(), [
      "USE_BIOMETRIC",
      "CAMERA",
      "RECORD_AUDIO",
      "POST_NOTIFICATIONS",
      "FOREGROUND_SERVICE_MEDIA_PROJECTION",
    ]);
  });

  it("builds iOS usage descriptions from the same permission contract", () => {
    assert.deepEqual(getWhisprMobileIosInfoPlistUsageDescriptions(), {
      NSFaceIDUsageDescription:
        "Whispr uses Face ID or device biometrics only when you choose to unlock the app.",
      NSCameraUsageDescription:
        "Whispr uses the camera only when you choose to join video calls or share video.",
      NSMicrophoneUsageDescription:
        "Whispr uses the microphone only when you join voice channels or calls.",
      NSPhotoLibraryUsageDescription:
        "Whispr uses your photo library only when you choose media to upload.",
    });
    assert.equal(
      Object.hasOwn(
        getWhisprMobileIosInfoPlistUsageDescriptions(),
        "NSScreenCaptureUsageDescription",
      ),
      false,
    );
  });

  it("summarizes store readiness without secrets or raw identifiers", () => {
    const result = validateMobileStoreReadiness();

    assert.deepEqual(result.blockers, []);
    assert.equal(result.permissionCount, WHISPR_MOBILE_PERMISSION_DISCLOSURES.length);
    assert.equal(result.privacyRequirementCount, WHISPR_MOBILE_PRIVACY_REQUIREMENTS.length);
    assert.equal(
      result.checklist.some((item) => item.includes("Store")),
      true,
    );
    assert.equal(
      result.checklist.some((item) => /access[_-]?token|refresh[_-]?token|password/i.test(item)),
      false,
    );
  });
});

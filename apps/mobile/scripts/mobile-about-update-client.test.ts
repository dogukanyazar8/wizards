import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMobileAppUpdatePath } from "../src/about/mobile-about-client";

describe("mobile About update client", () => {
  it("sends the native identity required for OTA versus APK decisions", () => {
    assert.equal(
      buildMobileAppUpdatePath({
        buildEnvironment: "uat",
        channel: "beta",
        installed: "0.8.15",
        platform: "android",
        runtimeVersion: "fingerprint-1",
        versionCode: 815,
      }),
      "/api/v1/mobile/app/update?buildEnvironment=uat&channel=beta&installed=0.8.15&platform=android&runtimeVersion=fingerprint-1&versionCode=815",
    );
  });
});

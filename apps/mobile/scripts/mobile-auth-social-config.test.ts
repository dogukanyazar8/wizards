import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MOBILE_AUTH_SOCIAL_PROVIDERS } from "../src/auth/mobile-auth-social-config";

describe("mobile auth social configuration", () => {
  it("advertises only the supported Google web hand-off provider", () => {
    assert.deepEqual(MOBILE_AUTH_SOCIAL_PROVIDERS, [
      {
        iconName: "logo-google",
        id: "google",
        labelCopyKey: "authSocialGoogle",
        testID: "mobile-auth-social-google",
      },
    ]);
  });
});

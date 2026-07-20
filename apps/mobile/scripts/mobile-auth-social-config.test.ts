import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isLiveMobileAuthSocialProvider,
  MOBILE_AUTH_SOCIAL_PROVIDERS,
} from "../src/auth/mobile-auth-social-config";

describe("mobile auth social configuration", () => {
  it("renders the redesign provider row with Google as the only live hand-off", () => {
    assert.deepEqual(MOBILE_AUTH_SOCIAL_PROVIDERS, [
      {
        displayName: "Google",
        id: "google",
        labelCopyKey: "authSocialGoogle",
        status: "live",
        testID: "mobile-auth-social-google",
      },
      {
        displayName: "Microsoft",
        id: "microsoft",
        labelCopyKey: "authSocialMicrosoft",
        status: "preview",
        testID: "mobile-auth-social-microsoft",
      },
      {
        displayName: "Apple",
        id: "apple",
        labelCopyKey: "authSocialApple",
        status: "preview",
        testID: "mobile-auth-social-apple",
      },
      {
        displayName: "Discord",
        id: "discord",
        labelCopyKey: "authSocialDiscord",
        status: "preview",
        testID: "mobile-auth-social-discord",
      },
    ]);
  });

  it("only treats Google as dispatchable so preview tiles cannot start an OAuth flow", () => {
    const live = MOBILE_AUTH_SOCIAL_PROVIDERS.filter(isLiveMobileAuthSocialProvider);

    assert.deepEqual(
      live.map((provider) => provider.id),
      ["google"],
    );
  });
});

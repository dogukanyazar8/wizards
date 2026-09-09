import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDesktopOAuthCompletePath,
  buildDesktopOAuthStartPath,
  buildDesktopOAuthStartUrl,
  getDesktopOAuthGoogleAuthorizationParams,
} from "./desktop-oauth-start";

describe("desktop OAuth start paths", () => {
  it("builds safe browser-start and desktop-complete paths", () => {
    assert.equal(
      buildDesktopOAuthStartPath("/messages"),
      "/desktop/oauth/start?callbackUrl=%2Fmessages",
    );
    assert.equal(
      buildDesktopOAuthCompletePath("/messages"),
      "/desktop/oauth/complete?callbackUrl=%2Fmessages",
    );
  });

  it("sanitizes unsafe callback targets before putting them in URLs", () => {
    assert.equal(
      buildDesktopOAuthStartPath("https://evil.example/channels"),
      "/desktop/oauth/start?callbackUrl=%2Fhome",
    );
    assert.equal(
      buildDesktopOAuthStartUrl("//evil.example/channels", "https://whispr.team"),
      "https://whispr.team/desktop/oauth/start?callbackUrl=%2Fhome",
    );
  });

  it("asks Google to show the account chooser for desktop sign-in", () => {
    assert.deepEqual(getDesktopOAuthGoogleAuthorizationParams(), {
      prompt: "select_account",
    });
  });
});

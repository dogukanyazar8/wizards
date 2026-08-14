import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMobileDeepLink } from "../src/deep-link/mobile-deep-links";

describe("mobile account deletion reauth deep links", () => {
  it("accepts only a bounded path token as a purpose-specific command", () => {
    assert.deepEqual(
      parseMobileDeepLink("whispr://reauth/account-delete/abcdefghijklmnopqrstuvwxyzABCDEF123456", {
        webUrl: "https://whispr.team",
      }),
      {
        intent: {
          token: "abcdefghijklmnopqrstuvwxyzABCDEF123456", // gitleaks:allow -- deterministic invalid fixture
          type: "account-delete-reauth",
        },
        ok: true,
      },
    );

    assert.equal(
      parseMobileDeepLink("whispr://reauth/account-delete/short", {
        webUrl: "https://whispr.team",
      }).ok,
      false,
    );
  });
});

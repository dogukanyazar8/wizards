import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileApiError } from "../src/api/mobile-api-client";
import {
  getMobileGoogleSignInFailure,
  getMobilePasswordSignInFailure,
} from "../src/auth/mobile-auth-error-mapping";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";

describe("mobile password sign-in error mapping", () => {
  it("requires a two-factor code when the server requests it", () => {
    assert.deepEqual(
      getMobilePasswordSignInFailure(
        new MobileApiError("Two-factor verification is required.", {
          serverCode: "TWO_FACTOR_REQUIRED",
          status: 401,
        }),
      ),
      {
        message: activeMobileCopy.authInvalidCredentials,
        requiresTwoFactor: true,
      },
    );
  });

  it("uses dedicated localized copy for an invalid two-factor code", () => {
    assert.deepEqual(
      getMobilePasswordSignInFailure(
        new MobileApiError("The two-factor code is invalid.", {
          serverCode: "TWO_FACTOR_INVALID",
          status: 401,
        }),
      ),
      {
        message: activeMobileCopy.authTwoFactorInvalidCode,
        requiresTwoFactor: false,
      },
    );
  });
});

describe("mobile Google sign-in error mapping", () => {
  it("keeps required and invalid two-factor failures recoverable on the login screen", () => {
    assert.deepEqual(
      getMobileGoogleSignInFailure(
        new MobileApiError("Two-factor verification is required.", {
          serverCode: "TWO_FACTOR_REQUIRED",
          status: 401,
        }),
      ),
      {
        message: activeMobileCopy.authTwoFactorRequiredNotice,
        requiresTwoFactor: true,
      },
    );
    assert.deepEqual(
      getMobileGoogleSignInFailure(
        new MobileApiError("The two-factor code is invalid.", {
          serverCode: "TWO_FACTOR_INVALID",
          status: 401,
        }),
      ),
      {
        message: activeMobileCopy.authTwoFactorInvalidCode,
        requiresTwoFactor: true,
      },
    );
  });
});

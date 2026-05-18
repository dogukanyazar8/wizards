import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isMutatingApiRequestAllowed } from "./middleware";

describe("API CSRF guard", () => {
  const requestOrigin = "https://whispr.team";

  it("allows same-origin mutating API requests", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "POST",
        originHeader: requestOrigin,
        pathname: "/api/v1/servers",
        requestOrigin,
        secFetchSite: "same-origin",
      }),
      true,
    );
  });

  it("blocks cross-site mutating API requests before route handlers run", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "POST",
        originHeader: "https://attacker.example",
        pathname: "/api/v1/servers",
        requestOrigin,
        secFetchSite: "cross-site",
      }),
      false,
    );
  });

  it("blocks mismatched Origin headers even when Fetch Metadata is absent", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "DELETE",
        originHeader: "https://attacker.example",
        pathname: "/api/v1/users/me",
        requestOrigin,
      }),
      false,
    );
  });

  it("does not apply to safe API methods", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "GET",
        originHeader: "https://attacker.example",
        pathname: "/api/v1/servers",
        requestOrigin,
        secFetchSite: "cross-site",
      }),
      true,
    );
  });
});

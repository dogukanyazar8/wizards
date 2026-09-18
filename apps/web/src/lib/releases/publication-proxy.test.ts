import assert from "node:assert/strict";
import { test } from "node:test";
import { isMutatingApiRequestAllowed } from "@/proxy";
import { parsePublishedReleaseChannel } from "@/lib/build-release-channel";

test("only the OIDC-only endpoint permits originless bearer requests", () => {
  const request = {
    method: "POST",
    pathname: "/api/v1/releases/publish",
    requestOrigin: "https://whispr.team",
  };
  assert.equal(isMutatingApiRequestAllowed(request), false);
  assert.equal(
    isMutatingApiRequestAllowed({ ...request, authorizationHeader: "Bearer jwt" }),
    true,
  );
  assert.equal(
    isMutatingApiRequestAllowed({
      ...request,
      authorizationHeader: "Bearer jwt",
      pathname: "/api/v1/admin/releases/123/withdraw",
    }),
    false,
  );
  assert.equal(
    isMutatingApiRequestAllowed({
      ...request,
      authorizationHeader: "Bearer jwt",
      pathname: "/api/v1/releases/publish/anything",
    }),
    false,
  );
});

test("publication recognizes channel aliases without guessing unknown environments", () => {
  for (const value of ["UAT", "uat", "beta", " Beta "])
    assert.equal(parsePublishedReleaseChannel(value), "UAT");
  for (const value of ["STABLE", "stable", "PROD", "production"])
    assert.equal(parsePublishedReleaseChannel(value), "STABLE");
  for (const value of [undefined, "", "canary", "preview"])
    assert.equal(parsePublishedReleaseChannel(value), null);
});

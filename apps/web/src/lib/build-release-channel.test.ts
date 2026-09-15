import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveWebReleaseChannel } from "./build-release-channel";

it("maps PROD to Stable and UAT to Beta without a third public channel", () => {
  for (const value of ["prod", "production", "stable", " PROD "]) {
    assert.equal(resolveWebReleaseChannel(value), "stable");
  }
  for (const value of [undefined, "", "development", "dev", "test", "preview", "uat", "beta"]) {
    assert.equal(resolveWebReleaseChannel(value), "beta");
  }
  for (const value of ["canary", "production-small", "invalid"]) {
    assert.throws(() => resolveWebReleaseChannel(value), /Unsupported release channel/);
  }
});

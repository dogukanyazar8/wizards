import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMobileScreenShareSupport } from "../src/voice/mobile-screen-share-platform";

test("iOS publishing requires an installed and device-validated broadcast extension", () => {
  assert.equal(
    resolveMobileScreenShareSupport({ platform: "ios", hasBroadcastExtension: false }),
    "unsupported-ios-no-extension",
  );
  assert.equal(
    resolveMobileScreenShareSupport({ platform: "ios", hasBroadcastExtension: true }),
    "supported",
  );
  assert.equal(
    resolveMobileScreenShareSupport({ platform: "android", hasBroadcastExtension: false }),
    "supported",
  );
});

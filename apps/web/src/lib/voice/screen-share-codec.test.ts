import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveScreenShareCodec, isScreenShare4kAllowed } from "./screen-share-codec";

const input = {
  mode: "text" as const,
  width: 1920,
  height: 1080,
  frameRate: 60,
  bitrateKbps: 6000,
};
for (const codec of ["av1", "vp9", "h264"] as const) {
  test(`selects ${codec} hardware after unsupported candidates`, async () => {
    const result = await resolveScreenShareCodec(input, async ({ video }) => ({
      supported: true,
      smooth: true,
      powerEfficient: video.contentType.toLowerCase().includes(codec),
    }));
    assert.equal(result.codec, codec);
    assert.equal(result.hardware, true);
  });
}
test("software fallbacks follow content mode; unavailable probe stays unknown", async () => {
  const software = async () => ({ supported: true, smooth: true, powerEfficient: false });
  assert.equal((await resolveScreenShareCodec(input, software)).codec, "vp9");
  assert.equal(
    (await resolveScreenShareCodec({ ...input, mode: "motion" }, software)).codec,
    "h264",
  );
  assert.equal((await resolveScreenShareCodec(input, undefined)).hardware, null);
  assert.equal(
    (
      await resolveScreenShareCodec(input, async () => {
        throw Error("unsupported");
      })
    ).reason,
    "probe-unavailable",
  );
});
test("4K requires flag, physical pixels and positive hardware evidence", () => {
  const screen = { width: 1920, height: 1080, dpr: 2 };
  assert.equal(isScreenShare4kAllowed(true, screen, true), true);
  assert.equal(isScreenShare4kAllowed(false, screen, true), false);
  assert.equal(isScreenShare4kAllowed(true, screen, null), false);
  assert.equal(isScreenShare4kAllowed(true, { ...screen, dpr: 1 }, true), false);
});

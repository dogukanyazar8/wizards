import assert from "node:assert/strict";
import { test } from "node:test";
import { getPictureInPictureCapabilities, exitVideoPictureInPicture } from "./screen-share-pip";
test("PiP uses capabilities, not browser identity; exit is idempotent", async () => {
  assert.deepEqual(getPictureInPictureCapabilities({}, {}), { video: false, document: false });
  assert.deepEqual(
    getPictureInPictureCapabilities(
      { pictureInPictureEnabled: true },
      { documentPictureInPicture: { requestWindow: async () => ({}) } },
    ),
    { video: true, document: true },
  );
  let exits = 0;
  await exitVideoPictureInPicture({
    pictureInPictureElement: null,
    exitPictureInPicture: async () => {
      exits++;
    },
  });
  assert.equal(exits, 0);
});

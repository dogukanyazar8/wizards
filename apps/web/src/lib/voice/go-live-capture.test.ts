import assert from "node:assert/strict";
import { test } from "node:test";
import { captureGoLiveTracks } from "./go-live-capture";

test("Go Live opens the picker synchronously, preserves cancellation, and requests ideal window capture", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const denied = new DOMException("Cancelled", "NotAllowedError");
  let called = false;
  let options: DisplayMediaStreamOptions | undefined;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getDisplayMedia(input: DisplayMediaStreamOptions) {
          called = true;
          options = input;
          return Promise.reject(denied);
        },
      },
    },
  });
  try {
    const capture = captureGoLiveTracks({
      width: 1920,
      height: 1080,
      frameRate: 60,
      shareSystemAudio: false,
    });
    assert.equal(called, true);
    await assert.rejects(capture, (error) => error === denied);
    assert.equal(options?.audio, false);
    assert.deepEqual(options?.video, {
      displaySurface: "window",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60 },
    });
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

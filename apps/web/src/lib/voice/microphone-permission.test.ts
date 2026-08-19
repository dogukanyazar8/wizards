import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAttemptMicrophoneCapture } from "./microphone-permission";

describe("canAttemptMicrophoneCapture", () => {
  it("blocks a denied microphone permission", () => {
    assert.equal(canAttemptMicrophoneCapture("denied"), false);
  });

  it("allows LiveKit to own capture when permission is granted", () => {
    assert.equal(canAttemptMicrophoneCapture("granted"), true);
  });

  it("allows LiveKit to raise the real prompt", () => {
    assert.equal(canAttemptMicrophoneCapture("prompt"), true);
  });

  it("allows capture when the Permissions API is unavailable", () => {
    assert.equal(canAttemptMicrophoneCapture(null), true);
  });
});

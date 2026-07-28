import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_VOICE_RECORD_CANCEL_DISTANCE,
  MOBILE_VOICE_RECORD_LOCK_DISTANCE,
  resolveMobileVoiceRecordGesture,
} from "../src/media/mobile-voice-record-gesture";

describe("MSG-1h voice record gesture", () => {
  it("cancels at the 60px left threshold and not a pixel before it", () => {
    assert.equal(MOBILE_VOICE_RECORD_CANCEL_DISTANCE, 60);
    assert.equal(resolveMobileVoiceRecordGesture({ dx: -59, dy: 0 }), "send");
    assert.equal(resolveMobileVoiceRecordGesture({ dx: -60, dy: 0 }), "cancel");
    assert.equal(resolveMobileVoiceRecordGesture({ dx: -140, dy: 0 }), "cancel");
  });

  it("locks on an upward drag", () => {
    assert.equal(MOBILE_VOICE_RECORD_LOCK_DISTANCE, 48);
    assert.equal(resolveMobileVoiceRecordGesture({ dx: 0, dy: -47 }), "send");
    assert.equal(resolveMobileVoiceRecordGesture({ dx: 0, dy: -48 }), "lock");
  });

  it("sends when the finger barely moved, in any direction", () => {
    assert.equal(resolveMobileVoiceRecordGesture({ dx: 0, dy: 0 }), "send");
    assert.equal(resolveMobileVoiceRecordGesture({ dx: 30, dy: 30 }), "send");
    assert.equal(resolveMobileVoiceRecordGesture({ dx: -20, dy: -20 }), "send");
  });

  it("prefers cancel over lock on a diagonal drag", () => {
    // Discarding by accident is recoverable; sending pocket noise is not.
    assert.equal(resolveMobileVoiceRecordGesture({ dx: -80, dy: -80 }), "cancel");
  });
});

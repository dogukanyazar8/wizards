import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCameraDeviceUnavailable,
  isCameraPermissionDenied,
  isLikelyKrispSecurityPolicyError,
  isMicrophoneConstraintError,
  isMicrophoneDeviceUnavailable,
  isMicrophonePermissionDenied,
  isScreenSharePermissionDenied,
} from "./error-classification";

describe("voice error classification", () => {
  it("classifies microphone permission, device, and constraint errors", () => {
    assert.equal(
      isMicrophonePermissionDenied(new DOMException("blocked", "NotAllowedError")),
      true,
    );
    assert.equal(isMicrophonePermissionDenied(new Error("Permission denied by user")), true);
    assert.equal(isMicrophoneDeviceUnavailable(new DOMException("missing", "NotFoundError")), true);
    assert.equal(isMicrophoneDeviceUnavailable(new Error("Requested device not found")), true);
    assert.equal(
      isMicrophoneConstraintError(new DOMException("bad", "OverconstrainedError")),
      true,
    );
    assert.equal(isMicrophoneConstraintError(new Error("ConstraintNotSatisfiedError")), true);
  });

  it("classifies camera permission and device availability errors", () => {
    assert.equal(isCameraPermissionDenied(new DOMException("blocked", "SecurityError")), true);
    assert.equal(isCameraPermissionDenied(new Error("NotAllowedError")), true);
    assert.equal(isCameraDeviceUnavailable(new DOMException("busy", "NotReadableError")), true);
    assert.equal(isCameraDeviceUnavailable(new Error("Could not start video source")), true);
  });

  it("classifies screen-share permission cancellation as a permission denial", () => {
    assert.equal(isScreenSharePermissionDenied(new DOMException("cancelled", "AbortError")), true);
    assert.equal(isScreenSharePermissionDenied(new Error("PermissionDeniedError")), true);
  });

  it("classifies Krisp CSP and WASM failures without matching generic errors", () => {
    assert.equal(
      isLikelyKrispSecurityPolicyError(
        new Error("Refused to create a worker because it violates script-src"),
      ),
      true,
    );
    assert.equal(isLikelyKrispSecurityPolicyError("WebAssembly unsafe-eval blocked"), true);
    assert.equal(isLikelyKrispSecurityPolicyError(new Error("network timeout")), false);
  });
});

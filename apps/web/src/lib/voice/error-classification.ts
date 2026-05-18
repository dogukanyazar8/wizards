export function isMicrophonePermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|securityerror/i.test(error.message)
  );
}

export function isMicrophoneDeviceUnavailable(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "AbortError" ||
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "OverconstrainedError"
    );
  }

  return (
    error instanceof Error &&
    /aborterror|notfounderror|notreadableerror|overconstrainederror|could not start audio source|device not found|requested device not found|audio input device/i.test(
      error.message,
    )
  );
}

export function isMicrophoneConstraintError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError";
  }

  return (
    error instanceof Error &&
    /overconstrainederror|constraintnotsatisfiederror|constraint/i.test(error.message)
  );
}

export function isCameraPermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|securityerror/i.test(error.message)
  );
}

export function isCameraDeviceUnavailable(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "AbortError" ||
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "OverconstrainedError"
    );
  }

  return (
    error instanceof Error &&
    /aborterror|notfounderror|notreadableerror|overconstrainederror|could not start video source|device not found|requested device not found|video input device/i.test(
      error.message,
    )
  );
}

export function isLikelyKrispSecurityPolicyError(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";

  return /content security policy|script-src|worker-src|wasm|webassembly|unsafe-eval|audioWorklet|worklet|blob:/i.test(
    message,
  );
}

export function isScreenSharePermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "AbortError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|aborterror|securityerror/i.test(
      error.message,
    )
  );
}

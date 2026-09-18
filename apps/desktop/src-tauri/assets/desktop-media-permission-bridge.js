(() => {
  "use strict";

  if (window.__WHISPR_DESKTOP__?.shell !== "desktop") return;

  const mediaDevices = navigator.mediaDevices;
  const originalGetUserMedia = mediaDevices?.getUserMedia;
  if (!mediaDevices || typeof originalGetUserMedia !== "function") return;

  const pendingByKind = new Map();
  const pendingByRequestId = new Map();
  const earlyDecisions = new Map();
  const requestTimeoutMs = 120_000;

  function notAllowed(message) {
    if (typeof DOMException === "function") {
      return new DOMException(message, "NotAllowedError");
    }

    const error = new Error(message);
    error.name = "NotAllowedError";
    return error;
  }

  async function isAlreadyGranted(kind) {
    if (!navigator.permissions?.query) return false;

    try {
      return (await navigator.permissions.query({ name: kind })).state === "granted";
    } catch {
      return false;
    }
  }

  function awaitDecision(requestId) {
    if (earlyDecisions.has(requestId)) {
      const allowed = earlyDecisions.get(requestId) === true;
      earlyDecisions.delete(requestId);
      return Promise.resolve(allowed);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingByRequestId.delete(requestId);
        reject(notAllowed("Whispr media permission request expired."));
      }, requestTimeoutMs);

      pendingByRequestId.set(requestId, (allowed) => {
        clearTimeout(timeout);
        pendingByRequestId.delete(requestId);
        resolve(allowed === true);
      });
    });
  }

  async function requestKind(kind) {
    if (await isAlreadyGranted(kind)) return;

    const existing = pendingByKind.get(kind);
    if (existing) return existing;

    const request = (async () => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== "function") {
        throw notAllowed("Whispr trusted media permission UI is unavailable.");
      }

      const prompt = await invoke("request_desktop_media_permission", { kind });
      if (
        !prompt ||
        prompt.kind !== kind ||
        typeof prompt.requestId !== "string" ||
        !/^media-permission-[1-9][0-9]*$/.test(prompt.requestId)
      ) {
        throw notAllowed("Whispr returned an invalid media permission request.");
      }

      if (!(await awaitDecision(prompt.requestId))) {
        throw notAllowed(`Whispr ${kind} access was not approved.`);
      }
    })();

    pendingByKind.set(kind, request);
    try {
      await request;
    } finally {
      if (pendingByKind.get(kind) === request) pendingByKind.delete(kind);
    }
  }

  Object.defineProperty(window, "__WHISPR_DESKTOP_MEDIA_PERMISSION_RESOLVE__", {
    configurable: false,
    enumerable: false,
    value(requestId, allowed) {
      if (typeof requestId !== "string") return;
      const resolve = pendingByRequestId.get(requestId);
      if (resolve) {
        resolve(allowed === true);
      } else {
        earlyDecisions.set(requestId, allowed === true);
      }
    },
    writable: false,
  });

  Object.defineProperty(mediaDevices, "getUserMedia", {
    configurable: false,
    enumerable: false,
    async value(constraints = {}) {
      const kinds = [];
      if (constraints.audio) kinds.push("microphone");
      if (constraints.video) kinds.push("camera");

      for (const kind of kinds) {
        await requestKind(kind);
      }

      return Reflect.apply(originalGetUserMedia, mediaDevices, [constraints]);
    },
    // WebRTC adapters (including Krisp's) wrap this method during ESM import.
    // The wrapper must stay assignable; WebView2's native permission handler
    // remains the authorization boundary, even if JavaScript replaces it.
    writable: true,
  });
})();

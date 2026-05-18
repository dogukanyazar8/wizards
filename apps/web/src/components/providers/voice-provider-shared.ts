"use client";

export const TRANSIENT_VOICE_ERROR_DISMISS_MS = 5_000;

export function notifyVoiceExit(sessionId: string) {
  return fetch("/api/v1/voice/state", {
    body: JSON.stringify({ sessionId }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "DELETE",
    keepalive: true,
  }).catch(() => undefined);
}

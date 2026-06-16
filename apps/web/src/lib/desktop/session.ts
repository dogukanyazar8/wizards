"use client";

import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

const DESKTOP_SESSION_CLOSE_ENDPOINT = "/api/v1/auth/desktop-session";
const DESKTOP_SESSION_CLOSE_TIMEOUT_MS = 1200;

export async function clearDesktopTransientAuthSession() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, DESKTOP_SESSION_CLOSE_TIMEOUT_MS);

  try {
    const response = await fetch(DESKTOP_SESSION_CLOSE_ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      method: "POST",
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

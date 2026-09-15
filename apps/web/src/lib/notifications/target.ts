import { buildSettingsHref } from "@/lib/settings/navigation";

/** Only application paths and explicit HTTP(S) links may become notification links. */
export function resolveNotificationTarget(
  actionUrl: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): string | null {
  if (!actionUrl || actionUrl.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(actionUrl)) {
    return null;
  }

  if (actionUrl.startsWith("/") && !actionUrl.startsWith("//")) {
    const target = new URL(actionUrl, "https://whispr.invalid");
    // Stored awards use the mobile-compatible legacy path. Canonicalize it only for web.
    if (target.pathname === "/settings/badges" || target.pathname === "/settings/badges/") {
      return `${buildSettingsHref("account", "badges")}${target.search}${target.hash}`;
    }
    // Threads target their parent in the channel list; retain the original thread parameter.
    const messageId = target.searchParams.get("thread") ?? metadata?.messageId;
    if (
      /^\/channels\/[^/]+\/[^/]+$/u.test(target.pathname) &&
      !target.searchParams.has("message") &&
      typeof messageId === "string" &&
      messageId.length > 0
    ) {
      target.searchParams.set("message", messageId);
      return `${target.pathname}${target.search}${target.hash}`;
    }
    return actionUrl;
  }

  try {
    const target = new URL(actionUrl);
    return /^https?:\/\//u.test(actionUrl) && !target.username && !target.password
      ? target.href
      : null;
  } catch {
    return null;
  }
}

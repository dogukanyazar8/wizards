import { parseMobileDeepLink } from "../deep-link/mobile-deep-links";

const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;
const MAX_SHARE_URL_LENGTH = 2048;

export interface MobileShareAdapter {
  share(content: { message: string }): Promise<{ action: string }>;
}

function isCanonicalHttpsInviteUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_SHARE_URL_LENGTH) {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function getNativeShareAdapter(): MobileShareAdapter {
  // Loaded only for a native share action so the pure contract stays runnable in Node.
  return require("react-native").Share as MobileShareAdapter;
}

export function parseMobileInviteCode(value: string, webUrl: string): string | null {
  const trimmed = value.trim();

  if (INVITE_CODE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const parsed = parseMobileDeepLink(trimmed, { webUrl });
  return parsed.ok && parsed.intent.type === "invite" ? parsed.intent.code : null;
}

export async function shareMobileInviteUrl(
  shareUrl: string,
  adapter?: MobileShareAdapter,
): Promise<"dismissed" | "shared"> {
  if (!isCanonicalHttpsInviteUrl(shareUrl)) {
    throw new Error("Canonical invite URL is required.");
  }

  const result = await (adapter ?? getNativeShareAdapter()).share({ message: shareUrl });
  return result.action === "dismissedAction" ? "dismissed" : "shared";
}

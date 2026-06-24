export const DESKTOP_INVITE_AUTO_ACCEPT_PARAM = "desktop";

const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_INVITE_CODE_LENGTH = 96;

export function normalizeInviteCodeForDesktop(value: string | null | undefined) {
  if (
    !value ||
    value.length > MAX_INVITE_CODE_LENGTH ||
    !INVITE_CODE_PATTERN.test(value)
  ) {
    return null;
  }

  return value;
}

export function buildDesktopInviteUrl(code: string) {
  const safeCode = normalizeInviteCodeForDesktop(code);
  if (!safeCode) {
    return null;
  }

  return `whispr://invite/${encodeURIComponent(
    safeCode,
  )}?${DESKTOP_INVITE_AUTO_ACCEPT_PARAM}=1`;
}

export function shouldAutoAcceptDesktopInvite(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === "1" || normalized === "true";
}

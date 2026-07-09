import { validateMobileScreenShareQualityContract } from "./mobile-screen-share";

export const VOICE_SCREEN_SHARE_STATE_TTL_SECONDS = 120;

export const MOBILE_SCREEN_SHARE_PRIVACY_NOTICE =
  "Your entire screen, including notifications and other apps, will be visible to participants until you stop sharing.";

export const MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE =
  "Screen sharing stopped because Whispr moved to the background.";

const SENSITIVE_SCREEN_SHARE_ERROR_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]+|wss?:\/\/[^\s]+)/i;

export function getMobileVoiceScreenShareStateKey(channelId: string, userId: string): string {
  return `voice:screenshare:${channelId}:${userId}`;
}

export function buildMobileScreenShareHeartbeatPayload({
  isScreenSharing,
  sessionId,
}: {
  isScreenSharing: boolean;
  sessionId: string;
}): {
  selfScreenShare: boolean;
  selfStream: boolean;
  sessionId: string;
} {
  return {
    selfScreenShare: isScreenSharing,
    selfStream: isScreenSharing,
    sessionId,
  };
}

export function isMobileScreenSharePermissionDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return /denied|permission|not allowed|cancel/i.test(message);
}

export function redactMobileScreenShareError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Screen sharing could not start.";

  if (SENSITIVE_SCREEN_SHARE_ERROR_PATTERN.test(message)) {
    return "Screen share failed without exposing sensitive details.";
  }

  return message.slice(0, 180);
}

export function validateMobileScreenShareContract(): string[] {
  const issues = validateMobileScreenShareQualityContract();

  if (VOICE_SCREEN_SHARE_STATE_TTL_SECONDS !== 120) {
    issues.push("Mobile screen-share presence TTL must stay aligned with web at 120 seconds.");
  }

  if (
    !/entire screen/i.test(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE) ||
    !/notifications/i.test(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE) ||
    !/other apps/i.test(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE)
  ) {
    issues.push(
      "Mobile screen-share privacy copy must explicitly name screen, notifications, and other apps.",
    );
  }

  if (!/stopped/i.test(MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE)) {
    issues.push("Mobile background stop copy must be explicit.");
  }

  if (SENSITIVE_SCREEN_SHARE_ERROR_PATTERN.test(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE)) {
    issues.push("Mobile screen-share privacy copy must not contain endpoint or credential text.");
  }

  return issues;
}

export const VOICE_SCREEN_SHARE_STATE_TTL_SECONDS = 120;

export function getVoiceScreenShareStateKey(channelId: string, userId: string) {
  return `voice:screenshare:${channelId}:${userId}`;
}

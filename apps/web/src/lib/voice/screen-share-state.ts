export const VOICE_SCREEN_SHARE_STATE_TTL_SECONDS = 120;

export function getVoiceScreenShareStateKey(channelId: string, userId: string) {
  return `voice:screenshare:${channelId}:${userId}`;
}

export const SCREEN_SHARE_WATCHERS_TTL_SECONDS = 120;
export function getScreenShareWatchersKey(channelId: string, sharerUserId: string) {
  return `voice:screenshare:watchers:${channelId}:${sharerUserId}`;
}

/** Stop and watch updates cannot recreate an expired/stopped publication's watcher set. */
export const UPDATE_SCREEN_SHARE_WATCHERS_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= '1' then return -1 end
if ARGV[2] == '1' then
  local changed = redis.call('SADD', KEYS[2], ARGV[1])
  redis.call('EXPIRE', KEYS[2], ARGV[3])
  return changed
end
return redis.call('SREM', KEYS[2], ARGV[1])
`;

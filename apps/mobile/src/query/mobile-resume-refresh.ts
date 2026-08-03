import { mobileQueryKeys } from "./mobile-query-keys";

/**
 * What a resume is actually allowed to refetch.
 *
 * `focusManager.setFocused(true)` marks every stale query that has an observer,
 * and the app comes back to a tree that holds a lot of them. A thirty-open device
 * run that never restarted the app issued sixty bootstrap reads and sixty
 * workspace reads; a run that cold-started thirty times issued thirteen and three.
 * The app that stayed alive was doing four times the work of the one that kept
 * dying, and every one of those payloads is ~21KB parsed on the JS thread — the
 * same thread the reader is waiting on for a chat to draw.
 *
 * The reader came back to one screen. This is that screen: the chat they had
 * open, the server it belongs to, and the root that carries the unread counts.
 * Everything else keeps its own stale time and refreshes when it is next looked
 * at.
 */
export type MobileResumeTarget = {
  readonly channelId: string | null;
  readonly conversationId: string | null;
  readonly serverId: string | null;
};

export function selectMobileResumeRefreshKeys(
  target: MobileResumeTarget,
): readonly (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [mobileQueryKeys.bootstrap()];

  if (target.serverId !== null && target.serverId.length > 0) {
    keys.push(mobileQueryKeys.workspace(target.serverId));
  }
  if (target.channelId !== null && target.channelId.length > 0) {
    keys.push(mobileQueryKeys.channelMessages(target.channelId));
  }
  if (target.conversationId !== null && target.conversationId.length > 0) {
    keys.push(mobileQueryKeys.dmMessages(target.conversationId));
  }

  return keys;
}

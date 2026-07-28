import { useMemo } from "react";

import {
  getMobileDMConversationTypingMap,
  type MobileDMConversationTypingMap,
} from "../../query/mobile-message-queries";
import { useMobileRealtimeRuntime } from "../providers/mobile-realtime-provider";

/**
 * §2 "1a".6.2: who is typing, per conversation, for the inbox rows.
 *
 * `dm:typing:update` fills the realtime provider for every conversation the
 * viewer participates in, open or not, so the list needs no second subscription
 * — only this projection.
 *
 * It lives behind a hook rather than inside `DirectMessageListCard` so the list
 * itself stays renderable without the realtime provider, which is how the
 * performance surfaces exercise it.
 */
export function useMobileDMRowTyping(): MobileDMConversationTypingMap {
  const { dmTyping } = useMobileRealtimeRuntime();
  return useMemo(() => getMobileDMConversationTypingMap(dmTyping), [dmTyping]);
}

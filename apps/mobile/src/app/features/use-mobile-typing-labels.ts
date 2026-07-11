import { useMemo } from "react";
import {
  formatMobileChannelTypingLabel,
  getVisibleMobileChannelTypingUsers,
  type MobileChannelTypingState,
} from "../../realtime/mobile-typing-state";

export function useMobileTypingLabels(input: {
  readonly channelId: string | null;
  readonly channelTyping: MobileChannelTypingState;
  readonly conversationId: string | null;
  readonly dmTyping: MobileChannelTypingState;
}) {
  const channelTypingLabel = useMemo(
    () =>
      formatMobileChannelTypingLabel(
        getVisibleMobileChannelTypingUsers(input.channelTyping, input.channelId),
      ),
    [input.channelId, input.channelTyping],
  );
  const dmTypingLabel = useMemo(
    () =>
      formatMobileChannelTypingLabel(
        getVisibleMobileChannelTypingUsers(input.dmTyping, input.conversationId),
      ),
    [input.conversationId, input.dmTyping],
  );
  return { channelTypingLabel, dmTypingLabel };
}

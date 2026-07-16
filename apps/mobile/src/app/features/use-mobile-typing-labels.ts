import { useMemo } from "react";
import {
  formatMobileChannelTypingLabel,
  getVisibleMobileChannelTypingUsers,
  type MobileChannelTypingState,
  type MobileChannelTypingUser,
} from "../../realtime/mobile-typing-state";

export function useMobileTypingLabels(input: {
  readonly channelId: string | null;
  readonly channelTyping: MobileChannelTypingState;
  readonly conversationId: string | null;
  readonly dmTyping: MobileChannelTypingState;
}): {
  readonly channelTypingLabel: string | null;
  readonly channelTypingUsers: readonly MobileChannelTypingUser[];
  readonly dmTypingLabel: string | null;
} {
  const channelTypingUsers = useMemo(
    () => getVisibleMobileChannelTypingUsers(input.channelTyping, input.channelId),
    [input.channelId, input.channelTyping],
  );
  const channelTypingLabel = useMemo(
    () => formatMobileChannelTypingLabel(channelTypingUsers),
    [channelTypingUsers],
  );
  const dmTypingLabel = useMemo(
    () =>
      formatMobileChannelTypingLabel(
        getVisibleMobileChannelTypingUsers(input.dmTyping, input.conversationId),
      ),
    [input.conversationId, input.dmTyping],
  );
  return { channelTypingLabel, channelTypingUsers, dmTypingLabel };
}

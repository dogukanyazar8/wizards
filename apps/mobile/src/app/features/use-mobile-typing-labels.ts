import { useMemo } from "react";
import {
  formatMobileChannelTypingLabel,
  getVisibleMobileChannelTypingUsers,
  type MobileChannelTypingUser,
} from "../../realtime/mobile-typing-state";
import { useMobileTypingStore } from "../../state/mobile-typing-store";

/**
 * The channel header's "yazıyor" row.
 *
 * Reads the store at the surface that shows the label instead of taking it as a
 * prop from the product root: typing arrives for every channel the viewer is in,
 * and routing it through the root re-rendered the whole tree for a stranger
 * typing somewhere the reader is not looking.
 *
 * Selects the raw channel map — a stable reference — and derives the visible
 * users here. A selector that built the array itself would hand
 * `useSyncExternalStore` a fresh snapshot on every read.
 */
export function useMobileChannelTypingLabels(channelId: string | null): {
  readonly channelTypingLabel: string | null;
  readonly channelTypingUsers: readonly MobileChannelTypingUser[];
} {
  const channels = useMobileTypingStore((state) => state.channels);
  const channelTypingUsers = useMemo(
    () => getVisibleMobileChannelTypingUsers(channels, channelId),
    [channelId, channels],
  );

  return useMemo(
    () => ({
      channelTypingLabel: formatMobileChannelTypingLabel(channelTypingUsers),
      channelTypingUsers,
    }),
    [channelTypingUsers],
  );
}

/** The DM header's "yazıyor" row, same rule as the channel one. */
export function useMobileDMTypingLabel(conversationId: string | null): string | null {
  const dms = useMobileTypingStore((state) => state.dms);

  return useMemo(
    () => formatMobileChannelTypingLabel(getVisibleMobileChannelTypingUsers(dms, conversationId)),
    [conversationId, dms],
  );
}

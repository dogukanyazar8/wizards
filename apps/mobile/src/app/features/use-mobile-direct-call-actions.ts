import { useCallback } from "react";

import { copy } from "../mobile-root-screen-shared";
import { getMobileConversationTitle } from "../mobile-display-model";
import type { MobileDMConversationListItem } from "../mobile-root-screen-shared";

/**
 * Binds the 4a header call buttons to the DM call ring handshake so the product
 * shell only forwards the two intents the screen exposes.
 */
export function useMobileDirectCallActions({
  selectedConversation,
  startCall,
}: {
  selectedConversation: MobileDMConversationListItem | null;
  startCall(input: { conversationId: string; title: string; video: boolean }): Promise<void>;
}) {
  const startDirectCall = useCallback(
    async (video: boolean) => {
      if (!selectedConversation) {
        return;
      }

      await startCall({
        conversationId: selectedConversation.id,
        title: getMobileConversationTitle(selectedConversation, copy.directMessageFallback),
        video,
      });
    },
    [selectedConversation, startCall],
  );

  return {
    onStartVideoCall: useCallback(() => void startDirectCall(true), [startDirectCall]),
    onStartVoiceCall: useCallback(() => void startDirectCall(false), [startDirectCall]),
  };
}

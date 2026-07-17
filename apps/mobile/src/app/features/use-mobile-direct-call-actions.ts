import { useCallback } from "react";

import {
  launchMobileDirectCall,
  openMobileVoiceRoom,
} from "../../voice/mobile-voice-room-route-navigation";
import { copy } from "../mobile-root-screen-shared";
import { getMobileConversationTitle } from "../mobile-display-model";
import type { MobileDMConversationListItem } from "../mobile-root-screen-shared";

/**
 * Binds the 4a header call buttons to the direct-call runtime so the product
 * shell only forwards the two intents the screen exposes.
 */
export function useMobileDirectCallActions({
  joinDirectCall,
  selectedConversation,
}: {
  joinDirectCall: Parameters<typeof launchMobileDirectCall>[0]["joinDirectCall"];
  selectedConversation: MobileDMConversationListItem | null;
}) {
  const startDirectCall = useCallback(
    async (video: boolean) => {
      if (!selectedConversation) {
        return;
      }

      await launchMobileDirectCall({
        conversationId: selectedConversation.id,
        joinDirectCall,
        openVoiceRoom: openMobileVoiceRoom,
        title: getMobileConversationTitle(selectedConversation, copy.directMessageFallback),
        video,
      });
    },
    [joinDirectCall, selectedConversation],
  );

  return {
    onStartVideoCall: useCallback(() => void startDirectCall(true), [startDirectCall]),
    onStartVoiceCall: useCallback(() => void startDirectCall(false), [startDirectCall]),
  };
}

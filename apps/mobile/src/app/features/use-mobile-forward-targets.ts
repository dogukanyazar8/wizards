import { useMemo } from "react";
import type { MobileDMConversationListItem } from "@wizards/types";

import type { MobileForwardTarget } from "../components/message-forward-sheet";
import { copy, getMobileConversationTitle } from "../mobile-root-screen-shared";

/**
 * The forward sheet's targets: the reader's own conversations, named the way
 * the inbox names them. It belongs to the conversation screen that opens the
 * sheet, but the list it reads is the inbox's, so the projection lives here
 * rather than in either screen.
 */
export function useMobileForwardTargets(
  conversations: readonly MobileDMConversationListItem[],
): readonly MobileForwardTarget[] {
  return useMemo(
    () =>
      conversations.map((conversation) => ({
        id: conversation.id,
        label: getMobileConversationTitle(conversation, copy.directMessageFallback),
        type: "dm" as const,
      })),
    [conversations],
  );
}

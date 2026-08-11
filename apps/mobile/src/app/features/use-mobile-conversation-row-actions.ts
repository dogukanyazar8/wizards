import { useCallback, useState } from "react";
import type { MobileDMConversationListItem } from "@wizards/types";

import type { MobileApiClient } from "../../api/mobile-api-client";
import {
  useMobileGroupMutations,
  useMobileGroupSettingsMutations,
} from "../../dm/mobile-group-client";
import { copy } from "../mobile-root-screen-shared";
import type { SheetAction } from "../components/kit/sheet-primitives";

export interface MobileConversationRowActions {
  readonly actions: readonly SheetAction[];
  close(): void;
  readonly conversation: MobileDMConversationListItem | null;
  open(conversationId: string): void;
}

/**
 * 2a §5's long-press sheet: pin, silence, hide. The three writes already exist
 * (they are 2f's own endpoints) and two of them are optimistic inside the
 * mutation, so all this owns is which row the sheet is about and what the rows
 * are called.
 *
 * The selected row is held by id rather than by value: a refetch replaces the
 * object, and a held copy would leave the sheet acting on a stale pin state.
 */
export function useMobileConversationRowActions(
  client: MobileApiClient,
  conversations: readonly MobileDMConversationListItem[],
  viewerId: string | null,
  onError: () => void,
): MobileConversationRowActions {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { hide } = useMobileGroupMutations(client, viewerId ?? undefined);
  const { setConversationPinned, setNotifyLevel } = useMobileGroupSettingsMutations(client);
  const conversation = conversations.find((entry) => entry.id === conversationId) ?? null;

  const close = useCallback(() => setConversationId(null), []);
  /**
   * Pin and mute roll themselves back on failure, so the only thing left to say
   * is that it failed — the row has already told the reader everything else.
   */
  const run = useCallback(
    (action: Promise<unknown>) => {
      setConversationId(null);
      void action.catch(onError);
    },
    [onError],
  );

  const actions: readonly SheetAction[] = conversation
    ? [
        {
          icon: "bookmark-outline",
          id: "pin",
          label: conversation.pinnedAt ? copy.conversationUnpinAction : copy.conversationPinAction,
          onPress: () =>
            run(
              setConversationPinned.mutateAsync({
                conversationId: conversation.id,
                pinned: conversation.pinnedAt === null,
              }),
            ),
          testID: "mobile-dm-row-action-pin",
        },
        {
          icon: "notifications-off-outline",
          id: "mute",
          label:
            conversation.notifyLevel === "ALL"
              ? copy.groupInfoActionMute
              : copy.groupInfoActionUnmute,
          onPress: () =>
            run(
              setNotifyLevel.mutateAsync({
                conversationId: conversation.id,
                // 2f owns the three-tier picker; this sheet is the on/off
                // shortcut, so it only ever writes the two ends of that ladder.
                notifyLevel: conversation.notifyLevel === "ALL" ? "NONE" : "ALL",
              }),
            ),
          testID: "mobile-dm-row-action-mute",
        },
        {
          destructive: true,
          icon: "eye-off-outline",
          id: "hide",
          label: copy.groupHideAction,
          onPress: () => run(hide.mutateAsync({ conversationId: conversation.id })),
          testID: "mobile-dm-row-action-hide",
        },
      ]
    : [];

  return { actions, close, conversation, open: setConversationId };
}

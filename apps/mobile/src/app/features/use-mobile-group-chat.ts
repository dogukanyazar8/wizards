import { useCallback, useMemo, useState } from "react";

import type { DMConversationDTO } from "@wizards/types";

import type { MobileApiClient } from "../../api/mobile-api-client";
import {
  useMobileGroupCallStateQuery,
  useMobileGroupDetailsQuery,
  useMobileGroupSettingsMutations,
} from "../../dm/mobile-group-client";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import {
  getGroupCallBannerState,
  getGroupCapabilities,
  getGroupMentionCandidates,
  getPinnedStripState,
  type MobileGroupCallBannerState,
  type MobileGroupCapabilities,
  type MobileGroupMemberSource,
  type MobileGroupMentionCandidate,
  type MobileGroupPinnedStripState,
} from "../mobile-group-chat-model";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §B. Everything 2d needs that a 1:1 does not, in
 * one hook so `dm-conversation-screen` stays the shell it is (§B: there is no
 * second chat screen).
 *
 * It reads `groupDetails` — the same key 2e and 2f open on and the same key
 * every group realtime event patches — so the header, the strip and the two
 * management screens can never disagree about a permission or a role.
 */
export interface MobileGroupChatState {
  readonly callBanner: MobileGroupCallBannerState;
  readonly capabilities: MobileGroupCapabilities;
  readonly details: DMConversationDTO | undefined;
  readonly members: readonly MobileGroupMemberSource[];
  readonly mentionCandidates: readonly MobileGroupMentionCandidate[];
  readonly onDismissPin: () => void;
  readonly onOpenInfo: () => void;
  readonly onOpenMembers: () => void;
  readonly onOpenSettings: () => void;
  readonly pinnedStrip: MobileGroupPinnedStripState;
  readonly title: string | null;
}

/** No members means no roster, and a stable identity keeps the row memo intact. */
const EMPTY_MEMBERS: readonly MobileGroupMemberSource[] = [];

export function useMobileGroupChat({
  client,
  conversationId,
  isGroup,
  viewerId,
}: {
  readonly client: MobileApiClient;
  readonly conversationId: string | null;
  readonly isGroup: boolean;
  readonly viewerId: string;
}): MobileGroupChatState | null {
  const enabled = isGroup && Boolean(conversationId);
  const detailsQuery = useMobileGroupDetailsQuery(client, conversationId ?? "", enabled);
  const callQuery = useMobileGroupCallStateQuery(client, conversationId ?? "", enabled);
  const { dismissPinnedStrip } = useMobileGroupSettingsMutations(client);
  // Mutation observer results are new objects on render; the command itself is
  // stable and keeps `onDismissPin` from invalidating the group screen model.
  const dismissPinnedStripMutate = dismissPinnedStrip.mutate;
  /**
   * §B2. The dismissal is local *and* written: the strip closes on this frame,
   * and the server remembers it so a reopen does not bring the same pin back.
   */
  const [dismissedPinId, setDismissedPinId] = useState<string | null>(null);

  const details = detailsQuery.data;
  const members = useMemo<readonly MobileGroupMemberSource[]>(
    () => details?.participants ?? EMPTY_MEMBERS,
    [details?.participants],
  );
  const mentionCandidates = useMemo(
    () => getGroupMentionCandidates(members, viewerId),
    [members, viewerId],
  );
  const capabilities = useMemo(
    () => getGroupCapabilities(details?.role, details?.permissions),
    [details?.permissions, details?.role],
  );
  const pinnedStrip = useMemo(
    () => getPinnedStripState({ pinnedMessage: details?.pinnedMessage }, dismissedPinId),
    [details?.pinnedMessage, dismissedPinId],
  );
  const callBanner = useMemo(
    () => getGroupCallBannerState(callQuery.data, viewerId),
    [callQuery.data, viewerId],
  );

  const onDismissPin = useCallback(() => {
    const messageId = pinnedStrip.messageId;
    if (!conversationId || !messageId) {
      return;
    }

    setDismissedPinId(messageId);
    // Fire-and-forget: the strip is already closed, and a failed write only
    // means it comes back on the next cold open.
    dismissPinnedStripMutate({ conversationId, messageId });
  }, [conversationId, dismissPinnedStripMutate, pinnedStrip.messageId]);

  const navigate = useCallback(
    (route: "GroupInfo" | "GroupMembers" | "GroupSettings") => {
      if (conversationId && mobileNavigationRef.isReady()) {
        mobileNavigationRef.navigate(route, { conversationId });
      }
    },
    [conversationId],
  );

  const onOpenInfo = useCallback(() => navigate("GroupInfo"), [navigate]);
  const onOpenMembers = useCallback(() => navigate("GroupMembers"), [navigate]);
  const onOpenSettings = useCallback(() => navigate("GroupSettings"), [navigate]);

  return useMemo(
    () =>
      enabled
        ? {
            callBanner,
            capabilities,
            details,
            members,
            mentionCandidates,
            onDismissPin,
            onOpenInfo,
            onOpenMembers,
            onOpenSettings,
            pinnedStrip,
            title: details?.name ?? null,
          }
        : null,
    [
      callBanner,
      capabilities,
      details,
      enabled,
      members,
      mentionCandidates,
      onDismissPin,
      onOpenInfo,
      onOpenMembers,
      onOpenSettings,
      pinnedStrip,
    ],
  );
}

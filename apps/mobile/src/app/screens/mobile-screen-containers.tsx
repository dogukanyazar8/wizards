import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { BackHandler } from "react-native";
import type { MobileDMConversationsResponse } from "@wizards/types";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import type {
  MobileBottomTabParamList,
  MobileRootStackParamList,
} from "../../navigation/mobile-navigation-types";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useMobileActiveTargetStore } from "../../state/mobile-active-target-store";
import { useMobileChannelTypingLabels } from "../features/use-mobile-typing-labels";
import { useMobileChannelRouteState } from "../features/use-mobile-channel-route-state";
import { useMobileDMRouteState } from "../features/use-mobile-dm-route-state";
import {
  useMobileChannelScreenProps,
  useMobileMessagesScreenProps,
  useMobileNotificationsScreenProps,
  useMobileOverviewScreenProps,
  useMobileProductNavigationActions,
  useMobileSettingsScreenProps,
  useMobileVoiceScreenProps,
} from "../providers/mobile-product-screen-provider";
import { useMobileRealtimeRuntime } from "../providers/mobile-realtime-provider";
import { MessagesScreen } from "./dm-screen";
import { MobileGroupCreateScreen } from "./group-create-screen";
import { useMobileGroupMutations } from "../../dm/mobile-group-client";
import { pickAndUploadMobileGroupIcon } from "../../dm/mobile-group-icon-upload";
import { useMobileFriendsQuery } from "../../social/mobile-social-query";
import { MobileGroupDetailsScreen } from "../../dm/mobile-group-details-screen";
import { fetchMobileDMDetails } from "../../dm/mobile-dm-details-client";
import { MobileMessageThreadScreen } from "./message-thread-screen";
import { OverviewScreen } from "./home-screen";
import { NotificationsScreen } from "./notifications-screen";
import { ProfileSettingsScreen } from "./settings-screen";
import { BlockedUsersScreen } from "../../social/social-account-screens";
import { MobileLegalDocumentScreen } from "../../legal/mobile-legal-document-screen";
import { MobileOpenSourceLicensesScreen } from "../../legal/mobile-open-source-licenses-screen";
import { MobilePerformanceDiagnosticsScreen } from "./mobile-performance-diagnostics-screen";
import {
  MobileAboutReleaseHistoryScreen,
  MobileAboutReleaseNoteScreen,
  MobileAboutUpdateChannelScreen,
  MobileBugReportScreen,
  MobileCommunityInviteScreen,
  MobileServerProfileScreen,
} from "./about/about-screen-shells";
import { getMobileAppReleaseChannel } from "../../about/mobile-app-identity";
import { MobileHelpCenterScreen } from "./about/about-help-center-screen";
import { MobileAboutWhatsNewScreen } from "./about/about-whats-new-screen";
import { MobileFeedbackFlowScreen } from "../../feedback/mobile-feedback-flow-screen";
import { MobileFeedbackSubmittedScreen } from "../../feedback/mobile-feedback-submitted-screen";
import { MobileRoadmapScreen } from "../../feedback/mobile-roadmap-screen";
import { MobileAdminCasesScreen } from "../../admin/mobile-admin-cases-screen";
import { MobileAdminCaseDetailScreen } from "../../admin/mobile-admin-case-detail-screen";
import { mobilePackageJson } from "../mobile-root-screen-shared";
import { MobileProfileEditScreen } from "../../social/mobile-profile-edit-screen";
import { MobileUserProfileScreen } from "../../social/mobile-user-profile-screen";
import { useOpenMobileProfileCard } from "../../social/profile-card";
import { VoiceScreen } from "./voice-screen";
import { MobileDirectCallScreen } from "./mobile-direct-call-screen";
import { MobileDirectVideoCallScreen } from "./mobile-direct-video-call-screen";
import {
  MobileOutgoingVideoCallScreen,
  MobileOutgoingVoiceCallScreen,
} from "./mobile-outgoing-call-screen";
import { useMobileDMCallStore } from "../../state/mobile-dm-call-store";
import { MobileTwoFactorScreen } from "../../account/mobile-two-factor-screen";
import { MobileSharedMediaScreen } from "../../dm/mobile-shared-media-screen";
import { resolveMobileSharedMediaParticipantName } from "../../dm/mobile-shared-media-model";
import { flattenMobileDMConversationPages } from "../../query/mobile-dm-conversations-query";
import { mobileQueryKeys } from "../../query/mobile-query-keys";
import { getMobileRuntimeConfig } from "../../config/environment";
import { useMobileBootstrapQuery } from "../../query/mobile-bootstrap-query";
import {
  getMobileNavigationSampleId,
  markMobileNavigationPhase,
  markMobileNavigationStage,
  type MobileNavigationPhase,
} from "../../performance/mobile-navigation-timing";
import { resolveMobileTelemetryDimensions } from "../../performance/mobile-telemetry-dimensions";
import { MobileServerSettingsScreen } from "../../workspace/mobile-server-settings-screen";
import { MobileServerRolesScreen } from "../../workspace/mobile-server-roles-screen";
import { MobileRoleDetailScreen } from "../../workspace/mobile-role-detail-screen";
import { MobileServerMembersScreen } from "../../workspace/mobile-server-members-screen";
import { MobileServerInvitesScreen } from "../../workspace/mobile-server-invites-screen";
import { MobileChannelSettingsScreen } from "../../workspace/mobile-channel-settings-screen";
import { MobileServerDiscoveryScreen } from "../../workspace/mobile-server-discovery-screen";
import {
  clearMobileVoiceRoomRouteContext,
  getMobileVoiceRoomRouteContext,
  hasMatchingMobileVoiceRoomRouteContext,
} from "../../voice/mobile-voice-room-route-context";
import { hasVoiceRoomContext, isVoiceSessionActive } from "../../voice/mobile-voice-room-contract";

const MOBILE_VOICE_LEAVING_TIMEOUT_MS = 5_000;

export function OverviewTabScreenContainer({
  navigation,
}: BottomTabScreenProps<MobileBottomTabParamList, "overview">) {
  const screenProps = useMobileOverviewScreenProps();
  const { prefetchChannelMessages } = useMobileProductNavigationActions();
  const rootNavigation =
    navigation.getParent<NativeStackNavigationProp<MobileRootStackParamList>>();

  return (
    <OverviewScreen
      {...screenProps}
      onOpenThread={(messageId) => {
        if (screenProps.activeWorkspaceTextChannelId && rootNavigation) {
          rootNavigation.navigate("MessageThread", {
            contextId: screenProps.activeWorkspaceTextChannelId,
            messageId,
            scope: "channel",
          });
        }
      }}
      onOpenWorkspaceChannel={async (channel) => {
        // Push before the state work. The native stack starts its animation on
        // the tap frame instead of queueing behind the read-marking and
        // selection updates the open handler performs.
        if (channel.type === "TEXT" && screenProps.selectedWorkspaceServerId && rootNavigation) {
          // Warm the stream first: the request leaves on the tap frame rather
          // than after the push and the selection commit.
          // Opens the tap-to-content span as well: it is the only caller that
          // knows whether this stream was already cached.
          const navigationSampleId = prefetchChannelMessages(channel.id);
          rootNavigation.navigate("ChannelChat", {
            channelId: channel.id,
            serverId: screenProps.selectedWorkspaceServerId,
          });
          markMobileNavigationPhase(
            "ChannelChat",
            "navigation-dispatched",
            globalThis.performance.now(),
            navigationSampleId,
          );
          void screenProps.onOpenWorkspaceChannel(channel);
          return false;
        }

        const shouldOpenVoiceRoom = await screenProps.onOpenWorkspaceChannel(channel);
        if (channel.type === "VOICE" && shouldOpenVoiceRoom && rootNavigation) {
          rootNavigation.navigate("VoiceRoom");
          return true;
        }

        return false;
      }}
    />
  );
}

export function MessagesTabScreenContainer({
  navigation,
}: BottomTabScreenProps<MobileBottomTabParamList, "messages">) {
  const screenProps = useMobileMessagesScreenProps();
  const { prefetchDMMessages } = useMobileProductNavigationActions();
  const rootNavigation =
    navigation.getParent<NativeStackNavigationProp<MobileRootStackParamList>>();

  return (
    // 8d: threads are channel-only, so the DM tab exposes no thread entry point.
    <MessagesScreen
      {...screenProps}
      onOpenConversation={(conversationId) => {
        // Push first, same reasoning as the channel row: the animation should
        // not wait behind the selection state the open handler sets.
        const navigationSampleId = prefetchDMMessages(conversationId);
        rootNavigation?.navigate("DirectMessage", { conversationId });
        markMobileNavigationPhase(
          "DirectMessage",
          "navigation-dispatched",
          globalThis.performance.now(),
          navigationSampleId,
        );
      }}
    />
  );
}

export function NotificationsTabScreenContainer(
  _props: BottomTabScreenProps<MobileBottomTabParamList, "notifications">,
) {
  return <NotificationsScreen {...useMobileNotificationsScreenProps()} />;
}

export function VoiceRoomStackScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "VoiceRoom">) {
  const screenProps = useMobileVoiceScreenProps();
  const room = screenProps.voiceRoomState;
  const routeContext = getMobileVoiceRoomRouteContext();
  const dmCallSession = useMobileDMCallStore((state) => state.session);
  // The room state resets the moment the session drops, so the route context is what still
  // says this screen belongs to a DM call.
  const isDirectCall = room.sessionMode === "direct" || routeContext?.sessionMode === "direct";
  const isRingingOut = isDirectCall && dmCallSession?.status === "ringing-out";
  const hasRouteContext =
    routeContext !== null &&
    (room.status === "idle" ||
      (hasMatchingMobileVoiceRoomRouteContext(room) && hasVoiceRoomContext(room)));
  // Both `replace` and `navigate` ignore what is already below the room:
  // replacing left a second MainTabs on the stack and navigating pushed one, so
  // back after a minimise landed on the voice room again. Popping the room off
  // is what keeps a single MainTabs and returns the user to the screen the call
  // interrupted.
  const dismissVoiceRoomScreen = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.popTo("MainTabs", { screen: "overview" });
  }, [navigation]);
  const leaveVoiceRoom = useCallback(async () => {
    try {
      // A DM call hangs up through its own handler so the peer is told and the ring state
      // is cleared; otherwise the stale session would block the next call.
      const endDirectCall = useMobileDMCallStore.getState().endCall;
      if (endDirectCall && isDirectCall) {
        await endDirectCall();
      } else {
        await screenProps.onLeaveVoiceChannel();
      }
    } finally {
      clearMobileVoiceRoomRouteContext();
      dismissVoiceRoomScreen();
    }
  }, [dismissVoiceRoomScreen, isDirectCall, screenProps]);
  const leaveAndReturnToOverview = useCallback(() => {
    void leaveVoiceRoom();
  }, [leaveVoiceRoom]);
  const cancelOutgoingCall = useCallback(() => {
    void (useMobileDMCallStore.getState().endCall?.() ?? Promise.resolve());
  }, []);
  const openVoiceRoomChat = useCallback(() => {
    if (!room.channelId || !room.serverId) {
      return;
    }

    navigation.navigate("ChannelChat", { channelId: room.channelId, serverId: room.serverId });
  }, [navigation, room.channelId, room.serverId]);
  useEffect(() => {
    if (!hasRouteContext) {
      dismissVoiceRoomScreen();
    }
  }, [dismissVoiceRoomScreen, hasRouteContext]);

  // A declined, cancelled or peer-ended DM call clears the session. Land the user back in
  // the conversation the call belonged to instead of the empty channel room UI.
  useEffect(() => {
    if (routeContext?.sessionMode !== "direct" || dmCallSession) {
      return;
    }

    const conversationId = routeContext.conversationId;
    clearMobileVoiceRoomRouteContext();
    if (conversationId) {
      // The conversation is usually already on the stack under the call, so pop
      // back onto it instead of stacking a second copy of the same DM.
      navigation.popTo("DirectMessage", { conversationId });
      return;
    }

    dismissVoiceRoomScreen();
  }, [
    dismissVoiceRoomScreen,
    dmCallSession,
    navigation,
    routeContext?.conversationId,
    routeContext?.sessionMode,
  ]);

  useEffect(() => {
    if (room.status !== "leaving") {
      return;
    }

    const timeout = setTimeout(() => {
      clearMobileVoiceRoomRouteContext();
      dismissVoiceRoomScreen();
    }, MOBILE_VOICE_LEAVING_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [dismissVoiceRoomScreen, room.status]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (isVoiceSessionActive(room.status)) {
          dismissVoiceRoomScreen();
          return true;
        }

        if (room.status === "error") {
          leaveAndReturnToOverview();
          return true;
        }

        return room.status === "checking-permission" || room.status === "leaving";
      });

      return () => subscription.remove();
    }, [leaveAndReturnToOverview, dismissVoiceRoomScreen, room.status]),
  );

  if (!hasRouteContext) {
    return null;
  }

  if (isRingingOut && dmCallSession) {
    const outgoingProps = {
      calleeName: dmCallSession.title,
      onCancelCall: cancelOutgoingCall,
      onMinimize: dismissVoiceRoomScreen,
      onToggleVoiceMute: screenProps.onToggleVoiceMute,
      voiceRoomState: room,
      ...(screenProps.onFlipVoiceCamera
        ? { onFlipVoiceCamera: screenProps.onFlipVoiceCamera }
        : {}),
      ...(screenProps.onSelectVoiceAudioOutput
        ? { onSelectVoiceAudioOutput: screenProps.onSelectVoiceAudioOutput }
        : {}),
      // The ringing screen carries the room's session strip, so its noise toggle
      // needs the same handler the answered call gets.
      ...(screenProps.onSelectVoiceNoiseSuppression
        ? { onSelectVoiceNoiseSuppression: screenProps.onSelectVoiceNoiseSuppression }
        : {}),
      ...(screenProps.onToggleVoiceCamera
        ? { onToggleVoiceCamera: screenProps.onToggleVoiceCamera }
        : {}),
    };

    return dmCallSession.isVideo ? (
      <MobileOutgoingVideoCallScreen {...outgoingProps} />
    ) : (
      <MobileOutgoingVoiceCallScreen {...outgoingProps} />
    );
  }

  if (isDirectCall) {
    const isVideoCall =
      room.selfCameraEnabled ||
      room.participants.some((participant) => !participant.isSelf && participant.isCameraEnabled);

    if (isVideoCall) {
      return (
        <MobileDirectVideoCallScreen
          {...screenProps}
          callStartedAt={dmCallSession?.connectedAt ?? null}
          onLeaveVoiceChannel={leaveVoiceRoom}
          onMinimize={dismissVoiceRoomScreen}
          testID="mobile-direct-video-call-screen"
        />
      );
    }

    return (
      <MobileDirectCallScreen
        {...screenProps}
        callStartedAt={dmCallSession?.connectedAt ?? null}
        onLeaveVoiceChannel={leaveVoiceRoom}
        onMinimize={dismissVoiceRoomScreen}
        testID="mobile-direct-call-screen"
      />
    );
  }

  return (
    <VoiceScreen
      {...screenProps}
      onLeaveVoiceChannel={leaveVoiceRoom}
      onMinimize={dismissVoiceRoomScreen}
      onOpenChat={openVoiceRoomChat}
      testID="mobile-voice-room-screen"
    />
  );
}

export function SettingsTabScreenContainer(
  _props: BottomTabScreenProps<MobileBottomTabParamList, "settings">,
) {
  return <ProfileSettingsScreen {...useMobileSettingsScreenProps()} />;
}

export function ChannelStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "ChannelChat">) {
  const screenProps = useMobileChannelScreenProps();
  const { openWorkspaceRoute } = useMobileProductNavigationActions();
  const { channelId, serverId } = route.params;
  const auth = useMobileAuth();
  const { stopChannelTyping, updateChannelTyping } = useMobileRealtimeRuntime();
  const routeState = useMobileChannelRouteState({
    apiClient: auth.apiClient,
    channelId,
    currentUser: auth.session?.user ?? null,
    isSignedIn: auth.status === "signed-in",
    stopTyping: stopChannelTyping,
    updateTyping: updateChannelTyping,
  });
  const navigationSampleIdRef = useRef<string | null>(null);
  // Second of the three stages: this screen's tree is committed. Whatever is
  // left before content is the list's own first render.
  useEffect(() => {
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("ChannelChat");
    markMobileNavigationStage(
      "ChannelChat",
      "mounted",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, []);
  useMobileTransitionCompletion(navigation, "ChannelChat", navigationSampleIdRef);
  const closeWorkspaceChannel = screenProps.onCloseWorkspaceChannel;
  const closeWorkspaceChannelRef = useLatestValueRef(closeWorkspaceChannel);
  const setServer = useMobileActiveTargetStore((state) => state.setServer);
  const setTextChannel = useMobileActiveTargetStore((state) => state.setTextChannel);

  useFocusEffect(
    useCallback(() => {
      openWorkspaceRoute(serverId, channelId);
      setTextChannel(serverId, channelId);
      navigationSampleIdRef.current ??= getMobileNavigationSampleId("ChannelChat");
      markMobileNavigationPhase(
        "ChannelChat",
        "conversation-selection-ready",
        globalThis.performance.now(),
        navigationSampleIdRef.current,
      );

      return () => {
        closeWorkspaceChannelRef.current();
        const current = useMobileActiveTargetStore.getState();
        if (current.serverId === serverId && current.channelId === channelId) {
          setServer(serverId);
        }
      };
    }, [
      channelId,
      closeWorkspaceChannelRef,
      openWorkspaceRoute,
      serverId,
      setServer,
      setTextChannel,
    ]),
  );

  return (
    // A notification or deep link for another channel reuses this screen rather
    // than stacking a second one, so the subtree is keyed by the route params:
    // scroll offset, search text and selection reset with the channel instead
    // of bleeding into it, and the stack still never grows. Keeping one
    // instance is why this is a key and not `getId` — a route per channel would
    // hold every visited channel mounted.
    <OverviewScreen
      key={`${serverId}:${channelId}`}
      {...screenProps}
      activeWorkspaceTextChannelId={channelId}
      activeWorkspaceVoiceChannelId={null}
      canRenderChannelChat
      channelFirstUnreadMessageId={routeState.firstUnreadMessageId}
      channelMessagesState={routeState.messagesState}
      channelPinnedMessages={routeState.pinnedMessages}
      isReactionMutationPending={routeState.isReactionPending || routeState.isMessageActionPending}
      onChannelDraftChange={routeState.draftChanged}
      onDeleteMessage={routeState.deleteMessage}
      onDiscardMessage={routeState.discardMessage}
      onEditMessage={routeState.editMessage}
      onLoadMoreChannelMessages={routeState.loadMoreMessages}
      onPinMessage={routeState.pinMessage}
      onRefreshChannelMessages={routeState.refreshMessages}
      onRefreshVisibleData={() => {
        screenProps.onRefreshVisibleData();
        routeState.refreshMessages();
      }}
      onRetryMessage={routeState.retryMessage}
      onSendChannelGif={routeState.sendGif}
      onSendChannelMessage={routeState.sendMessage}
      onToggleMessageReaction={routeState.toggleReaction}
      onOpenThread={(messageId) => {
        navigation.navigate("MessageThread", { contextId: channelId, messageId, scope: "channel" });
      }}
      onCloseWorkspaceChannel={() => {
        screenProps.onCloseWorkspaceChannel();
        navigation.goBack();
      }}
      selectedWorkspaceChannelId={channelId}
      selectedWorkspaceServerId={serverId}
    />
  );
}

export function DirectMessageStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "DirectMessage">) {
  const screenProps = useMobileMessagesScreenProps();
  const { conversationId } = route.params;
  const navigationSampleIdRef = useRef<string | null>(null);
  const auth = useMobileAuth();
  const routeState = useMobileDMRouteState({
    apiClient: auth.apiClient,
    conversationId,
    conversations: screenProps.dmConversations ?? [],
    currentUserId: auth.session?.user.id ?? null,
    isSignedIn: auth.status === "signed-in",
  });
  // Second of the three stages: this screen's tree is committed. Whatever is
  // left before content is the list's own first render.
  useEffect(() => {
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("DirectMessage");
    markMobileNavigationStage(
      "DirectMessage",
      "mounted",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, []);
  useMobileTransitionCompletion(navigation, "DirectMessage", navigationSampleIdRef);
  const closeDMConversation = screenProps.onCloseConversation;
  const closeDMConversationRef = useLatestValueRef(closeDMConversation);
  const openDMConversation = screenProps.onOpenConversation;
  const setConversation = useMobileActiveTargetStore((state) => state.setConversation);

  useFocusEffect(
    useCallback(() => {
      openDMConversation(conversationId);
      setConversation(conversationId);
      navigationSampleIdRef.current ??= getMobileNavigationSampleId("DirectMessage");
      markMobileNavigationPhase(
        "DirectMessage",
        "conversation-selection-ready",
        globalThis.performance.now(),
        navigationSampleIdRef.current,
      );

      return () => {
        closeDMConversationRef.current(conversationId);
        if (useMobileActiveTargetStore.getState().conversationId === conversationId) {
          setConversation(null);
        }
      };
    }, [closeDMConversationRef, conversationId, openDMConversation, setConversation]),
  );

  return (
    // Same reuse rule as the channel screen: a conversation switch through an
    // external intent remounts the subtree so no draft-adjacent local state
    // follows the user into the next conversation.
    <MessagesScreen
      key={conversationId}
      {...screenProps}
      canRenderConversation
      dmMessagesState={routeState.messagesState}
      onLoadMoreMessages={routeState.loadMoreMessages}
      onRefreshConversation={routeState.refreshConversation}
      onRefreshVisibleData={() => {
        screenProps.onRefreshVisibleData();
        routeState.refreshConversation();
      }}
      selectedConversation={routeState.selectedConversation}
      selectedConversationId={conversationId}
      onOpenThread={(messageId) => {
        navigation.navigate("MessageThread", { contextId: conversationId, messageId, scope: "dm" });
      }}
      onCloseConversation={() => {
        screenProps.onCloseConversation(conversationId);
        navigation.goBack();
      }}
    />
  );
}

/**
 * Dev-only instrument. Registered for every environment except production so a UAT
 * *release* build can report its own numbers — a debug build's numbers are not
 * comparable to anything a reader would experience.
 */
export function PerformanceDiagnosticsStackScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "PerformanceDiagnostics">) {
  const queryClient = useQueryClient();
  const bootstrap = queryClient.getQueryData<{ readonly app?: { readonly buildId?: string } }>(
    mobileQueryKeys.bootstrap(),
  );
  return (
    <MobilePerformanceDiagnosticsScreen
      backendBuildId={bootstrap?.app?.buildId ?? "unknown"}
      onBack={() => navigation.goBack()}
    />
  );
}

export function MessageThreadStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "MessageThread">) {
  const screenProps = useMobileOverviewScreenProps();
  const { contextId, messageId } = route.params;
  const channelName = findMobileWorkspaceChannelName(screenProps.workspaceServerState, contextId);
  // The thread belongs to one channel, so it selects that channel's typing users
  // itself instead of receiving whatever the root last carried.
  const { channelTypingUsers } = useMobileChannelTypingLabels(contextId);

  return (
    <MobileMessageThreadScreen
      key={`${contextId}:${messageId}`}
      {...(channelName ? { channelName } : {})}
      contextId={contextId}
      messageId={messageId}
      onBack={() => navigation.goBack()}
      serverId={findMobileWorkspaceServerId(screenProps.workspaceServerState)}
      typingUsers={channelTypingUsers}
    />
  );
}

function findMobileWorkspaceChannelName(
  serverState: ReturnType<typeof useMobileOverviewScreenProps>["workspaceServerState"],
  channelId: string,
): string | null {
  const detail = serverState.status === "ready" ? serverState.payload.detail : null;
  if (!detail) {
    return null;
  }

  const channels = [
    ...detail.categories.flatMap((category) => category.channels),
    ...detail.ungroupedChannels,
  ];
  return channels.find((channel) => channel.id === channelId)?.name ?? null;
}

/** 10a: the thread screen needs the owning server to resolve its mention roster. */
function findMobileWorkspaceServerId(
  serverState: ReturnType<typeof useMobileOverviewScreenProps>["workspaceServerState"],
): string | null {
  return serverState.status === "ready" ? serverState.payload.detail.server.id : null;
}

export function SettingsDetailScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "SettingsDetail">) {
  return (
    <ProfileSettingsScreen
      {...useMobileSettingsScreenProps()}
      activeSection={route.params.section}
      // Carried through rather than read here: only the badges section knows
      // what to do with it (07 §4).
      activeBadgeId={route.params.badgeId}
      onBack={() => navigation.goBack()}
    />
  );
}

export function ProfileEditScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "ProfileEdit">) {
  return <MobileProfileEditScreen onBack={() => navigation.goBack()} />;
}

/**
 * Faz 5 §15.3. The created conversation is opened directly instead of unwinding
 * to the inbox: the user just named a group, and the next thing they want is to
 * write in it.
 */
export function GroupCreateScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "GroupCreate">) {
  const { apiClient, getAccessToken } = useMobileAuth();
  const friendsQuery = useMobileFriendsQuery(apiClient);
  const { create } = useMobileGroupMutations(apiClient);

  return (
    <MobileGroupCreateScreen
      friends={friendsQuery.data?.friends ?? []}
      isPending={create.isPending}
      onCancel={() => navigation.goBack()}
      onCreated={(conversationId) => navigation.navigate("DirectMessage", { conversationId })}
      onPickPhoto={() => pickAndUploadMobileGroupIcon({ getAccessToken })}
      onSubmit={(input) => create.mutateAsync(input)}
    />
  );
}

export function GroupDetailsScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "GroupDetails">) {
  const { conversationId } = route.params;
  const { apiClient, getAccessToken, session } = useMobileAuth();
  const currentUserId = session?.user.id ?? "";
  const conversations = useMobileDMConversationsCache();
  const conversation = conversations.find((entry) => entry.id === conversationId) ?? null;
  const { addMembers, hide, removeMember, setMuted, update } = useMobileGroupMutations(
    apiClient,
    currentUserId,
  );
  const detailsQuery = useQuery({
    queryFn: () => fetchMobileDMDetails(apiClient, conversationId),
    queryKey: mobileQueryKeys.dmDetails(conversationId),
    staleTime: 30_000,
  });
  // Only the owner can add anyone, so only the owner pays for the friend list.
  const friendsQuery = useMobileFriendsQuery(
    apiClient,
    Boolean(detailsQuery.data?.ownerId && detailsQuery.data.ownerId === currentUserId),
  );

  return (
    <MobileGroupDetailsScreen
      conversation={{
        iconUrl: conversation?.iconUrl ?? null,
        id: conversationId,
        name: conversation?.name ?? null,
        // The inbox row does not carry `ownerId`; the details read is the only
        // source, so owner-only controls stay hidden until it lands.
        ownerId: detailsQuery.data?.ownerId ?? null,
      }}
      currentUserId={currentUserId}
      friends={friendsQuery.data?.friends ?? []}
      isMuted={conversation?.muted ?? false}
      isPending={
        addMembers.isPending ||
        hide.isPending ||
        removeMember.isPending ||
        setMuted.isPending ||
        update.isPending
      }
      members={detailsQuery.data?.members ?? []}
      onAddMembers={(userIds) => addMembers.mutateAsync({ conversationId, userIds })}
      onBack={() => navigation.goBack()}
      onHide={async () => {
        await hide.mutateAsync({ conversationId });
        navigation.popTo("MainTabs", { screen: "messages" });
      }}
      onLeave={async () => {
        await removeMember.mutateAsync({ conversationId, userId: currentUserId });
        navigation.popTo("MainTabs", { screen: "messages" });
      }}
      onOpenSharedMedia={() => navigation.navigate("SharedMedia", { conversationId })}
      // The group exists, so the upload is authorized against it rather than
      // left inert the way a create-time icon is.
      onPickPhoto={() => pickAndUploadMobileGroupIcon({ conversationId, getAccessToken })}
      onRemoveMember={(userId) => removeMember.mutateAsync({ conversationId, userId })}
      onSetMuted={(muted) => setMuted.mutateAsync({ conversationId, muted })}
      onUpdate={(patch) => update.mutateAsync({ conversationId, patch })}
    />
  );
}

export function BlockedUsersScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "BlockedUsers">) {
  return <BlockedUsersScreen onBack={() => navigation.goBack()} />;
}

export function LegalDocumentScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "LegalDocument">) {
  return (
    <MobileLegalDocumentScreen
      documentId={route.params.documentId}
      onBack={() => navigation.goBack()}
    />
  );
}

export function UserProfileStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "UserProfile">) {
  const { serverId, userId } = route.params;
  const { openWorkspaceRoute } = useMobileProductNavigationActions();
  const openProfileCard = useOpenMobileProfileCard();

  return (
    // Same rule as the channel screen: a second profile reuses this route, so
    // the subtree is keyed by the user instead of stacking one screen per visit.
    <MobileUserProfileScreen
      key={`${userId}:${serverId ?? ""}`}
      onBack={() => navigation.goBack()}
      onOpenConversation={(conversationId) =>
        navigation.navigate("DirectMessage", { conversationId })
      }
      onOpenProfileEdit={() => navigation.navigate("ProfileEdit")}
      // 11f owns the gallery screen; the page only knows which conversation and
      // person it is about.
      onOpenSharedMedia={({ conversationId, userId: peerUserId }) =>
        navigation.navigate("SharedMedia", { conversationId, userId: peerUserId })
      }
      onOpenServer={(nextServerId) => {
        openWorkspaceRoute(nextServerId, null);
        // The workspace lives in the overview tab; popTo walks back to the tabs
        // instead of stacking a second MainTabs above this screen (10g).
        navigation.popTo("MainTabs", { screen: "overview" });
      }}
      // README 1c: a mutual friend opens as the quick card (11b), and its own
      // "Profili görüntüle" is what pushes another page on top of this one.
      onOpenUserProfile={(nextUserId) => openProfileCard(nextUserId, serverId)}
      {...(serverId ? { serverId } : {})}
      userId={userId}
    />
  );
}

export function OpenSourceLicensesScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "OpenSourceLicenses">) {
  return (
    // The manifest is generated from this package's own dependency closure, so
    // the version stamped on it is the package version — not whatever the
    // server reports for the account's release channel.
    <MobileOpenSourceLicensesScreen
      appVersion={mobilePackageJson.version}
      onBack={() => navigation.goBack()}
    />
  );
}

export function AboutWhatsNewScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "AboutWhatsNew">) {
  return (
    <MobileAboutWhatsNewScreen
      installedVersion={mobilePackageJson.version}
      onBack={() => navigation.goBack()}
      onOpenBugReport={() => navigation.navigate("BugReport")}
      onOpenReleaseHistory={() => navigation.navigate("AboutReleaseHistory")}
      onOpenReleaseNote={(version) => navigation.navigate("AboutReleaseNote", { version })}
    />
  );
}

export function AboutReleaseNoteScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "AboutReleaseNote">) {
  return (
    <MobileAboutReleaseNoteScreen
      key={route.params.version}
      installedVersion={mobilePackageJson.version}
      onBack={() => navigation.goBack()}
      version={route.params.version}
      webUrl={getMobileRuntimeConfig().webUrl}
    />
  );
}

export function AboutReleaseHistoryScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "AboutReleaseHistory">) {
  return (
    <MobileAboutReleaseHistoryScreen
      installedVersion={mobilePackageJson.version}
      onBack={() => navigation.goBack()}
      onOpenReleaseNote={(version) => navigation.navigate("AboutReleaseNote", { version })}
    />
  );
}

export function AboutUpdateChannelScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "AboutUpdateChannel">) {
  return (
    <MobileAboutUpdateChannelScreen
      currentChannel={getMobileAppReleaseChannel()}
      onBack={() => navigation.goBack()}
    />
  );
}

export function HelpCenterScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "HelpCenter">) {
  return (
    <MobileHelpCenterScreen
      onBack={() => navigation.goBack()}
      onOpenBugReport={(category) =>
        navigation.navigate("BugReport", category === undefined ? undefined : { category })
      }
    />
  );
}

export function BugReportScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "BugReport">) {
  const auth = useMobileAuth();
  const bootstrapQuery = useMobileBootstrapQuery(auth.apiClient, auth.status === "signed-in");
  const runtime = resolveMobileTelemetryDimensions();
  const app = bootstrapQuery.data?.app;

  return (
    <MobileBugReportScreen
      appBuild={app?.buildId ?? runtime.buildId}
      appVersion={app?.version ?? mobilePackageJson.version}
      onBack={() => navigation.goBack()}
      releaseChannel={getMobileAppReleaseChannel()}
      {...(route.params?.category === undefined ? {} : { category: route.params.category })}
    />
  );
}

export function CommunityInviteScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "CommunityInvite">) {
  const { openWorkspaceRoute } = useMobileProductNavigationActions();
  const runtime = getMobileRuntimeConfig();

  return (
    <MobileCommunityInviteScreen
      onBack={() => navigation.goBack()}
      onOpenServer={(serverId) => {
        openWorkspaceRoute(serverId, null);
        navigation.popTo("MainTabs", { screen: "overview" });
      }}
      slug={route.params?.slug ?? runtime.communityInviteSlug}
      webUrl={runtime.webUrl}
    />
  );
}

/** S2 Section D: the same 2g body, sourced by `serverId` (settings/members entry points, deep link). */
export function ServerProfileScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "ServerProfile">) {
  const { openWorkspaceRoute } = useMobileProductNavigationActions();
  const runtime = getMobileRuntimeConfig();

  return (
    <MobileServerProfileScreen
      onBack={() => navigation.goBack()}
      onOpenServer={(serverId) => {
        openWorkspaceRoute(serverId, null);
        navigation.popTo("MainTabs", { screen: "overview" });
      }}
      serverId={route.params.serverId}
      webUrl={runtime.webUrl}
    />
  );
}

/** S3 Section D: browse public, discoverable servers. A card tap opens the S2 profile screen. */
export function DiscoverScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "Discover">) {
  return (
    <MobileServerDiscoveryScreen
      onBack={() => navigation.goBack()}
      onOpenServer={(serverId) => navigation.navigate("ServerProfile", { serverId })}
    />
  );
}

export function SecurityScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "Security">) {
  return <MobileTwoFactorScreen onBack={() => navigation.goBack()} />;
}

export function FeedbackScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "Feedback">) {
  return (
    <MobileFeedbackFlowScreen
      appVersion={mobilePackageJson.version}
      onClose={() => navigation.goBack()}
      onOpenRoadmap={() => navigation.navigate("Roadmap")}
    />
  );
}

/** The tracking view a FEEDBACK notification opens; it reads live status. */
export function FeedbackSubmittedScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "FeedbackSubmitted">) {
  const feedbackId = route.params?.feedbackId;

  return (
    <MobileFeedbackSubmittedScreen
      {...(feedbackId ? { feedbackId } : {})}
      // A notification tap can be the first screen of a cold start, so there is
      // not always something behind this one to go back to.
      key={feedbackId ?? "feedback-tracking"}
      onBack={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigation.popTo("MainTabs", { screen: "settings" })
      }
      onOpenRoadmap={() => navigation.navigate("Roadmap")}
      onStartNewFeedback={() => navigation.navigate("Feedback")}
    />
  );
}

export function RoadmapScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "Roadmap">) {
  return (
    <MobileRoadmapScreen
      onBack={() => navigation.goBack()}
      onOpenFeedback={(feedbackId) => navigation.navigate("FeedbackSubmitted", { feedbackId })}
      // `navigate` rather than `push`: the roadmap is usually opened from the
      // form, and an empty "Bildirdiklerim" should return to that form rather
      // than stack a second copy of it behind this screen.
      onStartFeedback={() => navigation.navigate("Feedback")}
    />
  );
}

export function AdminIncidentsScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "AdminIncidents">) {
  return (
    <MobileAdminCasesScreen
      onBack={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigation.popTo("MainTabs", { screen: "settings" })
      }
      onOpenCase={(caseId) => navigation.navigate("AdminIncidentDetail", { caseId })}
    />
  );
}

/**
 * A MODERATION notification can be the first screen of a cold start, so this
 * one never assumes there is a queue behind it to go back to.
 */
export function AdminIncidentDetailScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "AdminIncidentDetail">) {
  const { caseId } = route.params;

  return (
    <MobileAdminCaseDetailScreen
      caseId={caseId}
      key={caseId}
      onBack={() =>
        navigation.canGoBack() ? navigation.goBack() : navigation.popTo("AdminIncidents")
      }
    />
  );
}

export function SharedMediaScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "SharedMedia">) {
  const { conversationId, userId } = route.params;
  const conversations = useMobileDMConversationsCache();
  const { session } = useMobileAuth();

  return (
    <MobileSharedMediaScreen
      // The gallery is reachable from both the DM header and a profile page, so
      // a second conversation reuses this route: key the subtree by target.
      key={conversationId}
      conversationId={conversationId}
      onBack={() => navigation.goBack()}
      // The DM header opens this route with no `userId`, and the cached
      // conversation lists the viewer first: without the viewer's own id the
      // subtitle names the viewer instead of the person the gallery is about.
      participantName={resolveMobileSharedMediaParticipantName(conversations, {
        conversationId,
        ...(session?.user.id ? { currentUserId: session.user.id } : {}),
        ...(userId ? { userId } : {}),
      })}
    />
  );
}

/**
 * The DM list the caller already came through. Reading the name from cache
 * keeps the gallery header from costing a request the list has already paid.
 */
function useMobileDMConversationsCache() {
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData<
    InfiniteData<MobileDMConversationsResponse, unknown> | undefined
  >(mobileQueryKeys.dmConversations());

  return useMemo(() => flattenMobileDMConversationPages(cached), [cached]);
}

export function ServerSettingsStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "ServerSettings">) {
  const { serverId } = route.params;
  return (
    <MobileServerSettingsScreen
      serverId={serverId}
      onBack={() => navigation.goBack()}
      onOpenMembers={() => navigation.navigate("ServerMembers", { serverId })}
      onOpenProfile={() => navigation.navigate("ServerProfile", { serverId })}
      onOpenRoles={() => navigation.navigate("ServerRoles", { serverId })}
      onOpenInvites={() => navigation.navigate("ServerInvites", { serverId })}
      onOpenChannelSettings={(channelId) =>
        navigation.navigate("ChannelSettings", { channelId, serverId })
      }
    />
  );
}

export function ServerRolesStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "ServerRoles">) {
  const { serverId } = route.params;
  return (
    <MobileServerRolesScreen
      serverId={serverId}
      onBack={() => navigation.goBack()}
      onOpenRoleDetail={(roleId) => navigation.navigate("RoleDetail", { roleId, serverId })}
    />
  );
}

export function RoleDetailStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "RoleDetail">) {
  return (
    <MobileRoleDetailScreen
      roleId={route.params.roleId}
      serverId={route.params.serverId}
      onBack={() => navigation.goBack()}
    />
  );
}

export function ServerMembersStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "ServerMembers">) {
  const { serverId } = route.params;
  return (
    <MobileServerMembersScreen
      serverId={serverId}
      onBack={() => navigation.goBack()}
      onOpenMemberProfile={(userId) => navigation.navigate("UserProfile", { serverId, userId })}
      onOpenServerProfile={() => navigation.navigate("ServerProfile", { serverId })}
    />
  );
}

export function ServerInvitesStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "ServerInvites">) {
  return (
    <MobileServerInvitesScreen
      serverId={route.params.serverId}
      onBack={() => navigation.goBack()}
    />
  );
}

export function ChannelSettingsStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "ChannelSettings">) {
  return (
    <MobileChannelSettingsScreen
      channelId={route.params.channelId}
      serverId={route.params.serverId}
      onBack={() => navigation.goBack()}
    />
  );
}

function useLatestValueRef<T>(value: T) {
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  return valueRef;
}

function useMobileTransitionCompletion(
  navigation: {
    readonly addListener?: (
      event: "transitionEnd",
      listener: (event: { readonly data?: { readonly closing?: boolean } }) => void,
    ) => () => void;
  },
  route: "ChannelChat" | "DirectMessage",
  navigationSampleIdRef: { current: string | null },
) {
  useEffect(() => {
    if (typeof navigation.addListener !== "function") {
      return;
    }

    return navigation.addListener("transitionEnd", (event) => {
      if (event.data?.closing) {
        return;
      }
      navigationSampleIdRef.current ??= getMobileNavigationSampleId(route);
      markMobileNavigationPhase(
        route,
        "transition-completed" satisfies MobileNavigationPhase,
        globalThis.performance.now(),
        navigationSampleIdRef.current,
      );
    });
  }, [navigation, navigationSampleIdRef, route]);
}

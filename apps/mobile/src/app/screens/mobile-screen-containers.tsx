import { useCallback, useEffect, useRef } from "react";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { BackHandler } from "react-native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import type {
  MobileBottomTabParamList,
  MobileRootStackParamList,
} from "../../navigation/mobile-navigation-types";
import { useMobileActiveTargetStore } from "../../state/mobile-active-target-store";
import {
  useMobileMessagesScreenProps,
  useMobileNotificationsScreenProps,
  useMobileOverviewScreenProps,
  useMobileProductNavigationActions,
  useMobileSettingsScreenProps,
  useMobileVoiceScreenProps,
} from "../providers/mobile-product-screen-provider";
import { MessagesScreen } from "./dm-screen";
import { MobileMessageThreadScreen } from "./message-thread-screen";
import { OverviewScreen } from "./home-screen";
import { NotificationsScreen } from "./notifications-screen";
import { ProfileSettingsScreen } from "./settings-screen";
import { BlockedUsersScreen } from "../../social/social-account-screens";
import { MobileProfileEditScreen } from "../../social/mobile-profile-edit-screen";
import { VoiceScreen } from "./voice-screen";
import { MobileDirectCallScreen } from "./mobile-direct-call-screen";
import { MobileDirectVideoCallScreen } from "./mobile-direct-video-call-screen";
import {
  MobileOutgoingVideoCallScreen,
  MobileOutgoingVoiceCallScreen,
} from "./mobile-outgoing-call-screen";
import { useMobileDMCallStore } from "../../state/mobile-dm-call-store";
import { MobileTwoFactorScreen } from "../../account/mobile-two-factor-screen";
import { MobileDMDetailsScreen } from "../../dm/mobile-dm-details-screen";
import { MobileServerSettingsScreen } from "../../workspace/mobile-server-settings-screen";
import { MobileServerRolesScreen } from "../../workspace/mobile-server-roles-screen";
import { MobileRoleDetailScreen } from "../../workspace/mobile-role-detail-screen";
import { MobileServerMembersScreen } from "../../workspace/mobile-server-members-screen";
import { MobileServerInvitesScreen } from "../../workspace/mobile-server-invites-screen";
import { MobileChannelSettingsScreen } from "../../workspace/mobile-channel-settings-screen";
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
        const shouldOpenVoiceRoom = await screenProps.onOpenWorkspaceChannel(channel);
        if (channel.type === "VOICE" && shouldOpenVoiceRoom && rootNavigation) {
          rootNavigation.navigate("VoiceRoom");
          return true;
        }

        if (channel.type === "TEXT" && screenProps.selectedWorkspaceServerId && rootNavigation) {
          rootNavigation.navigate("ChannelChat", {
            channelId: channel.id,
            serverId: screenProps.selectedWorkspaceServerId,
          });
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
  const rootNavigation =
    navigation.getParent<NativeStackNavigationProp<MobileRootStackParamList>>();

  return (
    <MessagesScreen
      {...screenProps}
      onOpenThread={(messageId) => {
        if (screenProps.selectedConversationId && rootNavigation) {
          rootNavigation.navigate("MessageThread", {
            contextId: screenProps.selectedConversationId,
            messageId,
            scope: "dm",
          });
        }
      }}
      onOpenConversation={(conversationId) => {
        screenProps.onOpenConversation(conversationId);
        rootNavigation?.navigate("DirectMessage", { conversationId });
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
      navigation.replace("MainTabs", { screen: "overview" });
    }
  }, [isDirectCall, navigation, screenProps]);
  const leaveAndReturnToOverview = useCallback(() => {
    void leaveVoiceRoom();
  }, [leaveVoiceRoom]);
  const minimizeVoiceRoom = useCallback(() => {
    navigation.navigate("MainTabs", { screen: "overview" });
  }, [navigation]);
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
      navigation.replace("MainTabs", { screen: "overview" });
    }
  }, [hasRouteContext, navigation]);

  // A declined, cancelled or peer-ended DM call clears the session. Land the user back in
  // the conversation the call belonged to instead of the empty channel room UI.
  useEffect(() => {
    if (routeContext?.sessionMode !== "direct" || dmCallSession) {
      return;
    }

    const conversationId = routeContext.conversationId;
    clearMobileVoiceRoomRouteContext();
    if (conversationId) {
      navigation.replace("DirectMessage", { conversationId });
      return;
    }

    navigation.replace("MainTabs", { screen: "overview" });
  }, [dmCallSession, navigation, routeContext?.conversationId, routeContext?.sessionMode]);

  useEffect(() => {
    if (room.status !== "leaving") {
      return;
    }

    const timeout = setTimeout(() => {
      clearMobileVoiceRoomRouteContext();
      navigation.replace("MainTabs", { screen: "overview" });
    }, MOBILE_VOICE_LEAVING_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [navigation, room.status]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (isVoiceSessionActive(room.status)) {
          minimizeVoiceRoom();
          return true;
        }

        if (room.status === "error") {
          leaveAndReturnToOverview();
          return true;
        }

        return room.status === "checking-permission" || room.status === "leaving";
      });

      return () => subscription.remove();
    }, [leaveAndReturnToOverview, minimizeVoiceRoom, room.status]),
  );

  if (!hasRouteContext) {
    return null;
  }

  if (isRingingOut && dmCallSession) {
    const outgoingProps = {
      calleeName: dmCallSession.title,
      onCancelCall: cancelOutgoingCall,
      onMinimize: minimizeVoiceRoom,
      onToggleVoiceMute: screenProps.onToggleVoiceMute,
      voiceRoomState: room,
      ...(screenProps.onFlipVoiceCamera
        ? { onFlipVoiceCamera: screenProps.onFlipVoiceCamera }
        : {}),
      ...(screenProps.onSelectVoiceAudioOutput
        ? { onSelectVoiceAudioOutput: screenProps.onSelectVoiceAudioOutput }
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
          onMinimize={minimizeVoiceRoom}
          testID="mobile-direct-video-call-screen"
        />
      );
    }

    return (
      <MobileDirectCallScreen
        {...screenProps}
        callStartedAt={dmCallSession?.connectedAt ?? null}
        onLeaveVoiceChannel={leaveVoiceRoom}
        onMinimize={minimizeVoiceRoom}
        testID="mobile-direct-call-screen"
      />
    );
  }

  return (
    <VoiceScreen
      {...screenProps}
      onLeaveVoiceChannel={leaveVoiceRoom}
      onMinimize={minimizeVoiceRoom}
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
  const screenProps = useMobileOverviewScreenProps();
  const { openWorkspaceRoute } = useMobileProductNavigationActions();
  const { channelId, serverId } = route.params;
  const closeWorkspaceChannel = screenProps.onCloseWorkspaceChannel;
  const closeWorkspaceChannelRef = useLatestValueRef(closeWorkspaceChannel);
  const setServer = useMobileActiveTargetStore((state) => state.setServer);
  const setTextChannel = useMobileActiveTargetStore((state) => state.setTextChannel);

  useFocusEffect(
    useCallback(() => {
      openWorkspaceRoute(serverId, channelId);
      setTextChannel(serverId, channelId);

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
    <OverviewScreen
      {...screenProps}
      onOpenThread={(messageId) => {
        navigation.navigate("MessageThread", { contextId: channelId, messageId, scope: "channel" });
      }}
      onCloseWorkspaceChannel={() => {
        screenProps.onCloseWorkspaceChannel();
        navigation.goBack();
      }}
    />
  );
}

export function DirectMessageStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "DirectMessage">) {
  const screenProps = useMobileMessagesScreenProps();
  const { conversationId } = route.params;
  const closeDMConversation = screenProps.onCloseConversation;
  const closeDMConversationRef = useLatestValueRef(closeDMConversation);
  const openDMConversation = screenProps.onOpenConversation;
  const setConversation = useMobileActiveTargetStore((state) => state.setConversation);

  useFocusEffect(
    useCallback(() => {
      openDMConversation(conversationId);
      setConversation(conversationId);

      return () => {
        closeDMConversationRef.current();
        if (useMobileActiveTargetStore.getState().conversationId === conversationId) {
          setConversation(null);
        }
      };
    }, [closeDMConversationRef, conversationId, openDMConversation, setConversation]),
  );

  return (
    <MessagesScreen
      {...screenProps}
      onOpenDetails={() => navigation.navigate("DMDetails", { conversationId })}
      onOpenThread={(messageId) => {
        navigation.navigate("MessageThread", { contextId: conversationId, messageId, scope: "dm" });
      }}
      onCloseConversation={() => {
        screenProps.onCloseConversation();
        navigation.goBack();
      }}
    />
  );
}

export function MessageThreadStackScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "MessageThread">) {
  return <MobileMessageThreadScreen {...route.params} onBack={() => navigation.goBack()} />;
}

export function SettingsDetailScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "SettingsDetail">) {
  return (
    <ProfileSettingsScreen
      {...useMobileSettingsScreenProps()}
      activeSection={route.params.section}
      onBack={() => navigation.goBack()}
    />
  );
}

export function ProfileEditScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "ProfileEdit">) {
  return (
    <MobileProfileEditScreen
      onBack={() => navigation.goBack()}
      onOpenBlockedUsers={() => navigation.navigate("BlockedUsers")}
    />
  );
}

export function BlockedUsersScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "BlockedUsers">) {
  return <BlockedUsersScreen onBack={() => navigation.goBack()} />;
}

export function SecurityScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "Security">) {
  return <MobileTwoFactorScreen onBack={() => navigation.goBack()} />;
}

export function DMDetailsScreenContainer({
  navigation,
  route,
}: NativeStackScreenProps<MobileRootStackParamList, "DMDetails">) {
  return (
    <MobileDMDetailsScreen
      conversationId={route.params.conversationId}
      onBack={() => navigation.goBack()}
    />
  );
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
  return (
    <MobileServerMembersScreen
      serverId={route.params.serverId}
      onBack={() => navigation.goBack()}
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

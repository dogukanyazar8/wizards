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
import { BlockedUsersScreen, ProfileEditScreen } from "../../social/social-account-screens";
import { VoiceScreen } from "./voice-screen";
import { MobileTwoFactorScreen } from "../../account/mobile-two-factor-screen";
import { MobileDMDetailsScreen } from "../../dm/mobile-dm-details-screen";
import { MobileServerSettingsScreen } from "../../workspace/mobile-server-settings-screen";
import { MobileServerMembersScreen } from "../../workspace/mobile-server-members-screen";
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
  const hasRouteContext =
    routeContext !== null &&
    (room.status === "idle" ||
      (hasMatchingMobileVoiceRoomRouteContext(room) && hasVoiceRoomContext(room)));
  const leaveVoiceRoom = useCallback(async () => {
    try {
      await screenProps.onLeaveVoiceChannel();
    } finally {
      clearMobileVoiceRoomRouteContext();
      navigation.replace("MainTabs", { screen: "overview" });
    }
  }, [navigation, screenProps]);
  const leaveAndReturnToOverview = useCallback(() => {
    void leaveVoiceRoom();
  }, [leaveVoiceRoom]);
  const minimizeVoiceRoom = useCallback(() => {
    navigation.navigate("MainTabs", { screen: "overview" });
  }, [navigation]);
  const openVoiceRoomChat = useCallback(() => {
    if (!room.channelId || !room.serverId) {
      return;
    }

    navigation.navigate("ChannelChat", { channelId: room.channelId, serverId: room.serverId });
  }, [navigation, room.channelId, room.serverId]);
  const openVoiceRoomInvite = useCallback(() => {
    screenProps.onOpenVoiceInvite?.();
    minimizeVoiceRoom();
  }, [minimizeVoiceRoom, screenProps]);

  useEffect(() => {
    if (!hasRouteContext) {
      navigation.replace("MainTabs", { screen: "overview" });
    }
  }, [hasRouteContext, navigation]);

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

  return (
    <VoiceScreen
      {...screenProps}
      onLeaveVoiceChannel={leaveVoiceRoom}
      onMinimize={minimizeVoiceRoom}
      onOpenChat={openVoiceRoomChat}
      onOpenVoiceInvite={openVoiceRoomInvite}
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
  return <ProfileEditScreen onBack={() => navigation.goBack()} />;
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
      onOpenChannelSettings={(channelId) =>
        navigation.navigate("ChannelSettings", { channelId, serverId })
      }
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

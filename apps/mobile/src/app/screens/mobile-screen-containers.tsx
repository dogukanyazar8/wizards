import { useCallback, useEffect, useRef } from "react";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
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
      onOpenWorkspaceChannel={(channel) => {
        screenProps.onOpenWorkspaceChannel(channel);
        if (channel.type === "TEXT" && screenProps.selectedWorkspaceServerId && rootNavigation) {
          rootNavigation.navigate("ChannelChat", {
            channelId: channel.id,
            serverId: screenProps.selectedWorkspaceServerId,
          });
        }
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

export function VoiceTabScreenContainer(
  _props: BottomTabScreenProps<MobileBottomTabParamList, "voice">,
) {
  return <VoiceScreen {...useMobileVoiceScreenProps()} />;
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

function useLatestValueRef<T>(value: T) {
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  return valueRef;
}

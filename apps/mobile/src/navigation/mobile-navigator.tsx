import { useCallback, useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer, type NavigationState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Linking } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../config/environment";
import { useMobileDeepLinkRuntime } from "../app/providers/mobile-deep-link-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import {
  ChannelStackScreenContainer,
  DirectMessageStackScreenContainer,
  MessageThreadStackScreenContainer,
  MessagesTabScreenContainer,
  NotificationsTabScreenContainer,
  OverviewTabScreenContainer,
  SettingsDetailScreenContainer,
  SettingsTabScreenContainer,
  VoiceRoomStackScreenContainer,
  ProfileEditScreenContainer,
  BlockedUsersScreenContainer,
  SecurityScreenContainer,
  SharedMediaScreenContainer,
  ServerSettingsStackScreenContainer,
  ServerRolesStackScreenContainer,
  RoleDetailStackScreenContainer,
  ServerMembersStackScreenContainer,
  ServerInvitesStackScreenContainer,
  ChannelSettingsStackScreenContainer,
  UserProfileStackScreenContainer,
} from "../app/screens/mobile-screen-containers";
import { useMobileVoiceScreenProps } from "../app/providers/mobile-product-screen-provider";
import { FloatingNavigationChrome } from "./floating-navigation-chrome";
import { MobileAuthNavigator } from "./mobile-auth-navigator";
import { createMobileLinkingOptions } from "./mobile-linking";
import { isMobileTabId, type MobileTabId } from "./mobile-navigation";
import { mobileNavigationRef, navigateMobileRouteIntent } from "./mobile-navigation-ref";
import type { MobileBottomTabParamList, MobileRootStackParamList } from "./mobile-navigation-types";

const RootStack = createNativeStackNavigator<MobileRootStackParamList>();
const BottomTabs = createBottomTabNavigator<MobileBottomTabParamList>();

interface MobileNavigatorProps {
  readonly directMessageUnreadCount?: number;
  readonly onTabChange?: (tab: MobileTabId) => void;
}

export function MobileNavigator({
  directMessageUnreadCount = 0,
  onTabChange,
}: MobileNavigatorProps) {
  const { status } = useMobileAuth();
  const theme = useTheme();
  const reducedMotion = useReducedMotion() === true;
  const { handleCommand } = useMobileDeepLinkRuntime();
  const runtimeConfig = getMobileRuntimeConfig();
  const linking = useMemo(
    () =>
      createMobileLinkingOptions({
        linking: Linking,
        onCommand: handleCommand,
        webUrl: runtimeConfig.webUrl,
      }),
    [handleCommand, runtimeConfig.webUrl],
  );
  const reportActiveTab = useCallback(() => {
    const tab = getActiveMainTab(mobileNavigationRef.getRootState());
    if (tab) {
      onTabChange?.(tab);
    }
  }, [onTabChange]);
  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: theme.dark,
      colors: {
        ...DefaultTheme.colors,
        background: theme.surface.base,
        border: theme.border.subtle,
        card: theme.surface.elevated,
        notification: theme.status.danger,
        primary: theme.accent.default,
        text: theme.text.primary,
      },
    }),
    [theme],
  );
  const rootStackOptions = useMemo(
    () => ({
      animation: reducedMotion ? ("none" as const) : ("slide_from_right" as const),
      freezeOnBlur: true,
      headerShown: false,
    }),
    [reducedMotion],
  );

  return (
    <NavigationContainer
      linking={linking}
      onReady={reportActiveTab}
      onStateChange={reportActiveTab}
      ref={mobileNavigationRef}
      theme={navigationTheme}
    >
      {status === "signed-in" ? (
        <RootStack.Navigator screenOptions={rootStackOptions}>
          <RootStack.Screen name="MainTabs">
            {() => <MobileBottomTabs directMessageUnreadCount={directMessageUnreadCount} />}
          </RootStack.Screen>
          <RootStack.Screen name="VoiceRoom">
            {(props) => <VoiceRoomStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ChannelChat">
            {(props) => <ChannelStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="DirectMessage">
            {(props) => <DirectMessageStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="MessageThread">
            {(props) => <MessageThreadStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="SettingsDetail" component={SettingsDetailScreenContainer} />
          <RootStack.Screen name="ProfileEdit" component={ProfileEditScreenContainer} />
          <RootStack.Screen name="UserProfile">
            {(props) => <UserProfileStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="BlockedUsers" component={BlockedUsersScreenContainer} />
          <RootStack.Screen name="Security">
            {(props) => <SecurityScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="SharedMedia">
            {(props) => <SharedMediaScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ServerSettings">
            {(props) => <ServerSettingsStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ServerRoles">
            {(props) => <ServerRolesStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="RoleDetail">
            {(props) => <RoleDetailStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ServerMembers">
            {(props) => <ServerMembersStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ServerInvites">
            {(props) => <ServerInvitesStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ChannelSettings">
            {(props) => <ChannelSettingsStackScreenContainer {...props} />}
          </RootStack.Screen>
        </RootStack.Navigator>
      ) : (
        <MobileAuthNavigator reason={status === "checking" ? "checking" : "auth-required"} />
      )}
    </NavigationContainer>
  );
}

function MobileBottomTabs({
  directMessageUnreadCount,
}: {
  readonly directMessageUnreadCount: number;
}) {
  const {
    bootstrapState,
    onBeginVoicePushToTalk,
    onEndVoicePushToTalk,
    onLeaveVoiceChannel,
    onToggleVoiceMute,
    voiceInputMode,
    voicePushToTalkPhase,
    voiceRoomState,
  } = useMobileVoiceScreenProps();
  const voiceServerName =
    bootstrapState.status === "ready"
      ? (bootstrapState.payload.home.servers.recent.find(
          (server) => server.id === voiceRoomState.serverId,
        )?.name ?? null)
      : null;
  const openVoiceRoom = useCallback(() => {
    navigateMobileRouteIntent({ name: "VoiceRoom", params: undefined, type: "route" });
  }, []);

  return (
    <BottomTabs.Navigator
      // Tab visits are not history. With "history" the back key walked every
      // tab the user had touched before it ever reached the launcher, which is
      // not what Discord/WhatsApp do: back collapses to the home tab, and from
      // the home tab it leaves the app.
      backBehavior="initialRoute"
      initialRouteName="overview"
      screenOptions={{
        freezeOnBlur: true,
        headerShown: false,
        lazy: true,
        tabBarHideOnKeyboard: true,
      }}
      tabBar={(props) => (
        <FloatingNavigationChrome
          {...props}
          directMessageUnreadCount={directMessageUnreadCount}
          onBeginPushToTalk={onBeginVoicePushToTalk}
          onEndPushToTalk={onEndVoicePushToTalk}
          onLeaveVoiceChannel={onLeaveVoiceChannel}
          onOpenVoiceRoom={openVoiceRoom}
          onToggleVoiceMute={onToggleVoiceMute}
          voiceInputMode={voiceInputMode}
          voicePushToTalkPhase={voicePushToTalkPhase}
          voiceRoom={voiceRoomState}
          voiceServerName={voiceServerName}
        />
      )}
    >
      <BottomTabs.Screen name="overview" component={OverviewTabScreenContainer} />
      <BottomTabs.Screen name="messages" component={MessagesTabScreenContainer} />
      <BottomTabs.Screen name="notifications" component={NotificationsTabScreenContainer} />
      <BottomTabs.Screen name="settings" component={SettingsTabScreenContainer} />
    </BottomTabs.Navigator>
  );
}

function getActiveMainTab(state: NavigationState | undefined): MobileTabId | null {
  const mainTabsRoute = state?.routes.find((route) => route.name === "MainTabs");
  const nestedState = mainTabsRoute?.state;
  if (!nestedState || nestedState.index === undefined) {
    return null;
  }

  const route = nestedState.routes[nestedState.index];
  return route && isMobileTabId(route.name) ? route.name : null;
}

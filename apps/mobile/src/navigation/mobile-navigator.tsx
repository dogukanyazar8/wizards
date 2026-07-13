import { type ReactNode, useCallback, useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer, type NavigationState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Linking } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../config/environment";
import { useMobileDeepLinkRuntime } from "../app/providers/mobile-deep-link-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { AuthGate } from "../app/screens/auth-gate";
import {
  ChannelStackScreenContainer,
  DirectMessageStackScreenContainer,
  MessageThreadStackScreenContainer,
  MessagesTabScreenContainer,
  NotificationsTabScreenContainer,
  OverviewTabScreenContainer,
  SettingsDetailScreenContainer,
  SettingsTabScreenContainer,
  VoiceTabScreenContainer,
  ProfileEditScreenContainer,
  BlockedUsersScreenContainer,
  SecurityScreenContainer,
  DMDetailsScreenContainer,
  ServerSettingsStackScreenContainer,
  ServerMembersStackScreenContainer,
  ChannelSettingsStackScreenContainer,
} from "../app/screens/mobile-screen-containers";
import { MobileBottomTabBar } from "./mobile-bottom-tab-bar";
import { createMobileLinkingOptions } from "./mobile-linking";
import { isMobileTabId, resolveMobileRoute, type MobileTabId } from "./mobile-navigation";
import { mobileNavigationRef } from "./mobile-navigation-ref";
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
      <RootStack.Navigator screenOptions={rootStackOptions}>
        <RootStack.Screen name="MainTabs">
          {() => <MobileBottomTabs directMessageUnreadCount={directMessageUnreadCount} />}
        </RootStack.Screen>
        <RootStack.Screen name="ChannelChat">
          {(props) => (
            <ProtectedStackRoute>
              <ChannelStackScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="DirectMessage">
          {(props) => (
            <ProtectedStackRoute>
              <DirectMessageStackScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="MessageThread">
          {(props) => (
            <ProtectedStackRoute>
              <MessageThreadStackScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="SettingsDetail" component={SettingsDetailScreenContainer} />
        <RootStack.Screen name="ProfileEdit" component={ProfileEditScreenContainer} />
        <RootStack.Screen name="BlockedUsers" component={BlockedUsersScreenContainer} />
        <RootStack.Screen name="Security">
          {(props) => (
            <ProtectedStackRoute>
              <SecurityScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="DMDetails">
          {(props) => (
            <ProtectedStackRoute>
              <DMDetailsScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ServerSettings">
          {(props) => (
            <ProtectedStackRoute>
              <ServerSettingsStackScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ServerMembers">
          {(props) => (
            <ProtectedStackRoute>
              <ServerMembersStackScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ChannelSettings">
          {(props) => (
            <ProtectedStackRoute>
              <ChannelSettingsStackScreenContainer {...props} />
            </ProtectedStackRoute>
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

function MobileBottomTabs({
  directMessageUnreadCount,
}: {
  readonly directMessageUnreadCount: number;
}) {
  const { status } = useMobileAuth();

  return (
    <BottomTabs.Navigator
      backBehavior="history"
      initialRouteName={status === "signed-in" ? "overview" : "settings"}
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={(props) => (
        <MobileBottomTabBar {...props} directMessageUnreadCount={directMessageUnreadCount} />
      )}
    >
      <BottomTabs.Screen name="overview">
        {(props) => (
          <ProtectedTab tab="overview">
            <OverviewTabScreenContainer {...props} />
          </ProtectedTab>
        )}
      </BottomTabs.Screen>
      <BottomTabs.Screen name="messages">
        {(props) => (
          <ProtectedTab tab="messages">
            <MessagesTabScreenContainer {...props} />
          </ProtectedTab>
        )}
      </BottomTabs.Screen>
      <BottomTabs.Screen name="notifications">
        {(props) => (
          <ProtectedTab tab="notifications">
            <NotificationsTabScreenContainer {...props} />
          </ProtectedTab>
        )}
      </BottomTabs.Screen>
      <BottomTabs.Screen name="voice">
        {(props) => (
          <ProtectedTab tab="voice">
            <VoiceTabScreenContainer {...props} />
          </ProtectedTab>
        )}
      </BottomTabs.Screen>
      <BottomTabs.Screen name="settings" component={SettingsTabScreenContainer} />
    </BottomTabs.Navigator>
  );
}

function ProtectedTab({
  children,
  tab,
}: {
  readonly children: ReactNode;
  readonly tab: MobileTabId;
}) {
  const { status } = useMobileAuth();
  const route = resolveMobileRoute(tab, status);
  return route.isBlocked ? <MobileAuthGate reason={route.blockedReason} /> : children;
}

function ProtectedStackRoute({ children }: { readonly children: ReactNode }) {
  const { status } = useMobileAuth();
  return status === "signed-in" ? children : <MobileAuthGate reason="auth-required" />;
}

function MobileAuthGate({ reason }: { readonly reason: "auth-required" | "checking" | null }) {
  const auth = useMobileAuth();
  return (
    <AuthGate
      reason={reason ?? "auth-required"}
      onOpenWebRegister={() => void auth.openWebRegister()}
      onOpenWebSignIn={() => void auth.openWebSignIn()}
      onRefresh={() => void auth.refreshSessionFromStorage()}
      onRegisterWithPassword={auth.registerWithPassword}
      onRequestPasswordReset={auth.requestPasswordReset}
      onRequestVerificationEmail={auth.requestVerificationEmail}
      onSignInWithPassword={auth.signInWithPassword}
    />
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

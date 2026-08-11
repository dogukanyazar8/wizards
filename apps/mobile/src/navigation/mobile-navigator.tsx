import { useCallback, useEffect, useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer, type NavigationState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Linking } from "react-native";
import {
  beginMobileLinkedChatNavigationSpan,
  probeMobileChatCache,
  resolveMobileActiveChatRouteTarget,
} from "../performance/mobile-chat-route-target";
import {
  annotateMobileNavigationSpan,
  ensureMobileNavigationSpan,
  markMobileNavigationStage,
} from "../performance/mobile-navigation-timing";
import { getMobileMessageListAnchorVariant } from "../app/components/message-list-anchor";
import { resolveMobileMessageStreamOpenSource } from "../query/mobile-message-stream-source";
import {
  advanceMobileChatTransitionVariant,
  configureMobileChatTransition,
  getMobileChatTransitionVariant,
  resolveMobileChatTransitionAnimation,
} from "./mobile-chat-transition";
import { markMobileStartupPhase } from "../performance/mobile-startup-phases";
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
  GroupCreateScreenContainer,
  GroupDetailsScreenContainer,
  BlockedUsersScreenContainer,
  LegalDocumentScreenContainer,
  OpenSourceLicensesScreenContainer,
  PerformanceDiagnosticsStackScreenContainer,
  FeedbackScreenContainer,
  FeedbackSubmittedScreenContainer,
  RoadmapScreenContainer,
  SecurityScreenContainer,
  SharedMediaScreenContainer,
  ServerSettingsStackScreenContainer,
  ServerRolesStackScreenContainer,
  RoleDetailStackScreenContainer,
  ServerMembersStackScreenContainer,
  ServerInvitesStackScreenContainer,
  ChannelSettingsStackScreenContainer,
  UserProfileStackScreenContainer,
  AdminIncidentsScreenContainer,
  AdminIncidentDetailScreenContainer,
  AboutWhatsNewScreenContainer,
  AboutReleaseNoteScreenContainer,
  AboutReleaseHistoryScreenContainer,
  AboutUpdateChannelScreenContainer,
  HelpCenterScreenContainer,
  BugReportScreenContainer,
  CommunityInviteScreenContainer,
  ServerProfileScreenContainer,
  ServerEventsScreenContainer,
  ServerEventFormScreenContainer,
  DiscoverScreenContainer,
} from "../app/screens/mobile-screen-containers";
import {
  MobileGroupInfoPlaceholderScreen,
  MobileGroupInvitePreviewPlaceholderScreen,
  MobileGroupMembersPlaceholderScreen,
  MobileGroupSettingsPlaceholderScreen,
} from "../dm/mobile-group-route-placeholders";
import { MobileAuthNavigator } from "./mobile-auth-navigator";
import { createMobileLinkingOptions } from "./mobile-linking";
import { isMobileTabId, type MobileTabId } from "./mobile-navigation";
import { mobileNavigationRef } from "./mobile-navigation-ref";
import { MobileTabBarHost } from "./mobile-tab-bar-host";
import type { MobileBottomTabParamList, MobileRootStackParamList } from "./mobile-navigation-types";

const RootStack = createNativeStackNavigator<MobileRootStackParamList>();
const BottomTabs = createBottomTabNavigator<MobileBottomTabParamList>();

/**
 * Read at push time, not at navigator render time.
 *
 * A screen's `options` function runs when that screen renders, which for a push
 * is the push itself — so the rotating variant reaches the transition without
 * the navigator re-rendering. Re-rendering it would remount every inline screen
 * element on the stack, which is the cost this whole wave is trying to remove.
 */
const chatScreenOptions = () => ({ animation: resolveMobileChatTransitionAnimation() });

interface MobileNavigatorProps {
  readonly directMessageUnreadCount?: number;
  readonly notificationUnreadCount?: number;
  readonly onTabChange?: (tab: MobileTabId) => void;
}

export function MobileNavigator({
  directMessageUnreadCount = 0,
  notificationUnreadCount = 0,
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
        onRoute: (route) => {
          beginMobileLinkedChatNavigationSpan(route);
        },
        webUrl: runtimeConfig.webUrl,
      }),
    [handleCommand, runtimeConfig.webUrl],
  );
  /**
   * Every chat the navigator shows opens a span, tap or no tap.
   *
   * The two prefetch tap handlers used to be the only openers, and a device run
   * measured twelve of roughly twenty-three opens with *zero* abandoned spans —
   * the missing ones never started. Deep links, push intents, profile cards, the
   * friends hub and the voice room all navigate straight here. This is the one
   * seam all of them pass through, and it never replaces a tap's span, which
   * starts earlier and is the better measurement.
   */
  const trackActiveChatRoute = useCallback(() => {
    const target = resolveMobileActiveChatRouteTarget(mobileNavigationRef.getRootState());
    if (!target) {
      return;
    }

    const now = globalThis.performance.now();
    const dataUpdatedAtMs = probeMobileChatCache(target);
    const navigationSampleId = ensureMobileNavigationSpan(
      target.route,
      now,
      dataUpdatedAtMs !== null,
    );
    // The pushed screen has already read the variant by the time the navigator
    // commits, so this records what the reader saw rather than what is next.
    // `cacheHit` was one bit and could not say whether the page came from memory,
    // from the encrypted store or from a warm that had settled.
    const origin = resolveMobileMessageStreamOpenSource({
      dataUpdatedAtMs,
      scope: target.route === "ChannelChat" ? "channel" : "dm",
      targetId: target.targetId,
    });
    annotateMobileNavigationSpan(
      target.route,
      {
        cacheAgeMs:
          origin.cacheAgeMs === null ? null : Math.min(Math.max(origin.cacheAgeMs, 0), 86_400_000),
        // Which layout the transcript was asked for. Both switches ride the open
        // so a run can price them instead of arguing about them.
        listAnchor: getMobileMessageListAnchorVariant(),
        source: origin.source,
        transition: getMobileChatTransitionVariant(),
      },
      navigationSampleId,
    );
    // First of the three stages: the navigator has committed the route. What is
    // left after this is the screen tree and the list.
    if (markMobileNavigationStage(target.route, "navigated", now, navigationSampleId) !== null) {
      // Only a route that was newly committed is an open; a state change inside
      // a chat the reader is already in must not rotate the experiment.
      advanceMobileChatTransitionVariant();
    }
  }, []);

  const reportActiveTab = useCallback(() => {
    const tab = getActiveMainTab(mobileNavigationRef.getRootState());
    if (tab) {
      onTabChange?.(tab);
    }
    trackActiveChatRoute();
  }, [onTabChange, trackActiveChatRoute]);

  const handleNavigationReady = useCallback(() => {
    // The second of the two milestones inside the shell-frame-to-content gap:
    // the navigation tree exists, so whatever is slow after this is the screen.
    markMobileStartupPhase("navigator-ready");
    reportActiveTab();
  }, [reportActiveTab]);
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
  // The baseline found no meaningful transition difference. Keep one variant so
  // later renderer measurements do not inherit experiment variance.
  useEffect(() => {
    configureMobileChatTransition({
      reducedMotion,
      rotate: false,
    });
  }, [reducedMotion]);

  return (
    <NavigationContainer
      linking={linking}
      onReady={handleNavigationReady}
      onStateChange={reportActiveTab}
      ref={mobileNavigationRef}
      theme={navigationTheme}
    >
      {status === "signed-in" ? (
        <RootStack.Navigator screenOptions={rootStackOptions}>
          <RootStack.Screen name="MainTabs">
            {() => (
              <MobileBottomTabs
                directMessageUnreadCount={directMessageUnreadCount}
                notificationUnreadCount={notificationUnreadCount}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="VoiceRoom">
            {(props) => <VoiceRoomStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ChannelChat" options={chatScreenOptions}>
            {(props) => <ChannelStackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="DirectMessage" options={chatScreenOptions}>
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
          <RootStack.Screen name="GroupCreate" component={GroupCreateScreenContainer} />
          <RootStack.Screen name="GroupDetails" component={GroupDetailsScreenContainer} />
          {/*
            Grup sohbetleri 2e/2f. Registered in Faz 3 against placeholders so
            `/g/<code>` resolves and the params are typed; Faz 5 swaps in the
            real containers without touching the router again.
          */}
          <RootStack.Screen name="GroupInfo" component={MobileGroupInfoPlaceholderScreen} />
          <RootStack.Screen name="GroupSettings" component={MobileGroupSettingsPlaceholderScreen} />
          <RootStack.Screen name="GroupMembers" component={MobileGroupMembersPlaceholderScreen} />
          <RootStack.Screen
            name="GroupInvitePreview"
            component={MobileGroupInvitePreviewPlaceholderScreen}
          />
          <RootStack.Screen name="BlockedUsers" component={BlockedUsersScreenContainer} />
          <RootStack.Screen name="LegalDocument">
            {(props) => <LegalDocumentScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="OpenSourceLicenses">
            {(props) => <OpenSourceLicensesScreenContainer {...props} />}
          </RootStack.Screen>
          {/* Instrument, not product: a production build has no route to it. */}
          {getMobileRuntimeConfig().environment === "production" ? null : (
            <RootStack.Screen name="PerformanceDiagnostics">
              {(props) => <PerformanceDiagnosticsStackScreenContainer {...props} />}
            </RootStack.Screen>
          )}
          <RootStack.Screen name="Feedback">
            {(props) => <FeedbackScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="FeedbackSubmitted">
            {(props) => <FeedbackSubmittedScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="Roadmap">
            {(props) => <RoadmapScreenContainer {...props} />}
          </RootStack.Screen>
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
          <RootStack.Screen name="AboutWhatsNew">
            {(props) => <AboutWhatsNewScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="AboutReleaseNote">
            {(props) => <AboutReleaseNoteScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="AboutReleaseHistory">
            {(props) => <AboutReleaseHistoryScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="AboutUpdateChannel">
            {(props) => <AboutUpdateChannelScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="HelpCenter">
            {(props) => <HelpCenterScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="BugReport">
            {(props) => <BugReportScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="CommunityInvite">
            {(props) => <CommunityInviteScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ServerProfile">
            {(props) => <ServerProfileScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ServerEvents">
            {(props) => <ServerEventsScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="ServerEventForm">
            {(props) => <ServerEventFormScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="Discover">
            {(props) => <DiscoverScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="AdminIncidents">
            {(props) => <AdminIncidentsScreenContainer {...props} />}
          </RootStack.Screen>
          <RootStack.Screen name="AdminIncidentDetail">
            {(props) => <AdminIncidentDetailScreenContainer {...props} />}
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
  notificationUnreadCount,
}: {
  readonly directMessageUnreadCount: number;
  readonly notificationUnreadCount: number;
}) {
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
        <MobileTabBarHost
          {...props}
          directMessageUnreadCount={directMessageUnreadCount}
          notificationUnreadCount={notificationUnreadCount}
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

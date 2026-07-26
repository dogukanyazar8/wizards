import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMobileNavigationState,
  DEFAULT_MOBILE_TAB_ID,
  getMobileTabForRoutePath,
  isMobileTabId,
  MOBILE_BOTTOM_TAB_IDS,
  MOBILE_TAB_IDS,
  mobileNavigationReducer,
  parseMobileChannelsRoutePath,
  resolveMobileRoute,
} from "../src/navigation/mobile-navigation";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile tab ids are stable and validate unknown input", () => {
  assert.deepEqual(MOBILE_TAB_IDS, ["overview", "messages", "notifications", "settings"]);
  assert.deepEqual(MOBILE_BOTTOM_TAB_IDS, ["overview", "messages", "notifications", "settings"]);
  assert.equal(isMobileTabId("messages"), true);
  assert.equal(isMobileTabId("members"), false);
});

test("bottom navigation exposes only primary native product surfaces", () => {
  const bottomTabs = MOBILE_BOTTOM_TAB_IDS as readonly string[];
  assert.equal(bottomTabs.includes("messages"), true);
  assert.equal(bottomTabs.includes("notifications"), true);
  assert.equal(bottomTabs.includes("overview"), true);
  assert.equal(bottomTabs.includes("settings"), true);
  assert.equal(bottomTabs.includes("voice"), false);
  assert.equal((MOBILE_TAB_IDS as readonly string[]).includes("voice"), false);
});

test("the 11f shared-media gallery is reachable from the profile page", () => {
  const containers = read("../src/app/screens/mobile-screen-containers.tsx");
  const navigator = read("../src/navigation/mobile-navigator.tsx");
  const routeTypes = read("../src/navigation/mobile-navigation-types.ts");
  const gallery = read("../src/dm/mobile-shared-media-screen.tsx");

  // The route exists with both params, and the screen is actually mounted.
  assert.match(
    routeTypes,
    /SharedMedia: \{ readonly conversationId: string; readonly userId\?: string \}/,
  );
  assert.match(navigator, /<RootStack\.Screen name="SharedMedia">/);
  assert.match(navigator, /SharedMediaScreenContainer/);

  // 1c "see all" lands on the shared-media route with the participant carried.
  assert.match(
    containers,
    /onOpenSharedMedia=\{\(\{ conversationId, userId: peerUserId \}\) =>\s*navigation\.navigate\("SharedMedia", \{ conversationId, userId: peerUserId \}\)/,
  );

  // Reused param route: a second conversation remounts instead of stacking.
  assert.match(containers, /key=\{conversationId\}/);

  // Test IDs the gallery is driven by, on the surfaces that own them.
  for (const testId of [
    "mobile-shared-media-screen",
    "mobile-shared-media-back",
    "mobile-shared-media-tabs",
    "mobile-shared-media-list",
    "mobile-shared-media-loading",
    "mobile-shared-media-empty",
    "mobile-shared-media-error",
  ]) {
    assert.match(gallery, new RegExp(`testID="${testId}"`), `${testId} must exist`);
  }
  for (const template of [
    "mobile-shared-media-tab-",
    "mobile-shared-media-tile-",
    "mobile-shared-media-duration-",
    "mobile-shared-media-file-",
    "mobile-shared-media-link-",
    "mobile-shared-media-month-",
  ]) {
    assert.ok(gallery.includes(template), `${template} must exist`);
  }
});

test("the 4a/4b feedback flow is one destination reachable from the profile hub", () => {
  const containers = read("../src/app/screens/mobile-screen-containers.tsx");
  const linking = read("../src/navigation/mobile-linking.ts");
  const navigator = read("../src/navigation/mobile-navigator.tsx");
  const routeTypes = read("../src/navigation/mobile-navigation-types.ts");
  const settings = read("../src/app/screens/settings-screen.tsx");

  // The post-send receipt is the second state of `Feedback`, not a route of its
  // own, so Back from it always means "leave feedback" rather than "reopen a
  // form I already submitted".
  assert.match(routeTypes, /Feedback: undefined/);
  assert.match(routeTypes, /FeedbackSubmitted: \{ readonly feedbackId: string \}/);
  assert.match(routeTypes, /Roadmap: undefined/);
  for (const routeName of ["Feedback", "FeedbackSubmitted", "Roadmap"]) {
    assert.match(navigator, new RegExp(`<RootStack\\.Screen name="${routeName}">`));
  }
  for (const containerName of [
    "FeedbackScreenContainer",
    "FeedbackSubmittedScreenContainer",
    "RoadmapScreenContainer",
  ]) {
    assert.match(containers, new RegExp(`export function ${containerName}`));
  }

  // Entry point: the profile settings list.
  assert.match(settings, /mobileNavigationRef\.navigate\("Feedback"\)/);

  // A FEEDBACK notification opens that record's tracking view, not the list.
  assert.match(linking, /\^\\\/feedback\\\/\(\[\^\/\]\+\)\$/);
  assert.match(linking, /name: "FeedbackSubmitted"/);
});

test("mobile navigation state falls back to the home overview tab", () => {
  assert.deepEqual(createMobileNavigationState("not-a-tab"), {
    currentTab: DEFAULT_MOBILE_TAB_ID,
    previousTab: null,
  });
});

test("mobile navigation reducer ignores unknown tabs", () => {
  const state = createMobileNavigationState("overview");
  assert.equal(mobileNavigationReducer(state, { tab: "unknown", type: "select" }), state);
});

test("mobile navigation reducer tracks the previous tab", () => {
  const state = createMobileNavigationState("overview");
  const next = mobileNavigationReducer(state, { tab: "messages", type: "select" });

  assert.deepEqual(next, {
    currentTab: "messages",
    previousTab: "overview",
  });
});

test("protected mobile routes are gated while signed out", () => {
  assert.deepEqual(resolveMobileRoute("messages", "signed-out"), {
    blockedReason: "auth-required",
    currentTab: "messages",
    isBlocked: true,
    requiresSession: true,
  });
});

test("server overview is gated while signed out", () => {
  assert.deepEqual(resolveMobileRoute("overview", "signed-out"), {
    blockedReason: "auth-required",
    currentTab: "overview",
    isBlocked: true,
    requiresSession: true,
  });
});

test("notifications are gated while signed out", () => {
  assert.deepEqual(resolveMobileRoute("notifications", "signed-out"), {
    blockedReason: "auth-required",
    currentTab: "notifications",
    isBlocked: true,
    requiresSession: true,
  });
});

test("protected mobile routes can distinguish loading from signed-out", () => {
  assert.equal(resolveMobileRoute("overview", "checking").blockedReason, "checking");
  assert.equal(resolveMobileRoute("overview", "signed-in").isBlocked, false);
});

test("public mobile routes stay available without a session", () => {
  assert.deepEqual(resolveMobileRoute("settings", "signed-out"), {
    blockedReason: null,
    currentTab: "settings",
    isBlocked: false,
    requiresSession: false,
  });
});

test("mobile channel route parsing is bounded and decode-safe", () => {
  assert.deepEqual(parseMobileChannelsRoutePath("/channels/@me"), {
    channelId: null,
    serverId: "@me",
  });
  assert.deepEqual(parseMobileChannelsRoutePath("/channels/server%201/channel%202?x=1"), {
    channelId: "channel 2",
    serverId: "server 1",
  });
  assert.equal(parseMobileChannelsRoutePath("/settings"), null);
});

test("mobile route paths resolve to the intended native product surface", () => {
  assert.equal(getMobileTabForRoutePath("/channels/@me"), "messages");
  assert.equal(getMobileTabForRoutePath("/channels/server-1/channel-1"), "overview");
  assert.equal(getMobileTabForRoutePath("/settings/profile"), "settings");
  assert.equal(getMobileTabForRoutePath("/invite/invite-code"), "overview");
  assert.equal(getMobileTabForRoutePath("/unknown"), DEFAULT_MOBILE_TAB_ID);
});

test("server management routes remain protected, typed, and contextual", () => {
  const types = read("../src/navigation/mobile-navigation-types.ts");
  const navigator = read("../src/navigation/mobile-navigator.tsx");
  const containers = read("../src/app/screens/mobile-screen-containers.tsx");

  assert.match(types, /ServerSettings:\s*\{\s*readonly serverId: string;?\s*\}/);
  assert.match(types, /ServerMembers:\s*\{\s*readonly serverId: string;?\s*\}/);
  assert.match(
    types,
    /ChannelSettings:\s*\{\s*readonly channelId: string;\s*readonly serverId: string;?\s*\}/,
  );
  assert.match(
    navigator,
    /status === "signed-in"\s*\?\s*\(\s*<RootStack\.Navigator/,
    "the signed-in root stack is the shared protection boundary for server management routes",
  );
  for (const routeName of ["ServerSettings", "ServerMembers", "ChannelSettings"]) {
    assert.match(navigator, new RegExp(`<RootStack\\.Screen name="${routeName}">`));
  }
  for (const containerName of [
    "ServerSettingsStackScreenContainer",
    "ServerMembersStackScreenContainer",
    "ChannelSettingsStackScreenContainer",
  ]) {
    assert.match(containers, new RegExp(`export function ${containerName}`));
  }
  assert.equal(/mobile-product-app/.test(containers), false);
});

test("voice room is a protected root route rather than a bottom tab", () => {
  const types = read("../src/navigation/mobile-navigation-types.ts");
  const navigator = read("../src/navigation/mobile-navigator.tsx");
  const navigationRef = read("../src/navigation/mobile-navigation-ref.ts");
  const containers = read("../src/app/screens/mobile-screen-containers.tsx");

  assert.match(types, /VoiceRoom:\s*undefined/);
  assert.doesNotMatch(types, /voice:\s*undefined/);
  assert.match(navigator, /status === "signed-in"\s*\?\s*\(\s*<RootStack\.Navigator/);
  assert.match(navigator, /<RootStack\.Screen name="VoiceRoom">/);
  assert.doesNotMatch(navigator, /<BottomTabs\.Screen name="voice"/);
  assert.match(navigationRef, /getMobileVoiceRoomRouteContext/);
  assert.match(containers, /hardwareBackPress/);
  assert.match(containers, /isVoiceSessionActive/);
  assert.match(containers, /onMinimize=\{dismissVoiceRoomScreen\}/);
  assert.match(
    containers,
    /navigation\.navigate\("ChannelChat", \{ channelId: room\.channelId, serverId: room\.serverId \}\)/,
  );
});

test("back navigation never stacks a duplicate of a screen that is already open", () => {
  const containers = read("../src/app/screens/mobile-screen-containers.tsx");
  const navigationRef = read("../src/navigation/mobile-navigation-ref.ts");
  const navigator = read("../src/navigation/mobile-navigator.tsx");
  const linking = read("../src/navigation/mobile-linking.ts");

  // Tab visits are not back history: back collapses to the home tab, then exits.
  assert.match(navigator, /backBehavior="initialRoute"/);
  assert.doesNotMatch(navigator, /backBehavior="history"/);
  // freezeOnBlur and lazy stay: the back fix is not allowed to cost the tab
  // navigator its mount and render budget.
  assert.match(navigator, /freezeOnBlur:\s*true/);
  assert.match(navigator, /lazy:\s*true/);

  // A cold-start deep link puts MainTabs under the detail screen, so back stays
  // inside the app instead of quitting it.
  assert.match(linking, /initialRouteName:\s*"MainTabs"/);
  assert.match(linking, /initialRouteName:\s*"overview"/);

  // Notification taps and deep links pop to an open instance instead of pushing
  // a second one, and every intent in the union is actually routed.
  assert.match(navigationRef, /const ROUTE_INTENT_OPTIONS = \{ pop: true \}/);
  for (const routeName of [
    "MainTabs",
    "VoiceRoom",
    "ChannelChat",
    "DirectMessage",
    "MessageThread",
    "SettingsDetail",
    "ServerRoles",
    "ProfileEdit",
    "BlockedUsers",
  ]) {
    assert.match(
      navigationRef,
      new RegExp(`case "${routeName}":`),
      `${routeName} route intents must reach the navigator`,
    );
    assert.match(
      navigationRef,
      new RegExp(`navigate\\("${routeName}",[^)]*ROUTE_INTENT_OPTIONS\\)`),
    );
  }

  // The voice room used to `replace` the tabs, which left a second MainTabs
  // behind it; popping is what keeps one instance of each.
  assert.doesNotMatch(containers, /navigation\.replace\(/);
  assert.match(containers, /navigation\.canGoBack\(\)/);
  assert.match(containers, /navigation\.popTo\("MainTabs", \{ screen: "overview" \}\)/);
  assert.match(containers, /navigation\.popTo\("DirectMessage", \{ conversationId \}\)/);

  // Reused param routes remount their subtree so nothing leaks across targets.
  assert.match(containers, /key=\{`\$\{serverId\}:\$\{channelId\}`\}/);
  assert.match(containers, /key=\{conversationId\}/);
  assert.match(containers, /key=\{`\$\{contextId\}:\$\{messageId\}`\}/);
});

test("voice room navigation does not retain the legacy overview voice surface", () => {
  const messagingFeature = read("../src/app/features/use-mobile-messaging-feature.ts");
  const voiceJoinBranch = messagingFeature.slice(
    messagingFeature.indexOf('if (channel.type === "VOICE")'),
    messagingFeature.indexOf('if (channel.type !== "TEXT")'),
  );

  assert.doesNotMatch(voiceJoinBranch, /setActiveWorkspaceVoiceChannelId\(channel\.id\)/);
});

test("floating navigation chrome is the measured inset owner for tab roots", () => {
  const chrome = read("../src/navigation/floating-navigation-chrome.tsx");
  const bottomTabBar = read("../src/navigation/mobile-bottom-tab-bar.tsx");
  const navigator = read("../src/navigation/mobile-navigator.tsx");
  const settingsStyles = read("../src/app/screens/settings-screen.styles.ts");

  assert.match(chrome, /BottomTabBarHeightCallbackContext/);
  assert.match(chrome, /onLayout=\{handleLayout\}/);
  assert.match(chrome, /isVoiceSessionActive\(voiceRoom\.status\)/);
  assert.match(chrome, /mobile-mini-voice-bar/);
  assert.match(chrome, /Keyboard\.addListener/);
  assert.match(navigator, /tabBarHideOnKeyboard:\s*true/);
  assert.doesNotMatch(bottomTabBar, /useSafeAreaInsets/);
  assert.doesNotMatch(settingsStyles, /paddingBottom:\s*132/);
});

test("keyboard ownership is split between the shell and chat keyboard regions", () => {
  const app = read("../App.tsx");
  const shell = read("../src/app/mobile-app-shell.tsx");
  const chrome = read("../src/navigation/floating-navigation-chrome.tsx");
  const channelScreen = read("../src/app/screens/channel-screen.tsx");
  const dmScreen = read("../src/app/screens/dm-conversation-screen.tsx");
  const region = read("../src/app/mobile-chat-keyboard-region.tsx");
  const authBackground = read("../src/app/components/kit/auth/auth-screen-background.tsx");

  // Edge-to-edge is auto-detected now: RN publishes `isEdgeToEdge` on the
  // DeviceInfo constants and Expo turns the flag on, so `KeyboardProvider`
  // forces both translucency hints on itself. Passing them explicitly is dead
  // weight that only produces a dev-only "values are ignored" warning.
  assert.doesNotMatch(app, /<KeyboardProvider[^>]*\bnavigationBarTranslucent\b/);
  assert.doesNotMatch(app, /<KeyboardProvider[^>]*\bstatusBarTranslucent\b/);
  // The shell keeps padding top-anchored screens (auth forms, settings,
  // threads) clear of the keyboard and reserves the system bottom inset once
  // for everyone.
  assert.match(shell, /useReanimatedKeyboardAnimation/);
  assert.match(shell, /resolveMobileBottomKeyboardSpacing/);
  assert.match(shell, /MobileChatKeyboardScopeProvider/);
  assert.match(shell, /useMobileChatKeyboardOwnership/);
  // Chat bodies ride the IME on the compositor: transform only — never an
  // animated layout property — and clipped so the lift slides under the header.
  assert.match(region, /translateY:\s*-resolveMobileKeyboardLift/);
  assert.match(region, /overflow:\s*"hidden"/);
  assert.doesNotMatch(region, /paddingBottom|paddingTop/);
  assert.match(channelScreen, /<MobileChatKeyboardRegion/);
  assert.match(dmScreen, /<MobileChatKeyboardRegion/);
  // The edge-to-edge tab bar is the one surface allowed under the shell's
  // reservation: the chrome reclaims the inset with a negative margin and the
  // bar repads it inside its own background so nothing is padded twice.
  assert.match(chrome, /resolveMobileBottomSystemSpacing\(systemBarInsets\.bottom,\s*0\)/);
  assert.match(chrome, /marginBottom: -bottomInset/);
  assert.match(chrome, /bottomSafeAreaInset=\{bottomInset\}/);
  assert.doesNotMatch(channelScreen, /KeyboardAvoidingView/);
  assert.doesNotMatch(dmScreen, /KeyboardAvoidingView/);
  assert.doesNotMatch(authBackground, /KeyboardAvoidingView/);
});

test("edge-to-edge tab bar uses canonical styling and typed DM unread state", () => {
  const bottomTabBar = read("../src/navigation/mobile-bottom-tab-bar.tsx");
  const productApp = read("../src/app/mobile-product-app.tsx");
  const messagingFeature = read("../src/app/features/use-mobile-messaging-feature.ts");
  const copy = read("../src/locale/mobile-copy.ts");

  for (const icon of ["servers", "chat-bubble", "bell", "profile"]) {
    assert.match(bottomTabBar, new RegExp(`"${icon}"`));
  }
  assert.match(bottomTabBar, /MobileLineIcon/);
  // Edge-to-edge: no side margins, no floating pill card, no active-tab box.
  assert.doesNotMatch(bottomTabBar, /marginHorizontal/);
  assert.doesNotMatch(bottomTabBar, /navButtonActive/);
  assert.match(bottomTabBar, /borderTopWidth:\s*1/);
  assert.match(bottomTabBar, /theme\.border\.tabBarTop/);
  assert.match(bottomTabBar, /theme\.accent\.tabActive/);
  assert.match(bottomTabBar, /mobileNavigationMetrics\.tabBarPaddingBottom \+ bottomSafeAreaInset/);
  assert.match(bottomTabBar, /theme\.surface\.card/);
  assert.match(bottomTabBar, /theme\.elevation\.tabBar/);
  assert.match(bottomTabBar, /mobile-bottom-tab-unread-dot/);
  assert.doesNotMatch(bottomTabBar, /navBadgeText|Math\.min\(badge/);
  assert.match(bottomTabBar, /pendingTabKeyRef/);
  assert.match(messagingFeature, /getMobileDMUnreadCount\(dmConversationsQuery\.data\)/);
  assert.doesNotMatch(messagingFeature, /bootstrapState\.summary\.unreadDirectMessageCount/);
  assert.match(productApp, /directMessageUnreadCount=\{directMessageUnreadCount\}/);
  assert.doesNotMatch(productApp, /payload\.home\.directMessages\.unreadCount/);
  assert.match(copy, /tabServers:\s*"Sunucular"/);
  assert.match(copy, /tabServers:\s*"Servers"/);
});

test("mini voice bar is an active-session-only control surface", () => {
  const chrome = read("../src/navigation/floating-navigation-chrome.tsx");
  const productApp = read("../src/app/mobile-product-app.tsx");

  assert.match(chrome, /isVoiceSessionActive\(voiceRoom\.status\)/);
  assert.match(chrome, /marginHorizontal:\s*20/);
  assert.match(chrome, /borderRadius:\s*20/);
  assert.match(chrome, /paddingHorizontal:\s*16/);
  assert.match(chrome, /paddingVertical:\s*12/);
  assert.match(chrome, /theme\.surface\.inverse/);
  assert.match(chrome, /theme\.elevation\.miniVoiceBar/);
  assert.match(chrome, /theme\.text\.onInverseMuted/);
  assert.match(chrome, /onBeginPushToTalk/);
  assert.match(chrome, /onEndPushToTalk/);
  assert.match(chrome, /onToggleVoiceMute/);
  assert.match(chrome, /isTalkPressed\s*\?\s*"mic"\s*:\s*"mic-off"/);
  assert.match(chrome, /onLeaveVoiceChannel/);
  assert.match(chrome, /mobile-mini-voice-mic/);
  assert.match(chrome, /mobile-mini-voice-leave/);
  assert.match(productApp, /onLeaveVoiceChannel:\s*handleLeaveWorkspaceVoiceChannel/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { darkTheme, lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import {
  PROFILE_BADGE_CHIP_RADIUS,
  PROFILE_BADGE_CHIP_SIZE,
  PROFILE_BADGE_GLYPH_SIZE,
} from "../src/social/profile-badges/profile-badge-chips.styles";
import { MOBILE_PROFILE_PAGE_METRICS } from "../src/social/profile-page/mobile-profile-page.styles";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const screenSource = read("src/social/mobile-user-profile-screen.tsx");
const sectionsSource = read("src/social/profile-page/mobile-profile-page-sections.tsx");
const stylesSource = read("src/social/profile-page/mobile-profile-page.styles.ts");
const navigationTypesSource = read("src/navigation/mobile-navigation-types.ts");
const navigatorSource = read("src/navigation/mobile-navigator.tsx");
const navigationRefSource = read("src/navigation/mobile-navigation-ref.ts");
const linkingSource = read("src/navigation/mobile-linking.ts");
const deepLinkSource = read("src/deep-link/mobile-deep-links.ts");
const containersSource = read("src/app/screens/mobile-screen-containers.tsx");
const profileCardOverlaySource = read("src/social/profile-card/profile-card-overlay.tsx");
const profileCardViewSource = read("src/social/profile-card/profile-card-view.tsx");

/** Every id a Maestro flow or a device walkthrough drives the 1c page with. */
const PROFILE_PAGE_TEST_IDS = [
  "mobile-user-profile-screen",
  "mobile-user-profile-banner",
  "mobile-user-profile-back",
  "mobile-user-profile-menu",
  "mobile-user-profile-identity",
  "mobile-user-profile-avatar",
  "mobile-user-profile-status",
  "mobile-user-profile-about",
  "mobile-user-profile-note",
  "mobile-user-profile-mutual-servers",
  "mobile-user-profile-mutual-friends",
  "mobile-user-profile-shared-media",
  "mobile-user-profile-skeleton",
  "mobile-user-profile-error",
  "mobile-user-profile-retry",
] as const;

describe("11c profile page contract", () => {
  it("registers the UserProfile route through types, navigator, intents and containers", () => {
    assert.match(
      navigationTypesSource,
      /UserProfile: \{\s*readonly serverId\?: string \| undefined;/,
    );
    assert.match(navigationTypesSource, /readonly name: "UserProfile"/);
    assert.match(navigatorSource, /<RootStack\.Screen name="UserProfile">/);
    assert.match(navigatorSource, /UserProfileStackScreenContainer/);
    assert.match(navigationRefSource, /case "UserProfile":/);
    // Out-of-stack entry points must not stack a duplicate route (10g).
    assert.match(
      navigationRefSource,
      /navigate\("UserProfile", intent\.params, ROUTE_INTENT_OPTIONS\)/,
    );
    assert.match(containersSource, /export function UserProfileStackScreenContainer/);
    // A mutual friend opens as the 11b card, which is what pushes the next page.
    assert.match(containersSource, /openProfileCard\(nextUserId, serverId\)/);
    assert.match(profileCardOverlaySource, /mobileNavigationRef\.navigate\("UserProfile"/);
    assert.match(profileCardOverlaySource, /onViewProfile=\{openFullProfile\}/);
    assert.match(profileCardOverlaySource, /onOpenMutuals=\{openFullProfile\}/);
    // Going to a server walks back to the tabs instead of stacking MainTabs.
    assert.match(containersSource, /navigation\.popTo\("MainTabs", \{ screen: "overview" \}\)/);
  });

  it("keeps whispr://user/{id} a routable deep link", () => {
    assert.match(deepLinkSource, /const SAFE_ROUTE_PREFIXES = \[[^\]]*"\/user"/);
    assert.match(linkingSource, /UserProfile: "user\/:userId"/);
    assert.match(linkingSource, /\^\\\/user\\\/\(\[\^\/\]\+\)\$/);
    // Cold start builds the stack from the path, so MainTabs stays underneath.
    assert.match(linkingSource, /initialRouteName: "MainTabs"/);
  });

  it("exposes every 1c section testID from the production screen", () => {
    const source = `${screenSource}\n${sectionsSource}`;
    for (const testId of PROFILE_PAGE_TEST_IDS) {
      assert.match(source, new RegExp(`testID="${testId}"`), testId);
    }
    // Row-level ids are templated per entity.
    assert.match(sectionsSource, /mobile-user-profile-mutual-server-\$\{row\.id\}/);
    assert.match(sectionsSource, /mobile-user-profile-mutual-friend-\$\{friend\.id\}/);
    assert.match(sectionsSource, /mobile-user-profile-media-\$\{item\.id\}/);
  });

  it("draws the page from real data and the shared profile tokens", () => {
    assert.match(screenSource, /useMobileUserProfileQuery/);
    // The media strip reads an existing conversation; it must never create one.
    assert.doesNotMatch(screenSource, /MobileDMCreateRequest|createMobileDM/);
    assert.match(screenSource, /findMobileProfileDirectConversationId/);
    assert.match(screenSource, /MessageImageLightbox/);
    assert.doesNotMatch(stylesSource, /#[0-9a-f]{6}|rgba\(/i);
    assert.doesNotMatch(sectionsSource, /#[0-9a-f]{6}|rgba\(/i);
    assert.doesNotMatch(screenSource, /#[0-9a-f]{6}|rgba\(/i);
    assert.doesNotMatch(screenSource, /\b(dummy|mock|sample|placeholderUser)\b/i);
  });

  it("locks the 1c geometry read from the handoff", () => {
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.bannerHeight, 148);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.navControl, 36);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.navControlRadius, 13);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.identityCardOverlap, -30);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.cardRadius, 24);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.avatar, 84);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.avatarRadius, 28);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.avatarOffsetTop, -40);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.presenceDot, 19);
    // The chip measures moved to the shared badge row the card and the page now
    // both render; 1c:491 and 1a:330 draw the same box, so one source holds it.
    assert.equal(PROFILE_BADGE_CHIP_SIZE, 28);
    assert.equal(PROFILE_BADGE_CHIP_RADIUS, 10);
    assert.equal(PROFILE_BADGE_GLYPH_SIZE, 14);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.serverAvatar, 40);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.serverAvatarRadius, 14);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.mutualAvatar, 30);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.mutualAvatarOverlap, -9);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.mediaTileRadius, 14);
    // Touch targets stay native-sized even where the handoff draws 36pt chrome.
    assert.ok(MOBILE_PROFILE_PAGE_METRICS.secondaryAction >= lightTheme.sizing.minTouchTarget);
  });

  it("resolves both themes from the shared profile token family", () => {
    for (const theme of [lightTheme, darkTheme]) {
      assert.equal(theme.profileCard.bannerDefault, "#4F46E5");
      assert.equal(typeof theme.profileCard.bannerControl, "string");
      assert.equal(typeof theme.profileCard.bannerNeutral, "string");
      assert.equal(typeof theme.profileCard.roleChipSurface, "string");
      assert.equal(typeof theme.profileCard.viewProfileText, "string");
      assert.equal(typeof theme.profileCard.mutualSurface, "string");
      assert.equal(typeof theme.profileCard.statusOnline, "string");
    }
    // 1f keeps the card family on the dark surfaces from the README table.
    assert.equal(darkTheme.profileCard.mutualSurface, "#161936");
    assert.equal(darkTheme.profileCard.viewProfileText, "#A5A8F5");
    assert.equal(lightTheme.profileCard.viewProfileText, "#4F46E5");
  });

  it("serves every profile page string in both languages", () => {
    const keys = Object.keys(mobileCopy.tr).filter((key) => key.startsWith("profilePage"));
    assert.ok(keys.length >= 30, "profile page copy should cover the whole 1c surface");
    for (const key of keys) {
      assert.ok(key in mobileCopy.en, `${key} missing from the English table`);
    }

    assert.equal(mobileCopy.tr.profilePageAboutHeading, "HAKKINDA");
    assert.equal(mobileCopy.en.profilePageAboutHeading, "ABOUT");
    assert.equal(mobileCopy.tr.profilePageNotePlaceholder, "Not ekle (yalnız sana görünür)");
    assert.equal(mobileCopy.tr.profilePageSeeAllAction, "Tümünü gör");
    assert.match(mobileCopy.tr.profilePageMutualServersHeading, /\{count\}/);
    assert.match(mobileCopy.en.profilePageMutualServersHeading, /\{count\}/);
    assert.deepEqual(
      Object.keys(mobileCopy.tr.profilePageReportReasons),
      Object.keys(mobileCopy.en.profilePageReportReasons),
    );
  });
});

/**
 * The card and the page it opens have to look and behave like one surface. Each
 * assertion below stands for a place where they had drifted apart.
 */
describe("11b card and 11c page parity", () => {
  it("runs the page call buttons through the shared direct-call starter", () => {
    assert.match(screenSource, /startMobileDirectCall\(\{/);
    assert.match(screenSource, /onVoiceCall=\{\(\) => startCall\(false\)\}/);
    assert.match(screenSource, /onVideoCall=\{\(\) => startCall\(true\)\}/);
    // Both surfaces reach the one starter the product shell registers.
    assert.match(profileCardOverlaySource, /startMobileDirectCall\(\{/);
  });

  it("answers an incoming friend request from the card, not a dead button", () => {
    assert.doesNotMatch(profileCardOverlaySource, /TODO\(11b\)/);
    // The request id lives in the friends overview, exactly as the page reads it.
    assert.match(profileCardOverlaySource, /useMobileFriendsQuery/);
    assert.match(profileCardOverlaySource, /mutations\.acceptRequest\.mutateAsync/);
    assert.match(profileCardOverlaySource, /mutations\.rejectRequest\.mutateAsync/);
    assert.match(profileCardOverlaySource, /onRespondToRequest=\{openPendingSurface\}/);
    for (const key of [
      "profileCardRequestSheetTitle",
      "profileCardRequestSheetSubtitle",
      "profileCardRequestAcceptedToastTemplate",
      "profileCardRequestRejectedToast",
    ] as const) {
      assert.equal(typeof mobileCopy.tr[key], "string", key);
      assert.ok(key in mobileCopy.en, `${key} missing from the English table`);
    }
  });

  it("keeps the card's copy tables out of module scope so a language switch lands", () => {
    // `activeMobileCopy` resolves per access; an object literal at import time
    // freezes the language the bundle booted in.
    assert.doesNotMatch(profileCardViewSource, /^const STATUS_LABELS = \{/m);
    assert.match(profileCardViewSource, /const statusLabels = readStatusLabels\(\);/);
    assert.doesNotMatch(profileCardOverlaySource, /^const REPORT_REASONS/m);
    // Built per render from the active locale's table, which the memo also
    // depends on — so the language is a tracked dependency, not a commented one.
    assert.match(profileCardOverlaySource, /readReportReasons\(labels\)/);
    assert.match(profileCardOverlaySource, /const labels = mobileCopy\[locale\];/);
    assert.doesNotMatch(profileCardOverlaySource, /useMemo\([^)]*\), \[locale\]\)/);
    // Subscribing to the runtime is what re-renders a card that stays mounted.
    assert.match(profileCardOverlaySource, /const \{ locale \} = useMobileLocaleRuntime\(\);/);
  });

  it("draws every profile surface from the one line-icon set", () => {
    // 1a-1f, 2a, 2b and 2c all sit next to each other in a single flow; a glyph
    // must not change shape as the user walks from the card into the page or a
    // sheet. Kit sheets still take Ionicons names through their `icon` prop —
    // that is the kit's contract, not a profile-surface import.
    const profileSurfaces = [
      "src/social/mobile-user-profile-screen.tsx",
      "src/social/profile-page/mobile-profile-page-sections.tsx",
      "src/social/profile-card/profile-card-view.tsx",
      "src/social/profile-card/profile-card-parts.tsx",
      "src/social/profile-card/profile-card-menu.tsx",
      "src/social/mobile-profile-edit-screen.tsx",
      "src/social/mobile-user-note-sheet.tsx",
      "src/social/mobile-status-picker-sheet.tsx",
    ] as const;
    for (const path of profileSurfaces) {
      assert.doesNotMatch(read(path), /from "@expo\/vector-icons/, path);
    }
    assert.match(sectionsSource, /MobileLineIcon/);
    assert.match(screenSource, /MobileLineIcon/);
  });

  it("hangs the page overflow menu off the three-dot control", () => {
    assert.match(screenSource, /<ProfilePageMenu/);
    assert.doesNotMatch(screenSource, /ActionSheet/);
    assert.match(sectionsSource, /testID="mobile-user-profile-menu-popover"/);
    assert.match(sectionsSource, /testID="mobile-user-profile-menu-backdrop"/);
    assert.equal(MOBILE_PROFILE_PAGE_METRICS.menuWidth, 196);
  });

  it("gives the page media strip the same video reading as the 2d gallery", () => {
    assert.match(screenSource, /isMobileSharedMediaVideo/);
    assert.match(screenSource, /resolveMobileSharedMediaThumbnail/);
    assert.match(screenSource, /formatMobileMediaDuration/);
    assert.match(sectionsSource, /mobile-user-profile-media-duration-\$\{item\.id\}/);
    // The heading counts the conversation, not the page the strip was cut from.
    assert.match(
      screenSource,
      /totalCount=\{mediaQuery\.data\?\.mediaCount \?\? mediaItems\.length\}/,
    );
  });

  it("puts a see-all behind the mutual friends card, like the mutual servers card", () => {
    assert.match(sectionsSource, /testID="mobile-user-profile-mutual-friends-list"/);
    assert.match(screenSource, /mutualFriendsExpanded/);
  });
});

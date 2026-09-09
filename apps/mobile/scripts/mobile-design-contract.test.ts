import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileRadii, mobileSizing, mobileSpacing, mobileTypography } from "../src/design/tokens";
import { darkTheme, lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const RAW_COLOR_PATTERN = /#[0-9a-f]{6}|rgba\(/i;
const LEGACY_COLOR_PATTERN = /\bmobileColors\b/;
const JS_ANIMATED_PATTERN = /from ["']react-native["'][^;]*\bAnimated\b/;
const PSEUDO_ICON_PATTERN = />\s*(?:FILE|x)\s*<|\{\s*["'](?:FILE|x)["']\s*\}/;

function collectSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    return /\.tsx?$/.test(entry.name) ? [absolutePath] : [];
  });
}

function findSourceViolations(pattern: RegExp): string[] {
  const files = [
    ...collectSourceFiles(join(process.cwd(), "src", "app")),
    ...collectSourceFiles(join(process.cwd(), "src", "navigation")),
    join(process.cwd(), "src", "voice", "mobile-voice-room-panel.tsx"),
  ];

  return files
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => relative(process.cwd(), file).replaceAll("\\", "/"))
    .sort();
}

function extractFunctionSource(source: string, name: string, nextName: string) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);

  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`);

  return source.slice(start, end);
}

function readMobileScreenImplementationSource() {
  return [
    "src/app/mobile-root-screen-shared.ts",
    "src/app/screens/settings-screen.tsx",
    "src/app/screens/home-screen.tsx",
    "src/app/screens/channel-screen.tsx",
    "src/app/composer/mobile-composer.tsx",
    "src/app/components/message-primitives.tsx",
    "src/app/screens/dm-screen.tsx",
    "src/app/screens/dm-inbox.tsx",
    "src/app/screens/dm-conversation-screen.tsx",
    "src/app/screens/voice-screen.tsx",
    "src/app/screens/notifications-screen.tsx",
    "src/app/components/ui-atoms.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
}

function readMobileAuthImplementationSource() {
  return [
    "src/app/components/kit/auth/auth-code-cells.tsx",
    "src/app/components/kit/auth/auth-password-strength-row.tsx",
    "src/app/screens/auth/auth-backup-code-screen.tsx",
    "src/app/screens/auth/auth-forgot-password-screen.tsx",
    "src/app/screens/auth/auth-login-screen.tsx",
    "src/app/screens/auth/auth-register-screen.tsx",
    "src/app/screens/auth/auth-two-factor-screen.tsx",
    "src/app/screens/auth/mobile-auth-screen-containers.tsx",
    "src/navigation/mobile-auth-navigator.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
}

describe("mobile design contract", () => {
  it("draws every switch with the shared kit toggle, and never dims a busy one", () => {
    // `src/design` is the token table itself: it may still name a `toggleKnob`
    // colour. The rule is about screens drawing their own control.
    const sources = collectSourceFiles(join(process.cwd(), "src")).filter(
      (path) =>
        !path.endsWith(join("components", "kit", "toggle.tsx")) &&
        !path.includes(join("src", "design")),
    );

    for (const path of sources) {
      const source = readFileSync(path, "utf8");
      const label = relative(process.cwd(), path);

      // No screen re-draws a track and knob of its own, and none falls back to
      // React Native's platform switch.
      assert.doesNotMatch(source, /toggleTrack|toggleKnob/, `${label} draws its own toggle track`);
      assert.doesNotMatch(source, /<Switch\b/, `${label} renders a platform Switch`);
      // A request in flight is `readOnly` (full colour); `disabled` is reserved
      // for permanently unavailable switches, so one pending switch never dims
      // the switches beside it.
      for (const block of source.match(/<Toggle\b[\s\S]*?\/>/g) ?? []) {
        assert.doesNotMatch(
          block,
          /disabled=\{[^}]*isPending/,
          `${label} dims a switch while a mutation is pending`,
        );
      }
    }
  });

  it("keeps the semantic theme outside crash and product providers", () => {
    const appSource = readFileSync(join(process.cwd(), "App.tsx"), "utf8");
    const providerOrder = [
      "<MobileBootstrapErrorBoundary>",
      "<MobileQueryProvider>",
      "<MobileThemeProvider>",
      "<MobileErrorBoundary>",
      "<MobileAuthProvider",
      "<WhisprMobileRoot />",
    ].map((marker) => appSource.indexOf(marker));

    assert.ok(
      providerOrder.every((index) => index >= 0),
      "required providers must be mounted",
    );
    assert.deepEqual(
      providerOrder,
      [...providerOrder].sort((left, right) => left - right),
    );
    assert.match(
      appSource,
      /<MobileErrorBoundary>[\s\S]*<MobileAuthProvider[\s\S]*deviceIntegrityDetector=\{expoMobileDeviceIntegrityDetector\}[\s\S]*securitySignalLogger=\{mobileSecuritySignalLogger\}[\s\S]*<WhisprMobileRoot \/>\s*<\/MobileAuthProvider>\s*<MobileThemeSystemSurfaces \/>\s*<\/MobileErrorBoundary>/,
    );
  });

  it("keeps presentation sources on semantic colors and UI-thread animation", () => {
    assert.deepEqual(findSourceViolations(RAW_COLOR_PATTERN), []);
    assert.deepEqual(findSourceViolations(LEGACY_COLOR_PATTERN), []);
    assert.deepEqual(findSourceViolations(JS_ANIMATED_PATTERN), []);
  });

  it("keeps kit accessibility contracts explicit and rejects pseudo-icons", () => {
    const kitRoot = join(process.cwd(), "src", "app", "components", "kit");
    const buttonSource = readFileSync(join(kitRoot, "button.tsx"), "utf8");
    const iconButtonSource = readFileSync(join(kitRoot, "icon-button.tsx"), "utf8");
    const contextMenuSource = readFileSync(join(kitRoot, "context-menu.tsx"), "utf8");
    const toastSource = readFileSync(join(kitRoot, "toast.tsx"), "utf8");

    assert.match(buttonSource, /accessibilityRole="button"/);
    assert.match(iconButtonSource, /accessibilityRole="button"/);
    assert.match(iconButtonSource, /accessibilityLabel: string/);
    assert.match(contextMenuSource, /accessibilityRole="menu"/);
    assert.match(contextMenuSource, /accessibilityRole="menuitem"/);
    assert.match(toastSource, /accessibilityLiveRegion/);
    assert.deepEqual(findSourceViolations(PSEUDO_ICON_PATTERN), []);
  });

  it("keeps native touch targets and compact surfaces production-safe", () => {
    assert.equal(mobileSizing.minTouchTarget >= 44, true);
    assert.equal(mobileRadii.card <= 22, true);
    assert.equal(mobileRadii.control <= mobileRadii.card, true);
    assert.equal(mobileSpacing.page <= 24, true);
    assert.equal(mobileSpacing.section <= mobileSpacing.page, true);
  });

  it("keeps inline mobile content bounded for compact phones", () => {
    assert.equal(mobileSizing.maxInlineContentWidth >= 360, true);
    assert.equal(mobileSizing.maxInlineContentWidth <= 640, true);
  });

  it("uses vendored Plus Jakarta Sans as the app-wide mobile font contract", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const fontGateSource = readFileSync(
      join(process.cwd(), "src", "design", "mobile-font-gate.tsx"),
      "utf8",
    );

    assert.equal(mobileTypography.fontFamily, "WhisprJakarta_400Regular");
    assert.equal(
      Object.keys(packageJson.dependencies ?? {}).some((name) =>
        name.startsWith("@expo-google-fonts/"),
      ),
      false,
    );
    assert.ok(packageJson.dependencies?.["expo-font"]);
    assert.match(fontGateSource, /useMobileFonts/);
    assert.match(fontGateSource, /installMobileFontDefaults/);
    assert.match(fontGateSource, /MOBILE_FONT_FALLBACK_DIAGNOSTIC/);
  });

  it("keeps mobile visual tokens aligned with the Whispr web and desktop system", () => {
    for (const typographyToken of [
      "display",
      "headline",
      "title",
      "body",
      "bodyStrong",
      "message",
      "secondary",
      "label",
      "button",
      "caption",
      "overline",
      "dateSeparator",
    ] as const) {
      assert.equal(typeof mobileTypography[typographyToken].fontFamily, "string", typographyToken);
      assert.equal(typeof mobileTypography[typographyToken].fontSize, "number");
      assert.equal(typeof mobileTypography[typographyToken].lineHeight, "number");
      assert.equal(typeof mobileTypography[typographyToken].letterSpacing, "number");
    }

    for (const theme of [lightTheme, darkTheme]) {
      assert.equal(typeof theme.surface.base, "string");
      assert.equal(typeof theme.surface.card, "string");
      assert.equal(typeof theme.text.primary, "string");
      assert.equal(typeof theme.text.muted, "string");
      assert.equal(typeof theme.accent.default, "string");
      assert.equal(typeof theme.border.focus, "string");

      for (const elevationToken of [
        "bottomSheet",
        "dangerAction",
        "headerCard",
        "miniVoiceBar",
        "primaryAction",
        "tabBar",
      ] as const) {
        assert.equal(typeof theme.elevation[elevationToken].shadowColor, "string");
        assert.equal(typeof theme.elevation[elevationToken].shadowOpacity, "number");
        assert.equal(typeof theme.elevation[elevationToken].shadowRadius, "number");
        assert.equal(typeof theme.elevation[elevationToken].elevation, "number");
      }
    }
  });

  it("renders the mobile auth flow through reusable screens, kit primitives, and typed navigation", () => {
    const screenSource = readMobileAuthImplementationSource();

    /*
     * SPEC-GIRIS-KAYIT §6 — bes ekran: Giris, Hesap olustur, Sifremi unuttum, iki adimli
     * dogrulama, yedek kod. Karsilama ekrani paket karari K4 ile kaldirildi.
     */
    for (const componentName of [
      "AuthLoginScreen",
      "AuthRegisterScreen",
      "AuthForgotPasswordScreen",
      "AuthTwoFactorScreen",
      "AuthBackupCodeScreen",
      "MobileAuthNavigator",
    ]) {
      assert.match(screenSource, new RegExp(`function ${componentName}\\(`));
    }

    for (const componentName of [
      "AuthPrimaryButton",
      "AuthSecondaryButton",
      "AuthPasswordStrengthRow",
      "AuthCodeCells",
    ]) {
      assert.match(screenSource, new RegExp(componentName));
    }

    assert.doesNotMatch(screenSource, /cloudflare|turnstile/i);
    assert.match(screenSource, /identityLoginRemember/);
    assert.match(screenSource, /termsAccepted/);
    assert.match(screenSource, /createNativeStackNavigator<MobileAuthStackParamList>\(\)/);
    assert.match(screenSource, /initialRouteName="Login"/);
    assert.match(screenSource, /MobileAuthSessionCheckingContainer/);
    assert.doesNotMatch(screenSource, /authSocialDiscord|logo-discord/);
    // K10: sifre tekrar alani yok; K1: telefon numarasi hicbir ekranda yok.
    assert.doesNotMatch(screenSource, /authConfirmPasswordFieldLabel|identityFieldPhone/);
  });

  it("keeps the dedicated mobile channel chat visually focused and virtualized", () => {
    const screenSource = readMobileScreenImplementationSource();

    assert.match(screenSource, /function MobileChannelChatScreen\(/);
    assert.match(screenSource, /function ChannelScrollToBottomButton\(/);
    assert.match(screenSource, /testID="mobile-channel-chat-screen"/);
    assert.match(screenSource, /testID="mobile-channel-chat-header"/);
    assert.match(screenSource, /testID="mobile-channel-back-button"/);
    assert.match(screenSource, /testID="mobile-channel-message-list"/);
    assert.match(screenSource, /showsVerticalScrollIndicator=\{false\}/);
    assert.match(screenSource, /variant="channel"/);
    assert.match(screenSource, /mode="channel"/);
    assert.match(screenSource, /testID="mobile-channel-composer"/);
    assert.match(screenSource, /testID="mobile-channel-attach-button"/);
    assert.match(screenSource, /testID="mobile-channel-emoji-button"/);
    // The 1b handoff specifies an attachment action, emoji, voice recording, and send;
    // GIF is intentionally not part of the compact channel composer.
    assert.doesNotMatch(screenSource, /testID="mobile-channel-gif-button"/);
    assert.match(screenSource, /testID="mobile-channel-voice-record-button"/);
    assert.match(screenSource, /testID="mobile-channel-send-button"/);
    // MSG-1e §2 "1e".14 made the channel composer the 1d composer, so the single
    // control row it has to keep is the shared one.
    assert.match(screenSource, /styles\.dmChatComposerRow/);
    assert.match(screenSource, /testID="mobile-channel-attachment-picker"/);
    assert.match(screenSource, /useMobileVoiceMessageRecorder/);
    assert.match(screenSource, /!onOpenMembers\s*&&\s*styles\.mobileChannelChatIconButtonDisabled/);
    // MSG-1e §0 rule 5: the header buttons are line icons now, not Ionicons.
    assert.match(
      screenSource,
      /<MobileLineIcon color=\{theme\.messaging\.accent\} name="members" size=\{18\} \/>/,
    );
    assert.match(screenSource, /messagePreviewBubbleChannel/);
  });

  it("keeps the mobile DM inbox on the premium real-data contract", () => {
    const screenSource = readMobileScreenImplementationSource();

    assert.match(screenSource, /testID="mobile-dm-inbox-screen"/);
    assert.match(screenSource, /function DMInboxHeader\(/);
    assert.match(screenSource, /function DirectMessageSummaryCard\(/);
    assert.match(screenSource, /function DirectMessageListCard\(/);
    assert.match(screenSource, /function DirectMessageConversationCard\(/);
    assert.match(screenSource, /testID="mobile-dm-compose-button"/);
    assert.match(screenSource, /testID="mobile-dm-summary-card"/);
    assert.match(screenSource, /testID="mobile-dm-search-input"/);
    assert.match(screenSource, /testID="mobile-dm-filter-tabs"/);
    assert.match(screenSource, /styles\.dmConversationCard/);
    assert.match(screenSource, /styles\.dmConversationPreview/);
    // 2a §3: a group row says "group" with the crossed avatar pair, not with
    // a badge stuck on a single avatar.
    assert.match(screenSource, /testID="mobile-dm-group-avatar-pair"/);
    assert.match(screenSource, /copy\.homeContinueLatestDirectMessage/);
    assert.doesNotMatch(
      screenSource,
      /sampleConversations|mockMessages|demoUsers|fakeMembers|placeholderMessages|dummy/i,
    );
  });

  it("keeps mobile settings production-facing and free of diagnostics surfaces", () => {
    const screenSource = readMobileScreenImplementationSource();
    const productSource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-product-app.tsx"),
      "utf8",
    );
    const productLinksSource = readFileSync(
      join(process.cwd(), "src", "app", "features", "use-mobile-product-links.ts"),
      "utf8",
    );
    const shellSource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-app-shell.tsx"),
      "utf8",
    );
    const bottomTabBarSource = readFileSync(
      join(process.cwd(), "src", "navigation", "mobile-bottom-tab-bar.tsx"),
      "utf8",
    );
    const errorBoundarySource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-error-boundary.tsx"),
      "utf8",
    );
    const voiceSource = readFileSync(
      join(process.cwd(), "src", "voice", "mobile-voice-room-panel.tsx"),
      "utf8",
    );
    const profileSettingsSource = extractFunctionSource(
      screenSource,
      "ProfileSettingsScreen",
      "OverviewScreen",
    );

    assert.match(profileSettingsSource, /testID="mobile-settings-screen"/);
    assert.match(profileSettingsSource, /<ScrollView/);
    assert.match(profileSettingsSource, /contentContainerStyle=\{styles\.settingsScreenContent\}/);
    assert.match(profileSettingsSource, /SettingsLocaleSelector/);
    assert.match(profileSettingsSource, /onSelectLocale/);
    assert.match(profileSettingsSource, /SettingsPreferenceSection/);
    assert.match(profileSettingsSource, /copy\.settingsAppearanceTitle/);
    assert.match(profileSettingsSource, /copy\.settingsLanguageTitle/);
    assert.match(profileSettingsSource, /copy\.settingsNotificationsTitle/);
    assert.match(profileSettingsSource, /copy\.settingsPrivacyTitle/);
    assert.match(profileSettingsSource, /copy\.settingsAboutTitle/);
    assert.match(profileSettingsSource, /SettingsSessionActionCard/);
    assert.match(profileSettingsSource, /onSignOut=\{onSignOut\}/);
    assert.match(profileSettingsSource, /onOpenWebSignIn=\{onOpenWebSignIn\}/);
    assert.match(profileSettingsSource, /onOpenWebRegister=\{onOpenWebRegister\}/);
    assert.match(profileSettingsSource, /SettingsSupportLegalCard/);
    // Legal texts open in-app now instead of handing off to the browser, so the
    // card is wired to the LegalDocument route rather than to the web-open props.
    assert.match(
      profileSettingsSource,
      /onOpenPrivacyPolicy=\{\(\) => openMobileLegalDocument\("privacy"\)\}/,
    );
    assert.match(
      profileSettingsSource,
      /onOpenTerms=\{\(\) => openMobileLegalDocument\("terms"\)\}/,
    );
    assert.match(
      profileSettingsSource,
      /onOpenCookies=\{\(\) => openMobileLegalDocument\("cookies"\)\}/,
    );
    assert.match(profileSettingsSource, /onOpenSupport=\{onOpenSupport\}/);
    assert.match(profileSettingsSource, /SettingsNativePermissionCard/);
    assert.match(profileSettingsSource, /mediaState=\{mediaState\}/);
    assert.match(
      profileSettingsSource,
      /onRequestNotificationPermission=\{onRequestNotificationPermission\}/,
    );
    assert.match(profileSettingsSource, /onRequestCameraPermission=\{onRequestCameraPermission\}/);
    assert.match(
      profileSettingsSource,
      /onRequestPhotoLibraryPermission=\{onRequestPhotoLibraryPermission\}/,
    );
    assert.match(profileSettingsSource, /onRequestDocumentPicker=\{onRequestDocumentPicker\}/);
    assert.match(screenSource, /function SettingsPermissionActionList/);
    assert.match(screenSource, /mobile-settings-permission-action-notifications/);
    assert.match(screenSource, /mobile-settings-permission-action-camera/);
    assert.match(screenSource, /mobile-settings-permission-action-photo-library/);
    assert.match(screenSource, /mobile-settings-permission-action-document-picker/);
    assert.match(screenSource, /function SettingsSessionActionCard/);
    assert.match(screenSource, /mobile-settings-session-actions/);
    assert.match(screenSource, /mobile-settings-sign-out-action/);
    assert.match(screenSource, /mobile-settings-web-sign-in-action/);
    assert.match(screenSource, /mobile-settings-web-register-action/);
    assert.match(screenSource, /function SettingsSupportLegalCard/);
    assert.match(screenSource, /mobile-settings-support-legal/);
    assert.match(screenSource, /mobile-settings-privacy-action/);
    assert.match(screenSource, /mobile-settings-terms-action/);
    assert.match(screenSource, /mobile-settings-cookies-action/);
    assert.match(screenSource, /mobile-settings-support-action/);
    assert.match(screenSource, /accessibilityState=\{\{ disabled/);
    assert.match(productSource, /useMobileProductLinks/);
    assert.match(productLinksSource, /Linking\.openURL/);
    assert.match(productLinksSource, /new URL\(path, webUrl\)/);
    assert.match(productLinksSource, /openTrustedWebPath\("\/privacy"\)/);
    assert.match(productLinksSource, /openTrustedWebPath\("\/terms"\)/);
    assert.match(productLinksSource, /openTrustedWebPath\("\/cookies"\)/);
    assert.match(productLinksSource, /support@whispr\.team/);
    assert.match(productSource, /activeMobileCopy/);
    assert.match(screenSource, /activeMobileCopy/);
    assert.match(bottomTabBarSource, /activeMobileCopy/);
    assert.match(errorBoundarySource, /activeMobileCopy/);
    assert.match(voiceSource, /activeMobileCopy/);
    assert.match(screenSource, /testID="mobile-settings-language-control"/);
    assert.match(screenSource, /accessibilityRole="radiogroup"/);
    assert.doesNotMatch(productSource, /mobileCopy\.tr/);
    assert.doesNotMatch(screenSource, /mobileCopy\.tr/);
    assert.doesNotMatch(shellSource, /mobileCopy\.tr/);
    assert.doesNotMatch(errorBoundarySource, /mobileCopy\.tr/);
    assert.doesNotMatch(voiceSource, /mobileCopy\.tr/);
    assert.doesNotMatch(profileSettingsSource, /showDiagnostics|onToggleDiagnostics/);
    assert.match(profileSettingsSource, /resolvedSection === "developer"/);
    assert.match(profileSettingsSource, /"mobile-settings-developer"/);
  });

  it("keeps the profile hub feedback entry on the megaphone glyph and the short label", () => {
    const screenSource = readMobileScreenImplementationSource();
    const hubSource = extractFunctionSource(
      screenSource,
      "MobileProfileSettingsHub",
      "MobileProfileHubRow",
    );

    // The generic chat bubble read as "message someone" next to the DM surfaces;
    // the megaphone is the feedback affordance and stays in the hub's Ionicons set.
    assert.match(
      hubSource,
      /icon="megaphone-outline"\s+iconTone="accent"\s+label=\{profileCopy\.feedbackHubAction\}/,
    );
    assert.doesNotMatch(hubSource, /chatbubble-ellipses-outline/);
    assert.equal(mobileCopy.tr.feedbackHubAction, "Geri bildirim");
    assert.equal(mobileCopy.en.feedbackHubAction, "Feedback");
  });

  it("keeps the bottom navigation on the canonical edge-to-edge contract", () => {
    const shellSource = readFileSync(
      join(process.cwd(), "src", "navigation", "mobile-bottom-tab-bar.tsx"),
      "utf8",
    );

    assert.match(shellSource, /function MobileBottomTabBar\(/);
    assert.match(shellSource, /styles\.bottomNavSurface/);
    assert.match(shellSource, /MobileLineIcon/);
    assert.match(shellSource, /useThemedStyles\(createMobileBottomTabBarStyles\)/);
    assert.match(shellSource, /theme\.elevation\.tabBar/);
    assert.doesNotMatch(shellSource, /theme\.elevation\.(?:floating|soft)/);
    assert.match(shellSource, /theme\.typography\.tabLabel/);
    assert.match(shellSource, /mobileNavigationMetrics\.tabItemPaddingVertical/);
    assert.match(shellSource, /theme\.surface\.card/);
    assert.match(shellSource, /theme\.text\.visualFaint/);
    assert.match(shellSource, /theme\.border\.tabBarTop/);
    assert.match(shellSource, /theme\.accent\.tabActive/);
    assert.doesNotMatch(shellSource, /navButtonActive/);
    assert.match(shellSource, /accessibilityRole="tablist"/);
    assert.match(shellSource, /accessibilityRole="tab"/);
    assert.doesNotMatch(shellSource, /navSelectionBar/);
    assert.doesNotMatch(shellSource, /tabIndicator/);
  });

  it("keeps the native voice room surface on the shared mobile visual system", () => {
    const voiceSource = readFileSync(
      join(process.cwd(), "src", "voice", "mobile-voice-room-panel.tsx"),
      "utf8",
    );

    assert.match(voiceSource, /useVoiceRoomThemedStyles\(createMobileVoiceRoomPanelStyles\)/);
    assert.match(voiceSource, /theme\.typography\.headline/);
    assert.match(voiceSource, /theme\.typography\.bodyStrong/);
    assert.match(voiceSource, /theme\.elevation\.headerCard/);
    assert.match(voiceSource, /theme\.elevation\.primaryAction/);
    assert.match(voiceSource, /theme\.surface\.card/);
    assert.match(voiceSource, /theme\.status\.dangerSoft/);
  });

  it("locks the 1e active voice room to production state, actions, and canonical geometry", () => {
    const voiceScreenSource = readFileSync(
      join(process.cwd(), "src", "app", "screens", "voice-screen.tsx"),
      "utf8",
    );
    const voiceStylesSource = readFileSync(
      join(process.cwd(), "src", "app", "screens", "voice-screen.styles.ts"),
      "utf8",
    );
    const modelSource = readFileSync(
      join(process.cwd(), "src", "app", "screens", "active-voice-room-model.ts"),
      "utf8",
    );
    const containerSource = readFileSync(
      join(process.cwd(), "src", "app", "screens", "mobile-screen-containers.tsx"),
      "utf8",
    );

    assert.match(containerSource, /testID="mobile-voice-room-screen"/);
    assert.match(voiceScreenSource, /testID="mobile-voice-minimize"/);
    assert.match(voiceScreenSource, /testID="mobile-voice-audio-output"/);
    assert.match(voiceScreenSource, /testID="mobile-voice-leave"/);
    assert.match(voiceScreenSource, /testID="mobile-voice-invite"/);
    assert.match(voiceScreenSource, /testID="mobile-voice-stage"/);
    // 5a: the scattered header badges became one session strip carrying a real
    // noise-suppression switch, so the read-only badge is gone.
    assert.match(voiceScreenSource, /testID="mobile-voice-session-strip"/);
    assert.match(voiceScreenSource, /testID="mobile-voice-noise-toggle"/);
    assert.doesNotMatch(voiceScreenSource, /testID="mobile-voice-noise-badge"/);
    // The session clock runs on a live connection only, and releases its timer.
    assert.match(voiceScreenSource, /shouldTickMobileVoiceRoomDuration/);
    assert.match(
      voiceScreenSource,
      /if \(!durationRunning\)[\s\S]*setInterval[\s\S]*return \(\) => clearInterval\(interval\);/,
    );
    // Exactly one invite surface in the header, whatever the stage mode is.
    assert.equal(voiceScreenSource.match(/testID="mobile-voice-invite"/g)?.length, 1);
    // The crowded header chat and the mic-permission footnote stay removed.
    assert.doesNotMatch(voiceScreenSource, /testID="mobile-voice-chat"/);
    // The settings entry is back, but icon-only: the invite pill already spends
    // the header's width, and the sheet is the only way to reach the screen-share
    // quality rows from a channel room.
    assert.equal(voiceScreenSource.match(/testID="mobile-voice-settings"/g)?.length, 1);
    assert.match(voiceScreenSource, /styles\.activeVoiceRoomHeaderIconButton/);
    assert.doesNotMatch(
      voiceScreenSource,
      /testID="mobile-voice-settings"[\s\S]{0,220}activeVoiceRoomHeaderPillText/,
    );
    assert.doesNotMatch(voiceScreenSource, /voiceRoomPermissionFootnote/);
    assert.doesNotMatch(voiceScreenSource, /onRequestVoicePermission\(\)/);
    assert.doesNotMatch(modelSource, /\b(dummy|fake|mock)\b/i);
    assert.match(modelSource, /participants: room\.participants/);
    assert.match(voiceStylesSource, /activeVoiceRoomParticipantCard:[\s\S]*borderRadius: 28/);
    assert.match(voiceStylesSource, /activeVoiceRoomStageTile:[\s\S]*borderRadius: 24/);
    // 5a dock: four 48pt circles plus a 52pt leave button, spaced apart.
    assert.match(voiceStylesSource, /activeVoiceRoomControl:[\s\S]*width: 48/);
    assert.match(voiceStylesSource, /activeVoiceRoomControl:[\s\S]*height: 48/);
    assert.match(voiceStylesSource, /activeVoiceRoomControlDanger:[\s\S]*width: 52/);
    assert.match(
      voiceStylesSource,
      /activeVoiceRoomControls:[\s\S]*justifyContent: "space-between"/,
    );
    // 5a header + strip + solo card geometry.
    assert.match(voiceStylesSource, /activeVoiceRoomBackButton:[\s\S]*width: 36/);
    assert.match(voiceStylesSource, /activeVoiceRoomBackButton:[\s\S]*borderRadius: 13/);
    assert.match(voiceStylesSource, /activeVoiceRoomSessionStrip:[\s\S]*borderRadius: 16/);
    // The noise switch is the shared `kit/toggle`, so the room draws no track of its own.
    assert.doesNotMatch(voiceStylesSource, /activeVoiceRoomNoiseToggle/);
    assert.match(voiceStylesSource, /activeVoiceRoomSoloCard:[\s\S]*borderRadius: 28/);
    assert.match(voiceStylesSource, /activeVoiceRoomStatusBadge:[\s\S]*width: 30/);
    // Every colour in the room comes from the dedicated voice-room token group.
    assert.doesNotMatch(voiceStylesSource, /#[0-9a-fA-F]{3,8}\b/);
  });
});

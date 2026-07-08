import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mobileColors,
  mobileElevation,
  mobileRadii,
  mobileSizing,
  mobileSpacing,
  mobileTypography,
} from "../src/design/tokens";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function extractFunctionSource(source: string, name: string, nextName: string) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);

  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`);

  return source.slice(start, end);
}

function readMobileScreenImplementationSource() {
  return readFileSync(
    join(process.cwd(), "src", "app", "mobile-root-screens-legacy.tsx"),
    "utf8",
  );
}

function readMobileAuthImplementationSource() {
  return readFileSync(
    join(process.cwd(), "src", "app", "screens", "auth-gate.tsx"),
    "utf8",
  );
}

describe("mobile design contract", () => {
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

  it("uses Outfit as the app-wide mobile font contract", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const rootSource = readFileSync(
      join(process.cwd(), "src", "app", "whispr-mobile-root.tsx"),
      "utf8",
    );

    assert.equal(mobileTypography.fontFamily, "Outfit");
    assert.ok(packageJson.dependencies?.["@expo-google-fonts/outfit"]);
    assert.ok(packageJson.dependencies?.["expo-font"]);
    assert.match(rootSource, /useOutfitFonts/);
  });

  it("keeps mobile visual tokens aligned with the Whispr web and desktop system", () => {
    for (const colorToken of [
      "surfaceBase",
      "surfaceCard",
      "surfaceSoft",
      "surfaceOverlay",
      "surfaceElevated",
      "textPrimary",
      "textSecondary",
      "textMuted",
      "primary",
      "primaryForeground",
      "primarySoft",
      "borderSubtle",
      "input",
      "ring",
      "ambientPrimary",
      "ambientSecondary",
      "shadow",
    ] as const) {
      assert.equal(typeof mobileColors[colorToken], "string", colorToken);
    }

    for (const typographyToken of [
      "display",
      "headline",
      "title",
      "body",
      "bodyStrong",
      "message",
      "label",
      "button",
      "caption",
    ] as const) {
      assert.equal(
        typeof mobileTypography[typographyToken].fontFamily,
        "string",
        typographyToken,
      );
      assert.equal(typeof mobileTypography[typographyToken].fontSize, "number");
      assert.equal(typeof mobileTypography[typographyToken].lineHeight, "number");
    }

    for (const elevationToken of ["soft", "card", "floating"] as const) {
      assert.equal(typeof mobileElevation[elevationToken].shadowColor, "string");
      assert.equal(typeof mobileElevation[elevationToken].shadowOpacity, "number");
      assert.equal(typeof mobileElevation[elevationToken].shadowRadius, "number");
      assert.equal(typeof mobileElevation[elevationToken].elevation, "number");
    }
  });

  it("renders the mobile auth screens through reusable premium auth components", () => {
    const screenSource = readMobileAuthImplementationSource();

    for (const componentName of [
      "AuthScreenLayout",
      "AuthHeader",
      "ProfileTypeSelector",
      "AuthInput",
      "AuthPrimaryButton",
      "AuthSecondaryButton",
      "SocialLoginRow",
      "SecurityCard",
      "PasswordStrengthBar",
    ]) {
      assert.match(screenSource, new RegExp(`function ${componentName}\\(`));
    }

    assert.match(screenSource, /cloudflare/i);
    assert.match(screenSource, /authRememberMe/);
    assert.match(screenSource, /authTermsAccepted/);
    assert.match(screenSource, /authProfileCorporate/);
    assert.match(
      screenSource,
      /useState<"corporate" \| "gamer" \| "personal">\(\s*"personal",?\s*\)/,
    );
    assert.match(screenSource, /authProfilePreviewLabel/);
    assert.match(screenSource, /authSocialWhisprWeb/);
    assert.match(screenSource, /mobile-auth-social-whispr/);
    assert.doesNotMatch(screenSource, /authSocialDiscord|logo-discord/);
    assert.doesNotMatch(
      screenSource,
      /mode === "register"\s*\?\s*copy\.authNativeWebRegisterFallback\s*:\s*copy\.authNativeWebSignInFallback/,
    );
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
    assert.match(screenSource, /testID="mobile-channel-gif-button"/);
    assert.match(screenSource, /testID="mobile-channel-voice-record-button"/);
    assert.match(screenSource, /testID="mobile-channel-send-button"/);
    assert.match(screenSource, /channelComposerControlRow/);
    assert.match(screenSource, /mobileChannelComposerActions/);
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
    assert.match(screenSource, /styles\.dmActivePresencePill/);
    assert.match(screenSource, /copy\.homeContinueLatestDirectMessage/);
    assert.doesNotMatch(
      screenSource,
      /sampleConversations|mockMessages|demoUsers|fakeMembers|placeholderMessages|dummy/i,
    );
  });

  it("keeps mobile settings production-facing and free of diagnostics surfaces", () => {
    const screenSource = readMobileScreenImplementationSource();
    const rootSource = readFileSync(
      join(process.cwd(), "src", "app", "whispr-mobile-root.tsx"),
      "utf8",
    );
    const shellSource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-app-shell.tsx"),
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
    assert.match(profileSettingsSource, /onOpenPrivacyPolicy=\{onOpenPrivacyPolicy\}/);
    assert.match(profileSettingsSource, /onOpenTerms=\{onOpenTerms\}/);
    assert.match(profileSettingsSource, /onOpenCookies=\{onOpenCookies\}/);
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
    assert.match(rootSource, /Linking\.openURL/);
    assert.match(rootSource, /new URL\(path, runtimeConfig\.webUrl\)/);
    assert.match(rootSource, /openTrustedWebPath\("\/privacy"\)/);
    assert.match(rootSource, /openTrustedWebPath\("\/terms"\)/);
    assert.match(rootSource, /openTrustedWebPath\("\/cookies"\)/);
    assert.match(rootSource, /support@whispr\.team/);
    assert.match(rootSource, /activeMobileCopy/);
    assert.match(screenSource, /activeMobileCopy/);
    assert.match(shellSource, /activeMobileCopy/);
    assert.match(errorBoundarySource, /activeMobileCopy/);
    assert.match(voiceSource, /activeMobileCopy/);
    assert.match(screenSource, /testID="mobile-settings-language-control"/);
    assert.match(screenSource, /accessibilityRole="radiogroup"/);
    assert.doesNotMatch(rootSource, /mobileCopy\.tr/);
    assert.doesNotMatch(screenSource, /mobileCopy\.tr/);
    assert.doesNotMatch(shellSource, /mobileCopy\.tr/);
    assert.doesNotMatch(errorBoundarySource, /mobileCopy\.tr/);
    assert.doesNotMatch(voiceSource, /mobileCopy\.tr/);
    assert.doesNotMatch(
      profileSettingsSource,
      /showDiagnostics|onToggleDiagnostics|SettingsMobileOverviewCard|SettingsFeatureReadinessCard|SettingsPermissionEvidenceCard|SettingsReleaseQualityCard|DeveloperDiagnosticsCard|SessionDiagnostics|ReleaseReadinessCard|StoreReadinessCard|ProductionReadinessCard|MobileQualityGateCard|MediaRuntimeCard/,
    );
  });

  it("keeps the bottom navigation on the premium floating capsule contract", () => {
    const shellSource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-app-shell.tsx"),
      "utf8",
    );

    assert.match(shellSource, /function MobileBottomNavigation\(/);
    assert.match(shellSource, /styles\.bottomNavShadow/);
    assert.match(shellSource, /styles\.bottomNavSurface/);
    assert.match(shellSource, /styles\.navIconHalo/);
    assert.match(shellSource, /styles\.navActiveGlow/);
    assert.match(shellSource, /mobileElevation\.floating/);
    assert.match(shellSource, /mobileTypography\.caption/);
    assert.match(shellSource, /mobileColors\.surfaceElevated/);
    assert.match(shellSource, /mobileColors\.primaryForeground/);
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

    assert.match(voiceSource, /mobileTypography\.headline/);
    assert.match(voiceSource, /mobileTypography\.bodyStrong/);
    assert.match(voiceSource, /mobileElevation\.card/);
    assert.match(voiceSource, /mobileColors\.surfaceCard/);
    assert.match(voiceSource, /mobileColors\.dangerSoft/);
  });
});

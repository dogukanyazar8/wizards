import { describe, expect, it } from "@jest/globals";
import { StyleSheet } from "react-native";
import { createMediaPrimitiveStyles } from "../src/app/components/media-primitives.styles";
import { createMessagePrimitiveStyles } from "../src/app/components/message-primitives.styles";
import { createUiAtomStyles } from "../src/app/components/ui-atoms.styles";
import { createMobileComposerStyles } from "../src/app/composer/mobile-composer.styles";
import { createMobileVoiceInviteOverlayStyles } from "../src/app/overlays/mobile-voice-invite-overlay.styles";
import { createChannelScreenStyles } from "../src/app/screens/channel-screen.styles";
import { createDmScreenStyles } from "../src/app/screens/dm-screen.styles";
import { createHomeScreenStyles } from "../src/app/screens/home-screen.styles";
import { createVoiceScreenStyles } from "../src/app/screens/voice-screen.styles";
import { darkTheme, lightTheme } from "../src/design/themes";
import { createMobileVoiceRoomPanelStyles } from "../src/voice/mobile-voice-room-panel";

describe("mobile communication semantic themes", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)(
    "lets the %s workspace and DM lists own the remaining tab height",
    (_scheme, theme) => {
      const homeStyles = createHomeScreenStyles(theme);
      const dmStyles = createDmScreenStyles(theme);

      expect(homeStyles.homeScreen.flex).toBe(1);
      expect(homeStyles.workspaceBrowserShell.flex).toBe(1);
      expect(homeStyles.mobileWorkspaceSectionListViewport).toMatchObject({
        flex: 1,
        minHeight: 0,
      });
      expect(dmStyles.chatScreen.flex).toBe(1);
      expect(dmStyles.dmListCard.flex).toBe(1);
      expect(dmStyles.dmConversationListViewport).toMatchObject({ flex: 1, minHeight: 0 });
      expect(dmStyles.dmConversationListViewport).not.toHaveProperty("maxHeight");
    },
  );

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("builds %s communication surfaces from semantic theme roles", (_scheme, theme) => {
    expect(createDmScreenStyles(theme).dmConversationCard.backgroundColor).toBe(theme.surface.card);
    expect(createChannelScreenStyles(theme).mobileChannelChatScreen.backgroundColor).toBe(
      theme.surface.base,
    );
    expect(createVoiceScreenStyles(theme).mobileVoiceChannelScreen.backgroundColor).toBe(
      theme.surface.card,
    );
    expect(createMobileComposerStyles(theme).channelComposer.backgroundColor).toBe(
      theme.surface.elevated,
    );
    expect(
      createMobileVoiceInviteOverlayStyles(theme).mobileVoiceInviteOverlayCard.backgroundColor,
    ).toBe(theme.surface.elevated);
    expect(createUiAtomStyles(theme).actionButton.backgroundColor).toBe(theme.surface.card);
    expect(createMediaPrimitiveStyles(theme).mediaRuntimeStatusPill.backgroundColor).toBe(
      theme.surface.soft,
    );
    expect(createMessagePrimitiveStyles(theme).messageAttachmentCard.backgroundColor).toBe(
      theme.surface.card,
    );
    expect(createMobileVoiceRoomPanelStyles(theme).card.backgroundColor).toBe(theme.surface.card);
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("composes audited %s status and action color pairs", (_scheme, theme) => {
    const homeStyles = createHomeScreenStyles(theme);
    const composerStyles = createMobileComposerStyles(theme);
    const uiStyles = createUiAtomStyles(theme);
    const voicePanelStyles = createMobileVoiceRoomPanelStyles(theme);
    const voiceScreenStyles = createVoiceScreenStyles(theme);
    const bootstrapErrorContainer = StyleSheet.flatten([
      uiStyles.bootstrapNotice,
      uiStyles.bootstrapNoticeError,
    ]);
    const bootstrapErrorTitle = StyleSheet.flatten([
      uiStyles.environmentLabel,
      uiStyles.bootstrapNoticeForegroundError,
    ]);
    const bootstrapErrorDescription = StyleSheet.flatten([
      uiStyles.contractDescription,
      uiStyles.bootstrapNoticeForegroundError,
    ]);
    const successIcon = StyleSheet.flatten([uiStyles.statusIcon, uiStyles.statusIconSuccess]);
    const successIconText = StyleSheet.flatten([
      uiStyles.statusIconText,
      uiStyles.statusIconTextSuccess,
    ]);
    const successCardLabel = StyleSheet.flatten([
      uiStyles.environmentLabel,
      uiStyles.statusCardTextSuccess,
    ]);
    const successCardTitle = StyleSheet.flatten([
      uiStyles.statusCardTitle,
      uiStyles.statusCardTextSuccess,
    ]);
    const successCardDescription = StyleSheet.flatten([
      uiStyles.statusCardDescription,
      uiStyles.statusCardTextSuccess,
    ]);

    expect(bootstrapErrorContainer.backgroundColor).toBe(theme.status.dangerSoft);
    expect(bootstrapErrorTitle.color).toBe(theme.status.onStatus);
    expect(bootstrapErrorDescription.color).toBe(theme.status.onStatus);
    expect(successIcon.backgroundColor).toBe(theme.status.successSoft);
    expect(successIconText.color).toBe(theme.status.successText);
    expect(uiStyles.environmentLabel.color).toBe(theme.text.soft);
    expect(uiStyles.statusCardDescription.color).toBe(theme.text.muted);
    expect(successCardLabel.color).toBe(theme.status.successText);
    expect(successCardTitle.color).toBe(theme.status.successText);
    expect(successCardDescription.color).toBe(theme.status.successText);
    expect(homeStyles.homeSummaryCard.backgroundColor).toBe(theme.accent.action);
    expect(homeStyles.homePrimaryServerMeta.color).toBe(theme.text.onPrimary);
    expect(voicePanelStyles.controlButtonDanger.backgroundColor).toBe(theme.status.dangerSoft);
    expect(voicePanelStyles.controlLabelDanger.color).toBe(theme.status.onStatus);
    expect(voiceScreenStyles.mobileVoiceControlButtonDanger.backgroundColor).toBe(
      theme.status.dangerSoft,
    );
    expect(voiceScreenStyles.mobileVoiceControlLabelDanger.color).toBe(theme.status.onStatus);
    expect(composerStyles.dmSendErrorText.backgroundColor).toBe(theme.status.dangerSoft);
    expect(composerStyles.dmSendErrorText.color).toBe(theme.status.onStatus);
  });
});

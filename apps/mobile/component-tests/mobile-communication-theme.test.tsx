import { describe, expect, it } from "@jest/globals";
import { StyleSheet } from "react-native";
import { createMediaPrimitiveStyles } from "../src/app/components/media-primitives.styles";
import { createMessagePrimitiveStyles } from "../src/app/components/message-primitives.styles";
import { createUiAtomStyles } from "../src/app/components/ui-atoms.styles";
import { createMobileComposerStyles } from "../src/app/composer/mobile-composer.styles";
import { createMobileIncomingRequestSheetStyles } from "../src/app/overlays/mobile-incoming-request-sheet.styles";
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
    // MSG-1a: K1 reaches the list. A conversation row paints no surface of its
    // own — it is separated by a hairline, not a card — and only the selected
    // and pressed states tint, from the messaging group.
    expect(createDmScreenStyles(theme).dmConversationCard.backgroundColor).toBeUndefined();
    expect(createDmScreenStyles(theme).dmConversationCardSelected.backgroundColor).toBe(
      theme.messaging.field,
    );
    expect(createDmScreenStyles(theme).dmInboxScreen.backgroundColor).toBe(theme.messaging.screen);
    // MSG-1e moved the channel and its composer onto the messaging group; the
    // global light/dark surfaces below are untouched by that (K4).
    expect(createChannelScreenStyles(theme).mobileChannelChatScreen.backgroundColor).toBe(
      theme.messaging.surface,
    );
    expect(createVoiceScreenStyles(theme).mobileVoiceChannelScreen.backgroundColor).toBe(
      theme.surface.card,
    );
    expect(createMobileComposerStyles(theme).channelComposer.backgroundColor).toBe(
      theme.messaging.surface,
    );
    expect(createMobileComposerStyles(theme).dmChatComposerInputShell.backgroundColor).toBe(
      theme.messaging.field,
    );
    expect(createMobileIncomingRequestSheetStyles(theme).subtitle.color).toBe(theme.text.secondary);
    expect(createUiAtomStyles(theme).actionButton.backgroundColor).toBe(theme.surface.card);
    expect(createMediaPrimitiveStyles(theme).mediaRuntimeStatusPill.backgroundColor).toBe(
      theme.surface.soft,
    );
    // MSG-1d moved the file card onto the messaging token group, where the
    // bubble surface — not the app card — is what a message sits on.
    expect(createMessagePrimitiveStyles(theme).messageAttachmentCard.backgroundColor).toBe(
      theme.messaging.bubbleIn,
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

  it("keeps the 5a/5b active voice room on its canonical light and dark theme surfaces", () => {
    const light = createVoiceScreenStyles(lightTheme);
    const dark = createVoiceScreenStyles(darkTheme);

    expect(light.activeVoiceRoomScreen.backgroundColor).toBe("#F6F7FB");
    expect(light.activeVoiceRoomParticipantCard).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#E7E9F4",
      borderRadius: 28,
      borderWidth: 1,
    });
    expect(light.activeVoiceRoomControl.backgroundColor).toBe("#F6F7FB");
    expect(light.activeVoiceRoomSessionStrip).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#E7E9F4",
    });
    // 5b rewrote the dark set: an opaque screen and card pair replaced the old
    // translucent white washes.
    expect(dark.activeVoiceRoomScreen.backgroundColor).toBe("#14172A");
    expect(dark.activeVoiceRoomParticipantCard).toMatchObject({
      backgroundColor: "#1E2235",
      borderColor: "#2E3452",
    });
    expect(dark.activeVoiceRoomControl.backgroundColor).toBe("#262B45");
    expect(dark.activeVoiceRoomControlDanger.backgroundColor).toBe("#E5484D");
    expect(dark.activeVoiceRoomDock.borderTopColor).toBe("#262B45");
    // The layout is theme-independent: only the colours move between 5a and 5b.
    expect(light.activeVoiceRoomControl.width).toBe(dark.activeVoiceRoomControl.width);
    expect(light.activeVoiceRoomSessionStrip.borderRadius).toBe(
      dark.activeVoiceRoomSessionStrip.borderRadius,
    );
  });
});

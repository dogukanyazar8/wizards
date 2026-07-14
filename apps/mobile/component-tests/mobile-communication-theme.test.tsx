import { describe, expect, it } from "@jest/globals";
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
});

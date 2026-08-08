import { render } from "@testing-library/react-native";

import { createDmScreenStyles } from "../src/app/screens/dm-screen.styles";
import {
  DMInboxHeader,
  DMOnlineStrip,
  DirectMessageConversationCard,
  formatMobileVoicePreviewLabel,
} from "../src/app/screens/dm-inbox";
import {
  getMobileMessagingScale,
  MOBILE_MESSAGING_MAX_SCALE,
} from "../src/design/mobile-messaging-scale";
import { createFriendsHubStyles } from "../src/social/friends-hub";
import { darkTheme, lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";

/** RNTL 14 renders asynchronously; every caller must await this. */
async function renderInTheme(node: React.ReactElement) {
  return render(<MobileThemeProvider>{node}</MobileThemeProvider>);
}

const participant = {
  avatarUrl: null,
  displayName: "Ogi",
  id: "user-2",
  isBot: false,
  status: "ONLINE" as const,
  username: "ogi_uat",
};

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    iconUrl: null,
    id: "dm-1",
    lastMessage: {
      author: { displayName: "Ogi", id: "user-2", username: "ogi_uat" },
      authorIsCurrentUser: false,
      createdAt: "2026-07-28T04:47:00.000Z",
      deliveryStatus: null,
      durationSec: null,
      id: "message-1",
      kind: "text" as const,
      text: "Deploy tamam, bir bakar mısın?",
    },
    lastMessageAt: "2026-07-28T04:47:00.000Z",
    mentionCount: 0,
    muted: false,
    name: null,
    participantCount: 2,
    participants: [participant],
    type: "DM" as const,
    unreadCount: 0,
    ...overrides,
  };
}

describe("MSG-1a/1b/1c shared shell", () => {
  /**
   * Acceptance criterion 8. The three tabs are two files — an inbox and a
   * friends hub — so the band above them is the easiest thing in this wave to
   * let drift. Pinning the shared geometry is what keeps a segment change from
   * nudging the content.
   */
  it("keeps the header, segment and search band identical on every tab", () => {
    const styles = createDmScreenStyles(lightTheme);

    // §2 "1a".2: `padding: 8px 20px 10px`, and no subtitle line under the title.
    expect(styles.dmInboxHeader).toMatchObject({
      paddingBottom: 10,
      paddingHorizontal: 20,
      paddingTop: 8,
    });
    expect(styles).not.toHaveProperty("dmInboxDescription");
    expect(mobileCopy.tr).not.toHaveProperty("dmInboxDescription");
    expect(mobileCopy.en).not.toHaveProperty("dmInboxDescription");

    // §2 "1a".3/.4: the segment and the search pill share the 20px inset, and
    // both keep a fixed height so neither collapses on a tab with less content.
    expect(styles.dmSegmentTrack).toMatchObject({ marginHorizontal: 20, padding: 3, gap: 3 });
    expect(styles.dmSegmentItem).toMatchObject({ height: 36, borderRadius: 11 });
    expect(styles.dmUnifiedSearchWrap).toMatchObject({ marginHorizontal: 20, marginTop: 12 });
    expect(styles.dmUnifiedSearchPill).toMatchObject({ height: 42, borderRadius: 14 });
  });

  it("swaps only the FAB glyph between the chats tab and the people tabs", async () => {
    const chats = await renderInTheme(
      <DMInboxHeader onCompose={() => {}} onCreateGroup={() => {}} segment="conversations" />,
    );
    expect(chats.getByLabelText(mobileCopy.tr.dmComposeAction, { exact: false })).toBeTruthy();

    const friends = await renderInTheme(
      <DMInboxHeader onCompose={() => {}} onCreateGroup={() => {}} segment="friends" />,
    );
    expect(friends.getByLabelText(mobileCopy.tr.dmAddFriendAction, { exact: false })).toBeTruthy();
  });

  it("gives the three lists their own hairline inset", () => {
    const inbox = createDmScreenStyles(lightTheme);
    const hub = createFriendsHubStyles(lightTheme);

    expect(inbox.dmConversationHairline.marginLeft).toBe(79);
    expect(hub.listHairlineFriends.marginLeft).toBe(76);
    expect(hub.listHairlineRequests.marginLeft).toBe(78);
  });
});

describe("MSG-1a conversation rows", () => {
  it("reads the unread row at 800 and the read row at 700", () => {
    const styles = createDmScreenStyles(lightTheme);

    expect(styles.dmConversationName.fontFamily).toBe(lightTheme.typography.fontFamilyBold);
    expect(styles.dmConversationNameUnread.fontFamily).toBe(
      lightTheme.typography.fontFamilyExtraBold,
    );
    expect(styles.dmConversationPreview.color).toBe(lightTheme.messaging.textSecondary);
    expect(styles.dmConversationPreviewUnread.color).toBe(lightTheme.messaging.textTertiary);
    expect(styles.dmConversationTime.color).toBe(lightTheme.messaging.listTime);
    expect(styles.dmConversationTimeUnread.color).toBe(lightTheme.messaging.accent);
  });

  it("draws the mention badge from M4A's mentionCount, ahead of the unread pill", async () => {
    const view = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation({ mentionCount: 2, unreadCount: 4 })}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );

    expect(view.getByTestId("mobile-dm-conversation-mention-badge")).toBeTruthy();
    expect(view.queryByText("4")).toBeNull();
  });

  it('renders a voice preview as "Sesli mesaj · 0:42" from durationSec', async () => {
    expect(formatMobileVoicePreviewLabel(42)).toBe("Sesli mesaj · 0:42");
    expect(formatMobileVoicePreviewLabel(75)).toBe("Sesli mesaj · 1:15");
    // No duration is still a voice note, just without the clock.
    expect(formatMobileVoicePreviewLabel(null)).toBe("Sesli mesaj");

    const view = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation({
          lastMessage: {
            ...conversation().lastMessage,
            durationSec: 42,
            kind: "voice",
            text: "voice-message.m4a",
          },
        })}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );

    expect(view.getByText("Sesli mesaj · 0:42")).toBeTruthy();
  });

  it("shows the BOT badge for a bot counterpart", async () => {
    const view = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation({
          participants: [{ ...participant, id: "bot-1", isBot: true, username: "codex" }],
        })}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );

    expect(view.getByTestId("mobile-dm-conversation-bot-badge")).toBeTruthy();
  });

  it("replaces the preview with typing dots while someone is typing", async () => {
    const view = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation()}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
        typingNames={["ogi_uat"]}
      />,
    );

    expect(view.getByTestId("mobile-dm-conversation-typing")).toBeTruthy();
    expect(view.getByText(mobileCopy.tr.dmTypingShortLabel)).toBeTruthy();
    expect(view.queryByText("Deploy tamam, bir bakar mısın?")).toBeNull();
  });

  it("marks a muted row with the bell and a read row with the double tick", async () => {
    const muted = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation({ muted: true })}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );
    expect(muted.getByLabelText(mobileCopy.tr.dmMutedLabel)).toBeTruthy();

    const read = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation({
          lastMessage: {
            ...conversation().lastMessage,
            authorIsCurrentUser: true,
            deliveryStatus: "read",
          },
        })}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );
    expect(read.getByLabelText(mobileCopy.tr.dmReadReceiptLabel)).toBeTruthy();
  });

  /**
   * §2 "1a".6.4. "Delivered" and "read" share the double-tick glyph, so the
   * three states are only distinguishable by the testID and the label — which
   * is exactly what a screen reader is left with too.
   */
  it("walks the outgoing preview through gönderildi, iletildi and okundu", async () => {
    const outgoing = (deliveryStatus: "sent" | "delivered" | "read") =>
      conversation({
        lastMessage: { ...conversation().lastMessage, authorIsCurrentUser: true, deliveryStatus },
      });

    const sent = await renderInTheme(
      <DirectMessageConversationCard
        conversation={outgoing("sent")}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );
    expect(sent.getByTestId("mobile-dm-conversation-tick-sent")).toBeTruthy();
    expect(sent.getByLabelText(mobileCopy.tr.dmChatSentLabel)).toBeTruthy();

    const delivered = await renderInTheme(
      <DirectMessageConversationCard
        conversation={outgoing("delivered")}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );
    expect(delivered.getByTestId("mobile-dm-conversation-tick-delivered")).toBeTruthy();
    expect(delivered.getByLabelText(mobileCopy.tr.dmChatDeliveredLabel)).toBeTruthy();

    // An incoming preview is not the viewer's message, so it carries no tick.
    const incoming = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation()}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
      />,
    );
    expect(incoming.queryByTestId("mobile-dm-conversation-tick-sent")).toBeNull();
    expect(incoming.queryByTestId("mobile-dm-conversation-tick-read")).toBeNull();
  });

  /** §2 "1a".5: the row agrees with the strip about who is in a voice room. */
  it("draws the wave tile on a row whose counterpart is in a voice room", async () => {
    const inVoice = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation()}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
        voiceUserIds={new Set(["user-2"])}
      />,
    );
    expect(inVoice.getByTestId("mobile-dm-conversation-voice-tile")).toBeTruthy();
    expect(inVoice.queryByTestId("mobile-dm-conversation-online-dot")).toBeNull();

    // The viewer's own voice room says nothing about the counterpart's row.
    const selfOnly = await renderInTheme(
      <DirectMessageConversationCard
        conversation={conversation()}
        currentUserId="user-1"
        onOpenConversation={() => {}}
        selected={false}
        voiceUserIds={new Set(["user-1"])}
      />,
    );
    expect(selfOnly.queryByTestId("mobile-dm-conversation-voice-tile")).toBeNull();
  });
});

describe("MSG-1a online strip", () => {
  const friend = {
    avatarUrl: null,
    displayName: "CodeX",
    id: "friend-1",
    status: "ONLINE" as const,
    username: "codex",
    voiceRoom: null,
  };

  it("marks a friend in a voice room with the wave tile, not a presence dot", async () => {
    const view = await renderInTheme(
      <DMOnlineStrip
        friends={[
          {
            ...friend,
            voiceRoom: {
              channelId: "channel-1",
              channelName: "live-room",
              serverId: "server-1",
              serverName: "paycore",
            },
          },
        ]}
        onAddFriend={() => {}}
        onOpenFriendDM={() => {}}
      />,
    );

    expect(view.getByTestId("mobile-dm-online-voice-friend-1")).toBeTruthy();
    expect(view.queryByTestId("mobile-dm-online-dot-friend-1")).toBeNull();
  });

  it("falls back to the presence dot for a friend who is merely online", async () => {
    const view = await renderInTheme(
      <DMOnlineStrip friends={[friend]} onAddFriend={() => {}} onOpenFriendDM={() => {}} />,
    );

    expect(view.getByTestId("mobile-dm-online-dot-friend-1")).toBeTruthy();
    expect(view.queryByTestId("mobile-dm-online-voice-friend-1")).toBeNull();
  });

  it("locks the strip cell to the 52/50/r17 scale and the dashed add tile", () => {
    const styles = createDmScreenStyles(lightTheme);

    expect(styles.dmOnlineStripCell.width).toBe(52);
    expect(styles.dmOnlineStripAvatarWrap).toMatchObject({ height: 50, width: 50 });
    expect(styles.dmOnlineStripVoiceTile).toMatchObject({
      borderRadius: 7,
      height: 19,
      width: 19,
    });
    expect(styles.dmOnlineStripAddCell).toMatchObject({
      borderRadius: 17,
      borderStyle: "dashed",
      borderWidth: 1.6,
    });
  });
});

/**
 * The handoff is drawn on a 390pt frame. On a wider phone every fixed metric
 * covers proportionally less screen, which is what made the shipped list read a
 * size smaller than "1a" — thinner rows, a presence dot that looked like a
 * speck. The factory takes the mapping as an argument so the design's own
 * numbers stay the baseline.
 */
describe("MSG-1a proportional scale", () => {
  it("holds the 1a proportions on a wider screen and clamps past a phone", () => {
    expect(getMobileMessagingScale(390)).toBe(1);
    // Narrower than the frame is left alone rather than shrunk.
    expect(getMobileMessagingScale(360)).toBe(1);
    expect(getMobileMessagingScale(430)).toBeCloseTo(430 / 390, 5);
    expect(getMobileMessagingScale(1024)).toBe(MOBILE_MESSAGING_MAX_SCALE);
    // A window that has not measured yet must not collapse the list.
    expect(getMobileMessagingScale(0)).toBe(1);
  });

  it("grows the row, the dot and the type together", () => {
    const baseline = createDmScreenStyles(lightTheme);
    const wide = createDmScreenStyles(lightTheme, getMobileMessagingScale(430));

    expect(baseline.dmActivePresenceDot).toMatchObject({ borderWidth: 2.5, height: 13, width: 13 });
    expect(wide.dmActivePresenceDot.height).toBeGreaterThan(13);
    expect(wide.dmConversationAvatar.height).toBeGreaterThan(46);
    expect(wide.dmConversationName.fontSize).toBeGreaterThan(15);
    expect(wide.dmConversationPreview.fontSize).toBeGreaterThan(13);
    // The seam between rows is a hairline at every size, not a rule.
    expect(wide.dmConversationHairline.height).toBe(1);
  });
});

describe("MSG-1b/1c row geometry", () => {
  it("uses the 44/r15 friend avatar and the 46/r16 request avatar", () => {
    const hub = createFriendsHubStyles(lightTheme);

    expect(hub.socialRow).toMatchObject({ gap: 12, paddingHorizontal: 20, paddingVertical: 9 });
    expect(hub.socialRowRequest.paddingVertical).toBe(10);
    // §2 "1b": an offline friend dims; §2 "1c": a sent request dims less.
    expect(hub.socialAvatarOffline.opacity).toBe(0.6);
    expect(hub.socialAvatarSent.opacity).toBe(0.75);
  });

  it("keeps the 1c decision buttons at 40/r14 and the pills at h36", () => {
    const hub = createFriendsHubStyles(lightTheme);

    expect(hub.requestDecisionAccept).toMatchObject({
      backgroundColor: lightTheme.messaging.accent,
      borderRadius: 14,
      height: 40,
      width: 40,
    });
    expect(hub.requestDecisionReject).toMatchObject({
      backgroundColor: lightTheme.messaging.surface,
      borderWidth: 1,
      height: 40,
      width: 40,
    });
    expect(hub.socialSmallPill.height).toBe(36);
    expect(hub.socialJoinPill.height).toBe(38);
  });

  it("resolves every 1b/1c colour through the messaging group on both themes", () => {
    for (const theme of [lightTheme, darkTheme]) {
      const hub = createFriendsHubStyles(theme);
      expect(hub.root.backgroundColor).toBe(theme.messaging.screen);
      expect(hub.groupLabel.color).toBe(theme.messaging.groupLabel);
      expect(hub.groupCountOnline.color).toBe(theme.messaging.onlineText);
      expect(hub.groupCountDanger.color).toBe(theme.messaging.danger);
      expect(hub.socialNameMuted.color).toBe(theme.messaging.nameMuted);
      expect(hub.listHairlineFriends.backgroundColor).toBe(theme.messaging.hairline);
    }
  });
});

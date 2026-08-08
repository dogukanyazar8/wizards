import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import type { MobileBootstrapPayload } from "@wizards/types";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { DirectMessageConversationCard } from "../src/app/screens/dm-screen";
import { DMOnlineStrip } from "../src/app/screens/dm-inbox";
import { createDmScreenStyles } from "../src/app/screens/dm-screen.styles";
import { getMobilePresenceColor } from "../src/design/mobile-presence-color";
import { lightTheme } from "../src/design/themes";

const groupConversation = {
  iconUrl: null,
  id: "group-1",
  lastMessage: {
    author: {
      avatarUrl: null,
      displayName: "Ada",
      id: "user-ada",
      status: "ONLINE",
      username: "ada",
    },
    authorIsCurrentUser: false,
    text: "Toplantı 15:00'te.",
  },
  lastMessageAt: "2026-07-16T08:00:00.000Z",
  muted: false,
  name: "Paycore ekip",
  participantCount: 3,
  participants: [
    {
      avatarUrl: null,
      displayName: "Ada",
      id: "user-ada",
      status: "ONLINE",
      username: "ada",
    },
  ],
  type: "GROUP_DM",
  unreadCount: 2,
} as MobileBootstrapPayload["home"]["directMessages"]["recent"][number];

describe("1c DM inbox redesign", () => {
  it("derives the unread group row entirely from its live conversation payload", async () => {
    const onOpenConversation = jest.fn();
    const view = await render(
      <DirectMessageConversationCard
        conversation={groupConversation}
        onOpenConversation={onOpenConversation}
        selected={false}
      />,
    );

    expect(view.getByText("Paycore ekip")).toBeTruthy();
    expect(view.getByText("2")).toBeTruthy();
    expect(view.getByTestId("mobile-dm-conversation-group-badge")).toBeTruthy();
  });

  it("locks the MSG-1a row geometry to the messaging shape scale", () => {
    const styles = createDmScreenStyles(lightTheme);

    // §0.5: 46/r16 on the conversation list, `padding: 10px 20px`, gap 13.
    expect(styles.dmConversationAvatar).toMatchObject({
      borderRadius: 16,
      height: 46,
      width: 46,
    });
    expect(styles.dmConversationCard).toMatchObject({
      gap: 13,
      paddingHorizontal: 20,
      paddingVertical: 10,
    });
    // K1: no card, no frame — a hairline at 79px is the only separator.
    expect(styles.dmConversationCard).not.toHaveProperty("borderWidth");
    expect(styles.dmConversationHairline).toMatchObject({
      backgroundColor: lightTheme.messaging.hairline,
      height: 1,
      marginLeft: 79,
    });
  });

  it("anchors the 6a presence dot to the avatar corner with per-status colours", () => {
    const styles = createDmScreenStyles(lightTheme);

    // §0.5: 13px dot ringed 2.5px in the screen tone, overhanging the corner.
    expect(styles.dmActivePresenceDot).toMatchObject({
      position: "absolute",
      bottom: -1,
      right: -1,
      width: 13,
      height: 13,
      borderWidth: 2.5,
      backgroundColor: lightTheme.messaging.online,
      borderColor: lightTheme.messaging.screen,
    });
    expect(getMobilePresenceColor("online", lightTheme)).toBe(lightTheme.status.success);
    expect(getMobilePresenceColor("idle", lightTheme)).toBe(lightTheme.status.warning);
    expect(getMobilePresenceColor("dnd", lightTheme)).toBe(lightTheme.status.danger);
    expect(getMobilePresenceColor("offline", lightTheme)).toBe(lightTheme.control.separatorDot);
  });

  it("shows the counterpart presence on a direct row and ignores the viewer's own status", async () => {
    const directConversation = {
      ...groupConversation,
      id: "dm-1",
      name: "ogi_uat",
      participantCount: 2,
      participants: [
        {
          avatarUrl: null,
          displayName: null,
          id: "user-self",
          status: "ONLINE",
          username: "dogukanyazar",
        },
        {
          avatarUrl: null,
          displayName: null,
          id: "user-ogi",
          status: "OFFLINE",
          username: "ogi_uat",
        },
      ],
      type: "DM",
      unreadCount: 0,
    } as typeof groupConversation;

    const renderDot = async (presenceByUserId?: ReadonlyMap<string, string>) => {
      const view = await render(
        <DirectMessageConversationCard
          conversation={directConversation}
          currentUserId="user-self"
          onOpenConversation={jest.fn()}
          {...(presenceByUserId ? { presenceByUserId } : {})}
          selected={false}
        />,
      );
      return view.getByTestId("mobile-dm-conversation-online-dot").props.style;
    };

    // The viewer is ONLINE in the payload; the row must reflect the counterpart instead.
    expect(await renderDot()).toEqual(
      expect.arrayContaining([{ backgroundColor: lightTheme.control.separatorDot }]),
    );
    expect(await renderDot(new Map([["user-ogi", "ONLINE"]]))).toEqual(
      expect.arrayContaining([{ backgroundColor: lightTheme.status.success }]),
    );
    expect(await renderDot(new Map([["user-ogi", "DND"]]))).toEqual(
      expect.arrayContaining([{ backgroundColor: lightTheme.status.danger }]),
    );
    expect(await renderDot(new Map([["user-ogi", "IDLE"]]))).toEqual(
      expect.arrayContaining([{ backgroundColor: lightTheme.status.warning }]),
    );
  });

  it("shows the counterpart identity on a direct row and never the viewer's own avatar", async () => {
    const directConversation = {
      ...groupConversation,
      id: "dm-2",
      name: "ogi_uat",
      participantCount: 2,
      participants: [
        {
          avatarUrl: "https://cdn.whispr.team/self.png",
          displayName: null,
          id: "user-self",
          status: "ONLINE",
          username: "dogukanyazar",
        },
        {
          avatarUrl: null,
          displayName: null,
          id: "user-ogi",
          status: "OFFLINE",
          username: "ogi_uat",
        },
      ],
      type: "DM",
      unreadCount: 0,
    } as typeof groupConversation;

    const view = await render(
      <DirectMessageConversationCard
        conversation={directConversation}
        currentUserId="user-self"
        onOpenConversation={jest.fn()}
        selected={false}
      />,
    );

    // Initials render only when the row falls back, and the row must fall back
    // to the counterpart instead of borrowing the viewer's photo.
    expect(view.getByText("OG")).toBeTruthy();
  });

  it("paints the online strip ring and dot with the per-status presence colour", async () => {
    const view = await render(
      <DMOnlineStrip
        friends={[
          { avatarUrl: null, displayName: null, id: "f-dnd", status: "DND", username: "dnd_user" },
          {
            avatarUrl: null,
            displayName: null,
            id: "f-idle",
            status: "IDLE",
            username: "idle_user",
          },
        ]}
        onAddFriend={jest.fn()}
        onOpenFriendDM={jest.fn()}
      />,
    );

    expect(view.getByTestId("mobile-dm-online-dot-f-dnd").props.style).toEqual(
      expect.arrayContaining([{ backgroundColor: lightTheme.status.danger }]),
    );
    expect(view.getByTestId("mobile-dm-online-dot-f-idle").props.style).toEqual(
      expect.arrayContaining([{ backgroundColor: lightTheme.status.warning }]),
    );
  });
});

/**
 * A group lifecycle row stores no text — the sentence depends on the reader's
 * locale. The list route used to answer "Attachment" for it, so the very first
 * row a new group showed was a hardcoded English word.
 */
describe("group lifecycle preview", () => {
  const systemConversation = {
    ...groupConversation,
    lastMessage: {
      author: {
        avatarUrl: null,
        displayName: "Ada",
        id: "user-ada",
        status: "ONLINE",
        username: "ada",
      },
      authorIsCurrentUser: false,
      systemTargetUserIds: [],
      systemType: "GROUP_CREATED",
      systemValue: null,
      text: "",
    },
    unreadCount: 0,
  } as unknown as typeof groupConversation;

  it("renders the localized sentence rather than an empty or English preview", async () => {
    const view = await render(
      <DirectMessageConversationCard
        conversation={systemConversation}
        currentUserId="user-me"
        onOpenConversation={jest.fn()}
        selected={false}
      />,
    );

    expect(view.queryByText("Attachment")).toBeNull();
    expect(view.getByText("Ada grubu oluşturdu")).toBeTruthy();
  });

  it("says 'Sen' when the viewer is the one who acted", async () => {
    const view = await render(
      <DirectMessageConversationCard
        conversation={systemConversation}
        currentUserId="user-ada"
        onOpenConversation={jest.fn()}
        selected={false}
      />,
    );

    expect(view.getByText("Sen grubu oluşturdu")).toBeTruthy();
  });
});

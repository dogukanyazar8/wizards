import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import type { MobileBootstrapPayload } from "@wizards/types";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { DirectMessageConversationCard } from "../src/app/screens/dm-screen";
import { createDmScreenStyles } from "../src/app/screens/dm-screen.styles";
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

  it("locks the 1c unread-card and avatar geometry to semantic theme tokens", () => {
    const styles = createDmScreenStyles(lightTheme);

    expect(styles.dmConversationAvatar).toMatchObject({
      borderRadius: 18,
      height: 50,
      width: 50,
    });
    expect(styles.dmConversationCardUnread).toMatchObject({
      backgroundColor: lightTheme.surface.card,
      borderColor: lightTheme.border.subtle,
      borderRadius: 18,
      borderWidth: 1,
    });
    expect(styles.inboxFilterButtonActive).toMatchObject({
      backgroundColor: lightTheme.surface.inverse,
      borderRadius: 14,
    });
  });
});

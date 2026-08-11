import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DMConversationDTO, GroupInviteDTO } from "@wizards/types";

import { DmGroupDetailsPanel } from "@/components/dm/dm-group-details-panel";
import { DmGroupSettingsPanel } from "@/components/dm/dm-group-settings-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §D3 / P11. The web arm has to enforce the same
 * two rules the phone does: an unauthorized viewer sees **no** permissions block
 * (§11.3/30) and **no** action they cannot take (Faz 3 karar 7).
 */

const VIEWER = "user-1";

function participant(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    avatarUrl: null,
    customStatus: null,
    displayName: userId.toUpperCase(),
    joinedAt: "2026-03-12T09:00:00.000Z",
    muted: false,
    presence: { customStatus: null, status: "OFFLINE" as const },
    role: "MEMBER" as const,
    status: "OFFLINE" as const,
    unreadCount: 0,
    userId,
    username: userId,
    ...overrides,
  };
}

function conversation(overrides: Partial<DMConversationDTO> = {}): DMConversationDTO {
  return {
    avatarColor: "#4F46E5",
    description: null,
    disappearingAfter: "OFF",
    historyVisibility: "ALL",
    iconUrl: null,
    id: "group-1",
    lastMessage: null,
    lastMessageAt: "2026-03-12T09:00:00.000Z",
    memberCount: 3,
    name: "Whispr Mobil Ekibi",
    notifyLevel: "ALL",
    ownerId: VIEWER,
    participants: [
      participant(VIEWER, { role: "OWNER" }),
      participant("user-2", { role: "ADMIN" }),
      participant("user-3"),
    ],
    permissions: {
      addMembers: "ALL",
      editInfo: "ADMINS",
      pinMessage: "ADMINS",
      sendMessage: "ALL",
    },
    pinnedAt: null,
    pinnedMessage: null,
    role: "OWNER",
    type: "GROUP_DM",
    ...overrides,
  } as DMConversationDTO;
}

const MEMBER_VIEW = conversation({
  ownerId: "user-2",
  participants: [
    participant("user-2", { role: "OWNER" }),
    participant(VIEWER, { role: "MEMBER" }),
    participant("user-3"),
  ],
  role: "MEMBER",
});

const OPEN_INVITE: GroupInviteDTO = {
  code: "ABCDEFGHJKLM",
  displayUrl: "whispr.gg/g/ABCDEFGHJKLM",
  enabled: true,
  expiresAt: null,
  maxUses: null,
  rotatedAt: null,
  url: "https://whispr.gg/g/ABCDEFGHJKLM",
  uses: 2,
};

function renderSettings(props: Partial<React.ComponentProps<typeof DmGroupSettingsPanel>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DmGroupSettingsPanel
        conversation={conversation()}
        currentUserId={VIEWER}
        onLeave={() => undefined}
        {...props}
      />
    </LocaleProvider>,
  );
}

function renderDetails(props: Partial<React.ComponentProps<typeof DmGroupDetailsPanel>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DmGroupDetailsPanel
        conversation={conversation()}
        currentUserId={VIEWER}
        onRemoveMember={() => undefined}
        onSetMemberRole={() => undefined}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("web 2f settings panel", () => {
  it("draws the three notification tiers and marks the current one", () => {
    const html = renderSettings();

    assert.match(html, /dm-group-notify-ALL/);
    assert.match(html, /dm-group-notify-MENTIONS/);
    assert.match(html, /dm-group-notify-NONE/);
    assert.match(html, /aria-checked="true"[^>]*data-testid="dm-group-notify-ALL"/);
  });

  it("draws the four permission rows for somebody who may change them", () => {
    const html = renderSettings();

    for (const action of ["sendMessage", "addMembers", "editInfo", "pinMessage"]) {
      assert.match(html, new RegExp(`dm-group-permission-${action}`));
    }
  });

  it("renders no permissions block at all for a member (§11.3/30)", () => {
    const html = renderSettings({ conversation: MEMBER_VIEW });

    assert.doesNotMatch(html, /dm-group-permissions/);
    assert.doesNotMatch(html, /dm-group-permission-sendMessage/);
  });

  it("prints no invite link while it is off and prints it once it is on (§11.3/28)", () => {
    assert.doesNotMatch(renderSettings(), /whispr\.gg\/g\//);
    assert.match(renderSettings({ invite: OPEN_INVITE }), /whispr\.gg\/g\/ABCDEFGHJKLM/);
  });

  it("offers copy and rotate only once a link exists", () => {
    assert.doesNotMatch(renderSettings(), /dm-group-invite-copy/);

    const open = renderSettings({ invite: OPEN_INVITE, onRotateInvite: () => undefined });
    assert.match(open, /dm-group-invite-copy/);
    assert.match(open, /dm-group-invite-rotate/);
  });

  it("says the disappearing change is forward-only before it is made (V6)", () => {
    assert.match(renderSettings(), /yalnız yeni mesajlara/);
  });

  it("hides the invite switch from a member who may not edit the info", () => {
    assert.doesNotMatch(renderSettings({ conversation: MEMBER_VIEW }), /dm-group-invite-toggle/);
  });
});

describe("web 2e details panel", () => {
  it("names the owner in gold and the other admin in the accent tint", () => {
    const html = renderDetails();

    assert.match(html, /dm-group-role-owner/);
    assert.match(html, /dm-group-role-admin/);
  });

  it("offers promote and remove to the owner", () => {
    const html = renderDetails();

    assert.match(html, /dm-group-role-toggle-user-3/);
    assert.match(html, /dm-group-remove-user-3/);
  });

  it("offers a member neither of them (Faz 3 karar 7)", () => {
    const html = renderDetails({ conversation: MEMBER_VIEW });

    assert.doesNotMatch(html, /dm-group-role-toggle-/);
    assert.doesNotMatch(html, /dm-group-remove-/);
  });

  it("never offers the viewer a control aimed at themselves", () => {
    const html = renderDetails();

    assert.doesNotMatch(html, new RegExp(`dm-group-remove-${VIEWER}`));
    assert.doesNotMatch(html, new RegExp(`dm-group-role-toggle-${VIEWER}`));
  });

  it("draws the pinned card only when the group has a pin", () => {
    assert.doesNotMatch(renderDetails(), /dm-group-pinned-card/);

    const pinned = renderDetails({
      conversation: conversation({
        pinnedMessage: {
          authorName: "Doğukan",
          dismissed: false,
          excerpt: "Demo yarın 16:00",
          id: "m-pin",
        },
      }),
    });
    assert.match(pinned, /dm-group-pinned-card/);
    assert.match(pinned, /Demo yarın 16:00/);
  });

  it("hides the identity form from a member (the same gate 2e's pencil reads)", () => {
    const html = renderDetails({ conversation: MEMBER_VIEW, onUpdate: () => undefined });

    assert.doesNotMatch(html, /dm-group-name-input/);
  });
});

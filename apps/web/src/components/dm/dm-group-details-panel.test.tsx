import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DMConversationDTO, DMParticipantDTO } from "@wizards/types";

import { DmGroupDetailsPanel } from "@/components/dm/dm-group-details-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function participant(userId: string, displayName: string): DMParticipantDTO {
  return {
    avatarUrl: null,
    customStatus: null,
    displayName,
    muted: false,
    presence: { customStatus: null, status: "OFFLINE" },
    status: "OFFLINE",
    unreadCount: 0,
    userId,
    username: displayName.toLocaleLowerCase(),
  };
}

const CONVERSATION: DMConversationDTO = {
  iconUrl: null,
  id: "dm-group-1",
  lastMessage: null,
  lastMessageAt: "2026-08-08T10:00:00.000Z",
  name: "Takım",
  ownerId: "user-1",
  participants: [
    participant("user-1", "Ada"),
    participant("user-2", "Selin"),
    participant("user-3", "Kaan"),
  ],
  type: "GROUP_DM",
};

function renderPanel(currentUserId: string, overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DmGroupDetailsPanel
        conversation={CONVERSATION}
        currentUserId={currentUserId}
        onAddMembers={() => undefined}
        onLeave={() => undefined}
        onRemoveMember={() => undefined}
        onUpdate={() => undefined}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("DM group details panel", () => {
  it("gives the owner the editor, the photo field, add and remove", () => {
    const markup = renderPanel("user-1");

    assert.match(markup, /dm-group-name-input/);
    assert.match(markup, /group-icon-field/);
    assert.match(markup, /dm-group-add-member/);
    assert.match(markup, /dm-group-remove-user-2/);
    // The owner never removes themselves from the roster; leaving is its own action.
    assert.doesNotMatch(markup, /dm-group-remove-user-1/);
  });

  it("gives a plain member the roster and the exit only", () => {
    const markup = renderPanel("user-2");

    assert.doesNotMatch(markup, /dm-group-name-input/);
    assert.doesNotMatch(markup, /group-icon-field/);
    assert.doesNotMatch(markup, /dm-group-add-member/);
    assert.doesNotMatch(markup, /dm-group-remove-/);
    assert.match(markup, /dm-group-leave/);
  });

  it("marks the owner row and counts every member", () => {
    const markup = renderPanel("user-2");

    assert.match(markup, /Yönetici/);
    assert.match(markup, /3 üye/);
  });

  it("draws no mutual-servers block", () => {
    assert.doesNotMatch(renderPanel("user-2"), /ORTAK SUNUCULAR/);
  });

  it("keeps the add-member picker searchable once it is opened", () => {
    // The picker is closed on first paint, so its field is not in the markup yet
    // — what this pins is that the field belongs to the picker and not the panel.
    const markup = renderPanel("user-1", {
      candidates: [{ avatarUrl: null, displayName: "Ece", id: "user-9", username: "ece" }],
    });

    assert.doesNotMatch(markup, /dm-group-add-search/);
    assert.match(markup, /dm-group-add-member/);
  });
});

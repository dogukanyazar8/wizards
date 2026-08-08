import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DMSystemMessageTypeValue } from "@wizards/types";

import { DmSystemMessage } from "@/components/dm/dm-system-message";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const PARTICIPANTS = [
  { displayName: "Ada", userId: "user-1", username: "ada" },
  { displayName: "Selin", userId: "user-2", username: "selin_qa" },
  { displayName: "Kaan", userId: "user-3", username: "kaan" },
];

function renderSystemMessage(input: {
  actorUserId: string;
  currentUserId?: string;
  systemTargetUserIds?: string[];
  systemType: DMSystemMessageTypeValue | null;
  systemValue?: string | null;
}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DmSystemMessage
        actorUserId={input.actorUserId}
        currentUserId={input.currentUserId ?? "user-9"}
        participants={PARTICIPANTS}
        systemTargetUserIds={input.systemTargetUserIds}
        systemType={input.systemType}
        systemValue={input.systemValue ?? null}
      />
    </LocaleProvider>,
  );
}

describe("DM system message", () => {
  it("names the actor who created the group", () => {
    const markup = renderSystemMessage({ actorUserId: "user-1", systemType: "GROUP_CREATED" });

    assert.match(markup, /dm-system-message/);
    assert.match(markup, /Ada grubu oluşturdu/);
  });

  it("substitutes the reader's own pronoun for their own action", () => {
    const markup = renderSystemMessage({
      actorUserId: "user-1",
      currentUserId: "user-1",
      systemType: "MEMBER_LEFT",
    });

    assert.match(markup, /Sen gruptan ayrıldı/);
    assert.doesNotMatch(markup, /Ada/);
  });

  it("joins several targets into one sentence and skips ids it cannot resolve", () => {
    const markup = renderSystemMessage({
      actorUserId: "user-1",
      systemTargetUserIds: ["user-2", "user-3", "user-gone"],
      systemType: "MEMBER_ADDED",
    });

    assert.match(markup, /Selin, Kaan kişisini ekledi/);
    assert.doesNotMatch(markup, /user-gone/);
  });

  it("puts the new name into the rename sentence", () => {
    const markup = renderSystemMessage({
      actorUserId: "user-2",
      systemType: "NAME_CHANGED",
      systemValue: "Takım",
    });

    assert.match(markup, /Takım/);
  });

  it("renders nothing for an ordinary message", () => {
    assert.equal(renderSystemMessage({ actorUserId: "user-1", systemType: null }), "");
  });
});

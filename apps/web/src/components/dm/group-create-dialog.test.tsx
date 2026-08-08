import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  createInitialGroupCreateState,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupCreateState,
} from "@wizards/types";

import { GroupCreateDialogContent } from "@/components/dm/group-create-dialog";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const FRIENDS = [
  { avatarUrl: null, displayName: "Selin", id: "user-2", username: "selin_qa" },
  { avatarUrl: null, displayName: "Kaan", id: "user-3", username: "kaan" },
];

function renderDialog() {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <GroupCreateDialogContent
        friends={FRIENDS}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />
    </LocaleProvider>,
  );
}

function selectMany(count: number): GroupCreateState {
  let state = createInitialGroupCreateState();
  for (let index = 0; index < count; index += 1) {
    state = toggleGroupMember(state, `user-${index}`);
  }
  return state;
}

describe("group create dialog", () => {
  it("opens on the member step with the next action shut", () => {
    const markup = renderDialog();

    assert.match(markup, /group-create-dialog/);
    assert.match(markup, /group-create-friend-user-2/);
    // Nothing is picked yet, so the counter is the creator alone and "next" is
    // rendered disabled.
    assert.match(markup, />1\/32</);
    assert.match(markup, /data-testid="group-create-next"[^>]*disabled/);
  });

  it("keeps its rules in @wizards/types rather than re-deriving them", () => {
    // The dialog imports these; the ceiling below is the shared one, not a copy.
    const full = selectMany(GROUP_DM_MAX_PARTICIPANTS - 1);
    const overflowed = toggleGroupMember(full, "user-overflow");

    assert.equal(full.selectedUserIds.length, GROUP_DM_MAX_PARTICIPANTS - 1);
    assert.equal(overflowed, full);
    assert.equal(overflowed.selectedUserIds.length, GROUP_DM_MAX_PARTICIPANTS - 1);
  });

  it("drops a blank name from the create body", () => {
    const state: GroupCreateState = {
      ...selectMany(2),
      name: "   ",
      step: "identity",
    };

    const body = toGroupCreateRequest(state, null);

    assert.equal("name" in body, false);
    assert.deepEqual(body.userIds, ["user-0", "user-1"]);
  });

  it("sends a trimmed name", () => {
    const state: GroupCreateState = {
      ...selectMany(2),
      name: "  Takım  ",
      step: "identity",
    };

    assert.equal(toGroupCreateRequest(state, null).name, "Takım");
  });

  it("carries the group copy in both locales", () => {
    for (const locale of ["tr", "en"] as const) {
      const messages: Record<string, string | undefined> = getMessagesForLocale(locale);

      assert.ok(messages["dm.group.counter"]?.includes("{count}"));
      assert.ok(messages["dm.group.createAction"]);
      assert.ok(messages["dm.group.submitAction"]);
    }
  });
});

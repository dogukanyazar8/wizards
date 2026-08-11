import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  buildGroupNameFromMembers,
  createInitialGroupCreateState,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupCreateState,
} from "@wizards/types";

import { GroupCreateDialogContent } from "@/components/dm/group-create-dialog";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const FRIENDS = [
  {
    allowsGroupInvites: true,
    avatarUrl: null,
    displayName: "Selin",
    id: "user-2",
    username: "selin_qa",
  },
  {
    allowsGroupInvites: true,
    avatarUrl: null,
    displayName: "Kaan",
    id: "user-3",
    username: "kaan",
  },
  {
    allowsGroupInvites: false,
    avatarUrl: null,
    displayName: "Mert",
    id: "user-4",
    username: "mert",
  },
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

  /** F2: the picker refuses what the server would refuse, before the request. */
  it("locks the row of a friend who takes no group invites", () => {
    const markup = renderDialog();

    assert.match(markup, /data-testid="group-create-friend-user-4"[^>]*disabled/);
    assert.match(markup, /Grup davetlerine kapalı/);
    assert.doesNotMatch(markup, /data-testid="group-create-friend-user-2"[^>]*disabled/);
  });

  /**
   * §4.4 on the web side: the dialog's hint and the mobile screen's hint are
   * the same function, so the two surfaces promise the same name.
   */
  it("derives the same blank-name hint the mobile screen shows", () => {
    const names = ["Atakan", "UAT Test", "DY"];

    assert.equal(buildGroupNameFromMembers(names, "tr"), "Atakan, UAT Test ve DY");
    assert.equal(buildGroupNameFromMembers(names, "en"), "Atakan, UAT Test and DY");
  });

  it("carries the 2c identity fields into the create body with the invite off", () => {
    const state: GroupCreateState = {
      ...selectMany(2),
      avatarColor: "#C2185B",
      description: "  Mobil ekip  ",
      historyVisibility: "NONE",
      permAddMembers: "ADMINS",
      step: "identity",
    };

    const body = toGroupCreateRequest(state, null);

    assert.equal(body.avatarColor, "#C2185B");
    assert.equal(body.description, "Mobil ekip");
    assert.equal(body.historyVisibility, "NONE");
    assert.equal(body.permAddMembers, "ADMINS");
    // K2: the link is not minted unless the creator ticked it.
    assert.equal(body.inviteEnabled, false);
  });

  it("carries the group copy in both locales", () => {
    for (const locale of ["tr", "en"] as const) {
      const messages: Record<string, string | undefined> = getMessagesForLocale(locale);

      assert.ok(messages["dm.group.counter"]?.includes("{count}"));
      assert.ok(messages["dm.group.createAction"]);
      assert.ok(messages["dm.group.submitAction"]);
      // The 2c fields the dialog gained in Faz 4.
      assert.ok(messages["dm.group.nameHintTemplate"]?.includes("{names}"));
      assert.ok(messages["dm.group.colorLabel"]);
      assert.ok(messages["dm.group.descriptionPlaceholder"]);
      assert.ok(messages["dm.group.joinLabel"]);
      assert.ok(messages["dm.group.inviteLinkHint"]);
      assert.ok(messages["dm.group.historyVisibility"]);
      assert.ok(messages["dm.group.inviteClosed"]);
      assert.ok(messages["dm.sidebar.pinnedSection"]);
    }
  });
});

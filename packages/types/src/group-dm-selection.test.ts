import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_MIN_PARTICIPANTS,
  GroupDMCreateRequestSchema,
} from "./group-dm";
import { GROUP_AVATAR_COLORS } from "./group-dm-settings";
import {
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  hasGroupCreateProgress,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupCreateState,
} from "./group-dm-selection";

const SELECTABLE_MAX = GROUP_DM_MAX_PARTICIPANTS - 1;
const SELECTABLE_MIN = GROUP_DM_MIN_PARTICIPANTS - 1;

function selectMany(count: number): GroupCreateState {
  let state = createInitialGroupCreateState();
  for (let index = 0; index < count; index += 1) {
    state = toggleGroupMember(state, `user-${index}`);
  }
  return state;
}

describe("group create selection model", () => {
  it("starts on the members step with nothing picked and no name", () => {
    const state = createInitialGroupCreateState();

    assert.equal(state.step, "members");
    assert.deepEqual(state.selectedUserIds, []);
    assert.equal(state.name, "");
  });

  it("counts the creator, so one pick already means two people", () => {
    const state = toggleGroupMember(createInitialGroupCreateState(), "user-a");

    assert.equal(getGroupSelectionCount(state), 2);
  });

  it("drops a member when the same id is toggled twice", () => {
    const picked = toggleGroupMember(createInitialGroupCreateState(), "user-a");
    const dropped = toggleGroupMember(picked, "user-a");

    assert.deepEqual(dropped.selectedUserIds, []);
    assert.equal(getGroupSelectionCount(dropped), 1);
  });

  it("blocks the identity step below the two-friend minimum", () => {
    const state = selectMany(SELECTABLE_MIN - 1);

    assert.equal(canAdvanceToIdentity(state), false);
  });

  it("opens the identity step at the two-friend minimum", () => {
    const state = selectMany(SELECTABLE_MIN);

    assert.equal(canAdvanceToIdentity(state), true);
  });

  it("locks the selection at 31 friends and ignores the 32nd", () => {
    const full = selectMany(SELECTABLE_MAX);

    assert.equal(full.selectedUserIds.length, SELECTABLE_MAX);
    assert.equal(isGroupSelectionFull(full), true);
    assert.equal(getGroupSelectionCount(full), GROUP_DM_MAX_PARTICIPANTS);

    const overflowed = toggleGroupMember(full, "user-overflow");

    assert.equal(overflowed, full);
    assert.equal(overflowed.selectedUserIds.length, SELECTABLE_MAX);
  });

  it("still removes a picked member while the selection is full", () => {
    const full = selectMany(SELECTABLE_MAX);
    const reduced = toggleGroupMember(full, "user-0");

    assert.equal(reduced.selectedUserIds.length, SELECTABLE_MAX - 1);
    assert.equal(reduced.selectedUserIds.includes("user-0"), false);
    assert.equal(isGroupSelectionFull(reduced), false);
  });

  it("leaves the name key out of the request when it is blank", () => {
    const state: GroupCreateState = {
      ...selectMany(SELECTABLE_MIN),
      name: "   ",
      step: "identity",
    };

    const request = toGroupCreateRequest(state, null);

    assert.equal("name" in request, false);
    assert.equal("iconUrl" in request, false);
    assert.deepEqual(request.userIds, ["user-0", "user-1"]);
  });

  it("sends a trimmed name together with the icon", () => {
    const state: GroupCreateState = {
      ...selectMany(SELECTABLE_MIN),
      name: "  Takım  ",
      step: "identity",
    };

    const request = toGroupCreateRequest(state, "https://utfs.io/f/group.png");

    assert.equal(request.name, "Takım");
    assert.equal(request.iconUrl, "https://utfs.io/f/group.png");
  });

  it("refuses submit while the members step is still open", () => {
    const state = selectMany(SELECTABLE_MIN);

    assert.equal(state.step, "members");
    assert.equal(canSubmitGroup(state), false);
    assert.equal(canSubmitGroup({ ...state, step: "identity" }), true);
  });
});

describe("2c identity fields", () => {
  it("starts on the design's defaults: first swatch, everyone adds, 30 days, invite off", () => {
    const state = createInitialGroupCreateState();

    assert.equal(state.avatarColor, GROUP_AVATAR_COLORS[0]);
    assert.equal(state.description, "");
    assert.equal(state.historyVisibility, "LAST_30D");
    assert.equal(state.permAddMembers, "ALL");
    // K2: a link nobody asked for is a link nobody can close before it leaks.
    assert.equal(state.inviteEnabled, false);
  });

  it("carries the KATILIM trio and the colour on every request", () => {
    const state: GroupCreateState = {
      ...selectMany(SELECTABLE_MIN),
      avatarColor: "#C2185B",
      historyVisibility: "NONE",
      inviteEnabled: true,
      permAddMembers: "ADMINS",
      step: "identity",
    };

    const request = toGroupCreateRequest(state, null);

    assert.equal(request.avatarColor, "#C2185B");
    assert.equal(request.historyVisibility, "NONE");
    assert.equal(request.inviteEnabled, true);
    assert.equal(request.permAddMembers, "ADMINS");
  });

  it("drops a whitespace-only description rather than storing an empty one", () => {
    const state: GroupCreateState = {
      ...selectMany(SELECTABLE_MIN),
      description: "   ",
      step: "identity",
    };

    assert.equal("description" in toGroupCreateRequest(state, null), false);
  });

  it("sends a trimmed description", () => {
    const state: GroupCreateState = {
      ...selectMany(SELECTABLE_MIN),
      description: "  Mobil ekip  ",
      step: "identity",
    };

    assert.equal(toGroupCreateRequest(state, null).description, "Mobil ekip");
  });

  it("produces a body the write schema accepts", () => {
    const state: GroupCreateState = {
      ...selectMany(SELECTABLE_MIN),
      avatarColor: "#1B8A55",
      description: "Mobil ekip",
      inviteEnabled: true,
      name: "Whispr Mobil Ekibi",
      step: "identity",
    };

    const parsed = GroupDMCreateRequestSchema.parse(toGroupCreateRequest(state, null));

    assert.equal(parsed.name, "Whispr Mobil Ekibi");
    assert.equal(parsed.inviteEnabled, true);
    assert.equal(parsed.avatarColor, "#1B8A55");
  });

  it("asks before dropping the flow only once something has been picked", () => {
    assert.equal(hasGroupCreateProgress(createInitialGroupCreateState()), false);
    assert.equal(hasGroupCreateProgress(selectMany(1)), true);
  });
});

import { GROUP_DM_MAX_PARTICIPANTS, GROUP_DM_MIN_PARTICIPANTS } from "./group-dm";

/**
 * Faz 5 §14. The group-create screen's rules live here rather than in the React
 * tree because mobile and web both draw the flow: two surfaces implementing the
 * same ceiling twice is two places for it to drift.
 *
 * The creator is implicit everywhere in this module. They are never in
 * `selectedUserIds` — the create request body excludes them too — so the
 * selectable bounds are one below the conversation bounds.
 */
export const GROUP_SELECTABLE_MAX = GROUP_DM_MAX_PARTICIPANTS - 1;
export const GROUP_SELECTABLE_MIN = GROUP_DM_MIN_PARTICIPANTS - 1;

export type GroupCreateStep = "identity" | "members";

export type GroupCreateState = {
  readonly name: string;
  readonly selectedUserIds: readonly string[];
  readonly step: GroupCreateStep;
};

export type GroupCreateRequestBody = {
  iconUrl?: string;
  name?: string;
  userIds: string[];
};

export function createInitialGroupCreateState(): GroupCreateState {
  return { name: "", selectedUserIds: [], step: "members" };
}

/** Creator included, so this is what the `{count}/32` counter shows. */
export function getGroupSelectionCount(state: GroupCreateState): number {
  return state.selectedUserIds.length + 1;
}

export function isGroupSelectionFull(state: GroupCreateState): boolean {
  return state.selectedUserIds.length >= GROUP_SELECTABLE_MAX;
}

/**
 * Removal returns before the ceiling guard: once the list is full every row is
 * still tappable to *undo* a pick, and a guard placed first would freeze the
 * screen at 31 with no way back down.
 */
export function toggleGroupMember(state: GroupCreateState, userId: string): GroupCreateState {
  if (state.selectedUserIds.includes(userId)) {
    return {
      ...state,
      selectedUserIds: state.selectedUserIds.filter((selectedId) => selectedId !== userId),
    };
  }

  if (isGroupSelectionFull(state)) {
    return state;
  }

  return { ...state, selectedUserIds: [...state.selectedUserIds, userId] };
}

export function canAdvanceToIdentity(state: GroupCreateState): boolean {
  return state.selectedUserIds.length >= GROUP_SELECTABLE_MIN;
}

export function canSubmitGroup(state: GroupCreateState): boolean {
  return state.step === "identity" && canAdvanceToIdentity(state);
}

/**
 * Absent keys, not null ones: the server reads a missing `name` as "no name" and
 * stores null itself, while an explicit null on create would have to be spelled
 * out in the schema for no gain.
 */
export function toGroupCreateRequest(
  state: GroupCreateState,
  iconUrl: string | null,
): GroupCreateRequestBody {
  const trimmedName = state.name.trim();

  return {
    ...(iconUrl ? { iconUrl } : {}),
    ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
    userIds: [...state.selectedUserIds],
  };
}

import { GROUP_DM_MAX_PARTICIPANTS, GROUP_DM_MIN_PARTICIPANTS } from "./group-dm";
import {
  GROUP_AVATAR_COLORS,
  type GroupAvatarColor,
  type GroupHistoryVisibility,
  type GroupPermissionLevel,
} from "./group-dm-settings";

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

/**
 * 2c fills the identity step in one pass, so the five fields it collects live on
 * the same state the picker writes: the "Düzenle" link walks back to step one and
 * returns, and anything held in a second place would be lost on that trip.
 */
export type GroupCreateState = {
  readonly avatarColor: GroupAvatarColor;
  readonly description: string;
  readonly historyVisibility: GroupHistoryVisibility;
  /** K2. Off until somebody asks for it; switching it on mints the code at create. */
  readonly inviteEnabled: boolean;
  readonly name: string;
  readonly permAddMembers: GroupPermissionLevel;
  readonly selectedUserIds: readonly string[];
  readonly step: GroupCreateStep;
};

export type GroupCreateRequestBody = {
  avatarColor: GroupAvatarColor;
  description?: string;
  historyVisibility: GroupHistoryVisibility;
  iconUrl?: string;
  inviteEnabled: boolean;
  /** Required since the Mesajlar package; see `canSubmitGroup`. */
  name: string;
  permAddMembers: GroupPermissionLevel;
  userIds: string[];
};

/**
 * Defaults read off the Mesajlar group-create modal (karar #9): first swatch,
 * "Herkes", "Tüm geçmiş", invite link **on**.
 *
 * Two of these changed with this package. History moved from `LAST_30D` to
 * `ALL` and the invite link from off to on, because the screen ships both that
 * way — a default the UI contradicts is a default nobody chose. Neither touches
 * an existing conversation: this function only seeds a new draft.
 */
export function createInitialGroupCreateState(): GroupCreateState {
  return {
    avatarColor: GROUP_AVATAR_COLORS[0],
    description: "",
    historyVisibility: "ALL",
    inviteEnabled: true,
    name: "",
    permAddMembers: "ALL",
    selectedUserIds: [],
    step: "members",
  };
}

/**
 * 2c §E2's exit guard. Leaving step one throws away the picking, which is the
 * expensive part of the flow; leaving it untouched throws away nothing, and a
 * confirmation there would be a dialog with no purpose.
 */
export function hasGroupCreateProgress(state: GroupCreateState): boolean {
  return state.selectedUserIds.length > 0;
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

/**
 * A group needs a name (karar: "Grubu oluştur grup adı boşsa pasif").
 *
 * `buildGroupNameFromMembers` stays, but only as the *suggestion* the field is
 * seeded with. Deriving the name silently meant two groups with the same three
 * members were both called the same thing and neither creator had chosen it.
 */
export function canSubmitGroup(state: GroupCreateState): boolean {
  return state.step === "identity" && canAdvanceToIdentity(state) && state.name.trim().length > 0;
}

/**
 * Absent keys, not null ones: the server reads a missing `name` as "no name" and
 * stores null itself, while an explicit null on create would have to be spelled
 * out in the schema for no gain.
 *
 * The four KATILIM/identity values are always sent, blank ones included: unlike
 * the name and the description they are choices the screen shows a value for, and
 * omitting one would let the server default disagree with the row 2c just drew.
 */
export function toGroupCreateRequest(
  state: GroupCreateState,
  iconUrl: string | null,
): GroupCreateRequestBody {
  const trimmedName = state.name.trim();
  const trimmedDescription = state.description.trim();

  return {
    avatarColor: state.avatarColor,
    ...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
    historyVisibility: state.historyVisibility,
    ...(iconUrl ? { iconUrl } : {}),
    inviteEnabled: state.inviteEnabled,
    name: trimmedName,
    permAddMembers: state.permAddMembers,
    userIds: [...state.selectedUserIds],
  };
}

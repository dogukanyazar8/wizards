import { z } from "zod";

/**
 * Mesajlar paketi §2 / §11 / §12 — ekranın durum makinesi ve liste sözleşmeleri.
 *
 * The screen has three independent axes (view, panel, modal) and two "only one
 * at a time" rules that the acceptance criteria state outright: never two panels
 * open, never two menus open. Those rules live in a reducer rather than in the
 * components, because a rule spread across five `onClick` handlers is five
 * chances to forget it — and the one that gets forgotten is always the one no
 * test covers.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type MessagesView = "friends" | "dm" | "group" | "empty";
export type FriendsTab = "all" | "add" | "pending" | "blocked";
export type MessagesPanel = "thread" | "search" | null;
export type MessagesModal =
  | { readonly kind: "group"; readonly step: 1 | 2 }
  | { readonly kind: "poll" }
  | { readonly kind: "newMessage" }
  | null;

/**
 * Which menu is open, if any. One slot, not one flag per menu: two booleans can
 * both be true and the screen has no meaning for that.
 */
export type MessagesMenu =
  | { readonly kind: "friendRow"; readonly id: string }
  | { readonly kind: "message"; readonly id: string }
  | { readonly kind: "friendsSort" }
  | { readonly kind: "conversation" }
  | null;

export interface MessagesScreenState {
  readonly view: MessagesView;
  readonly tab: FriendsTab;
  readonly panel: MessagesPanel;
  readonly modal: MessagesModal;
  /** Composer formatting bar. Survives a conversation change. */
  readonly formattingOpen: boolean;
  readonly menu: MessagesMenu;
  /** Root message of the open thread panel; null when the panel is closed. */
  readonly threadRootId: string | null;
}

export type MessagesScreenAction =
  | { readonly type: "openConversation"; readonly kind: "dm" | "group" }
  | { readonly type: "openFriends"; readonly tab?: FriendsTab }
  | { readonly type: "openEmpty" }
  | { readonly type: "setTab"; readonly tab: FriendsTab }
  | { readonly type: "togglePanel"; readonly panel: Exclude<MessagesPanel, null> }
  | { readonly type: "openThread"; readonly messageId: string }
  | { readonly type: "closePanel" }
  | { readonly type: "openModal"; readonly modal: NonNullable<MessagesModal> }
  | { readonly type: "setGroupStep"; readonly step: 1 | 2 }
  | { readonly type: "closeModal" }
  | { readonly type: "openMenu"; readonly menu: NonNullable<MessagesMenu> }
  | { readonly type: "closeMenu" }
  | { readonly type: "toggleFormatting" };

export function createInitialMessagesScreenState(
  overrides: Partial<MessagesScreenState> = {},
): MessagesScreenState {
  return {
    formattingOpen: false,
    menu: null,
    modal: null,
    panel: null,
    tab: "all",
    threadRootId: null,
    view: "friends",
    ...overrides,
  };
}

function sameMenu(left: MessagesMenu, right: MessagesMenu): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  if (left.kind !== right.kind) {
    return false;
  }

  return "id" in left && "id" in right ? left.id === right.id : true;
}

/**
 * Every transition closes the menu.
 *
 * A menu is anchored to the row that opened it; anything that changes what is
 * on screen leaves it pointing at nothing. Making that the reducer's job rather
 * than each caller's is the whole reason the menu lives in this state.
 */
export function reduceMessagesScreen(
  state: MessagesScreenState,
  action: MessagesScreenAction,
): MessagesScreenState {
  switch (action.type) {
    case "openConversation":
      return { ...state, menu: null, view: action.kind };

    case "openFriends":
      // The panels belong to a conversation; leaving one closes them.
      return {
        ...state,
        menu: null,
        panel: null,
        tab: action.tab ?? state.tab,
        threadRootId: null,
        view: "friends",
      };

    case "openEmpty":
      return { ...state, menu: null, panel: null, threadRootId: null, view: "empty" };

    case "setTab":
      return { ...state, menu: null, tab: action.tab };

    case "togglePanel": {
      // Thread and search share one slot: opening either closes the other, and
      // pressing the open one closes it.
      const next = state.panel === action.panel ? null : action.panel;

      return {
        ...state,
        menu: null,
        panel: next,
        threadRootId: next === "thread" ? state.threadRootId : null,
      };
    }

    case "openThread":
      return { ...state, menu: null, panel: "thread", threadRootId: action.messageId };

    case "closePanel":
      return { ...state, menu: null, panel: null, threadRootId: null };

    case "openModal":
      return { ...state, menu: null, modal: action.modal };

    case "setGroupStep":
      return state.modal?.kind === "group"
        ? { ...state, menu: null, modal: { kind: "group", step: action.step } }
        : state;

    case "closeModal":
      return { ...state, menu: null, modal: null };

    case "openMenu":
      // Tapping the trigger of the open menu closes it; that is what "toggle"
      // means for a menu, and every trigger in the design behaves that way.
      return { ...state, menu: sameMenu(state.menu, action.menu) ? null : action.menu };

    case "closeMenu":
      return state.menu === null ? state : { ...state, menu: null };

    case "toggleFormatting":
      return { ...state, formattingOpen: !state.formattingOpen };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Friends ordering (karar #8)
// ---------------------------------------------------------------------------

export const FriendsSortSchema = z.enum(["status", "name", "recent"]);
export type FriendsSort = z.infer<typeof FriendsSortSchema>;

/** The control's menu, in the order §4 lists it. */
export const FRIENDS_SORTS = ["status", "name", "recent"] as const;

export const FriendsSortRequestSchema = z.object({ sort: FriendsSortSchema }).strict();

/** `?dmTab=online` was a tab until this package; it now lands on "Tümü". */
export const FRIENDS_TABS = ["all", "add", "pending", "blocked"] as const;

export function normalizeFriendsTab(value: string | null | undefined): FriendsTab {
  if (value && (FRIENDS_TABS as readonly string[]).includes(value)) {
    return value as FriendsTab;
  }

  // "online" is not an error, it is an old link. Sending it to "all" keeps the
  // bookmark working and shows the same people under a heading.
  return "all";
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export const MessagesPresenceSchema = z.enum(["online", "idle", "dnd", "offline"]);
export type MessagesPresence = z.infer<typeof MessagesPresenceSchema>;

// ---------------------------------------------------------------------------
// §11 data contract
// ---------------------------------------------------------------------------

export const ConversationRowDTOSchema = z.object({
  id: z.string(),
  initials: z.string(),
  kind: z.enum(["dm", "group"]),
  name: z.string(),
  pinned: z.boolean(),
  presence: MessagesPresenceSchema.nullable(),
  preview: z.object({
    /** "Sen: " for the viewer's own last message; null otherwise. */
    authorPrefix: z.string().nullable(),
    text: z.string(),
  }),
  /** Group tile colour, as a swatch name. Null for a 1:1 DM. */
  tileColor: z.string().nullable(),
  timeLabel: z.string(),
  unreadCount: z.number().int().nonnegative(),
});

export const FriendRowDTOSchema = z.object({
  avatarUrl: z.string().nullable(),
  handle: z.string(),
  id: z.string(),
  initials: z.string(),
  /** Only for offline rows: "2 saat önce görüldü". */
  lastSeenLabel: z.string().nullable(),
  name: z.string(),
  presence: MessagesPresenceSchema,
  /** Derived the same way the Ana Sayfa friends strip derives it. */
  statusText: z.string().nullable(),
});

export const FriendCountersSchema = z.object({
  offline: z.number().int().nonnegative(),
  online: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});

export const FriendSuggestionDTOSchema = z.object({
  avatarUrl: z.string().nullable(),
  id: z.string(),
  initials: z.string(),
  mutualFriendCount: z.number().int().nonnegative(),
  name: z.string(),
  username: z.string(),
  /** The shared server the suggestion came through. */
  viaServerName: z.string(),
});

export const PinnedMessageDTOSchema = z.object({
  authorName: z.string(),
  excerpt: z.string(),
  messageId: z.string(),
  pinnedAt: z.string().datetime(),
  /** Whether this viewer may remove the pin. */
  removable: z.boolean(),
});

export const MessageSearchFilterSchema = z.object({
  from: z.string().datetime().nullable(),
  personId: z.string().nullable(),
  to: z.string().datetime().nullable(),
});

/**
 * A match range, in **code points**.
 *
 * Byte offsets would be wrong for every Turkish word the design highlights:
 * `yoğunluğu` is nine characters and eleven bytes, so a byte range would clip
 * the mark mid-letter. UTF-16 code units would be wrong for emoji. Code points
 * are what `Array.from(text)` indexes.
 */
export const MessageMatchRangeSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);

export const MessageSearchHitDTOSchema = z.object({
  authorAvatarUrl: z.string().nullable(),
  authorId: z.string(),
  authorInitials: z.string(),
  authorName: z.string(),
  conversationId: z.string(),
  conversationName: z.string(),
  excerpt: z.string(),
  matchRanges: z.array(MessageMatchRangeSchema),
  messageId: z.string(),
  timeLabel: z.string(),
});

export const MessageSearchPageSchema = z.object({
  nextCursor: z.string().nullable(),
  results: z.array(MessageSearchHitDTOSchema),
  totalLabel: z.number().int().nonnegative(),
});

export type ConversationRowDTO = z.infer<typeof ConversationRowDTOSchema>;
export type FriendRowDTO = z.infer<typeof FriendRowDTOSchema>;
export type FriendCounters = z.infer<typeof FriendCountersSchema>;
export type FriendSuggestionDTO = z.infer<typeof FriendSuggestionDTOSchema>;
export type PinnedMessageDTO = z.infer<typeof PinnedMessageDTOSchema>;
export type MessageSearchFilter = z.infer<typeof MessageSearchFilterSchema>;
export type MessageMatchRange = z.infer<typeof MessageMatchRangeSchema>;
export type MessageSearchHitDTO = z.infer<typeof MessageSearchHitDTOSchema>;
export type MessageSearchPage = z.infer<typeof MessageSearchPageSchema>;

// ---------------------------------------------------------------------------
// Ceilings
// ---------------------------------------------------------------------------

/** karar #7. Beyond this the strip's "Tümünü gör" list stops being a list. */
export const DM_PINNED_MESSAGE_MAX = 50;

/** §9 draws three chips and no more. */
export const QUICK_START_CHIP_COUNT = 3;

/** §4's suggestion list; the endpoint returns at most this many. */
export const FRIEND_SUGGESTION_MAX = 12;

/**
 * Quick-start picks: pinned conversations first, then the most recent, never
 * repeating one (karar #12).
 *
 * Returns fewer than `limit` when there is less to show, and an empty array when
 * there is nothing — the caller draws no strip at all rather than an empty one.
 */
export function selectQuickStart<T extends { readonly id: string; readonly pinned: boolean }>(
  conversations: readonly T[],
  limit: number = QUICK_START_CHIP_COUNT,
): T[] {
  const picked: T[] = [];
  const seen = new Set<string>();

  for (const source of [
    conversations.filter((entry) => entry.pinned),
    conversations.filter((entry) => !entry.pinned),
  ]) {
    for (const entry of source) {
      if (picked.length >= limit) {
        return picked;
      }

      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        picked.push(entry);
      }
    }
  }

  return picked;
}

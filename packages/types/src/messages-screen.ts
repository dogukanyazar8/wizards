import { z } from "zod";
import { EarnedBadgeSchema } from "./badges";
import {
  DMNotifyLevelSchema,
  DMParticipantRoleSchema,
  GroupHistoryVisibilitySchema,
  GroupPermissionLevelSchema,
  StoredGroupAvatarColorSchema,
  type DMParticipantRole,
} from "./group-dm-settings";

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
/** §15 added `profile` to the slot thread and search already shared. */
export type MessagesPanel = "thread" | "search" | "profile" | null;

/**
 * §15.2's tabs. `uyeler` exists only for a group — the reducer rewrites it to
 * `genel` on a 1:1 DM rather than leaving the panel pointing at a tab it never
 * draws.
 */
export const PROFILE_PANEL_TABS = ["genel", "uyeler", "medya", "ayarlar"] as const;
export type ProfilePanelTab = (typeof PROFILE_PANEL_TABS)[number];

export type MessagesModal =
  | { readonly kind: "group"; readonly step: 1 | 2 }
  | { readonly kind: "poll" }
  | { readonly kind: "newMessage" }
  | { readonly kind: "invite" }
  | null;

/**
 * Which menu is open, if any. One slot, not one flag per menu: two booleans can
 * both be true and the screen has no meaning for that.
 *
 * `conversation` is the **conversation row**'s menu in the rail; `conversationMore`
 * is §17's header `...` menu. Two different anchors, two different row sets — one
 * slot would have made the rail row menu close the header menu for no reason a
 * reader could see, so they stay distinct kinds sharing the same slot.
 */
export type MessagesMenu =
  | { readonly kind: "friendRow"; readonly id: string }
  | { readonly kind: "message"; readonly id: string }
  | { readonly kind: "friendsSort" }
  | { readonly kind: "conversation" }
  | { readonly kind: "conversationMore" }
  | { readonly kind: "muteSubmenu" }
  | null;

export interface MessagesScreenState {
  readonly view: MessagesView;
  readonly tab: FriendsTab;
  readonly panel: MessagesPanel;
  /** §15.2. Only meaningful while `panel === "profile"`. */
  readonly profileTab: ProfilePanelTab;
  readonly modal: MessagesModal;
  /** Composer formatting bar. Survives a conversation change. */
  readonly formattingOpen: boolean;
  readonly menu: MessagesMenu;
  /** Root message of the open thread panel; null when the panel is closed. */
  readonly threadRootId: string | null;
  /** §2's `role` axis — opens the admin rows in the group menu and profile panel. */
  readonly role: DMParticipantRole;
  /** §17. `muted` with a null `mutedUntil` is the indefinite mute. */
  readonly muted: boolean;
  readonly mutedUntil: string | null;
  /** §17's strip. One at a time; a new one replaces the old. */
  readonly toast: ConversationToast | null;
  /** §15.5's two switches. Account-wide, mirrored here so the card can be optimistic. */
  readonly privacy: ConversationPrivacy;
  /** §16. User ids picked in the add-members modal. */
  readonly inviteSelection: readonly string[];
  readonly inviteLinkExpiry: InviteLinkExpiry;
  /** Narrow-viewport drawer for the profile panel (<1100px overlay). */
  readonly detailsDrawerOpen: boolean;
  /**
   * Bumped to re-run a search the user asked for again. A counter rather than a
   * boolean because "search again with the same query" has to be observable.
   */
  readonly searchRequestId: number;
  /**
   * Bumped whenever the profile panel takes the right-hand slot.
   *
   * §2 gives thread, search and profile **one** slot, but they are not owned by one
   * component: the chat surface opens thread and search from its own state, the screen
   * opens profile from this one. Without a signal the two owners each believe they hold
   * the slot and both draw — 340 + 330 leaves the main area 60px wide where the metric
   * dictionary requires 390.
   *
   * A counter rather than a flag for the same reason `searchRequestId` is one: opening
   * the profile twice in a row has to be observable both times.
   */
  readonly sidePanelCloseRequestId: number;
}

export type MessagesScreenAction =
  | { readonly type: "openConversation"; readonly kind: "dm" | "group" }
  | { readonly type: "openFriends"; readonly tab?: FriendsTab }
  | { readonly type: "openEmpty" }
  | { readonly type: "setTab"; readonly tab: FriendsTab }
  | { readonly type: "togglePanel"; readonly panel: Exclude<MessagesPanel, null> }
  | { readonly type: "openThread"; readonly messageId: string }
  | { readonly type: "closePanel" }
  | { readonly type: "openProfile"; readonly tab?: ProfilePanelTab }
  | { readonly type: "setProfileTab"; readonly tab: ProfilePanelTab }
  | { readonly type: "openModal"; readonly modal: NonNullable<MessagesModal> }
  | { readonly type: "setGroupStep"; readonly step: 1 | 2 }
  | { readonly type: "closeModal" }
  | { readonly type: "openMenu"; readonly menu: NonNullable<MessagesMenu> }
  | { readonly type: "closeMenu" }
  | { readonly type: "openMuteSubmenu" }
  | { readonly type: "setRole"; readonly role: DMParticipantRole }
  | { readonly type: "setMute"; readonly muted: boolean; readonly mutedUntil?: string | null }
  | { readonly type: "showToast"; readonly toast: ConversationToast }
  | { readonly type: "dismissToast" }
  | { readonly type: "setPrivacy"; readonly privacy: Partial<ConversationPrivacy> }
  | { readonly type: "toggleInviteSelection"; readonly userId: string }
  | { readonly type: "clearInviteSelection" }
  | { readonly type: "setInviteLinkExpiry"; readonly expiry: InviteLinkExpiry }
  | { readonly type: "openDetailsDrawer" }
  | { readonly type: "closeDetailsDrawer" }
  | { readonly type: "bumpSearchRequest" }
  | { readonly type: "toggleFormatting" };

export function createInitialMessagesScreenState(
  overrides: Partial<MessagesScreenState> = {},
): MessagesScreenState {
  return {
    detailsDrawerOpen: false,
    formattingOpen: false,
    inviteLinkExpiry: "7d",
    inviteSelection: [],
    menu: null,
    modal: null,
    muted: false,
    mutedUntil: null,
    panel: null,
    privacy: { readReceipts: true, typingIndicator: true },
    profileTab: "genel",
    role: "MEMBER",
    searchRequestId: 0,
    sidePanelCloseRequestId: 0,
    tab: "all",
    threadRootId: null,
    toast: null,
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
 * `uyeler` belongs to a group. A 1:1 DM draws three tabs, so asking for the
 * members tab there has to resolve to something the panel can render — `genel`,
 * the tab it opens on.
 */
export function normalizeProfileTab(
  tab: ProfilePanelTab,
  view: MessagesView | "dm" | "group",
): ProfilePanelTab {
  return tab === "uyeler" && view !== "group" ? "genel" : tab;
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
    /**
     * §12: "panel durumu sohbet değişince korunur" — the open panel survives, its
     * content refetches. Three things do not survive: the thread root (it names a
     * message in the conversation being left), the toast (it reports an action taken
     * on that conversation), and `uyeler` on a 1:1 DM, which has no members tab.
     *
     * The reference file's `go()` clears the panel too, but `go()` drives the
     * inspection chips at the top of the design copy — the SPEC says those "ürüne
     * taşınmaz", so §12's sentence is the product rule, not `go()`.
     */
    case "openConversation":
      return {
        ...state,
        menu: null,
        profileTab: normalizeProfileTab(state.profileTab, action.kind),
        threadRootId: null,
        toast: null,
        view: action.kind,
      };

    case "openFriends":
      // The panels belong to a conversation; leaving one closes them.
      return {
        ...state,
        menu: null,
        panel: null,
        profileTab: "genel",
        tab: action.tab ?? state.tab,
        threadRootId: null,
        toast: null,
        view: "friends",
      };

    case "openEmpty":
      return {
        ...state,
        menu: null,
        panel: null,
        profileTab: "genel",
        threadRootId: null,
        toast: null,
        view: "empty",
      };

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

    /**
     * §15: the profile panel shares the slot, so opening it closes thread and search.
     * Unlike `togglePanel` this never toggles off — every entry point (header menu row,
     * identity block, member row) means "show me this tab", and a second click on a
     * different menu row must not close the panel it just asked for.
     */
    case "openProfile":
      return {
        ...state,
        menu: null,
        panel: "profile",
        profileTab: normalizeProfileTab(action.tab ?? state.profileTab, state.view),
        // Yuvayı devralmak, önceki sahibine bıraktığını söylemeyi de gerektirir.
        sidePanelCloseRequestId: state.sidePanelCloseRequestId + 1,
        threadRootId: null,
      };

    case "setProfileTab":
      return state.panel === "profile"
        ? { ...state, menu: null, profileTab: normalizeProfileTab(action.tab, state.view) }
        : state;

    case "openModal":
      return { ...state, menu: null, modal: action.modal };

    case "setGroupStep":
      return state.modal?.kind === "group"
        ? { ...state, menu: null, modal: { kind: "group", step: action.step } }
        : state;

    /**
     * Closing the add-members modal drops the picks with it. §16 keeps a selection
     * only when the **add fails** — the modal stays open in that case, so a surviving
     * selection here would mean reopening the modal with strangers already ticked.
     */
    case "closeModal":
      return {
        ...state,
        inviteSelection: state.modal?.kind === "invite" ? [] : state.inviteSelection,
        menu: null,
        modal: null,
      };

    case "openMenu":
      // Tapping the trigger of the open menu closes it; that is what "toggle"
      // means for a menu, and every trigger in the design behaves that way.
      return { ...state, menu: sameMenu(state.menu, action.menu) ? null : action.menu };

    case "closeMenu":
      return state.menu === null ? state : { ...state, menu: null };

    /**
     * §17's submenu is a **child** of the header menu, not a peer. Opening it while
     * that menu is closed would draw a floating list anchored to nothing, so the
     * guard lives here rather than in the row's `onClick`.
     */
    case "openMuteSubmenu":
      if (state.menu?.kind === "muteSubmenu") {
        return { ...state, menu: { kind: "conversationMore" } };
      }

      return state.menu?.kind === "conversationMore"
        ? { ...state, menu: { kind: "muteSubmenu" } }
        : state;

    case "setRole":
      return state.role === action.role ? state : { ...state, role: action.role };

    /**
     * §17. Picking a duration closes both the submenu and its parent — the design
     * shows the menu gone and the pill in the header the moment a duration is chosen.
     */
    case "setMute":
      return {
        ...state,
        menu: null,
        muted: action.muted,
        mutedUntil: action.muted ? (action.mutedUntil ?? null) : null,
      };

    case "showToast":
      return { ...state, menu: null, toast: action.toast };

    case "dismissToast":
      return state.toast === null ? state : { ...state, toast: null };

    case "setPrivacy":
      return { ...state, privacy: { ...state.privacy, ...action.privacy } };

    case "toggleInviteSelection": {
      const picked = state.inviteSelection.includes(action.userId);

      return {
        ...state,
        inviteSelection: picked
          ? state.inviteSelection.filter((id) => id !== action.userId)
          : [...state.inviteSelection, action.userId],
      };
    }

    case "clearInviteSelection":
      return state.inviteSelection.length === 0 ? state : { ...state, inviteSelection: [] };

    case "setInviteLinkExpiry":
      return { ...state, inviteLinkExpiry: action.expiry };

    case "openDetailsDrawer":
      return { ...state, detailsDrawerOpen: true, menu: null };

    case "closeDetailsDrawer":
      return state.detailsDrawerOpen ? { ...state, detailsDrawerOpen: false } : state;

    case "bumpSearchRequest":
      return { ...state, menu: null, searchRequestId: state.searchRequestId + 1 };

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
// §15 profil paneli · §16 üye ekle · §17 menüler ve toast
// ---------------------------------------------------------------------------

/**
 * The tint a person or group carries everywhere they appear — rail row, profile
 * identity block, member list, invite candidate. One source, so the same person is
 * never green in the rail and grey in the panel. `neutral` is the fallback for a
 * subject the palette has no colour for; the design never draws a grey DS avatar
 * in the profile header.
 */
export const ProfileTintSchema = z.enum(["primary", "success", "warning", "danger", "neutral"]);
export type ProfileTint = z.infer<typeof ProfileTintSchema>;

/**
 * The four tints a real person can be given. `neutral` is not in the rotation: it
 * is what a **missing** identity falls back to, the way the reference file leaves
 * anyone outside its sample map grey.
 */
export const PROFILE_TINT_ROTATION = ["primary", "success", "warning", "danger"] as const;

/**
 * The tint a user carries on every surface — rail row, profile identity block,
 * member list, invite candidate, mutual-friend row.
 *
 * Derived from the id rather than stored, for two reasons. A column would need a
 * migration and a backfill for a value that must never change anyway; and
 * `DMParticipant.nameColor`, the one per-membership colour that already exists, is
 * scoped to a single group and holds raw hex — the same person would be a different
 * colour in every group, and the token audit rejects hex on a surface.
 *
 * FNV-1a over the id: stable across processes, stable across restarts, and evenly
 * spread, which `charCodeAt(0)` is not (a room full of names starting with "A" would
 * all come out the same colour).
 */
export function resolveProfileTint(userId: string | null | undefined): ProfileTint {
  if (!userId) {
    return "neutral";
  }

  let hash = 0x811c_9dc5;

  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    // FNV prime, via shifts so the value stays inside 32 bits without BigInt.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }

  return PROFILE_TINT_ROTATION[hash % PROFILE_TINT_ROTATION.length] as ProfileTint;
}

/** §17's `Sessize al` submenu. `forever` is `muted = true, mutedUntil = null`. */
export const ConversationMuteDurationSchema = z.enum(["15m", "1h", "8h", "forever"]);
export type ConversationMuteDuration = z.infer<typeof ConversationMuteDurationSchema>;

/** How long §16's invite link stays valid. */
export const InviteLinkExpirySchema = z.enum(["7d", "1d", "never"]);
export type InviteLinkExpiry = z.infer<typeof InviteLinkExpirySchema>;

/**
 * §17's toast strip. The DTO carries the **kind**, never the sentence: the copy
 * lives in the i18n dictionary, and a server that shipped Turkish prose would be
 * a second place to change it when the wording moves.
 *
 * `mutedForever` is not in §17's list of twelve — the reference file prints
 * `Sohbet süresiz sessize alındı` for it, and the HTML is the authority (karar K15).
 */
export const ConversationToastKindSchema = z.enum([
  "mutedFor",
  "mutedForever",
  "muteCleared",
  "markedUnread",
  "archived",
  "exportStarted",
  "inviteCopied",
  "membersAdded",
  "historyCleared",
  "groupLeft",
  "groupDeleted",
  "userBlocked",
  "reportSent",
  /**
   * Failures. `tone: "danger"` alone is not enough to describe one: a red strip still
   * carrying `inviteCopied` would read "Davet bağlantısı kopyalandı" in the colour that
   * means it did not happen, which is worse than no toast at all. A failure needs its
   * own sentence, so it gets its own kind.
   *
   * `actionFailed` is the catch-all for a mutation that was rolled back — the strip says
   * so, and the control the user touched has already snapped back to its old value.
   */
  "copyFailed",
  "actionFailed",
]);
export type ConversationToastKind = z.infer<typeof ConversationToastKindSchema>;

export const ConversationToastSchema = z
  .object({
    kind: ConversationToastKindSchema,
    /** Interpolation values for the i18n key: `{duration}`, `{name}`, `{count}`. */
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    /** Failures reuse the strip in a danger tone rather than a second surface. */
    tone: z.enum(["success", "danger"]).default("success"),
  })
  .strict();
export type ConversationToast = z.infer<typeof ConversationToastSchema>;

/**
 * §15.5's two switches. Both are **account-wide** preferences, not per-conversation:
 * the card sits in a conversation panel, but turning read receipts off there turns
 * them off everywhere, exactly as the Settings screen does.
 *
 * The card's third row reports transport encryption. It has no field here because
 * it is a status, not a preference — nothing to store and nothing to toggle.
 */
export const ConversationPrivacySchema = z
  .object({
    readReceipts: z.boolean(),
    typingIndicator: z.boolean(),
  })
  .strict();
export type ConversationPrivacy = z.infer<typeof ConversationPrivacySchema>;

export const UpdatePrivacyRequestSchema = ConversationPrivacySchema.partial().refine(
  (value) => value.readReceipts !== undefined || value.typingIndicator !== undefined,
  { message: "En az bir tercih verilmeli" },
);
export type UpdatePrivacyRequest = z.infer<typeof UpdatePrivacyRequestSchema>;

/**
 * §17 mute body. The old `{ muted }` shape stays valid and means "forever" — every
 * caller written before the submenu existed keeps working.
 */
export const SetMutedRequestSchema = z
  .object({
    duration: ConversationMuteDurationSchema.optional(),
    muted: z.boolean(),
  })
  .strict();
export type SetMutedRequest = z.infer<typeof SetMutedRequestSchema>;

/** §15.3.3's date card, DM arm. Null when the two are not friends (karar K7). */
export const ProfileFriendshipSchema = z
  .object({
    /** Where they met: the oldest shared server membership. Null when none (karar K6). */
    metViaServerName: z.string().nullable(),
    /** Accepted-at, from the friend request row. */
    since: z.string().datetime(),
    /** Rendered as "1 yıl 6 ay"; the client owns the plural rules. */
    durationMonths: z.number().int().nonnegative(),
  })
  .strict();

export const ProfileMutualServerSchema = z
  .object({
    id: z.string(),
    initials: z.string(),
    name: z.string(),
    onlineCount: z.number().int().nonnegative(),
    tint: ProfileTintSchema,
  })
  .strict();

export const ProfileMutualFriendSchema = z
  .object({
    id: z.string(),
    initials: z.string(),
    name: z.string(),
    presence: MessagesPresenceSchema,
    tint: ProfileTintSchema,
  })
  .strict();

/** §15, DM arm. One read; the panel does not fan out to six endpoints. */
export const UserProfilePanelDTOSchema = z
  .object({
    /** §15.3.2. Only badges actually earned; the counter's denominator is the catalog. */
    badges: z.array(EarnedBadgeSchema),
    /** `User.bio`. Null hides the section rather than drawing an empty heading. */
    bio: z.string().nullable(),
    blocked: z.boolean(),
    friendship: ProfileFriendshipSchema.nullable(),
    handle: z.string(),
    initials: z.string(),
    muted: z.boolean(),
    mutedUntil: z.string().datetime().nullable(),
    mutualFriends: z.array(ProfileMutualFriendSchema),
    /** Total matches, so "ve N kişi daha" is honest when the list is capped. */
    mutualFriendTotal: z.number().int().nonnegative(),
    mutualServers: z.array(ProfileMutualServerSchema),
    name: z.string(),
    notifyLevel: DMNotifyLevelSchema,
    presence: MessagesPresenceSchema,
    privacy: ConversationPrivacySchema,
    statusText: z.string().nullable(),
    tint: ProfileTintSchema,
    userId: z.string(),
  })
  .strict();
export type UserProfilePanelDTO = z.infer<typeof UserProfilePanelDTOSchema>;

/** §15, group arm. */
export const GroupProfilePanelDTOSchema = z
  .object({
    addPolicy: GroupPermissionLevelSchema,
    /** Swatch **name**, never a hex (`DMConversation.avatarColor`). */
    avatarColor: StoredGroupAvatarColorSchema,
    conversationId: z.string(),
    createdAt: z.string().datetime(),
    description: z.string().nullable(),
    historyVisibility: GroupHistoryVisibilitySchema,
    initials: z.string(),
    invite: z
      .object({
        code: z.string(),
        expiresAt: z.string().datetime().nullable(),
        url: z.string(),
      })
      .strict()
      .nullable(),
    memberCount: z.number().int().nonnegative(),
    muted: z.boolean(),
    mutedUntil: z.string().datetime().nullable(),
    name: z.string(),
    notifyLevel: DMNotifyLevelSchema,
    onlineCount: z.number().int().nonnegative(),
    ownerName: z.string().nullable(),
    pinnedMessages: z.array(PinnedMessageDTOSchema),
    /**
     * Informational only. Every admin row is re-authorised on the server; a client
     * that lies about its role gets a 403, not a shortcut.
     */
    viewerRole: DMParticipantRoleSchema,
  })
  .strict();
export type GroupProfilePanelDTO = z.infer<typeof GroupProfilePanelDTOSchema>;

/**
 * §15.4's roster. The endpoint returns a flat list with a role on each row; the
 * `YÖNETİCİ` / `ÜYE` grouping is a client concern, because the design's two headings
 * are a rendering decision and not a second query.
 */
export const GroupMemberRowDTOSchema = z
  .object({
    initials: z.string(),
    isSelf: z.boolean(),
    lastSeenAt: z.string().datetime().nullable(),
    name: z.string(),
    presence: MessagesPresenceSchema,
    role: DMParticipantRoleSchema,
    statusText: z.string().nullable(),
    tint: ProfileTintSchema,
    userId: z.string(),
  })
  .strict();
export type GroupMemberRowDTO = z.infer<typeof GroupMemberRowDTOSchema>;

export const GroupMemberPageSchema = z
  .object({
    items: z.array(GroupMemberRowDTOSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type GroupMemberPage = z.infer<typeof GroupMemberPageSchema>;

/** §15.5's Medya tab. Three kinds, one endpoint, one page shape (karar K16). */
export const SharedMediaKindSchema = z.enum(["media", "file", "link"]);
export type SharedMediaKind = z.infer<typeof SharedMediaKindSchema>;

export const SharedMediaItemDTOSchema = z
  .object({
    attachmentId: z.string(),
    createdAt: z.string().datetime(),
    height: z.number().int().positive().nullable(),
    kind: z.enum(["image", "video"]),
    messageId: z.string(),
    thumbnailUrl: z.string().nullable(),
    url: z.string(),
    width: z.number().int().positive().nullable(),
  })
  .strict();

export const SharedFileDTOSchema = z
  .object({
    attachmentId: z.string(),
    createdAt: z.string().datetime(),
    /** Derived from the name; no column was opened for a value the name already carries. */
    extension: z.string(),
    messageId: z.string(),
    name: z.string(),
    /** Raw bytes. "1,2 MB" is a locale decision and belongs to the client. */
    sizeBytes: z.number().int().nonnegative(),
    url: z.string(),
  })
  .strict();

export const SharedLinkDTOSchema = z
  .object({
    createdAt: z.string().datetime(),
    host: z.string(),
    messageId: z.string(),
    /** From an embed when one exists; the client falls back to the host. */
    title: z.string().nullable(),
    url: z.string(),
  })
  .strict();

export const SharedMediaPageSchema = z
  .object({
    items: z.union([
      z.array(SharedMediaItemDTOSchema),
      z.array(SharedFileDTOSchema),
      z.array(SharedLinkDTOSchema),
    ]),
    kind: SharedMediaKindSchema,
    nextCursor: z.string().nullable(),
    /**
     * Real total, not the page length: §15.5's sixth tile shows `+12`, and that number
     * is only right when it comes from a count the page size cannot cap.
     */
    total: z.number().int().nonnegative(),
  })
  .strict();

export type SharedMediaItemDTO = z.infer<typeof SharedMediaItemDTOSchema>;
export type SharedFileDTO = z.infer<typeof SharedFileDTOSchema>;
export type SharedLinkDTO = z.infer<typeof SharedLinkDTOSchema>;
export type SharedMediaPage = z.infer<typeof SharedMediaPageSchema>;

/** §16's candidate list. Existing members never appear — the server filters them out. */
export const InviteCandidateDTOSchema = z
  .object({
    initials: z.string(),
    name: z.string(),
    presence: MessagesPresenceSchema,
    statusText: z.string().nullable(),
    tint: ProfileTintSchema,
    userId: z.string(),
  })
  .strict();
export type InviteCandidateDTO = z.infer<typeof InviteCandidateDTOSchema>;

export const InviteCandidatePageSchema = z
  .object({
    /** Feeds "5 kişi zaten üye" without a second request. */
    alreadyMemberCount: z.number().int().nonnegative(),
    items: z.array(InviteCandidateDTOSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type InviteCandidatePage = z.infer<typeof InviteCandidatePageSchema>;

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
 * §15.5's media grid draws two rows of three and puts `+N` on the last tile. The
 * grid never grows: the panel is 330 wide and a third row would push the files
 * section off the first screen.
 */
export const PROFILE_MEDIA_PREVIEW_COUNT = 6;

/**
 * §17's four durations in minutes. `forever` has no number — it is the absence of
 * an expiry, which is why `mutedUntil` is nullable rather than carrying a sentinel
 * date every reader would have to recognise.
 */
export const CONVERSATION_MUTE_DURATION_MINUTES: Readonly<
  Record<Exclude<ConversationMuteDuration, "forever">, number>
> = Object.freeze({
  "15m": 15,
  "1h": 60,
  "8h": 480,
});

/**
 * Whether a stored mute is still in force.
 *
 * One place, three callers: the notification path, the rail's unread maths and the
 * profile panel. An expiry compared in three files is three chances to compare it
 * differently — and the one that drifts is the one that keeps sending pushes.
 */
export function isMuteActive(
  state: { readonly muted: boolean; readonly mutedUntil: Date | string | null },
  now: Date,
): boolean {
  if (!state.muted) {
    return false;
  }

  if (state.mutedUntil === null) {
    return true;
  }

  const until = state.mutedUntil instanceof Date ? state.mutedUntil : new Date(state.mutedUntil);

  return Number.isNaN(until.getTime()) ? true : until.getTime() > now.getTime();
}

/** The `mutedUntil` a duration produces. `forever` produces null. */
export function resolveMutedUntil(duration: ConversationMuteDuration, now: Date): Date | null {
  if (duration === "forever") {
    return null;
  }

  return new Date(now.getTime() + CONVERSATION_MUTE_DURATION_MINUTES[duration] * 60_000);
}

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

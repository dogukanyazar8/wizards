"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  type ConversationToast,
  type GroupMemberPage,
  type InviteCandidateDTO,
  type InviteCandidatePage,
  type InviteLinkExpiry,
} from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { InviteCandidateRow } from "@/components/messages/invite-candidate-row";
import { InviteLinkBox } from "@/components/messages/invite-link-box";
import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { addGroupMembersRequest, setGroupInviteEnabledRequest } from "@/lib/dm/client";
import { fetchGroupProfilePanel, groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import {
  collectCachedInviteCandidates,
  fetchInviteCandidatesPage,
  inviteCandidateQueryKeys,
} from "@/lib/dm/invite-candidates-client";
import { hairline, MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { profileTintForeground, profileTintSurface } from "@/lib/messages/profile-tint";

/**
 * SPEC-MESAJLAR §16 — the add-members modal. `Mesajlar.dc.html` `L1415–L1505`,
 * `screens/22-uye-ekle-penceresi.png`.
 *
 * Three things about the shape of this file are decisions, not accidents.
 *
 * **The selection is not local state.** K14 put `inviteSelection` and
 * `inviteLinkExpiry` in the screen reducer, so the modal is fully controlled: three
 * entry points (§15.3's header button, §15.4's dashed row, §17's group menu) all
 * dispatch `openModal({ kind: "invite" })` and share one selection. A `useState` here
 * would have given each of them their own, and the bug that produces — "I picked three
 * people, closed the menu, reopened from the panel, they are gone" — is invisible until
 * somebody opens the same modal twice.
 *
 * **The search goes to the server.** §16's list can be 400 friends long and the page is
 * cut server-side; filtering the loaded page in the browser would search only what has
 * already been fetched, which is the first 30 names alphabetically.
 *
 * **The failure path keeps the modal open.** A rejected add is the case where the
 * user's work is worth the most — they have picked people — and closing the window
 * would throw it away to show them a red strip.
 */

const { inviteModal } = MESSAGES_METRICS;

/**
 * §16's search debounce. Not in `MESSAGES_METRICS`: that sheet records **measurements**
 * and this is a timing. `metrics.ts` is also Dalga 0's file and not this stripe's to
 * write; see `raporlar/12-rapor.md`.
 */
export const INVITE_SEARCH_DEBOUNCE_MS = 250;

/** §16's stack draws four circles and lets the count carry the rest. */
export const INVITE_MEMBER_STACK_MAX = 4;

/** How many placeholder rows the list reserves while its first page is in flight. */
const CANDIDATE_SKELETON_ROWS = 5;

/**
 * The 250 ceiling, client side.
 *
 * `addGroupMembers` throws `GROUP_FULL` for the same condition, so this is not the
 * defence — it is the explanation. Letting the user pick 40 people into a group with
 * 220 and then answering with a red strip is a worse version of the same refusal.
 */
export function exceedsInviteCeiling(input: {
  memberCount: number;
  selectionCount: number;
}): boolean {
  return input.memberCount + input.selectionCount > GROUP_DM_MAX_PARTICIPANTS;
}

export function canSubmitInviteSelection(input: {
  memberCount: number;
  selectionCount: number;
}): boolean {
  return input.selectionCount > 0 && !exceedsInviteCeiling(input);
}

/**
 * §16's success strip. `ConversationToastKindSchema` carries one `membersAdded` kind and
 * the dictionary carries two sentences, so the **params** choose between them: a `count`
 * means "and n others".
 *
 * Ş9's strip therefore has to read `params.count` and print
 * `messages.toast.membersAddedMany` when it is there. Written up as a contract in
 * `raporlar/12-rapor.md` rather than left for the strip to discover.
 */
export function toMembersAddedToast(names: readonly string[]): ConversationToast {
  const [first, ...rest] = names;

  return {
    kind: "membersAdded",
    params: rest.length > 0 ? { count: rest.length, name: first ?? "" } : { name: first ?? "" },
    tone: "success",
  };
}

export type AddMembersOutcome = {
  readonly clearSelection: boolean;
  readonly closeModal: boolean;
  readonly toast: ConversationToast;
};

/**
 * What happens after the add request lands — as one function rather than two mutation
 * callbacks, because the asymmetry is the rule §16 states and it is the half that is
 * easy to get wrong.
 *
 * On success the window closes, the selection is dropped and the caller returns to the
 * group conversation. On failure **nothing** is dropped: the window stays open with the
 * same people picked, and only the strip changes. A modal that closes on failure throws
 * away the exact work the user would have to redo.
 */
export function resolveAddMembersOutcome(
  result: { readonly names: readonly string[]; readonly ok: true } | { readonly ok: false },
): AddMembersOutcome {
  if (!result.ok) {
    return {
      clearSelection: false,
      closeModal: false,
      toast: { kind: "actionFailed", tone: "danger" },
    };
  }

  return { clearSelection: true, closeModal: true, toast: toMembersAddedToast(result.names) };
}

/**
 * The same 250ms debounce `settings-window.tsx` uses. Copied rather than imported: that
 * hook is a module-private function in a file this stripe does not own, and exporting it
 * would be a write to somebody else's surface.
 */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) {
      return;
    }

    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [debounced, delayMs, value]);

  return debounced;
}

export type AddMembersModalProps = {
  conversationId: string;
  /** K14's `inviteLinkExpiry`. */
  expiry: InviteLinkExpiry;
  /** Test seam for the invite's validity window. */
  now?: Date | undefined;
  /** Success: §16 sends the user back to the group conversation. */
  onAdded?: ((userIds: readonly string[]) => void) | undefined;
  onClearSelection: () => void;
  onClose: () => void;
  onSelectExpiry: (expiry: InviteLinkExpiry) => void;
  onToast?: ((toast: ConversationToast) => void) | undefined;
  onToggleSelection: (userId: string) => void;
  open: boolean;
  /** K14's `inviteSelection`. */
  selection: readonly string[];
};

export function AddMembersModal(props: AddMembersModalProps): React.JSX.Element | null {
  const { t } = useI18n();
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Unmounted while closed, deliberately: the body's three queries are then never
  // registered for a modal nobody opened (kural 7), and `Modal`'s own cleanup returns
  // focus to the control that opened it.
  if (!props.open) {
    return null;
  }

  return (
    <Modal
      className="w-full overflow-y-auto p-0 sm:p-0"
      closeLabel={t("messages.invite.close")}
      hideHeader
      initialFocusRef={searchRef}
      onClose={props.onClose}
      open
      // §16's backdrop: `--backdrop/0.62` and a 4px blur. `backdrop-blur-xs` **is**
      // 4px in this Tailwind; an arbitrary `[4px]` is banned because it would not
      // scale with the root font size, and the named step is the one that does.
      overlayClassName="bg-[hsl(var(--backdrop)/0.62)] backdrop-blur-xs"
      // §16's card, spelled out because `Modal`'s own defaults are the app-wide ones:
      // 560 wide, radius 22, `--surface-card` behind a 1px `--border`, and the deep
      // `0 50px 90px -40px` drop the metrics sheet records as `shadow.modal`.
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(inviteModal.radius),
        boxShadow: `0 ${pxToRem(MESSAGES_METRICS.shadow.modal.offsetY)} ${pxToRem(
          MESSAGES_METRICS.shadow.modal.blur,
        )} ${pxToRem(MESSAGES_METRICS.shadow.modal.spread)} hsl(var(--shadow-color))`,
        maxWidth: pxToRem(inviteModal.width),
      }}
      title={t("messages.invite.title")}
    >
      <AddMembersModalBody {...props} searchRef={searchRef} />
    </Modal>
  );
}

export type AddMembersModalBodyProps = AddMembersModalProps & {
  searchRef?: React.RefObject<HTMLInputElement | null> | undefined;
};

/**
 * The modal's contents, exported on their own.
 *
 * `Modal` mounts through a portal and renders nothing at all on the server, so a test
 * that asks what §16 draws has to render the body. Splitting it also keeps the chrome
 * (backdrop, focus trap, `Esc`) in the shared component where kural 4 wants it.
 */
export function AddMembersModalBody({
  conversationId,
  expiry,
  now,
  onAdded,
  onClearSelection,
  onClose,
  onSelectExpiry,
  onToast,
  onToggleSelection,
  searchRef,
  selection,
}: AddMembersModalBodyProps): React.JSX.Element {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, INVITE_SEARCH_DEBOUNCE_MS);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  /**
   * Every candidate any cached search for this conversation has delivered, so a chip
   * survives the search that hides its row. Without it, typing a name after picking
   * somebody empties the chip strip and leaves the footer counting people the user can
   * no longer see or remove.
   */
  const knownCandidates = () =>
    collectCachedInviteCandidates(
      queryClient.getQueriesData<{ pages: InviteCandidatePage[] }>({
        queryKey: [...inviteCandidateQueryKeys.conversation(conversationId)],
      }),
    );

  const panelQuery = useQuery({
    queryFn: () => fetchGroupProfilePanel(conversationId),
    queryKey: [...groupProfileQueryKeys.panel(conversationId)],
  });

  const candidatesQuery = useInfiniteQuery({
    getNextPageParam: (last: InviteCandidatePage) => last.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchInviteCandidatesPage(conversationId, { cursor: pageParam, query: debouncedQuery }),
    queryKey: [...inviteCandidateQueryKeys.list(conversationId, debouncedQuery)],
  });

  const panel = panelQuery.data;
  const pages = candidatesQuery.data?.pages ?? [];
  const candidates = pages.flatMap((page) => page.items);
  const memberCount = panel?.memberCount ?? 0;
  const alreadyMemberCount = pages.at(0)?.alreadyMemberCount ?? memberCount;
  const overCeiling = exceedsInviteCeiling({ memberCount, selectionCount: selection.length });
  const submittable = canSubmitInviteSelection({ memberCount, selectionCount: selection.length });

  /**
   * The stack's initials are read from the roster Ş7's tab already cached — never
   * fetched. The number under §16's circles is the load-bearing part and it comes from
   * the endpoint; the faces are decoration, and decoration does not get to cost a
   * request.
   */
  const roster = queryClient.getQueryData<{ pages: GroupMemberPage[] }>([
    ...groupProfileQueryKeys.members(conversationId),
  ]);
  const memberStack = (roster?.pages.at(0)?.items ?? []).slice(0, INVITE_MEMBER_STACK_MAX);

  const addMutation = useMutation({
    mutationFn: (userIds: readonly string[]) => addGroupMembersRequest(conversationId, userIds),
    onError: () => {
      // §16: the window stays open and the selection stays picked. The strip says what
      // happened; nothing the user did is thrown away.
      onToast?.(resolveAddMembersOutcome({ ok: false }).toast);
    },
    onSuccess: (_conversation, userIds) => {
      // Read before the invalidations below: the request carries ids and the strip
      // needs a name, and the pages holding them are the ones about to be thrown away.
      const known = knownCandidates();
      const outcome = resolveAddMembersOutcome({
        names: userIds.map((userId) => known.get(userId)?.name ?? ""),
        ok: true,
      });

      void queryClient.invalidateQueries({
        queryKey: [...groupProfileQueryKeys.panel(conversationId)],
      });
      void queryClient.invalidateQueries({
        queryKey: [...groupProfileQueryKeys.members(conversationId)],
      });
      void queryClient.invalidateQueries({ queryKey: [...inviteCandidateQueryKeys.root] });

      if (outcome.clearSelection) {
        onClearSelection();
      }

      if (outcome.closeModal) {
        onClose();
      }

      onAdded?.(userIds);
      onToast?.(outcome.toast);
    },
  });

  /**
   * The expiry segment writes to the **existing** `PATCH …/invite` endpoint — §16 forbids
   * minting a new one. The call is an upsert with `enabled: true`: it creates the link
   * when there is none and returns the same code when there is one, so the field below
   * always shows what the server actually holds.
   *
   * TODO(api): the chosen duration does not survive the round trip. `GroupInvite.expiresAt`
   * exists as a column and **nothing in the codebase writes it** —
   * `GroupInviteSettingsRequestSchema` is `{ enabled }` and `upsertInvite` takes no
   * expiry. Until one of them grows the field the segment is a client-side preference.
   * Rotating instead was considered and rejected: `POST …/invite/rotate` kills every copy
   * of the link already pasted into a chat, which is not what "change the duration"
   * promises. See `raporlar/12-rapor.md`.
   */
  const inviteMutation = useMutation({
    mutationFn: () => setGroupInviteEnabledRequest(conversationId, true),
    onError: () => onToast?.({ kind: "actionFailed", tone: "danger" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...groupProfileQueryKeys.panel(conversationId)],
      });
    },
  });

  const canManageInvite = panel ? panel.viewerRole !== "MEMBER" : false;

  const handleSelectExpiry = (next: InviteLinkExpiry) => {
    onSelectExpiry(next);
    inviteMutation.mutate();
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = candidates[(index + step + candidates.length) % candidates.length];

    if (next) {
      rowRefs.current.get(next.userId)?.focus();
    }
  };

  const known = knownCandidates();
  const chips = selection
    .map((userId) => known.get(userId))
    .filter((candidate): candidate is InviteCandidateDTO => Boolean(candidate));

  const footerSummary = overCeiling
    ? t("messages.invite.limitReached", { max: GROUP_DM_MAX_PARTICIPANTS })
    : selection.length === 0
      ? t("messages.invite.summaryEmpty")
      : t("messages.invite.summary", {
          count: selection.length,
          total: memberCount + selection.length,
        });

  return (
    <div data-testid="add-members-modal">
      <header
        className="flex items-start border-b-[hsl(var(--border)/0.6)]"
        style={{
          borderBottomWidth: hairline(),
          gap: pxToRem(inviteModal.headerGap),
          padding: `${pxToRem(inviteModal.headerPaddingTop)} ${pxToRem(
            inviteModal.headerPaddingX,
          )} ${pxToRem(inviteModal.headerPaddingBottom)}`,
        }}
      >
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
          style={{
            borderRadius: pxToRem(inviteModal.headerTileRadius),
            height: pxToRem(inviteModal.headerTileSize),
            width: pxToRem(inviteModal.headerTileSize),
          }}
        >
          <UserPlus
            style={{
              height: pxToRem(inviteModal.headerTileIconSize),
              width: pxToRem(inviteModal.headerTileIconSize),
            }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <h2
            className={`truncate text-[hsl(var(--foreground))] ${DISPLAY_FONT}`}
            style={{
              fontSize: pxToRem(inviteModal.headerTitleFontSize),
              fontWeight: 600,
              lineHeight: inviteModal.headerTitleLineHeight,
            }}
          >
            {t("messages.invite.title")}
          </h2>
          <p
            className="truncate text-[hsl(var(--text-muted))]"
            data-testid="invite-subtitle"
            style={{
              fontSize: pxToRem(inviteModal.headerSubtitleFontSize),
              marginTop: pxToRem(inviteModal.headerSubtitleMarginTop),
            }}
          >
            {t("messages.invite.subtitle", {
              count: memberCount,
              group: panel?.name ?? "",
              max: GROUP_DM_MAX_PARTICIPANTS,
            })}
          </p>
        </div>

        {/*
          Hand-rolled rather than `WindowCloseButton`: that control spreads the caller's
          `style` **before** its own `SETTINGS_METRICS` values, so its 31px box, its
          radius and its border cannot be overridden, and §16 draws a 32px borderless one.
        */}
        <button
          aria-label={t("messages.invite.close")}
          className="grid shrink-0 place-items-center bg-transparent text-[hsl(var(--text-muted))] outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="invite-close"
          onClick={onClose}
          style={{
            borderRadius: pxToRem(inviteModal.closeRadius),
            height: pxToRem(inviteModal.closeSize),
            width: pxToRem(inviteModal.closeSize),
          }}
          type="button"
        >
          <X
            aria-hidden="true"
            style={{
              height: pxToRem(inviteModal.closeIconSize),
              width: pxToRem(inviteModal.closeIconSize),
            }}
          />
        </button>
      </header>

      <div
        style={{
          padding: `${pxToRem(inviteModal.searchPaddingTop)} ${pxToRem(
            inviteModal.searchPaddingX,
          )} ${pxToRem(inviteModal.searchPaddingBottom)}`,
        }}
      >
        <div
          className="flex items-center border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft)/0.7)] focus-within:ring-2 focus-within:ring-[hsl(var(--ring)/0.45)]"
          data-focus-surface
          style={{
            borderRadius: pxToRem(inviteModal.searchRadius),
            borderWidth: hairline(),
            gap: pxToRem(inviteModal.searchGap),
            height: pxToRem(inviteModal.searchHeight),
            padding: `0 ${pxToRem(inviteModal.searchInnerPaddingX)}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToRem(inviteModal.searchIconSize),
              width: pxToRem(inviteModal.searchIconSize),
            }}
          />
          <input
            aria-label={t("messages.invite.searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-[hsl(var(--foreground))] outline-hidden"
            data-testid="invite-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("messages.invite.searchPlaceholder")}
            ref={searchRef ?? null}
            style={{ fontSize: pxToRem(inviteModal.searchFontSize) }}
            type="text"
            value={query}
          />
        </div>

        {selection.length === 0 ? (
          <p
            className="text-[hsl(var(--text-muted))]"
            data-testid="invite-no-selection"
            style={{
              fontSize: pxToRem(inviteModal.emptySelectionFontSize),
              marginTop: pxToRem(inviteModal.emptySelectionMarginTop),
            }}
          >
            {t("messages.invite.noSelection")}
          </p>
        ) : (
          <div
            className="flex flex-wrap items-center"
            data-testid="invite-chips"
            style={{
              gap: pxToRem(inviteModal.chipsGap),
              marginTop: pxToRem(inviteModal.chipsMarginTop),
            }}
          >
            {chips.map((candidate) => (
              <span
                className="flex items-center border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.14)]"
                key={candidate.userId}
                style={{
                  borderRadius: pxToRem(inviteModal.chipRadius),
                  borderWidth: hairline(),
                  gap: pxToRem(inviteModal.chipGap),
                  height: pxToRem(inviteModal.chipHeight),
                  padding: `0 ${pxToRem(inviteModal.chipPaddingRight)} 0 ${pxToRem(
                    inviteModal.chipPaddingLeft,
                  )}`,
                }}
              >
                <span
                  aria-hidden="true"
                  className={`grid shrink-0 place-items-center rounded-full ${DISPLAY_FONT}`}
                  style={{
                    background: profileTintSurface(candidate.tint),
                    color: profileTintForeground(candidate.tint),
                    fontSize: pxToRem(inviteModal.chipAvatarFontSize),
                    fontWeight: 600,
                    height: pxToRem(inviteModal.chipAvatarSize),
                    lineHeight: 1,
                    width: pxToRem(inviteModal.chipAvatarSize),
                  }}
                >
                  {candidate.initials}
                </span>
                <span
                  className="whitespace-nowrap text-[hsl(var(--primary))]"
                  style={{
                    fontSize: pxToRem(inviteModal.chipNameFontSize),
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {candidate.name}
                </span>
                <button
                  aria-label={t("messages.invite.a11y.remove", { name: candidate.name })}
                  className="grid shrink-0 place-items-center rounded-full bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))] outline-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid={`invite-chip-remove-${candidate.userId}`}
                  onClick={() => onToggleSelection(candidate.userId)}
                  style={{
                    height: pxToRem(inviteModal.chipRemoveSize),
                    width: pxToRem(inviteModal.chipRemoveSize),
                  }}
                  type="button"
                >
                  <X
                    aria-hidden="true"
                    style={{
                      height: pxToRem(inviteModal.chipRemoveIconSize),
                      width: pxToRem(inviteModal.chipRemoveIconSize),
                    }}
                  />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          padding: `${pxToRem(inviteModal.sectionPaddingTop)} ${pxToRem(
            inviteModal.sectionPaddingX,
          )} 0`,
        }}
      >
        <ProfileSectionLabel
          rule
          {...(candidatesQuery.isPending
            ? {}
            : { count: t("messages.invite.candidateCount", { count: candidates.length }) })}
        >
          {t("messages.invite.candidatesTitle")}
        </ProfileSectionLabel>
      </div>

      <div
        style={{
          padding: `${pxToRem(inviteModal.listPaddingTop)} ${pxToRem(inviteModal.listPaddingX)} 0`,
        }}
      >
        {candidatesQuery.isPending ? (
          <div data-testid="invite-candidates-skeleton">
            {Array.from({ length: CANDIDATE_SKELETON_ROWS }, (_unused, index) => (
              <Skeleton
                className="w-full"
                key={index}
                style={{
                  borderRadius: pxToRem(inviteModal.rowRadius),
                  height: pxToRem(inviteModal.rowAvatarSize + inviteModal.rowPaddingY * 2),
                  marginTop: index === 0 ? 0 : pxToRem(inviteModal.rowPaddingY),
                }}
              />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <p
            className="text-[hsl(var(--text-muted))]"
            data-testid="invite-candidates-empty"
            style={{
              fontSize: pxToRem(inviteModal.rowStatusFontSize),
              padding: `${pxToRem(inviteModal.rowPaddingY)} ${pxToRem(inviteModal.rowPaddingX)}`,
            }}
          >
            {t("messages.invite.empty")}
          </p>
        ) : (
          <div
            aria-label={t("messages.invite.candidatesTitle")}
            aria-multiselectable="true"
            data-testid="invite-candidate-list"
            role="listbox"
          >
            {candidates.map((candidate, index) => (
              <InviteCandidateRow
                candidate={candidate}
                key={candidate.userId}
                onKeyDown={(event) => handleRowKeyDown(event, index)}
                onToggle={onToggleSelection}
                rowRef={(node) => {
                  if (node) {
                    rowRefs.current.set(candidate.userId, node);
                  } else {
                    rowRefs.current.delete(candidate.userId);
                  }
                }}
                selected={selection.includes(candidate.userId)}
                tabIndex={index === 0 ? 0 : -1}
              />
            ))}
          </div>
        )}

        {candidatesQuery.hasNextPage ? (
          <button
            className="text-[hsl(var(--primary))] outline-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
            data-testid="invite-candidates-more"
            disabled={candidatesQuery.isFetchingNextPage}
            onClick={() => void candidatesQuery.fetchNextPage()}
            style={{
              borderRadius: pxToRem(inviteModal.rowRadius),
              fontSize: pxToRem(inviteModal.rowStatusFontSize),
              fontWeight: 600,
              padding: `${pxToRem(inviteModal.rowPaddingY)} ${pxToRem(inviteModal.rowPaddingX)}`,
            }}
            type="button"
          >
            {t("messages.friends.action.more")}
          </button>
        ) : null}
      </div>

      <div
        className="flex items-center border-t-[hsl(var(--border)/0.45)]"
        data-testid="invite-member-stack"
        style={{
          borderTopWidth: hairline(),
          gap: pxToRem(inviteModal.memberStackGap),
          margin: `0 ${pxToRem(inviteModal.memberStackMarginX)}`,
          padding: `${pxToRem(inviteModal.memberStackPaddingTop)} ${pxToRem(
            inviteModal.memberStackPaddingX,
          )} ${pxToRem(inviteModal.memberStackPaddingBottom)}`,
        }}
      >
        {memberStack.length > 0 ? (
          <span aria-hidden="true" className="flex shrink-0">
            {memberStack.map((member) => (
              <span
                className={`grid place-items-center rounded-full ${DISPLAY_FONT}`}
                key={member.userId}
                style={{
                  background: profileTintSurface(member.tint),
                  border: `${hairline(inviteModal.memberStackBorderWidth)} solid hsl(var(--surface-card))`,
                  color: profileTintForeground(member.tint),
                  fontSize: pxToRem(inviteModal.memberStackAvatarFontSize),
                  fontWeight: 600,
                  height: pxToRem(inviteModal.memberStackAvatarSize),
                  lineHeight: 1,
                  marginRight: pxToRem(inviteModal.memberStackOverlap),
                  width: pxToRem(inviteModal.memberStackAvatarSize),
                }}
              >
                {member.initials}
              </span>
            ))}
          </span>
        ) : null}
        <span
          className="text-[hsl(var(--text-muted))]"
          data-testid="invite-already-members"
          style={{
            fontSize: pxToRem(inviteModal.memberStackNoteFontSize),
            marginLeft: pxToRem(inviteModal.memberStackNoteMarginLeft),
          }}
        >
          {t("messages.invite.alreadyMembers", { count: alreadyMemberCount })}
        </span>
      </div>

      <div style={{ margin: `0 ${pxToRem(inviteModal.linkBoxMarginX)}` }}>
        <InviteLinkBox
          canManage={canManageInvite}
          expiry={expiry}
          invite={panel?.invite ?? null}
          {...(now ? { now } : {})}
          {...(canManageInvite ? { onCreate: () => inviteMutation.mutate() } : {})}
          onSelectExpiry={handleSelectExpiry}
          {...(onToast ? { onToast } : {})}
          pending={inviteMutation.isPending}
        />
      </div>

      <footer
        className="flex items-center"
        style={{
          gap: pxToRem(inviteModal.footerGap),
          padding: `${pxToRem(inviteModal.footerPaddingTop)} ${pxToRem(
            inviteModal.footerPaddingX,
          )} ${pxToRem(inviteModal.footerPaddingBottom)}`,
        }}
      >
        <span
          className="flex-1 text-[hsl(var(--text-muted))]"
          data-testid="invite-footer-summary"
          style={{ fontSize: pxToRem(inviteModal.footerSummaryFontSize) }}
        >
          {footerSummary}
        </span>

        <button
          className="border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="invite-cancel"
          onClick={onClose}
          style={{
            borderRadius: pxToRem(inviteModal.footerButtonRadius),
            borderWidth: hairline(),
            fontSize: pxToRem(inviteModal.footerButtonFontSize),
            fontWeight: 600,
            height: pxToRem(inviteModal.footerButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(inviteModal.footerCancelPaddingX)}`,
          }}
          type="button"
        >
          {t("messages.invite.cancel")}
        </button>

        <button
          className="outline-hidden transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:hover:brightness-100"
          data-testid="invite-submit"
          disabled={!submittable || addMutation.isPending}
          onClick={() => addMutation.mutate([...selection])}
          style={{
            background: submittable ? "hsl(var(--primary))" : "hsl(var(--surface-tertiary))",
            borderRadius: pxToRem(inviteModal.footerButtonRadius),
            color: submittable ? "hsl(var(--primary-foreground))" : "hsl(var(--text-muted))",
            fontSize: pxToRem(inviteModal.footerButtonFontSize),
            fontWeight: 600,
            height: pxToRem(inviteModal.footerButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(inviteModal.footerSubmitPaddingX)}`,
          }}
          type="button"
        >
          {selection.length === 0
            ? t("messages.invite.submitEmpty")
            : t("messages.invite.submit", { count: selection.length })}
        </button>
      </footer>
    </div>
  );
}

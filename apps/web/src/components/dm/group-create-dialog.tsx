"use client";

import React, { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronLeft, ChevronRight, Lock, Search, UserPlus, X } from "lucide-react";
import {
  GROUP_AVATAR_COLORS,
  GROUP_DM_DESCRIPTION_MAX_LENGTH,
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_NAME_MAX_LENGTH,
  buildGroupNameFromMembers,
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  hasGroupCreateProgress,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupAvatarColor,
  type GroupCreateState,
  type GroupHistoryVisibility,
  type GroupPermissionLevel,
} from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { BugReportDiscardDialog } from "@/components/support/bug-report-overlays";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { getGroupSwatchBackground, getGroupSwatchInk } from "@/lib/messages/group-swatch";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

export type GroupCreateFriend = {
  readonly allowsGroupInvites: boolean;
  readonly avatarUrl: string | null;
  readonly customStatus?: string | null;
  readonly displayName: string | null;
  readonly id: string;
  readonly status?: "DND" | "IDLE" | "OFFLINE" | "ONLINE";
  readonly username: string;
};

const HISTORY_OPTIONS: readonly GroupHistoryVisibility[] = ["ALL", "LAST_30D", "LAST_7D", "NONE"];
const PERMISSION_OPTIONS: readonly GroupPermissionLevel[] = ["ALL", "ADMINS"];
const { groupModal } = MESSAGES_METRICS;
const GROUP_CANDIDATE_ROW_HEIGHT =
  groupModal.candidateAvatarSize + groupModal.candidateRowPaddingY * 2;

const PRESENCE_DOT_CLASS: Readonly<Record<NonNullable<GroupCreateFriend["status"]>, string>> = {
  DND: "bg-[hsl(var(--danger))]",
  IDLE: "bg-[hsl(var(--warning))]",
  OFFLINE: "bg-[hsl(var(--text-muted))]",
  ONLINE: "bg-[hsl(var(--success))]",
};

type GroupCreateDialogContentProps = {
  friends: readonly GroupCreateFriend[];
  initialState?: GroupCreateState;
  isSubmitting?: boolean;
  onClose: () => void;
  onProgressChange?: (hasProgress: boolean) => void;
  onSubmit: (input: ReturnType<typeof toGroupCreateRequest>) => void;
};

type GroupCreateDialogProps = GroupCreateDialogContentProps & { open: boolean };

function getFriendLabel(friend: GroupCreateFriend): string {
  return friend.displayName ?? friend.username;
}

function getInitials(value: string): string {
  const words = value.trim().split(/\s+/u).filter(Boolean);
  const initials =
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`
      : (words[0]?.slice(0, 2) ?? "#");

  return initials.toLocaleUpperCase();
}

function getHistoryLabel(
  value: GroupHistoryVisibility,
  t: (key: string, values?: Record<string, number | string>) => string,
): string {
  if (value === "LAST_30D") return t("messages.groupModal.history30d");
  if (value === "LAST_7D") return t("messages.groupModal.history7d");
  if (value === "NONE") return t("messages.groupModal.historyNone");
  return t("messages.groupModal.historyAll");
}

function footerButtonStyle(primary = false): CSSProperties {
  return {
    borderRadius: pxToRem(groupModal.footerButtonRadius),
    fontSize: pxToRem(groupModal.footerButtonFontSize),
    fontWeight: 600,
    height: pxToRem(groupModal.footerButtonHeight),
    padding: `0 ${pxToRem(
      primary ? groupModal.footerButtonPaddingXPrimary : groupModal.footerButtonPaddingX,
    )}`,
  };
}

export function GroupCreateDialog({ open, ...content }: GroupCreateDialogProps) {
  const { t } = useI18n();
  const hasProgressRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const requestClose = () => {
    if (hasProgressRef.current) {
      setDiscardOpen(true);
      return;
    }

    content.onClose();
  };

  return (
    <>
      <Modal
        className="!max-w-[35rem] !rounded-t-[1.375rem] !border-[hsl(var(--border))] !bg-[hsl(var(--surface-card))] !p-0 !shadow-[0_3.125rem_5.625rem_-2.5rem_hsl(var(--shadow-color))] !backdrop-blur-none sm:!rounded-[1.375rem]"
        closeLabel={t("messages.groupModal.cancel")}
        hideHeader
        onClose={requestClose}
        open={open}
        overlayClassName="messages-reference-surface !bg-[hsl(var(--backdrop)/0.62)] !backdrop-blur-[0.25rem]"
        title={t("messages.groupModal.title")}
      >
        <GroupCreateDialogContent
          {...content}
          onClose={requestClose}
          onProgressChange={(hasProgress) => {
            hasProgressRef.current = hasProgress;
          }}
        />
      </Modal>
      <BugReportDiscardDialog
        body={t("messages.groupModal.discardBody")}
        cancelLabel={t("messages.groupModal.discardCancel")}
        confirmLabel={t("messages.groupModal.discardConfirm")}
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          hasProgressRef.current = false;
          setDiscardOpen(false);
          content.onClose();
        }}
        open={open && discardOpen}
        testIdPrefix="group-create"
        title={t("messages.groupModal.discardTitle")}
      />
    </>
  );
}

/** Portal dışındaki içerik, Node sözleşme testinde DOM olmadan çizilebilir. */
export function GroupCreateDialogContent({
  friends,
  initialState,
  isSubmitting = false,
  onClose,
  onProgressChange,
  onSubmit,
}: GroupCreateDialogContentProps) {
  const { locale, t } = useI18n();
  const [state, setState] = useState<GroupCreateState>(
    () => initialState ?? createInitialGroupCreateState(),
  );
  const [search, setSearch] = useState("");
  const colorLabelId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const isIdentityStep = state.step === "identity";
  const isFull = isGroupSelectionFull(state);
  const selectedFriends = state.selectedUserIds
    .map((userId) => friends.find((friend) => friend.id === userId))
    .filter((friend): friend is GroupCreateFriend => Boolean(friend));
  const visibleFriends = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    if (!needle) return friends;

    return friends.filter((friend) =>
      `${getFriendLabel(friend)} @${friend.username}`.toLocaleLowerCase(locale).includes(needle),
    );
  }, [friends, locale, search]);
  const derivedName = buildGroupNameFromMembers(selectedFriends.map(getFriendLabel), locale);
  const virtualized = visibleFriends.length > groupModal.candidatesVirtualizeAbove;
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: visibleFriends.length,
    estimateSize: () => GROUP_CANDIDATE_ROW_HEIGHT,
    getScrollElement: () => listRef.current,
    overscan: 8,
  });
  const renderedFriends = virtualized
    ? rowVirtualizer.getVirtualItems().flatMap((item) => {
        const friend = visibleFriends[item.index];
        return friend ? [{ friend, virtualStart: item.start }] : [];
      })
    : visibleFriends.map((friend) => ({ friend, virtualStart: null }));
  const patch = (next: Partial<GroupCreateState>) =>
    setState((current) => ({ ...current, ...next }));
  const pickedCount = t("messages.groupModal.pickedCount", {
    count: state.selectedUserIds.length,
  });
  const displayName = state.name.trim() || derivedName || "#";

  useEffect(() => {
    onProgressChange?.(hasGroupCreateProgress(state));
  }, [onProgressChange, state]);

  return (
    <div data-testid="group-create-dialog">
      <header
        className="flex items-start border-b border-[hsl(var(--border)/0.6)]"
        style={{
          gap: pxToRem(groupModal.headerGap),
          padding: `${pxToRem(groupModal.headerPaddingTop)} ${pxToRem(
            groupModal.headerPaddingX,
          )} ${pxToRem(groupModal.headerPaddingBottom)}`,
        }}
      >
        <span
          className="grid shrink-0 place-items-center bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
          style={{
            borderRadius: pxToRem(groupModal.headerTileRadius),
            height: pxToRem(groupModal.headerTileSize),
            width: pxToRem(groupModal.headerTileSize),
          }}
        >
          <UserPlus
            aria-hidden="true"
            style={{
              height: pxToRem(groupModal.headerTileIconSize),
              width: pxToRem(groupModal.headerTileIconSize),
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
            style={{
              fontSize: pxToRem(groupModal.headerTitleFontSize),
              fontWeight: 600,
              lineHeight: groupModal.headerTitleLineHeight,
            }}
          >
            {t("messages.groupModal.title")}
          </h2>
          <p
            className="text-[hsl(var(--text-muted))]"
            data-testid="group-create-step-label"
            style={{
              fontSize: pxToRem(groupModal.headerStepFontSize),
              marginTop: pxToRem(groupModal.headerStepMarginTop),
            }}
          >
            {isIdentityStep ? t("messages.groupModal.step2") : t("messages.groupModal.step1")}
          </p>
        </div>
        <div
          aria-hidden="true"
          className="flex items-center"
          data-testid="group-create-progress"
          style={{ gap: pxToRem(groupModal.progressGap) }}
        >
          {[0, 1].map((index) => (
            <span
              className={cn(
                (isIdentityStep ? 1 : 0) >= index
                  ? "bg-[hsl(var(--primary))]"
                  : "bg-[hsl(var(--border))]",
              )}
              key={index}
              style={{
                borderRadius: pxToRem(groupModal.progressRadius),
                height: pxToRem(groupModal.progressHeight),
                width: pxToRem(groupModal.progressWidth),
              }}
            />
          ))}
        </div>
        <WindowCloseButton aria-label={t("messages.groupModal.cancel")} onClick={onClose} />
      </header>

      {isIdentityStep ? (
        <IdentityStep
          colorLabelId={colorLabelId}
          displayName={displayName}
          onPatch={patch}
          state={state}
          t={t}
        />
      ) : (
        <MembersStep
          friends={renderedFriends}
          isFull={isFull}
          listRef={listRef}
          onSearch={setSearch}
          onToggle={(userId) => setState((current) => toggleGroupMember(current, userId))}
          pickedCount={pickedCount}
          search={search}
          selectedFriends={selectedFriends}
          t={t}
          totalVirtualHeight={virtualized ? rowVirtualizer.getTotalSize() : null}
        />
      )}

      <footer
        className="flex items-center"
        style={{
          gap: pxToRem(groupModal.footerGap),
          padding: `${pxToRem(
            isIdentityStep ? groupModal.footerPaddingTopStep2 : groupModal.footerPaddingTop,
          )} ${pxToRem(groupModal.footerPaddingX)} ${pxToRem(groupModal.footerPaddingBottom)}`,
        }}
      >
        {isIdentityStep ? (
          <>
            <button
              className="flex items-center border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="group-create-back"
              onClick={() => patch({ step: "members" })}
              style={{ ...footerButtonStyle(), gap: pxToRem(groupModal.footerButtonGap) }}
              type="button"
            >
              <ChevronLeft
                aria-hidden="true"
                style={{
                  height: pxToRem(groupModal.footerButtonIconSize),
                  width: pxToRem(groupModal.footerButtonIconSize),
                }}
              />
              {t("messages.groupModal.back")}
            </button>
            <span
              className="min-w-0 flex-1 text-[hsl(var(--text-muted))]"
              data-testid="group-create-counter"
              style={{ fontSize: pxToRem(groupModal.footerHintFontSize) }}
            >
              {`${pickedCount} · ${t("messages.groupModal.includingYou")}`}
            </span>
            <button
              className="bg-[hsl(var(--primary))] text-white shadow-[0_0.625rem_1.375rem_-0.875rem_hsl(var(--primary))] transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55"
              data-testid="group-create-submit"
              disabled={!canSubmitGroup(state) || isSubmitting}
              onClick={() => onSubmit(toGroupCreateRequest(state, null))}
              style={footerButtonStyle(true)}
              type="button"
            >
              {t("messages.groupModal.submit")}
            </button>
          </>
        ) : (
          <>
            <span
              className="min-w-0 flex-1 text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(groupModal.footerHintFontSize) }}
            >
              {isFull
                ? t("dm.group.limitReached")
                : t("messages.groupModal.footerHint", { count: GROUP_DM_MAX_PARTICIPANTS })}
            </span>
            <button
              className="border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="group-create-cancel"
              onClick={onClose}
              style={footerButtonStyle()}
              type="button"
            >
              {t("messages.groupModal.cancel")}
            </button>
            <button
              className="flex items-center bg-[hsl(var(--primary))] text-white transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55"
              data-testid="group-create-next"
              disabled={!canAdvanceToIdentity(state)}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  name: current.name.trim() || derivedName,
                  step: "identity",
                }))
              }
              style={{ ...footerButtonStyle(true), gap: pxToRem(groupModal.footerButtonGap) }}
              type="button"
            >
              {t("messages.groupModal.next")}
              <ChevronRight
                aria-hidden="true"
                style={{
                  height: pxToRem(groupModal.footerButtonIconSize),
                  width: pxToRem(groupModal.footerButtonIconSize),
                }}
              />
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

type MembersStepProps = {
  friends: ReadonlyArray<{ friend: GroupCreateFriend; virtualStart: number | null }>;
  isFull: boolean;
  listRef: React.RefObject<HTMLUListElement | null>;
  onSearch: (value: string) => void;
  onToggle: (userId: string) => void;
  pickedCount: string;
  search: string;
  selectedFriends: readonly GroupCreateFriend[];
  t: (key: string, values?: Record<string, number | string>) => string;
  totalVirtualHeight: number | null;
};

function MembersStep({
  friends,
  isFull,
  listRef,
  onSearch,
  onToggle,
  pickedCount,
  search,
  selectedFriends,
  t,
  totalVirtualHeight,
}: MembersStepProps) {
  return (
    <>
      <div
        style={{
          padding: `${pxToRem(groupModal.step1PaddingTop)} ${pxToRem(
            groupModal.step1PaddingX,
          )} ${pxToRem(groupModal.step1PaddingBottom)}`,
        }}
      >
        <label
          className="flex items-center border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft)/0.7)]"
          style={{
            borderRadius: pxToRem(groupModal.searchRadius),
            gap: pxToRem(groupModal.searchGap),
            height: pxToRem(groupModal.searchHeight),
            padding: `0 ${pxToRem(groupModal.searchPaddingX)}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToRem(groupModal.searchIconSize),
              width: pxToRem(groupModal.searchIconSize),
            }}
          />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
            data-testid="group-create-search"
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t("messages.groupModal.searchPlaceholder")}
            style={{ fontSize: pxToRem(groupModal.searchFontSize) }}
            value={search}
          />
        </label>
        <div
          className="flex flex-wrap items-center"
          style={{
            gap: pxToRem(groupModal.chipsGap),
            marginTop: pxToRem(groupModal.chipsMarginTop),
          }}
        >
          {selectedFriends.map((friend) => (
            <span
              className="flex items-center border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.14)]"
              data-testid={`group-create-selected-${friend.id}`}
              key={friend.id}
              style={{
                borderRadius: pxToRem(groupModal.chipRadius),
                gap: pxToRem(groupModal.chipGap),
                height: pxToRem(groupModal.chipHeight),
                padding: `0 ${pxToRem(groupModal.chipPaddingRight)} 0 ${pxToRem(
                  groupModal.chipPaddingLeft,
                )}`,
              }}
            >
              <Avatar
                alt={getFriendLabel(friend)}
                fallback={getFriendLabel(friend)}
                src={friend.avatarUrl}
                style={{
                  fontSize: pxToRem(9),
                  height: pxToRem(groupModal.chipAvatarSize),
                  width: pxToRem(groupModal.chipAvatarSize),
                }}
              />
              <span
                className="text-[hsl(var(--primary))]"
                style={{ fontSize: pxToRem(groupModal.chipFontSize), fontWeight: 600 }}
              >
                {getFriendLabel(friend)}
              </span>
              <button
                aria-label={t("messages.groupModal.removePick", { name: getFriendLabel(friend) })}
                className="grid place-items-center rounded-full bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]"
                onClick={() => onToggle(friend.id)}
                style={{
                  height: pxToRem(groupModal.chipRemoveSize),
                  width: pxToRem(groupModal.chipRemoveSize),
                }}
                type="button"
              >
                <X
                  aria-hidden="true"
                  style={{
                    height: pxToRem(groupModal.chipRemoveIconSize),
                    width: pxToRem(groupModal.chipRemoveIconSize),
                  }}
                />
              </button>
            </span>
          ))}
          <span
            className="text-[hsl(var(--text-muted))]"
            data-testid="group-create-counter"
            style={{ fontSize: pxToRem(groupModal.pickedCountFontSize) }}
          >
            {pickedCount}
          </span>
        </div>
      </div>
      <ul
        className="relative overflow-y-auto"
        data-testid="group-create-candidates"
        data-virtualized={totalVirtualHeight === null ? undefined : "true"}
        ref={listRef}
        style={{
          maxHeight: pxToRem(groupModal.candidatesMaxHeight),
          padding: `${pxToRem(groupModal.candidatesPaddingTop)} ${pxToRem(
            groupModal.candidatesPaddingX,
          )} ${pxToRem(groupModal.candidatesPaddingBottom)}`,
        }}
      >
        {totalVirtualHeight === null ? null : (
          <li aria-hidden="true" style={{ height: pxToRem(totalVirtualHeight) }} />
        )}
        {friends.length === 0 ? (
          <li className="py-8 text-center text-sm text-[hsl(var(--text-muted))]">
            {t("messages.groupModal.candidatesEmpty")}
          </li>
        ) : null}
        {friends.map(({ friend, virtualStart }) => {
          const selected = selectedFriends.some((picked) => picked.id === friend.id);
          const disabled = (!selected && isFull) || !friend.allowsGroupInvites;
          const status = friend.allowsGroupInvites
            ? friend.customStatus || `@${friend.username}`
            : t("dm.group.inviteClosed");

          return (
            <li
              key={friend.id}
              style={
                virtualStart === null
                  ? undefined
                  : {
                      left: pxToRem(groupModal.candidatesPaddingX),
                      position: "absolute",
                      right: pxToRem(groupModal.candidatesPaddingX),
                      top: 0,
                      transform: `translateY(${virtualStart}px)`,
                    }
              }
            >
              <button
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center text-left transition hover:bg-[hsl(var(--surface-soft)/0.8)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  selected && "bg-[hsl(var(--primary)/0.1)]",
                  disabled && "cursor-not-allowed opacity-45",
                )}
                data-testid={`group-create-friend-${friend.id}`}
                disabled={disabled}
                onClick={() => onToggle(friend.id)}
                style={{
                  borderRadius: pxToRem(groupModal.candidateRowRadius),
                  gap: pxToRem(groupModal.candidateRowGap),
                  padding: `${pxToRem(groupModal.candidateRowPaddingY)} ${pxToRem(
                    groupModal.candidateRowPaddingX,
                  )}`,
                }}
                type="button"
              >
                <span
                  className={cn(
                    "grid shrink-0 place-items-center",
                    selected
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white"
                      : "border-[hsl(var(--border))] bg-transparent text-transparent",
                  )}
                  style={{
                    borderRadius: pxToRem(groupModal.checkboxRadius),
                    borderStyle: "solid",
                    borderWidth: pxToRem(groupModal.checkboxBorderWidth),
                    height: pxToRem(groupModal.checkboxSize),
                    width: pxToRem(groupModal.checkboxSize),
                  }}
                >
                  {selected ? (
                    <Check
                      aria-hidden="true"
                      style={{
                        height: pxToRem(groupModal.checkboxIconSize),
                        width: pxToRem(groupModal.checkboxIconSize),
                      }}
                    />
                  ) : null}
                </span>
                <span className="relative shrink-0">
                  <Avatar
                    alt={getFriendLabel(friend)}
                    fallback={getFriendLabel(friend)}
                    src={friend.avatarUrl}
                    style={{
                      fontSize: pxToRem(groupModal.candidateAvatarFontSize),
                      height: pxToRem(groupModal.candidateAvatarSize),
                      width: pxToRem(groupModal.candidateAvatarSize),
                    }}
                  />
                  {friend.status ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -right-px -bottom-px rounded-full",
                        PRESENCE_DOT_CLASS[friend.status],
                      )}
                      style={{
                        border: `${pxToRem(
                          groupModal.candidatePresenceDotBorderWidth,
                        )} solid hsl(var(--surface-card))`,
                        height: pxToRem(groupModal.candidatePresenceDotSize),
                        width: pxToRem(groupModal.candidatePresenceDotSize),
                      }}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[hsl(var(--foreground))]"
                    style={{
                      fontSize: pxToRem(groupModal.candidateNameFontSize),
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}
                  >
                    {getFriendLabel(friend)}
                  </span>
                  <span
                    className="block truncate text-[hsl(var(--text-muted))]"
                    style={{
                      fontSize: pxToRem(groupModal.candidateStatusFontSize),
                      marginTop: pxToRem(groupModal.candidateStatusMarginTop),
                    }}
                  >
                    {status}
                  </span>
                </span>
                {!friend.allowsGroupInvites ? (
                  <Lock aria-hidden="true" className="h-4 w-4 text-[hsl(var(--text-muted))]" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type IdentityStepProps = {
  colorLabelId: string;
  displayName: string;
  onPatch: (next: Partial<GroupCreateState>) => void;
  state: GroupCreateState;
  t: (key: string, values?: Record<string, number | string>) => string;
};

function IdentityStep({ colorLabelId, displayName, onPatch, state, t }: IdentityStepProps) {
  const fieldLabelStyle: CSSProperties = {
    fontSize: pxToRem(groupModal.fieldLabelFontSize),
    fontWeight: 600,
    letterSpacing: groupModal.fieldLabelTracking,
    lineHeight: 1,
  };

  return (
    <div
      style={{
        padding: `${pxToRem(groupModal.step2PaddingTop)} ${pxToRem(
          groupModal.step2PaddingX,
        )} ${pxToRem(groupModal.step2PaddingBottom)}`,
      }}
    >
      <div className="flex" style={{ gap: pxToRem(groupModal.iconPreviewGap) }}>
        <span
          className={cn("grid shrink-0 place-items-center", DISPLAY_FONT)}
          style={{
            background: getGroupSwatchBackground(state.avatarColor),
            borderRadius: pxToRem(groupModal.iconPreviewRadius),
            color: getGroupSwatchInk(state.avatarColor) ?? "white",
            fontSize: pxToRem(groupModal.iconPreviewFontSize),
            fontWeight: 600,
            height: pxToRem(groupModal.iconPreviewSize),
            width: pxToRem(groupModal.iconPreviewSize),
          }}
        >
          {getInitials(displayName)}
        </span>
        <label className="min-w-0 flex-1">
          <span
            className={cn("block uppercase text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
            style={fieldLabelStyle}
          >
            {t("messages.groupModal.name")}
          </span>
          <span
            className="flex items-center border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft)/0.7)]"
            style={{
              borderRadius: pxToRem(groupModal.nameFieldRadius),
              height: pxToRem(groupModal.nameFieldHeight),
              marginTop: pxToRem(groupModal.fieldMarginTop),
              padding: `0 ${pxToRem(groupModal.nameFieldPaddingX)}`,
            }}
          >
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[hsl(var(--foreground))] outline-hidden"
              data-testid="group-create-name"
              maxLength={GROUP_DM_NAME_MAX_LENGTH}
              onChange={(event) => onPatch({ name: event.target.value })}
              placeholder={t("dm.group.namePlaceholder")}
              style={{ fontSize: pxToRem(groupModal.nameFieldFontSize), fontWeight: 600 }}
              value={state.name}
            />
          </span>
        </label>
      </div>

      <label className="block" style={{ marginTop: pxToRem(groupModal.blockMarginTop) }}>
        <span
          className={cn("block uppercase text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
          style={fieldLabelStyle}
        >
          {t("messages.groupModal.description")}
        </span>
        <span
          className="block border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft)/0.7)]"
          style={{
            borderRadius: pxToRem(groupModal.descriptionRadius),
            marginTop: pxToRem(groupModal.fieldMarginTop),
            padding: `${pxToRem(groupModal.descriptionPaddingY)} ${pxToRem(
              groupModal.descriptionPaddingX,
            )}`,
          }}
        >
          <textarea
            className="block w-full resize-none border-0 bg-transparent text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
            data-testid="group-create-description"
            maxLength={GROUP_DM_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => onPatch({ description: event.target.value })}
            placeholder={t("dm.group.descriptionPlaceholder")}
            rows={groupModal.descriptionRows}
            style={{
              fontSize: pxToRem(groupModal.descriptionFontSize),
              lineHeight: groupModal.descriptionLineHeight,
            }}
            value={state.description}
          />
        </span>
      </label>

      <div style={{ marginTop: pxToRem(groupModal.blockMarginTop) }}>
        <span
          className={cn("block uppercase text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
          id={colorLabelId}
          style={fieldLabelStyle}
        >
          {t("messages.groupModal.color")}
        </span>
        <div
          aria-labelledby={colorLabelId}
          className="flex"
          role="radiogroup"
          style={{
            gap: pxToRem(groupModal.swatchGap),
            marginTop: pxToRem(groupModal.swatchMarginTop),
          }}
        >
          {GROUP_AVATAR_COLORS.map((color: GroupAvatarColor) => (
            <button
              aria-checked={color === state.avatarColor}
              aria-label={t(`messages.groupModal.color.${color}`)}
              className="grid place-items-center transition hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid={`group-create-color-${color}`}
              key={color}
              onClick={() => onPatch({ avatarColor: color })}
              role="radio"
              style={{
                background: getGroupSwatchBackground(color),
                borderColor: color === state.avatarColor ? "hsl(var(--primary))" : "transparent",
                borderRadius: pxToRem(groupModal.swatchRadius),
                borderStyle: "solid",
                borderWidth: pxToRem(groupModal.swatchRingWidth),
                color: getGroupSwatchInk(color) ?? "white",
                height: pxToRem(groupModal.swatchSize),
                width: pxToRem(groupModal.swatchSize),
              }}
              tabIndex={color === state.avatarColor ? 0 : -1}
              type="button"
            >
              {color === state.avatarColor ? (
                <Check
                  aria-hidden="true"
                  style={{
                    height: pxToRem(groupModal.swatchTickSize),
                    width: pxToRem(groupModal.swatchTickSize),
                  }}
                />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex flex-col border-t border-[hsl(var(--border)/0.6)]"
        style={{
          gap: pxToRem(groupModal.settingsGap),
          marginTop: pxToRem(groupModal.settingsMarginTop),
          paddingTop: pxToRem(groupModal.settingsPaddingTop),
        }}
      >
        <div className="flex items-center" style={{ gap: pxToRem(groupModal.settingRowGap) }}>
          <SettingCopy
            hint={t("messages.groupModal.addRuleHint")}
            title={t("messages.groupModal.addRule")}
          />
          <div
            className="flex shrink-0 border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft))]"
            role="radiogroup"
            style={{
              borderRadius: pxToRem(groupModal.segmentRadius),
              gap: pxToRem(groupModal.segmentGap),
              padding: pxToRem(groupModal.segmentPadding),
            }}
          >
            {PERMISSION_OPTIONS.map((value) => (
              <button
                aria-checked={state.permAddMembers === value}
                className={cn(
                  "transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  state.permAddMembers === value
                    ? "bg-[hsl(var(--surface-card))] text-[hsl(var(--foreground))] shadow-sm"
                    : "text-[hsl(var(--text-muted))]",
                )}
                data-testid={`group-create-perm-${value.toLowerCase()}`}
                key={value}
                onClick={() => onPatch({ permAddMembers: value })}
                role="radio"
                style={{
                  borderRadius: pxToRem(groupModal.segmentButtonRadius),
                  fontSize: pxToRem(groupModal.segmentButtonFontSize),
                  fontWeight: 600,
                  height: pxToRem(groupModal.segmentButtonHeight),
                  padding: `0 ${pxToRem(groupModal.segmentButtonPaddingX)}`,
                }}
                type="button"
              >
                {value === "ALL"
                  ? t("messages.groupModal.addRuleEveryone")
                  : t("messages.groupModal.addRuleAdmins")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center" style={{ gap: pxToRem(groupModal.settingRowGap) }}>
          <SettingCopy
            hint={t("messages.groupModal.inviteHint")}
            title={t("messages.groupModal.invite")}
          />
          <button
            aria-checked={state.inviteEnabled}
            aria-label={t("messages.groupModal.invite")}
            className={cn(
              "relative shrink-0 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              state.inviteEnabled ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-soft))]",
            )}
            data-testid="group-create-invite-enabled"
            onClick={() => onPatch({ inviteEnabled: !state.inviteEnabled })}
            role="switch"
            style={{
              borderRadius: pxToRem(groupModal.toggleRadius),
              height: pxToRem(groupModal.toggleHeight),
              width: pxToRem(groupModal.toggleWidth),
            }}
            type="button"
          >
            <span
              className="absolute rounded-full bg-white shadow-[0_0.125rem_0.375rem_hsl(var(--shadow-color)/0.6)] transition-[left]"
              style={{
                height: pxToRem(groupModal.toggleKnobSize),
                left: pxToRem(
                  state.inviteEnabled
                    ? groupModal.toggleKnobOffsetOn
                    : groupModal.toggleKnobOffsetOff,
                ),
                top: pxToRem(groupModal.toggleKnobTop),
                width: pxToRem(groupModal.toggleKnobSize),
              }}
            />
          </button>
        </div>

        <div className="flex items-center" style={{ gap: pxToRem(groupModal.settingRowGap) }}>
          <SettingCopy
            hint={t("messages.groupModal.historyHint")}
            title={t("messages.groupModal.history")}
          />
          <div
            className="flex shrink-0 border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft))]"
            role="radiogroup"
            style={{
              borderRadius: pxToRem(groupModal.segmentRadius),
              gap: pxToRem(groupModal.segmentGap),
              padding: pxToRem(groupModal.segmentPadding),
            }}
          >
            {HISTORY_OPTIONS.map((value) => (
              <button
                aria-checked={state.historyVisibility === value}
                className={cn(
                  "transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  state.historyVisibility === value
                    ? "bg-[hsl(var(--surface-card))] text-[hsl(var(--foreground))] shadow-sm"
                    : "text-[hsl(var(--text-muted))]",
                )}
                data-testid={`group-create-history-${value.toLowerCase()}`}
                key={value}
                onClick={() => onPatch({ historyVisibility: value })}
                role="radio"
                style={{
                  borderRadius: pxToRem(groupModal.segmentButtonRadius),
                  fontSize: pxToRem(groupModal.segmentButtonFontSizeNarrow),
                  fontWeight: 600,
                  height: pxToRem(groupModal.segmentButtonHeight),
                  padding: `0 ${pxToRem(groupModal.segmentButtonPaddingXNarrow)}`,
                }}
                type="button"
              >
                {getHistoryLabel(value, t)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingCopy({ hint, title }: { hint: string; title: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span
        className="block text-[hsl(var(--foreground))]"
        style={{
          fontSize: pxToRem(groupModal.settingTitleFontSize),
          fontWeight: 600,
          lineHeight: groupModal.settingTitleLineHeight,
        }}
      >
        {title}
      </span>
      <span
        className="block text-[hsl(var(--text-muted))]"
        style={{
          fontSize: pxToRem(groupModal.settingDescriptionFontSize),
          marginTop: pxToRem(groupModal.settingDescriptionMarginTop),
        }}
      >
        {hint}
      </span>
    </span>
  );
}

"use client";

import React, { useState } from "react";
import { Pin, X } from "lucide-react";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_NAME_MAX_LENGTH,
  getGroupCapabilities,
  getGroupMemberActions,
  type DMConversationDTO,
  type DMParticipantDTO,
  type GroupMemberAction,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/providers/locale-provider";
import { DmConversationShortcuts } from "@/components/dm/dm-details-panel";
import { GroupIconField } from "@/components/dm/group-icon-field";
import { getGroupConversationTitle } from "@/lib/dm/group-presentation";
import { cn } from "@/lib/utils";

type DmGroupDetailsPanelProps = {
  /** Faz 5 §D3.2: 2f's controls, mounted under this panel's own sections. */
  children?: React.ReactNode;
  className?: string;
  conversation: DMConversationDTO;
  currentUserId: string;
  isPending?: boolean;
  onAddMembers?: ((userIds: readonly string[]) => void) | undefined;
  /** Friends the owner may still add; already-joined ids are filtered here. */
  candidates?: readonly {
    avatarUrl: string | null;
    displayName: string | null;
    id: string;
    username: string;
  }[];
  /** Faz 5 §D3.1: the strip's target, so the panel can jump into the transcript. */
  onOpenPinnedMessage?: ((messageId: string) => void) | undefined;
  onClose?: (() => void) | undefined;
  onLeave?: (() => void) | undefined;
  onOpenSearch?: (() => void) | undefined;
  onRemoveMember?: ((userId: string) => void) | undefined;
  /** Faz 5 §D3.3. Promote and demote; the endpoint is the mobile one. */
  onSetMemberRole?: ((userId: string, role: "ADMIN" | "MEMBER") => void) | undefined;
  onUpdate?: ((patch: { iconUrl?: string | null; name?: string | null }) => void) | undefined;
  variant?: "drawer" | "panel";
};

/** §D3.3. Owner gold, other admins accent — the same two tints as 2e §6. */
function MemberRoleBadge({ role }: { role: DMParticipantDTO["role"] }) {
  const { t } = useI18n();

  if (role !== "OWNER" && role !== "ADMIN") {
    return null;
  }

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-black uppercase tracking-[0.12em]",
        role === "OWNER"
          ? "bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))]"
          : "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
      )}
      data-testid={`dm-group-role-${role.toLocaleLowerCase()}`}
    >
      {t(role === "OWNER" ? "dm.group.ownerBadge" : "dm.group.adminBadge")}
    </span>
  );
}

/**
 * Faz 6 §19.2. The group arm of the details surface, a sibling of the 1:1 panel
 * rather than a mode inside it: a group has no counterpart to profile and no
 * mutual servers to list, and it owns two controls the 1:1 panel never had.
 *
 * K4 sahip-yönetir: only `ownerId` may rename, add and remove. Every member can
 * leave.
 */
export function DmGroupDetailsPanel({
  candidates = [],
  children,
  className,
  conversation,
  currentUserId,
  isPending = false,
  onAddMembers,
  onClose,
  onLeave,
  onOpenPinnedMessage,
  onOpenSearch,
  onRemoveMember,
  onSetMemberRole,
  onUpdate,
  variant = "panel",
}: DmGroupDetailsPanelProps) {
  const { locale, t } = useI18n();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const isOwner = conversation.ownerId !== null && conversation.ownerId === currentUserId;
  /**
   * Faz 5 §D3. `getGroupCapabilities` is the shared rule (`@wizards/types`), so
   * this panel and 2e answer the same question the same way.
   *
   * `role` falls back to `ownerId` for a conversation written before the column
   * existed, and a group with no `permissions` at all falls back to K4's older
   * "sahip yönetir" — an absent permission set is a payload from before Faz 1,
   * not permission for everybody.
   */
  const viewerRole: DMParticipantDTO["role"] = conversation.role ?? (isOwner ? "OWNER" : "MEMBER");
  const capabilities = getGroupCapabilities(viewerRole, conversation.permissions);
  const canEditIdentity = conversation.permissions ? capabilities.canEditInfo : isOwner;
  const isFull = conversation.participants.length >= GROUP_DM_MAX_PARTICIPANTS;
  const title = getGroupConversationTitle(
    conversation,
    currentUserId,
    t("dm.sidebar.unknownUser"),
    locale,
  );
  // A 30-friend list is a scroll, not a choice: the field is what makes the
  // picker usable once the roster grows.
  const visibleCandidates = (() => {
    const needle = candidateSearch.trim().toLocaleLowerCase();
    if (!needle) {
      return candidates;
    }

    return candidates.filter((candidate) =>
      `${candidate.displayName ?? candidate.username} @${candidate.username}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  })();

  return (
    <aside
      aria-label={t("dm.details.title")}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--background)/0.88)] text-app-foreground backdrop-blur-xl",
        variant === "panel" && "border-l border-[hsl(var(--border)/0.42)]",
        variant === "drawer" &&
          "h-full rounded-l-[1.875rem] border-l border-[hsl(var(--border)/0.54)] shadow-[0_28px_74px_hsl(var(--shadow-color)/0.18)]",
        className,
      )}
      data-testid="dm-group-details-panel"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.18em] text-app-soft">
            {t("dm.details.title")}
          </p>
          {onClose ? (
            <button
              aria-label={t("dm.details.close")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <section className="flex items-center gap-3 rounded-[1.5rem] bg-[hsl(var(--surface-soft)/0.48)] p-3.5">
          <Avatar
            alt={title}
            className="h-14 w-14 text-base"
            fallback={title}
            src={conversation.iconUrl}
          />
          <div className="min-w-0">
            <h2 className="truncate text-base font-black text-app-foreground">{title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-app-muted">
              {t("dm.group.memberCount", {
                count: conversation.memberCount ?? conversation.participants.length,
              })}
            </p>
            {conversation.description ? (
              <p
                className="mt-1 text-xs font-semibold text-app-muted"
                data-testid="dm-group-description"
              >
                {conversation.description}
              </p>
            ) : null}
          </div>
        </section>

        {/* §D3.1: no pin, no card — never an empty one. */}
        {conversation.pinnedMessage ? (
          <button
            className="flex min-w-0 items-center gap-2.5 rounded-[1.25rem] bg-[hsl(var(--surface-soft)/0.48)] px-3 py-2.5 text-left transition hover:bg-[hsl(var(--surface-soft)/0.7)]"
            data-testid="dm-group-pinned-card"
            onClick={() => onOpenPinnedMessage?.(conversation.pinnedMessage!.id)}
            type="button"
          >
            <Pin className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
            <span className="min-w-0">
              <span className="block text-[0.6875rem] font-black uppercase tracking-[0.16em] text-[hsl(var(--primary))]">
                {t("dm.group.pinnedMessage")}
              </span>
              <span className="block truncate text-xs font-semibold text-app-muted">
                {`${conversation.pinnedMessage.authorName}: ${conversation.pinnedMessage.excerpt}`}
              </span>
            </span>
          </button>
        ) : null}

        {canEditIdentity && onUpdate ? (
          <section className="flex flex-col gap-2">
            {/* Faz 7: the group exists, so the upload is authorized against it
                rather than left inert the way a create-time icon is. */}
            <GroupIconField
              conversationId={conversation.id}
              label={title}
              onChange={(iconUrl) => onUpdate({ iconUrl })}
              value={conversation.iconUrl}
            />
            <label className="flex flex-col gap-1.5 text-xs font-bold text-app-muted">
              {t("dm.group.nameLabel")}
              <Input
                data-testid="dm-group-name-input"
                maxLength={GROUP_DM_NAME_MAX_LENGTH}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={t("dm.group.namePlaceholder")}
                value={draftName ?? conversation.name ?? ""}
              />
            </label>
            <div className="flex gap-2">
              <Button
                data-testid="dm-group-name-save"
                // A blank field means "clear the name", which is a real edit;
                // only an untouched field has nothing to send.
                disabled={isPending || draftName === null}
                onClick={() => {
                  const trimmed = (draftName ?? "").trim();
                  onUpdate({ name: trimmed.length > 0 ? trimmed : null });
                  setDraftName(null);
                }}
                type="button"
              >
                {t("dm.group.saveAction")}
              </Button>
              {onAddMembers ? (
                <Button
                  data-testid="dm-group-add-member"
                  disabled={isPending}
                  onClick={() => setPickerOpen((current) => !current)}
                  type="button"
                  variant="outline"
                >
                  {t("dm.group.addMemberAction")}
                </Button>
              ) : null}
            </div>

            {onAddMembers && pickerOpen ? (
              <div className="flex flex-col gap-1" data-testid="dm-group-add-picker">
                <p className="text-xs font-semibold text-app-muted">
                  {candidates.length > 0
                    ? t("dm.group.addMembersHint")
                    : t("dm.group.noCandidates")}
                </p>
                {candidates.length > 0 ? (
                  <Input
                    data-testid="dm-group-add-search"
                    onChange={(event) => setCandidateSearch(event.target.value)}
                    placeholder={t("dm.group.searchPlaceholder")}
                    value={candidateSearch}
                  />
                ) : null}
                {visibleCandidates.map((candidate) => {
                  const label = candidate.displayName ?? candidate.username;

                  return (
                    <button
                      className="flex min-w-0 items-center gap-2.5 rounded-2xl px-1.5 py-1.5 text-left text-sm font-semibold transition hover:bg-[hsl(var(--surface-soft)/0.5)] disabled:cursor-not-allowed disabled:opacity-55"
                      data-testid={`dm-group-add-${candidate.id}`}
                      disabled={isPending || isFull}
                      key={candidate.id}
                      onClick={() => {
                        setPickerOpen(false);
                        onAddMembers([candidate.id]);
                      }}
                      type="button"
                    >
                      <Avatar
                        alt={label}
                        className="h-7 w-7"
                        fallback={label}
                        src={candidate.avatarUrl}
                      />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </button>
                  );
                })}
                {/* The server enforces the ceiling too (`GROUP_FULL`); this only
                    stops the request from being sent when it cannot succeed. */}
                {isFull ? (
                  <p className="text-xs font-semibold text-app-muted">
                    {t("dm.group.limitReached")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-1.5">
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.18em] text-app-soft">
            {t("dm.group.membersTitle")}
          </p>
          <ul className="flex flex-col gap-1">
            {conversation.participants.map((member) => {
              const label = member.displayName ?? member.username;
              /**
               * §D3.3, the same rule mobile's sheet reads: an action the viewer
               * may not take is absent, never disabled. `role` falls back to
               * `ownerId` for a payload written before the column existed.
               */
              const role =
                member.role ?? (conversation.ownerId === member.userId ? "OWNER" : "MEMBER");
              const actions = getGroupMemberActions(
                viewerRole,
                role,
                member.userId === currentUserId,
              );
              const may = (action: GroupMemberAction) => actions.includes(action);

              return (
                <li
                  className="flex min-w-0 items-center gap-2.5 rounded-2xl px-1.5 py-1.5"
                  key={member.userId}
                >
                  <Avatar alt={label} className="h-8 w-8" fallback={label} src={member.avatarUrl} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
                  {member.userId === currentUserId ? (
                    <span className="shrink-0 text-[0.6875rem] font-black text-app-soft">
                      {t("dm.group.selfLabel")}
                    </span>
                  ) : null}
                  <MemberRoleBadge role={role} />
                  {onSetMemberRole && (may("promote") || may("demote")) ? (
                    <button
                      className="shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-black text-app-muted transition hover:text-[hsl(var(--primary))]"
                      data-testid={`dm-group-role-toggle-${member.userId}`}
                      disabled={isPending}
                      onClick={() =>
                        onSetMemberRole(member.userId, may("promote") ? "ADMIN" : "MEMBER")
                      }
                      type="button"
                    >
                      {t(may("promote") ? "dm.group.promoteAction" : "dm.group.demoteAction")}
                    </button>
                  ) : null}
                  {/* The owner never removes themselves from the roster; leaving
                      is the same write under its own label. */}
                  {onRemoveMember && may("remove") ? (
                    <button
                      aria-label={t("dm.group.removeMemberAction")}
                      className="shrink-0 rounded-full p-1 text-app-muted transition hover:text-[hsl(var(--danger))]"
                      data-testid={`dm-group-remove-${member.userId}`}
                      disabled={isPending}
                      onClick={() => onRemoveMember(member.userId)}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <DmConversationShortcuts onOpenSearch={onOpenSearch} />

        {children}

        {onLeave ? (
          <Button
            data-testid="dm-group-leave"
            disabled={isPending}
            onClick={onLeave}
            type="button"
            variant="outline"
          >
            {t("dm.group.leaveAction")}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

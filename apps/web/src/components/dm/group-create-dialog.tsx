"use client";

import React, { useMemo, useState } from "react";
import { Check, Link2, Lock, UserPlus, X } from "lucide-react";
import {
  GROUP_AVATAR_COLORS,
  GROUP_DM_DESCRIPTION_MAX_LENGTH,
  GROUP_DM_NAME_MAX_LENGTH,
  buildGroupNameFromMembers,
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupAvatarColor,
  type GroupCreateState,
  type GroupHistoryVisibility,
  type GroupPermissionLevel,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { Avatar } from "@/components/ui/avatar";
import { GroupIconField } from "@/components/dm/group-icon-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

export type GroupCreateFriend = {
  /** 2b §7. False draws the row closed: dimmed, locked and not selectable. */
  readonly allowsGroupInvites: boolean;
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly id: string;
  readonly username: string;
};

const HISTORY_OPTIONS: readonly GroupHistoryVisibility[] = ["NONE", "LAST_24H", "LAST_30D", "ALL"];
const PERMISSION_OPTIONS: readonly GroupPermissionLevel[] = ["ALL", "ADMINS"];

type GroupCreateDialogContentProps = {
  friends: readonly GroupCreateFriend[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (input: ReturnType<typeof toGroupCreateRequest>) => void;
};

type GroupCreateDialogProps = GroupCreateDialogContentProps & {
  open: boolean;
};

function getFriendLabel(friend: GroupCreateFriend): string {
  return friend.displayName ?? friend.username;
}

/**
 * Faz 6 §18.2 / F2. One dialog, two steps, and **no rules of its own**: every
 * question about what may be picked, what the counters read and what the group
 * ends up called is answered by `@wizards/types`, the same module the mobile
 * screens use. A second implementation here would be a second ceiling to keep
 * in step — and, for the name hint, a second answer to "what is this group
 * called" (§4.4).
 *
 * The mobile handoff's pixels are deliberately **not** copied (K5): this is the
 * web design language, with the same behaviour behind it.
 */
export function GroupCreateDialog({ open, ...content }: GroupCreateDialogProps) {
  const { t } = useI18n();

  return (
    <Modal
      className="max-w-lg"
      closeLabel={t("dm.group.cancelAction")}
      onClose={content.onClose}
      open={open}
      title={t("dm.group.createTitle")}
    >
      <GroupCreateDialogContent {...content} />
    </Modal>
  );
}

/**
 * The dialog body without its portal. Exported so the contract can be rendered
 * in the node test runner, which has no DOM for `createPortal` to reach.
 */
export function GroupCreateDialogContent({
  friends,
  isSubmitting = false,
  onClose,
  onSubmit,
}: GroupCreateDialogContentProps) {
  const { locale, t } = useI18n();
  const [state, setState] = useState<GroupCreateState>(createInitialGroupCreateState);
  const [search, setSearch] = useState("");
  // The uploaded icon is dialog state, not caller state: it only becomes real
  // when the create request carries it.
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  const isIdentityStep = state.step === "identity";
  const isFull = isGroupSelectionFull(state);
  const selectedFriends = state.selectedUserIds
    .map((userId) => friends.find((friend) => friend.id === userId))
    .filter((friend): friend is GroupCreateFriend => Boolean(friend));
  const visibleFriends = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) {
      return friends;
    }

    return friends.filter((friend) =>
      `${getFriendLabel(friend)} @${friend.username}`.toLocaleLowerCase().includes(needle),
    );
  }, [friends, search]);
  /**
   * §4.4. Not a sentence about the members — the name the group will actually
   * get, produced by the rule the server uses, so the hint and the result are
   * the same string on both surfaces.
   */
  const derivedName = buildGroupNameFromMembers(selectedFriends.map(getFriendLabel), locale);
  const trimmedName = state.name.trim();
  const patch = (next: Partial<GroupCreateState>) =>
    setState((current) => ({ ...current, ...next }));

  return (
    <div className="flex flex-col gap-3" data-testid="group-create-dialog">
      <p className="text-xs font-black uppercase tracking-wide text-app-soft">
        {isIdentityStep ? t("dm.group.identityStep") : t("dm.group.membersStep")}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-app-muted">
        <span>{isFull ? t("dm.group.limitReached") : t("dm.group.minimumHint")}</span>
        <span data-testid="group-create-counter">
          {t("dm.group.counter").replace("{count}", String(getGroupSelectionCount(state)))}
        </span>
      </div>

      {selectedFriends.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedFriends.map((friend) => (
            <button
              className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-soft)/0.6)] px-2.5 py-1 text-xs font-bold text-app-foreground"
              data-testid={`group-create-selected-${friend.id}`}
              key={friend.id}
              onClick={() => setState((current) => toggleGroupMember(current, friend.id))}
              type="button"
            >
              {getFriendLabel(friend)}
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}

      {isIdentityStep ? (
        <div className="flex flex-col gap-3">
          {/*
           * Faz 7: the group does not exist yet, so the uploader is handed a
           * null conversation id — the URL it returns is inert until POST
           * /dm/groups accepts it.
           */}
          <GroupIconField
            conversationId={null}
            label={trimmedName || derivedName || "#"}
            onChange={setIconUrl}
            value={iconUrl}
          />

          {/* 2c §2: the swatch strip is what a group without a photo wears. */}
          {iconUrl ? null : (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-bold text-app-muted">
                {t("dm.group.colorLabel")}
              </legend>
              <div className="flex gap-2">
                {GROUP_AVATAR_COLORS.map((color: GroupAvatarColor) => (
                  <button
                    aria-label={color}
                    aria-pressed={color === state.avatarColor}
                    className={cn(
                      "h-7 w-7 rounded-[10px] transition",
                      color === state.avatarColor
                        ? "ring-2 ring-[hsl(var(--ring)/0.65)] ring-offset-2 ring-offset-[hsl(var(--surface-card))]"
                        : "opacity-80 hover:opacity-100",
                    )}
                    data-testid={`group-create-color-${color.replace("#", "")}`}
                    key={color}
                    onClick={() => patch({ avatarColor: color })}
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                ))}
              </div>
            </fieldset>
          )}

          <label className="flex flex-col gap-1.5 text-xs font-bold text-app-muted">
            <span className="flex items-center justify-between">
              {t("dm.group.nameLabel")}
              <span data-testid="group-create-name-counter">
                {`${trimmedName.length}/${GROUP_DM_NAME_MAX_LENGTH}`}
              </span>
            </span>
            <Input
              data-testid="group-create-name"
              maxLength={GROUP_DM_NAME_MAX_LENGTH}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder={t("dm.group.namePlaceholder")}
              value={state.name}
            />
          </label>
          {trimmedName.length === 0 ? (
            <p className="text-xs text-app-muted" data-testid="group-create-name-hint">
              {t("dm.group.nameHintTemplate").replace("{names}", derivedName)}
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5 text-xs font-bold text-app-muted">
            <span className="flex items-center justify-between">
              {`${t("dm.group.descriptionLabel")} — ${t("dm.group.descriptionOptional")}`}
              <span data-testid="group-create-description-counter">
                {`${state.description.trim().length}/${GROUP_DM_DESCRIPTION_MAX_LENGTH}`}
              </span>
            </span>
            <Textarea
              data-testid="group-create-description"
              maxLength={GROUP_DM_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder={t("dm.group.descriptionPlaceholder")}
              value={state.description}
            />
          </label>

          <fieldset
            className="flex flex-col gap-2 rounded-2xl border border-[hsl(var(--border)/0.7)] p-3"
            data-testid="group-create-join"
          >
            <legend className="px-1 text-xs font-black uppercase tracking-wide text-app-soft">
              {t("dm.group.joinLabel")}
            </legend>
            <label className="flex items-center gap-2 text-sm font-semibold text-app-foreground">
              <UserPlus aria-hidden="true" className="h-4 w-4 text-app-muted" />
              <span className="flex-1">{t("dm.group.permAddMembers")}</span>
              <select
                className="rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.5)] px-2 py-1 text-xs font-bold"
                data-testid="group-create-perm-add-members"
                onChange={(event) =>
                  patch({ permAddMembers: event.target.value as GroupPermissionLevel })
                }
                value={state.permAddMembers}
              >
                {PERMISSION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value === "ALL" ? t("dm.group.permValueAll") : t("dm.group.permValueAdmins")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-app-foreground">
              <Link2 aria-hidden="true" className="h-4 w-4 text-app-muted" />
              <span className="flex flex-1 flex-col">
                {t("dm.group.inviteLink")}
                <span className="text-xs font-medium text-app-muted">
                  {t("dm.group.inviteLinkHint")}
                </span>
              </span>
              {/* K2: off until somebody asks for it, on web exactly as on 2c. */}
              <input
                checked={state.inviteEnabled}
                data-testid="group-create-invite-enabled"
                onChange={(event) => patch({ inviteEnabled: event.target.checked })}
                type="checkbox"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-app-foreground">
              <span className="flex-1">{t("dm.group.historyVisibility")}</span>
              <select
                className="rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.5)] px-2 py-1 text-xs font-bold"
                data-testid="group-create-history"
                onChange={(event) =>
                  patch({ historyVisibility: event.target.value as GroupHistoryVisibility })
                }
                value={state.historyVisibility}
              >
                {HISTORY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value === "NONE"
                      ? t("dm.group.historyNone")
                      : value === "LAST_24H"
                        ? t("dm.group.history24h")
                        : value === "LAST_30D"
                          ? t("dm.group.history30d")
                          : t("dm.group.historyAll")}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            data-testid="group-create-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("dm.group.searchPlaceholder")}
            value={search}
          />
          <ul className="max-h-72 overflow-y-auto">
            {visibleFriends.map((friend) => {
              const selected = state.selectedUserIds.includes(friend.id);
              // A full selection freezes the rows that are not part of it; the
              // picked ones stay live so the ceiling is never a dead end.
              const capped = isFull && !selected;
              const disabled = capped || !friend.allowsGroupInvites;

              return (
                <li key={friend.id}>
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left text-sm font-semibold text-app-foreground",
                      disabled ? "opacity-45" : "hover:bg-[hsl(var(--surface-soft)/0.5)]",
                    )}
                    data-testid={`group-create-friend-${friend.id}`}
                    disabled={disabled}
                    onClick={() => setState((current) => toggleGroupMember(current, friend.id))}
                    type="button"
                  >
                    <Avatar
                      alt={getFriendLabel(friend)}
                      className="h-8 w-8"
                      fallback={getFriendLabel(friend)}
                      src={friend.avatarUrl}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {getFriendLabel(friend)}
                      {friend.allowsGroupInvites ? null : (
                        <span className="block text-xs font-medium text-app-muted">
                          {t("dm.group.inviteClosed")}
                        </span>
                      )}
                    </span>
                    {friend.allowsGroupInvites ? null : (
                      <Lock aria-hidden="true" className="h-4 w-4 text-app-soft" />
                    )}
                    {selected ? (
                      <Check aria-hidden="true" className="h-4 w-4 text-[hsl(var(--primary))]" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {isIdentityStep ? (
          <>
            <Button
              data-testid="group-create-back"
              onClick={() => patch({ step: "members" })}
              type="button"
              variant="outline"
            >
              {t("dm.group.backAction")}
            </Button>
            <Button
              data-testid="group-create-submit"
              disabled={!canSubmitGroup(state) || isSubmitting}
              onClick={() => onSubmit(toGroupCreateRequest(state, iconUrl))}
              type="button"
            >
              {t("dm.group.submitAction")}
            </Button>
          </>
        ) : (
          <>
            <Button
              data-testid="group-create-cancel"
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {t("dm.group.cancelAction")}
            </Button>
            <Button
              data-testid="group-create-next"
              disabled={!canAdvanceToIdentity(state)}
              onClick={() => patch({ step: "identity" })}
              type="button"
            >
              {t("dm.group.nextAction")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

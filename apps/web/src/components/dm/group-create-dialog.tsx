"use client";

import React, { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import {
  GROUP_DM_NAME_MAX_LENGTH,
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupCreateState,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { Avatar } from "@/components/ui/avatar";
import { GroupIconField } from "@/components/dm/group-icon-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

export type GroupCreateFriend = {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly id: string;
  readonly username: string;
};

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
 * Faz 6 §18.2. One dialog, two steps, and **no rules of its own**: every
 * question about what may be picked or submitted is answered by
 * `@wizards/types`, the same module the mobile screen uses. A second
 * implementation here would be a second ceiling to keep in step.
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
  const { t } = useI18n();
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
            label={state.name || "#"}
            onChange={setIconUrl}
            value={iconUrl}
          />

          <label className="flex flex-col gap-1.5 text-xs font-bold text-app-muted">
            {t("dm.group.nameLabel")}
            <Input
              data-testid="group-create-name"
              maxLength={GROUP_DM_NAME_MAX_LENGTH}
              onChange={(event) =>
                setState((current) => ({ ...current, name: event.target.value }))
              }
              placeholder={t("dm.group.namePlaceholder")}
              value={state.name}
            />
          </label>
          <p className="text-xs text-app-muted">{t("dm.group.nameHint")}</p>
          <p className="text-xs font-semibold text-app-muted" data-testid="group-create-summary">
            {selectedFriends.map(getFriendLabel).join(", ")}
          </p>
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
              const disabled = isFull && !selected;

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
                    <span className="min-w-0 flex-1 truncate">{getFriendLabel(friend)}</span>
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
              onClick={() => setState((current) => ({ ...current, step: "members" }))}
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
              onClick={() => setState((current) => ({ ...current, step: "identity" }))}
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

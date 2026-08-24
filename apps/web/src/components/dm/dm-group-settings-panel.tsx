"use client";

import React, { useState } from "react";
import { Check, Copy, LogOut, RefreshCw } from "lucide-react";
import {
  getGroupCapabilities,
  type DMConversationDTO,
  type DMNotifyLevel,
  type GroupAction,
  type GroupDisappearingWindow,
  type GroupInviteDTO,
  type GroupPermissionLevel,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §D3.2 — the web arm of 2f.
 *
 * K5: the *rules* are the mobile screen's, the *pixels* are not. It draws in the
 * existing web design language and calls the same endpoints, and it asks
 * `getGroupCapabilities` — the shared rule in `@wizards/types` — rather than
 * re-deciding who may change what.
 */

const NOTIFY_LEVELS: readonly DMNotifyLevel[] = ["ALL", "MENTIONS", "NONE"];
const PERMISSION_LEVELS: readonly GroupPermissionLevel[] = ["ALL", "ADMINS"];
const DISAPPEARING_WINDOWS: readonly GroupDisappearingWindow[] = ["OFF", "H24", "D7", "D90"];
const PERMISSION_KEYS: Record<GroupAction, string> = {
  addMembers: "dm.group.permAddMembers",
  editInfo: "dm.group.permEditInfo",
  pinMessage: "dm.group.permPinMessage",
  sendMessage: "dm.group.permSendMessage",
};
const NOTIFY_KEYS: Record<DMNotifyLevel, { hint?: string; title: string }> = {
  ALL: { title: "dm.group.notifyAll" },
  MENTIONS: { hint: "dm.group.notifyMentionsHint", title: "dm.group.notifyMentions" },
  NONE: { hint: "dm.group.notifyNoneHint", title: "dm.group.notifyNone" },
};

type DmGroupSettingsPanelProps = {
  className?: string;
  conversation: DMConversationDTO;
  currentUserId: string;
  invite?: GroupInviteDTO | null;
  isPending?: boolean;
  onLeave?: ((input: { transferOwnershipTo?: string }) => void) | undefined;
  onRotateInvite?: (() => void) | undefined;
  onSetDisappearing?: ((window: GroupDisappearingWindow) => void) | undefined;
  onSetInviteEnabled?: ((enabled: boolean) => void) | undefined;
  onSetNotifyLevel?: ((level: DMNotifyLevel) => void) | undefined;
  onSetPermission?: ((action: GroupAction, level: GroupPermissionLevel) => void) | undefined;
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-black uppercase tracking-[0.18em] text-app-soft">
      {children}
    </p>
  );
}

export function DmGroupSettingsPanel({
  className,
  conversation,
  currentUserId,
  invite = null,
  isPending = false,
  onLeave,
  onRotateInvite,
  onSetDisappearing,
  onSetInviteEnabled,
  onSetNotifyLevel,
  onSetPermission,
}: DmGroupSettingsPanelProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const isOwner = conversation.ownerId !== null && conversation.ownerId === currentUserId;
  // Same fallback as the details panel: `role` from `ownerId` for an older
  // payload, and no `permissions` at all means K4's "sahip yönetir".
  const viewerRole = conversation.role ?? (isOwner ? "OWNER" : "MEMBER");
  const capabilities = getGroupCapabilities(viewerRole, conversation.permissions);
  const canEdit = conversation.permissions ? capabilities.canEditInfo : isOwner;
  const notifyLevel = conversation.notifyLevel ?? "ALL";
  const inviteUrl = invite?.url ?? null;
  const inviteLabel = invite?.displayUrl ?? invite?.url ?? null;
  /**
   * §11.3/30, on web too: a member does not see a disabled permissions block,
   * they see no block. The server refuses the write either way.
   */
  const showPermissions = capabilities.canEditInfo && conversation.permissions !== undefined;
  const others = conversation.participants.filter(
    (participant) => participant.userId !== currentUserId,
  );
  // V8: an owner with no other admin beside them hands the group over first.
  const needsTransfer =
    viewerRole === "OWNER" &&
    others.length > 0 &&
    !others.some((participant) => participant.role === "ADMIN");

  return (
    <section
      aria-label={t("dm.group.settingsTitle")}
      className={cn("flex flex-col gap-4", className)}
      data-testid="dm-group-settings-panel"
    >
      <div className="flex flex-col gap-1.5">
        <SectionHeading>{t("dm.group.notifications")}</SectionHeading>
        <div className="flex flex-col gap-1">
          {NOTIFY_LEVELS.map((level) => (
            <button
              aria-checked={notifyLevel === level}
              className="flex items-start gap-2.5 rounded-2xl px-2 py-2 text-left transition hover:bg-[hsl(var(--surface-soft)/0.5)]"
              data-testid={`dm-group-notify-${level}`}
              disabled={isPending}
              key={level}
              onClick={() => onSetNotifyLevel?.(level)}
              role="radio"
              type="button"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  notifyLevel === level
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border))]",
                )}
              >
                {notifyLevel === level ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{t(NOTIFY_KEYS[level].title)}</span>
                {NOTIFY_KEYS[level].hint ? (
                  <span className="block text-xs font-semibold text-app-muted">
                    {t(NOTIFY_KEYS[level].hint as string)}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showPermissions ? (
        <div className="flex flex-col gap-1.5" data-testid="dm-group-permissions">
          <div className="flex items-center gap-2">
            <SectionHeading>{t("dm.group.permissions")}</SectionHeading>
            <span className="rounded-full bg-[hsl(var(--warning)/0.14)] px-2 py-0.5 text-[0.625rem] font-black uppercase tracking-[0.12em] text-[hsl(var(--warning))]">
              {t("dm.group.adminBadge")}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {(Object.keys(PERMISSION_KEYS) as GroupAction[]).map((action) => (
              <div
                className="flex items-center justify-between gap-2 rounded-2xl px-2 py-1.5"
                key={action}
              >
                <span className="min-w-0 truncate text-sm font-semibold">
                  {t(PERMISSION_KEYS[action])}
                </span>
                <select
                  className="shrink-0 rounded-xl border border-[hsl(var(--border)/0.6)] bg-transparent px-2 py-1 text-xs font-semibold"
                  data-testid={`dm-group-permission-${action}`}
                  disabled={isPending}
                  onChange={(event) =>
                    onSetPermission?.(action, event.target.value as GroupPermissionLevel)
                  }
                  value={conversation.permissions?.[action] ?? "ALL"}
                >
                  {PERMISSION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level === "ALL" ? t("dm.group.permValueAll") : t("dm.group.permValueAdmins")}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <SectionHeading>{t("dm.group.privacy")}</SectionHeading>
        <div className="flex flex-col gap-2 rounded-2xl bg-[hsl(var(--surface-soft)/0.42)] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold">{t("dm.group.inviteLink")}</p>
              {/* K2: switched off means there is no code to print at all. */}
              <p
                className="truncate text-xs font-semibold text-app-muted"
                data-testid="dm-group-invite-url"
              >
                {inviteLabel ?? t("dm.group.inviteLinkHint")}
              </p>
            </div>
            {canEdit ? (
              <Button
                data-testid="dm-group-invite-toggle"
                disabled={isPending}
                onClick={() => onSetInviteEnabled?.(!(invite?.enabled === true))}
                type="button"
                variant="outline"
              >
                {invite?.enabled === true
                  ? t("dm.group.inviteDisable")
                  : t("dm.group.inviteEnable")}
              </Button>
            ) : null}
          </div>
          {inviteUrl ? (
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="dm-group-invite-copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteUrl).then(() => setCopied(true));
                }}
                type="button"
                variant="outline"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {t("dm.group.inviteCopy")}
              </Button>
              {canEdit && onRotateInvite ? (
                <Button
                  data-testid="dm-group-invite-rotate"
                  disabled={isPending}
                  onClick={() => {
                    if (window.confirm(t("dm.group.inviteRotateConfirm"))) {
                      onRotateInvite();
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("dm.group.inviteRotate")}
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold">{t("dm.group.disappearing")}</p>
              {/* V6, before the write rather than after it. */}
              <p className="text-xs font-semibold text-app-muted">
                {t("dm.group.disappearingWarning")}
              </p>
            </div>
            <select
              className="shrink-0 rounded-xl border border-[hsl(var(--border)/0.6)] bg-transparent px-2 py-1 text-xs font-semibold"
              data-testid="dm-group-disappearing"
              disabled={isPending || !canEdit}
              onChange={(event) =>
                onSetDisappearing?.(event.target.value as GroupDisappearingWindow)
              }
              value={conversation.disappearingAfter ?? "OFF"}
            >
              {DISAPPEARING_WINDOWS.map((window) => (
                <option key={window} value={window}>
                  {t(`dm.group.disappearing.${window}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {onLeave ? (
        <div className="flex flex-col gap-2">
          <Button
            data-testid="dm-group-settings-leave"
            disabled={isPending}
            onClick={() => {
              if (needsTransfer) {
                setTransferOpen(true);
                return;
              }

              onLeave({});
            }}
            type="button"
            variant="outline"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("dm.group.leaveAction")}
          </Button>
          {transferOpen ? (
            <div className="flex flex-col gap-1" data-testid="dm-group-transfer">
              <p className="text-xs font-semibold text-app-muted">{t("dm.group.transferHint")}</p>
              {others.map((participant) => {
                const label = participant.displayName ?? participant.username;

                return (
                  <button
                    className="rounded-2xl px-2 py-1.5 text-left text-sm font-semibold transition hover:bg-[hsl(var(--surface-soft)/0.5)]"
                    data-testid={`dm-group-transfer-${participant.userId}`}
                    disabled={isPending}
                    key={participant.userId}
                    onClick={() => {
                      setTransferOpen(false);
                      onLeave({ transferOwnershipTo: participant.userId });
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import React, { useRef, useState } from "react";
import { Check, Search, ShieldCheck } from "lucide-react";
import type { WorkspaceMember, WorkspaceRole } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import {
  ServerModalShell,
  serverModalFooterStyle,
  serverModalPrimaryButtonStyle,
  serverModalSecondaryButtonStyle,
} from "@/components/servers/modals/server-modal-shell";
import {
  selectAssignableMemberRoles,
  selectEditableMemberRoleIds,
} from "@/lib/servers/member-moderation";
import { getRoleToneColor, roleColorToTone } from "@/lib/servers/role-color";
import { cn } from "@/lib/utils";

type MemberRolesDialogProps = {
  member: WorkspaceMember;
  roles: readonly WorkspaceRole[];
  isOwner: boolean;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (roleIds: string[]) => void;
};

export function MemberRolesDialog({
  member,
  roles,
  isOwner,
  submitting,
  error,
  onCancel,
  onSubmit,
}: MemberRolesDialogProps) {
  const { t } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(() =>
    selectEditableMemberRoleIds(
      member.roles.map((role) => role.id),
      roles,
    ),
  );
  const [query, setQuery] = useState("");
  const assignable = selectAssignableMemberRoles(roles, isOwner);
  const visible = assignable.filter((role) =>
    role.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const initialIds = selectEditableMemberRoleIds(
    member.roles.map((role) => role.id),
    roles,
  );
  const changed =
    initialIds.length !== selected.length || initialIds.some((id) => !selected.includes(id));
  const canSubmit = changed && !submitting;

  return (
    <ServerModalShell
      icon={<ShieldCheck aria-hidden="true" size={20} />}
      layerId="server-member-roles"
      open
      width="category"
      title={t("server.settings.members.role.open", { name: member.displayName })}
      description={t("server.settings.members.role.description")}
      closeLabel={t("common.cancel")}
      initialFocusRef={searchRef}
      onClose={() => {
        if (!submitting) onCancel();
      }}
      bodyClassName="space-y-4"
      footer={
        <div className="flex flex-wrap items-center justify-end" style={serverModalFooterStyle()}>
          <p
            role="status"
            className="mr-auto w-full text-xs font-medium text-[hsl(var(--text-muted))] sm:w-auto"
          >
            {t("server.settings.members.role.selected", { count: selected.length })}
          </p>
          <button
            type="button"
            className="shrink-0 font-semibold transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            onClick={onCancel}
            style={serverModalSecondaryButtonStyle()}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="shrink-0 font-semibold transition enabled:hover:brightness-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            disabled={!canSubmit}
            onClick={() => {
              if (canSubmit) onSubmit(selectEditableMemberRoleIds(selected, assignable));
            }}
            style={serverModalPrimaryButtonStyle(canSubmit)}
          >
            {t("common.save")}
          </button>
        </div>
      }
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]"
        />
        <input
          ref={searchRef}
          type="search"
          aria-label={t("server.settings.members.role.search")}
          placeholder={t("server.settings.members.role.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] py-3 pl-10 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--text-muted))] outline-hidden focus-visible:border-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.2)]"
        />
      </div>
      <fieldset disabled={submitting} className="min-w-0 space-y-2 border-0 p-0">
        <legend className="sr-only">{t("server.settings.members.role.menuLabel")}</legend>
        {visible.map((role) => (
          <label
            key={role.id}
            data-focus-surface
            className={cn(
              "relative flex items-center gap-3 rounded-xl border p-3 text-sm text-[hsl(var(--foreground))] transition-colors focus-within:ring-2 focus-within:ring-[hsl(var(--ring)/0.55)]",
              selected.includes(role.id)
                ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.07)]"
                : "border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] hover:bg-[hsl(var(--surface-soft))]",
              submitting ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
          >
            <input
              type="checkbox"
              checked={selected.includes(role.id)}
              onChange={(event) => {
                const checked = event.target.checked;
                setSelected((current) =>
                  checked ? [...current, role.id] : current.filter((id) => id !== role.id),
                );
              }}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-lg"
              style={{
                color: getRoleToneColor(roleColorToTone(role.color)),
                background: getRoleToneColor(roleColorToTone(role.color), 0.12),
              }}
            >
              <ShieldCheck size={18} />
            </span>
            <span className="min-w-0 flex-1 break-words font-semibold">{role.name}</span>
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-transparent peer-checked:border-[hsl(var(--primary))] peer-checked:bg-[hsl(var(--primary))] peer-checked:text-[hsl(var(--primary-foreground))]"
            >
              <Check size={14} strokeWidth={3} />
            </span>
          </label>
        ))}
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] px-4 py-8 text-center text-sm text-[hsl(var(--text-muted))]">
            {t("server.settings.members.role.empty")}
          </p>
        ) : null}
      </fieldset>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[hsl(var(--danger)/0.2)] bg-[hsl(var(--danger)/0.07)] px-3 py-2.5 text-sm text-[hsl(var(--danger))]"
        >
          {error}
        </p>
      ) : null}
    </ServerModalShell>
  );
}

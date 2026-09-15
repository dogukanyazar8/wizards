"use client";

import React, { useId, useRef } from "react";
import { AtSign, CheckCircle2, Info, Loader2, UserPlus, Users } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import {
  ServerModalShell,
  serverModalFooterStyle,
  serverModalPrimaryButtonStyle,
  serverModalSecondaryButtonStyle,
} from "./server-modal-shell";

type ServerAddMemberFormProps = {
  error: string | null;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (username: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  serverName: string;
  success: string | null;
  username: string;
};

export function ServerAddMemberForm({
  error,
  inputRef,
  onChange,
  onClose,
  onSubmit,
  pending,
  serverName,
  success,
  username,
}: ServerAddMemberFormProps) {
  const { t } = useI18n();
  const id = useId();
  const canSubmit = !pending && username.trim().length >= 2;

  return (
    <form
      aria-busy={pending}
      data-testid="add-server-member-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="space-y-5 p-5">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-secondary)/0.5)] p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[var(--primary-readable)]">
            <Users aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-[hsl(var(--text-secondary))]">
              {t("workspace.modal.addMemberServer")}
            </p>
            <p
              className="break-words text-sm font-semibold text-app-foreground"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {serverName}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-app-foreground" htmlFor={id}>
            {t("workspace.modal.addMemberUsername")}
          </label>
          <div className="relative">
            <AtSign
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--text-muted))]"
            />
            <Input
              aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
              aria-invalid={Boolean(error)}
              autoCapitalize="none"
              autoComplete="off"
              className="rounded-xl pl-10 disabled:cursor-wait disabled:opacity-60"
              data-testid="add-server-member-input"
              disabled={pending}
              id={id}
              maxLength={32}
              onChange={(event) => onChange(event.target.value)}
              placeholder={t("workspace.modal.addMemberPlaceholder")}
              ref={inputRef}
              spellCheck={false}
              value={username}
            />
          </div>
          <p
            className="text-xs leading-relaxed text-[hsl(var(--text-secondary))]"
            id={`${id}-hint`}
          >
            {t("workspace.modal.addMemberHint")}
          </p>
          {error ? (
            <p className="text-sm text-app-danger" id={`${id}-error`} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {success ? (
          <div
            className="app-success flex items-start gap-2.5 rounded-xl border p-3 text-sm"
            data-testid="add-server-member-success"
            role="status"
          >
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-app-success" />
            <div className="min-w-0">
              <p className="font-semibold text-app-success">
                {t("workspace.modal.addMemberSuccessTitle")}
              </p>
              <p className="mt-1 break-words text-app-foreground">{success}</p>
            </div>
          </div>
        ) : (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-[hsl(var(--text-secondary))]">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t("workspace.modal.addMemberNotice")}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end" style={serverModalFooterStyle()}>
        <button
          className="border font-semibold transition hover:bg-[hsl(var(--surface-soft))] disabled:opacity-50"
          disabled={pending}
          onClick={onClose}
          style={serverModalSecondaryButtonStyle()}
          type="button"
        >
          {t(success ? "common.close" : "common.cancel")}
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 font-semibold transition"
          data-testid="add-server-member-submit"
          disabled={!canSubmit}
          style={serverModalPrimaryButtonStyle(canSubmit)}
          type="submit"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <UserPlus aria-hidden="true" className="size-4" />
          )}
          {t(pending ? "workspace.modal.addMemberAdding" : "workspace.modal.addMemberAction")}
        </button>
      </div>
    </form>
  );
}

export function ServerAddMemberModal(props: ServerAddMemberFormProps & { open: boolean }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <ServerModalShell
      bodyPaddingBottom={0}
      bodyPaddingTop={0}
      bodyPaddingX={0}
      closeLabel={t("common.close")}
      description={t("workspace.modal.addMemberDescription")}
      icon={<UserPlus aria-hidden="true" className="size-5" />}
      initialFocusRef={inputRef}
      layerId="server-add-member"
      onClose={() => {
        if (!props.pending) props.onClose();
      }}
      open={props.open}
      title={t("workspace.modal.addMemberTitle")}
      width="invite"
    >
      <ServerAddMemberForm {...props} inputRef={inputRef} />
    </ServerModalShell>
  );
}

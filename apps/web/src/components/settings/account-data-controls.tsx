"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, ShieldAlert, Trash2 } from "lucide-react";
import { signOut } from "next-auth/react";

import {
  deleteOwnAccount,
  downloadAccountDataExport,
  fetchAccountDeletionPreflight,
  openAccountDataSettingsInExternalBrowser,
  reauthenticateAccountDeletion,
  requestAccountDeletionEmailReauth,
} from "@/lib/account/privacy-client";
import { consumeAccountDeletionReauthToken } from "@/lib/account/account-deletion-reauth-session";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

type Translate = (key: string, values?: Record<string, number | string>) => string;

export function AccountDataControls({ t }: { t: Translate }) {
  const [exportStatus, setExportStatus] = useState<"idle" | "downloading" | "success" | "error">(
    "idle",
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [preflight, setPreflight] = useState<Awaited<
    ReturnType<typeof fetchAccountDeletionPreflight>
  > | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const deletePendingRef = useRef(false);

  const startExport = async () => {
    if (exportStatus === "downloading") return;
    setExportStatus("downloading");
    try {
      const { blob, filename } = await downloadAccountDataExport();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = filename;
      anchor.href = url;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportStatus("success");
    } catch {
      setExportStatus("error");
    }
  };

  const openDelete = async () => {
    setDeleteOpen(true);
    setFeedback(null);
    try {
      setPreflight(await fetchAccountDeletionPreflight());
    } catch {
      setFeedback(t("settings.account.data.delete.preflightError"));
    }
  };

  const reauthenticate = async () => {
    setFeedback(null);
    try {
      if (preflight?.reauthMethod === "PASSWORD") {
        setReauthToken(await reauthenticateAccountDeletion(password));
        setFeedback(t("settings.account.data.delete.reauthReady"));
      } else {
        await requestAccountDeletionEmailReauth();
        setFeedback(t("settings.account.data.delete.emailSent"));
      }
    } catch {
      setFeedback(t("settings.account.data.delete.reauthError"));
    }
  };

  const executeDelete = async () => {
    if (!reauthToken || deletePendingRef.current) return;
    deletePendingRef.current = true;
    setDeletePending(true);
    try {
      await deleteOwnAccount(reauthToken);
      await signOut({ redirectTo: "/login" });
    } catch {
      deletePendingRef.current = false;
      setDeletePending(false);
      setFinalConfirmOpen(false);
      setFeedback(t("settings.account.data.delete.error"));
    }
  };

  useEffect(() => {
    let active = true;
    const token = consumeAccountDeletionReauthToken(window.sessionStorage);
    if (!token) return;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setReauthToken(token);
      setDeleteOpen(true);
      try {
        const result = await fetchAccountDeletionPreflight();
        if (active) setPreflight(result);
      } catch {
        if (active) setFeedback(t("settings.account.data.delete.preflightError"));
      }
    });
    return () => {
      active = false;
    };
  }, [t]);

  return (
    <div className="space-y-3" data-testid="account-data-controls">
      <section
        className="rounded-[1.25rem] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] p-3 sm:p-4"
        data-testid="account-data-export-card"
      >
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-4 w-4 text-[hsl(var(--primary))]" />
          <div className="flex-1">
            <h3 className="text-sm font-extrabold text-app-foreground">
              {t("settings.account.data.export.title")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              {t("settings.account.data.export.description")}
            </p>
            <button
              className="mt-3 min-h-10 rounded-xl bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50"
              disabled={exportStatus === "downloading"}
              onClick={() => void startExport()}
              type="button"
            >
              {t(
                exportStatus === "downloading"
                  ? "settings.account.data.export.downloading"
                  : "settings.account.data.export.action",
              )}
            </button>
            {exportStatus === "success" || exportStatus === "error" ? (
              <p aria-live="polite" className="mt-2 text-xs text-app-muted">
                {t(`settings.account.data.export.${exportStatus}`)}
              </p>
            ) : null}
            {exportStatus === "error" && isWhisprDesktopRuntime() ? (
              <button
                className="mt-2 min-h-10 rounded-xl border px-4 text-xs font-bold"
                onClick={() => openAccountDataSettingsInExternalBrowser()}
                type="button"
              >
                {t("settings.account.data.export.openBrowser")}
              </button>
            ) : null}
          </div>
        </div>
      </section>
      <section
        className="rounded-[1.25rem] border border-rose-500/30 bg-rose-500/5 p-3 sm:p-4"
        data-testid="account-delete-card"
      >
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-4 w-4 text-rose-600" />
          <div className="flex-1">
            <h3 className="text-sm font-extrabold text-app-foreground">
              {t("settings.account.data.delete.title")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              {t("settings.account.data.delete.description")}
            </p>
            <button
              className="mt-3 min-h-10 rounded-xl border border-rose-500/35 px-4 text-xs font-bold text-rose-600"
              onClick={() => void openDelete()}
              type="button"
            >
              {t("settings.account.data.delete.open")}
            </button>
          </div>
        </div>
      </section>
      {deleteOpen ? (
        <div
          aria-labelledby="account-delete-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[hsl(var(--surface))] p-5 shadow-2xl">
            <div className="flex gap-3">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              <div>
                <h2 className="font-extrabold text-app-foreground" id="account-delete-title">
                  {t("settings.account.data.delete.dialogTitle")}
                </h2>
                <p className="mt-1 text-xs text-app-muted">
                  {t("settings.account.data.delete.consequences")}
                </p>
              </div>
            </div>
            {preflight?.ownedServers.length ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 p-3">
                <p className="text-xs font-bold">{t("settings.account.data.delete.blocked")}</p>
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {preflight.ownedServers.map((server) => (
                    <li key={server.id}>{server.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preflight?.canDelete ? (
              <>
                {preflight.reauthMethod === "PASSWORD" ? (
                  <label className="mt-4 block text-xs font-bold">
                    {t("settings.account.data.delete.password")}
                    <input
                      autoComplete="current-password"
                      className="mt-1 min-h-11 w-full rounded-xl border bg-transparent px-3"
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      value={password}
                    />
                  </label>
                ) : (
                  <p className="mt-4 text-xs">{t("settings.account.data.delete.emailReauth")}</p>
                )}
                <button
                  className="mt-3 min-h-10 rounded-xl border px-4 text-xs font-bold"
                  disabled={preflight.reauthMethod === "PASSWORD" && !password}
                  onClick={() => void reauthenticate()}
                  type="button"
                >
                  {t("settings.account.data.delete.reauth")}
                </button>
                <label className="mt-4 block text-xs font-bold">
                  {t("settings.account.data.delete.confirmation", {
                    phrase: preflight.confirmationPhrase,
                  })}
                  <input
                    className="mt-1 min-h-11 w-full rounded-xl border bg-transparent px-3"
                    onChange={(event) => setConfirmation(event.target.value)}
                    value={confirmation}
                  />
                </label>
                <button
                  className="mt-4 min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                  disabled={
                    !reauthToken || confirmation !== preflight.confirmationPhrase || deletePending
                  }
                  onClick={() => setFinalConfirmOpen(true)}
                  type="button"
                >
                  {t("settings.account.data.delete.action")}
                </button>
              </>
            ) : null}
            {feedback ? (
              <p aria-live="polite" className="mt-3 text-xs">
                {feedback}
              </p>
            ) : null}
            <button
              className="mt-4 min-h-10 px-4 text-xs font-bold"
              disabled={deletePending}
              onClick={() => setDeleteOpen(false)}
              type="button"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      {finalConfirmOpen ? (
        <div
          aria-label={t("settings.account.data.delete.finalTitle")}
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4"
          role="alertdialog"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--surface))] p-5">
            <h2 className="font-extrabold">{t("settings.account.data.delete.finalTitle")}</h2>
            <p className="mt-2 text-xs">{t("settings.account.data.delete.finalDescription")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={deletePending}
                onClick={() => setFinalConfirmOpen(false)}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button
                className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white"
                disabled={deletePending}
                onClick={() => void executeDelete()}
                type="button"
              >
                {t(
                  deletePending
                    ? "settings.account.data.delete.deleting"
                    : "settings.account.data.delete.finalAction",
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

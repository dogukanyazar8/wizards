"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/components/providers/locale-provider";
import { storeAccountDeletionReauthToken } from "@/lib/account/account-deletion-reauth-session";

export function AccountDeletionReauthConfirmation({ token }: { token: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/auth/reauth/email-confirm", {
      body: JSON.stringify({ purpose: "account-delete", token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("reauth failed");
        const body = (await response.json()) as { reauthToken?: unknown };
        if (typeof body.reauthToken !== "string") throw new Error("reauth token missing");
        storeAccountDeletionReauthToken(window.sessionStorage, body.reauthToken);
        window.location.replace("/settings#account-delete");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError")) setFailed(true);
      });
    return () => controller.abort();
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <section className="w-full rounded-2xl border bg-[hsl(var(--surface))] p-6">
        <h1 className="text-xl font-extrabold text-app-foreground">
          {t("auth.reauthEmail.title")}
        </h1>
        <p aria-live="polite" className="mt-3 text-sm text-app-muted">
          {failed
            ? t("settings.account.data.delete.reauthError")
            : t("settings.account.data.delete.reauthChecking")}
        </p>
        {failed ? (
          <Link
            className="mt-4 inline-flex min-h-10 items-center font-bold text-[hsl(var(--primary))]"
            href="/settings"
          >
            {t("settings.account.data.delete.return")}
          </Link>
        ) : null}
      </section>
    </main>
  );
}

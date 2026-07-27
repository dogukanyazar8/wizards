"use client";

import React, { useState, useTransition } from "react";
import { Button } from "@wizards/ui";
import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminPill,
  AdminToggle,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt, formatAdminPercent } from "@/components/admin/format/admin-format";
import type { AdminFeatureFlag } from "@/lib/feature-flags/service";

const PLATFORM_LABEL: Record<string, string> = {
  DESKTOP: "Masaüstü",
  MOBILE: "Mobil",
  UNKNOWN: "Bilinmiyor",
  WEB: "Web",
};

async function patchFlag(key: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/v1/admin/flags/${encodeURIComponent(key)}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error("Bayrak güncellenemedi.");
  }
}

/**
 * Turning a flag off is one click — a kill switch that asks questions is not a
 * kill switch. Turning one on asks for confirmation, because that is the
 * direction that exposes something new to people.
 */
function AdminFlagRow({ canWrite, flag }: { canWrite: boolean; flag: AdminFeatureFlag }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(enabled: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await patchFlag(flag.key, { enabled });
        setConfirming(false);
        window.location.reload();
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Bayrak güncellenemedi.");
      }
    });
  }

  return (
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-app-foreground text-[15px] font-semibold">{flag.key}</p>
            {flag.clientTypes.length === 0 ? (
              <AdminPill>Tüm platformlar</AdminPill>
            ) : (
              flag.clientTypes.map((clientType) => (
                <AdminPill key={clientType} tone="primary">
                  {PLATFORM_LABEL[clientType] ?? clientType}
                </AdminPill>
              ))
            )}
            <AdminPill tone={flag.rolloutPercent >= 100 ? "success" : "warning"}>
              {formatAdminPercent(flag.rolloutPercent)} dağıtım
            </AdminPill>
          </div>
          <p className="text-app-muted mt-1 text-[12.5px]">{flag.description ?? "Açıklama yok."}</p>
          <p className="text-app-soft mt-1 text-[11.5px]">
            Son değişiklik: {flag.updatedBy ? `@${flag.updatedBy.username}` : "sistem"}
          </p>
          {error ? <p className="mt-1 text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}
        </div>
        {canWrite ? (
          <div className="flex flex-col items-end gap-2">
            <AdminToggle
              checked={flag.enabled}
              disabled={pending}
              label={flag.enabled ? "Açık" : "Kapalı"}
              onChange={() => {
                if (flag.enabled) {
                  submit(false);
                  return;
                }

                setConfirming(true);
              }}
            />
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-app-muted text-[12px]">Herkese açılsın mı?</span>
                <Button disabled={pending} onClick={() => submit(true)} size="sm" type="button">
                  Aç
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Vazgeç
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <AdminPill tone={flag.enabled ? "success" : "neutral"}>
            {flag.enabled ? "Açık" : "Kapalı"}
          </AdminPill>
        )}
      </div>
    </AdminCard>
  );
}

export function AdminFlags({
  canWrite,
  capabilities,
  flags,
}: {
  canWrite: boolean;
  capabilities: ReadonlyArray<{ capability: string; roles: readonly string[] }>;
  flags: AdminFeatureFlag[];
}) {
  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Kill switch ve kademeli dağıtım" title="Özellik Bayrakları" />

      {flags.length === 0 ? (
        <AdminCard>
          <p className="text-app-muted text-[13px]">Tanımlı bayrak yok.</p>
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <AdminFlagRow canWrite={canWrite} flag={flag} key={flag.key} />
          ))}
        </div>
      )}

      <AdminCard>
        <AdminCardHeader
          subtitle="Salt okunur: yetkiler koddan gelir, panelden değiştirilmez."
          title="Roller & İzinler"
        />
        <div className="mt-3 space-y-1.5">
          {capabilities.map((entry) => (
            <div className="flex flex-wrap items-center gap-2" key={entry.capability}>
              <span className="text-app-foreground text-[12.5px] font-semibold">
                {entry.capability}
              </span>
              <span className="text-app-muted text-[12px]">
                {entry.roles.join(", ")} · {formatAdminInt(entry.roles.length)} rol
              </span>
            </div>
          ))}
        </div>
      </AdminCard>
    </section>
  );
}

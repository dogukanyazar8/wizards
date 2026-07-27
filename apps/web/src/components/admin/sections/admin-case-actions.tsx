"use client";

import React, { useState, useTransition } from "react";
import { Button } from "@wizards/ui";
import { AdminCard } from "@/components/admin/kit/admin-primitives";

export type ModerationActionKind = "ban" | "dismiss" | "warn";

const ACTION_COPY: Record<ModerationActionKind, { cta: string; title: string }> = {
  ban: { cta: "Hesabı engelle", title: "Hesabı engelle" },
  dismiss: { cta: "Vakayı reddet", title: "Vakayı reddet" },
  warn: { cta: "Uyarı gönder", title: "Uyarı gönder" },
};

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "İşlem tamamlanamadı.");
  }

  return response.json();
}

export function AdminCaseClaimButton({ caseId }: { caseId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await postJson(`/api/v1/admin/moderation/cases/${caseId}/claim`);
              window.location.reload();
            } catch (claimError) {
              setError(claimError instanceof Error ? claimError.message : "İşlem tamamlanamadı.");
            }
          });
        }}
        size="sm"
        type="button"
      >
        Üstlen
      </Button>
      {error ? <span className="text-[11px] text-[hsl(var(--danger))]">{error}</span> : null}
    </span>
  );
}

/**
 * Every state change carries a written reason: the modal cannot submit without
 * one, mirroring the API's 400.
 */
export function AdminCaseActionForm({
  action,
  caseId,
  onDone,
}: {
  action: ModerationActionKind;
  caseId: string;
  onDone?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resolution, setResolution] = useState("");
  const copy = ACTION_COPY[action];

  return (
    <div className="space-y-3">
      <label className="text-app-muted block text-[12px] font-semibold" htmlFor={`res-${action}`}>
        Gerekçe (zorunlu)
      </label>
      <textarea
        className="app-input min-h-24 w-full rounded-[12px] border p-3 text-sm outline-hidden"
        id={`res-${action}`}
        onChange={(event) => setResolution(event.target.value)}
        placeholder="Kararın gerekçesini yaz. Bu not vaka dosyasına ve denetim kaydına işlenir."
        required
        value={resolution}
      />
      {error ? <p className="text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !resolution.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await postJson(`/api/v1/admin/moderation/cases/${caseId}/action`, {
                  action,
                  resolution: resolution.trim(),
                });
                setResolution("");
                onDone?.();
                window.location.reload();
              } catch (actionError) {
                setError(
                  actionError instanceof Error ? actionError.message : "İşlem tamamlanamadı.",
                );
              }
            });
          }}
          {...(action === "ban"
            ? {
                className:
                  "bg-[hsl(var(--danger))] text-[hsl(var(--primary-foreground))] hover:opacity-90",
              }
            : {})}
          size="sm"
          type="button"
        >
          {copy.cta}
        </Button>
        {onDone ? (
          <Button disabled={pending} onClick={onDone} size="sm" type="button" variant="outline">
            Vazgeç
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Queue-level dismissal still opens the reason box: no one-click closures. */
export function AdminCaseDismissButton({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <Button
        onClick={() => setOpen((current) => !current)}
        size="sm"
        type="button"
        variant="outline"
      >
        Reddet
      </Button>
      {open ? (
        <AdminCard className="w-72">
          <AdminCaseActionForm action="dismiss" caseId={caseId} onDone={() => setOpen(false)} />
        </AdminCard>
      ) : null}
    </span>
  );
}

export function AdminCaseActionMenu({ caseId }: { caseId: string }) {
  const [openAction, setOpenAction] = useState<ModerationActionKind | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ACTION_COPY) as ModerationActionKind[]).map((action) => (
          <Button
            key={action}
            onClick={() => setOpenAction((current) => (current === action ? null : action))}
            size="sm"
            type="button"
            variant={openAction === action ? "default" : "outline"}
          >
            {ACTION_COPY[action].title}
          </Button>
        ))}
      </div>
      {openAction ? (
        <AdminCard className="space-y-3">
          <AdminCaseActionForm
            action={openAction}
            caseId={caseId}
            onDone={() => setOpenAction(null)}
          />
        </AdminCard>
      ) : null}
    </div>
  );
}

/** Only offered for evidence that still points at a live message. */
export function AdminCaseDeleteMessageButton({
  caseId,
  evidenceId,
}: {
  caseId: string;
  evidenceId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await postJson(`/api/v1/admin/moderation/cases/${caseId}/evidence/${evidenceId}`, {
                action: "delete_message",
              });
              window.location.reload();
            } catch (deleteError) {
              setError(deleteError instanceof Error ? deleteError.message : "Mesaj silinemedi.");
            }
          });
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        Mesaj sil
      </Button>
      {error ? <span className="text-[11px] text-[hsl(var(--danger))]">{error}</span> : null}
    </span>
  );
}

/** Shown only while a case sits in APPEALED. */
export function AdminCaseAppealForm({ caseId }: { caseId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(resolution: "granted" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await postJson(`/api/v1/admin/moderation/cases/${caseId}/appeal`, {
          note: note.trim(),
          resolution,
        });
        window.location.reload();
      } catch (appealError) {
        setError(appealError instanceof Error ? appealError.message : "İtiraz sonuçlandırılamadı.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        className="app-input min-h-20 w-full rounded-[12px] border p-3 text-sm outline-hidden"
        onChange={(event) => setNote(event.target.value)}
        placeholder="İtiraz kararının gerekçesi"
        value={note}
      />
      {error ? <p className="text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !note.trim()}
          onClick={() => decide("granted")}
          size="sm"
          type="button"
        >
          İtirazı kabul et
        </Button>
        <Button
          disabled={pending || !note.trim()}
          onClick={() => decide("rejected")}
          size="sm"
          type="button"
          variant="outline"
        >
          İtirazı reddet
        </Button>
      </div>
    </div>
  );
}

export function AdminCaseNoteForm({ caseId }: { caseId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <textarea
        className="app-input min-h-20 w-full rounded-[12px] border p-3 text-sm outline-hidden"
        onChange={(event) => setBody(event.target.value)}
        placeholder="Vaka notu ekle"
        value={body}
      />
      {error ? <p className="text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}
      <Button
        disabled={pending || !body.trim()}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await postJson(`/api/v1/admin/moderation/cases/${caseId}/note`, {
                body: body.trim(),
              });
              setBody("");
              window.location.reload();
            } catch (noteError) {
              setError(noteError instanceof Error ? noteError.message : "Not eklenemedi.");
            }
          });
        }}
        size="sm"
        type="button"
      >
        Not ekle
      </Button>
    </div>
  );
}

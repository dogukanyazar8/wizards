"use client";

import React, { useState, useTransition } from "react";
import { Button } from "@wizards/ui";

export function SuspendedAppealForm() {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="text-app-foreground text-[14px]">
        İtirazın alındı. Sonuç bildirildiğinde e-posta adresine ulaşacağız.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        className="app-input min-h-32 w-full rounded-[12px] border p-3 text-sm outline-hidden"
        onChange={(event) => setBody(event.target.value)}
        placeholder="Kararın neden yanlış olduğunu anlat."
        value={body}
      />
      {error ? <p className="text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}
      <Button
        disabled={pending || !body.trim()}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const response = await fetch("/api/v1/moderation/appeal", {
              body: JSON.stringify({ body: body.trim() }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            });

            if (response.ok) {
              setSent(true);
              return;
            }

            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            setError(payload?.error ?? "İtiraz gönderilemedi.");
          });
        }}
        type="button"
      >
        İtiraz gönder
      </Button>
    </div>
  );
}

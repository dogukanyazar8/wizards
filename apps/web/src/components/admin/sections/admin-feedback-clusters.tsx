"use client";

import React, { useState, useTransition } from "react";
import { Button } from "@wizards/ui";
import { AdminCard, AdminCardHeader, AdminPill } from "@/components/admin/kit/admin-primitives";
import { formatAdminInt, formatAdminPercent } from "@/components/admin/format/admin-format";
import type { AdminClusterSuggestion } from "@/lib/feedback/cluster-service";

const TOPIC_LABEL: Record<string, string> = {
  BUG: "Hata",
  OTHER: "Diğer",
  PERFORMANCE: "Performans",
  SUGGESTION: "Öneri",
  VOICE: "Ses",
};

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("İşlem tamamlanamadı.");
  }
}

/**
 * A suggestion is not a decision: accepting asks for the roadmap item to link
 * to, and rejecting only closes the proposal — neither happens automatically.
 */
function ClusterCard({ suggestion }: { suggestion: AdminClusterSuggestion }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [roadmapItemId, setRoadmapItemId] = useState("");

  function decide(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await post(`/api/v1/admin/feedback/clusters/${suggestion.id}`, body);
        window.location.reload();
      } catch (decisionError) {
        setError(decisionError instanceof Error ? decisionError.message : "İşlem tamamlanamadı.");
      }
    });
  }

  return (
    <AdminCard>
      <div className="flex flex-wrap items-center gap-2">
        <AdminPill tone="primary">{TOPIC_LABEL[suggestion.topic] ?? suggestion.topic}</AdminPill>
        <AdminPill>{formatAdminInt(suggestion.memberCount)} geri bildirim</AdminPill>
        <AdminPill tone="success">benzerlik {formatAdminPercent(suggestion.score * 100)}</AdminPill>
      </div>

      <ul className="mt-3 space-y-1.5">
        {suggestion.members.map((member) => (
          <li className="text-app-muted text-[12.5px]" key={member.id}>
            <span className="text-app-soft font-semibold">WSP-{member.publicNumber}</span> ·{" "}
            {member.preview}
          </li>
        ))}
      </ul>

      {error ? <p className="mt-2 text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="app-input h-9 min-w-[220px] rounded-[12px] border px-3 text-sm outline-hidden"
          onChange={(event) => setRoadmapItemId(event.target.value)}
          placeholder="Yol haritası öğesi kimliği"
          value={roadmapItemId}
        />
        <Button
          disabled={pending || !roadmapItemId.trim()}
          onClick={() => decide({ decision: "accept", roadmapItemId: roadmapItemId.trim() })}
          size="sm"
          type="button"
        >
          Kabul et
        </Button>
        <Button
          disabled={pending}
          onClick={() => decide({ decision: "reject" })}
          size="sm"
          type="button"
          variant="outline"
        >
          Reddet
        </Button>
      </div>
    </AdminCard>
  );
}

export function AdminFeedbackClusters({ suggestions }: { suggestions: AdminClusterSuggestion[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-3">
      <AdminCard>
        <AdminCardHeader
          subtitle="Benzer geri bildirimler tek yol haritası öğesine bağlanmak üzere önerilir."
          title="Küme Önerileri"
        />
        <div className="mt-3">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await post("/api/v1/admin/feedback/clusters");
                window.location.reload();
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Yeniden hesapla
          </Button>
        </div>
      </AdminCard>

      {suggestions.length === 0 ? (
        <AdminCard>
          <p className="text-app-muted text-[13px]">Bekleyen küme önerisi yok.</p>
        </AdminCard>
      ) : (
        suggestions.map((suggestion) => <ClusterCard key={suggestion.id} suggestion={suggestion} />)
      )}
    </section>
  );
}

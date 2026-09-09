"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@wizards/ui";

import {
  AdminCard,
  AdminGridTable,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import type { AdminDownloadArtifact } from "@/lib/downloads/admin-download-service";

/**
 * SPEC-INDIRME §B kataloğunun yönetim yüzeyi.
 *
 * Katalog DB kaynaklı (K1); bu tablo boşsa indirme penceresi de boş görünür.
 * Yayınlama ayrı bir eylem: taslak satır hiçbir kullanıcı ucunda görünmez.
 */

const PLATFORM_LABELS: Record<AdminDownloadArtifact["platform"], string> = {
  ANDROID: "Android",
  IOS: "iOS",
  LINUX: "Linux",
  MACOS: "macOS",
  WINDOWS: "Windows",
};

const CHANNEL_LABELS: Record<AdminDownloadArtifact["channel"], string> = {
  BETA: "BETA",
  STABLE: "PROD",
  UAT: "UAT",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value));
}

export function getDownloadPublishLabel(artifact: AdminDownloadArtifact) {
  return artifact.publishedAt === null ? "Yayınla" : "Yayından kaldır";
}

export function AdminDownloads({ artifacts }: { artifacts: AdminDownloadArtifact[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function togglePublished(artifact: AdminDownloadArtifact) {
    setBusyId(artifact.id);
    setError(null);

    const response = await fetch(`/api/v1/admin/downloads/${artifact.id}`, {
      body: JSON.stringify({ published: artifact.publishedAt === null }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Paket durumu değiştirilemedi.");
      setBusyId(null);
      return;
    }

    setBusyId(null);
    window.location.reload();
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        subtitle="İndirme penceresini besleyen masaüstü ve mobil paketler"
        title="İndirme Paketleri"
      />

      {error ? (
        <p aria-live="polite" className="text-app-danger text-sm">
          {error}
        </p>
      ) : null}

      <AdminCard>
        {artifacts.length === 0 ? (
          <p className="text-app-muted p-4 text-sm">
            Henüz paket eklenmedi. Katalog boşken indirme penceresi de boş görünür.
          </p>
        ) : (
          <AdminGridTable
            columns="90px 110px 150px minmax(0,1fr) 190px 140px"
            headers={["Ortam", "Platform", "Sürüm", "Bağlantı", "Durum", ""]}
            rows={artifacts.map((artifact) => ({
              cells: [
                <AdminPill
                  key="channel"
                  tone={artifact.channel === "STABLE" ? "success" : "warning"}
                >
                  {CHANNEL_LABELS[artifact.channel]}
                </AdminPill>,
                <span key="platform">{PLATFORM_LABELS[artifact.platform]}</span>,
                <span key="version">
                  {artifact.buildLabel === null
                    ? artifact.versionLabel
                    : `${artifact.versionLabel} (${artifact.buildLabel})`}
                </span>,
                <span className="text-app-muted truncate text-xs" key="url" title={artifact.url}>
                  {artifact.url}
                </span>,
                <AdminPill
                  key="status"
                  tone={artifact.publishedAt === null ? "neutral" : "success"}
                >
                  {artifact.publishedAt === null
                    ? "Taslak"
                    : `Yayında · ${formatDate(artifact.publishedAt)}`}
                </AdminPill>,
                <Button
                  key="action"
                  onClick={() => void togglePublished(artifact)}
                  size="sm"
                  variant="outline"
                >
                  {busyId === artifact.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    getDownloadPublishLabel(artifact)
                  )}
                </Button>,
              ],
              id: artifact.id,
            }))}
          />
        )}
      </AdminCard>
    </section>
  );
}

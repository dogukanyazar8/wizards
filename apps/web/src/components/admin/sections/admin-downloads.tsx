"use client";

import React, { useRef, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { Button } from "@wizards/ui";

import {
  AdminCard,
  AdminGridTable,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import type {
  AdminDownloadArtifact,
  AdminDownloadArtifactInput,
  AdminDownloadArtifactPatch,
} from "@/lib/downloads/admin-download-service";
import { writeAdminDownloadArtifact } from "@/lib/downloads/admin-download-client";
import { AdminDownloadForm } from "./admin-download-form";

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
  STABLE: "PROD",
  UAT: "UAT",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value));
}

export function getDownloadPublishLabel(artifact: AdminDownloadArtifact) {
  return artifact.publishedAt === null ? "Yayınla" : "Yayından kaldır";
}

export function AdminDownloads({
  artifacts,
  canWrite,
}: {
  artifacts: AdminDownloadArtifact[];
  canWrite: boolean;
}) {
  const [items, setItems] = useState(artifacts);
  const [editor, setEditor] = useState<AdminDownloadArtifact | null | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function persist(
    id: string | null,
    input: AdminDownloadArtifactInput | AdminDownloadArtifactPatch,
  ) {
    if (!canWrite || inFlight.current) throw new Error("İşlem şu anda kullanılamıyor.");
    inFlight.current = true;
    setBusyId(id ?? "new");
    setError(null);
    setMessage(null);
    try {
      const saved = await writeAdminDownloadArtifact(id, input);
      setItems((current) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort(
          (left, right) =>
            left.channel.localeCompare(right.channel) ||
            left.platform.localeCompare(right.platform),
        ),
      );
      return saved;
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }

  async function save(input: AdminDownloadArtifactInput) {
    const saved = await persist(editor?.id ?? null, input);
    setEditor(undefined);
    setMessage(
      saved.publishedAt
        ? "Yayındaki paket güncellendi."
        : "Paket taslak olarak kaydedildi. Yayınla ile kullanıcılara açabilirsiniz.",
    );
  }

  async function togglePublished(artifact: AdminDownloadArtifact) {
    try {
      const saved = await persist(artifact.id, { published: artifact.publishedAt === null });
      setMessage(saved.publishedAt ? "Paket yayınlandı." : "Paket yayından kaldırıldı.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Paket durumu değiştirilemedi.",
      );
    }
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        actions={
          canWrite ? (
            <Button
              disabled={busyId !== null || editor !== undefined}
              onClick={() => {
                setError(null);
                setMessage(null);
                setEditor(null);
              }}
              type="button"
            >
              <PackagePlus aria-hidden="true" className="mr-2 h-4 w-4" />
              Paket Ekle
            </Button>
          ) : undefined
        }
        subtitle="İndirme penceresini besleyen masaüstü ve mobil paketler"
        title="İndirme Paketleri"
      />

      {error ? (
        <p role="alert" className="text-app-danger text-sm">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-app-muted text-sm" role="status">
          {message}
        </p>
      ) : null}
      {canWrite && editor !== undefined ? (
        <AdminDownloadForm
          artifact={editor}
          busy={busyId !== null}
          key={editor?.id ?? "new"}
          onCancel={() => setEditor(undefined)}
          onSave={save}
        />
      ) : null}

      <AdminCard>
        {items.length === 0 ? (
          <p className="text-app-muted p-4 text-sm">
            Henüz paket eklenmedi. Katalog boşken indirme penceresi de boş görünür.
          </p>
        ) : (
          <AdminGridTable
            columns="80px 90px 120px minmax(120px,1fr) 170px 210px"
            headers={["Ortam", "Platform", "Sürüm", "Bağlantı", "Durum", ""]}
            rows={items.map((artifact) => ({
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
                artifact.releaseId ? (
                  <a
                    className="text-[hsl(var(--primary))] text-sm"
                    href={`/admin/releases/${artifact.releaseId}`}
                    key="release"
                  >
                    Yayını yönet
                  </a>
                ) : canWrite ? (
                  <div className="flex flex-wrap gap-2" key="action">
                    <Button
                      disabled={busyId !== null || editor !== undefined}
                      onClick={() => {
                        setError(null);
                        setMessage(null);
                        setEditor(artifact);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Düzenle
                    </Button>
                    <Button
                      disabled={busyId !== null || editor !== undefined}
                      onClick={() => void togglePublished(artifact)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {busyId === artifact.id ? (
                        <Loader2 aria-hidden="true" className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {getDownloadPublishLabel(artifact)}
                    </Button>
                  </div>
                ) : (
                  <span className="text-app-muted text-xs" key="readonly">
                    Salt okunur
                  </span>
                ),
              ],
              id: artifact.id,
            }))}
          />
        )}
      </AdminCard>
    </section>
  );
}

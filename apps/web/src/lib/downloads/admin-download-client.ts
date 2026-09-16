import { AdminDownloadArtifactInputSchema } from "@/lib/admin/content-schemas";
import type {
  AdminDownloadArtifact,
  AdminDownloadArtifactInput,
  AdminDownloadArtifactPatch,
} from "./admin-download-service";

const FIELD_LABELS: Record<string, string> = {
  buildLabel: "Derleme numarası",
  channel: "Ortam",
  delivery: "Dağıtım türü",
  extensionLabelEn: "Paket etiketi (EN)",
  extensionLabelTr: "Paket etiketi (TR)",
  metaLabelEn: "Platform açıklaması (EN)",
  metaLabelTr: "Platform açıklaması (TR)",
  platform: "Platform",
  releasedAt: "Sürüm tarihi",
  sha256: "SHA-256",
  sizeBytes: "Dosya boyutu",
  url: "HTTPS bağlantısı",
  versionLabel: "Sürüm",
};

export function toDownloadDateTimeInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, -1);
}

export function readAdminDownloadForm(data: FormData): AdminDownloadArtifactInput {
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const date = new Date(text("releasedAt"));
  const result = AdminDownloadArtifactInputSchema.safeParse({
    buildLabel: text("buildLabel") || null,
    channel: text("channel"),
    delivery: text("delivery"),
    extensionLabelEn: text("extensionLabelEn"),
    extensionLabelTr: text("extensionLabelTr"),
    metaLabelEn: text("metaLabelEn"),
    metaLabelTr: text("metaLabelTr"),
    platform: text("platform"),
    releasedAt: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
    sha256: text("sha256").toLowerCase() || null,
    sizeBytes: text("sizeBytes") === "" ? null : Number(text("sizeBytes")),
    url: text("url"),
    versionLabel: text("versionLabel"),
  });
  if (!result.success) {
    const field = String(result.error.issues[0]?.path[0] ?? "");
    throw new Error(
      field === "url"
        ? "Geçerli bir HTTPS bağlantısı girin."
        : field === "sizeBytes"
          ? "Dosya boyutunu bayt cinsinden pozitif, güvenli bir tam sayı olarak girin."
          : field === "sha256"
            ? "SHA-256 değeri 64 onaltılık karakter içermeli."
            : `${FIELD_LABELS[field] ?? "Form"} alanını kontrol edin.`,
    );
  }
  return result.data;
}

export async function writeAdminDownloadArtifact(
  id: string | null,
  input: AdminDownloadArtifactInput | AdminDownloadArtifactPatch,
): Promise<AdminDownloadArtifact> {
  let response: Response;
  try {
    response = await fetch(
      id === null ? "/api/v1/admin/downloads" : `/api/v1/admin/downloads/${encodeURIComponent(id)}`,
      {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: id === null ? "POST" : "PATCH",
      },
    );
  } catch {
    throw new Error("Bağlantı kurulamadı. Bilgileriniz korundu; yeniden deneyin.");
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: "Paket bilgileri geçersiz. Alanları kontrol edin.",
      401: "Oturumunuz sona ermiş. Yeniden giriş yapın.",
      403: "İndirme paketlerini değiştirme yetkiniz yok.",
      404: "Paket bulunamadı. Listeyi yenileyin.",
      409: "Bu ortam ve platform için zaten bir paket var. Mevcut kaydı düzenleyin.",
      429: "Çok fazla istek gönderildi. Biraz bekleyip yeniden deneyin.",
    };
    throw new Error(messages[response.status] ?? "Paket kaydedilemedi. Yeniden deneyin.");
  }
  const payload = (await response.json().catch(() => null)) as {
    artifact?: AdminDownloadArtifact;
  } | null;
  if (!payload?.artifact?.id) {
    throw new Error("Sunucu yanıtı doğrulanamadı. Yeniden denemeden önce listeyi yenileyin.");
  }
  return payload.artifact;
}

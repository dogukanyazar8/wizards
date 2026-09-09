import type { MobileBugReportCategory } from "@wizards/types";

import {
  REPORT_BODY_MAX_LENGTH,
  REPORT_BODY_MIN_LENGTH,
  REPORT_COUNTER_WARNING_THRESHOLD,
} from "@/lib/support/report-metrics";

/**
 * "Sorun bildir" penceresinin saf durum modeli (SPEC §A.3–§A.9).
 *
 * React'sız tutuluyor: pencerenin kararlarının hepsi — buton ne zaman pasif,
 * sayaç hangi tonda, alt bar hangi notu söylüyor, X onay soruyor mu — burada
 * test edilebilir fonksiyonlar. Bileşen yalnız çizer.
 */

/** SPEC §A.3, tasarımdaki sırayla. */
export const REPORT_CATEGORIES = [
  "voice",
  "chat",
  "notification",
  "performance",
  "other",
] as const satisfies readonly MobileBugReportCategory[];

/**
 * Referans akışında bu tek eksen: onay ve tam ekran katmanları formun
 * **üstünde** çizilir ama aynı anda ikisi birden açılamaz.
 */
export type BugReportPhase = "form" | "busy" | "done" | "discard" | "lightbox";

export type BugReportScreenshotState = "none" | "ready" | "uploading" | "failed";

export type BugReportErrorKind = "validate" | "submit" | "attach";

export type BugReportDraft = {
  readonly body: string;
  readonly category: MobileBugReportCategory | null;
  readonly error: BugReportErrorKind | null;
  readonly includesDeviceInfo: boolean;
  readonly includesLogs: boolean;
  readonly includesScreenshot: boolean;
  readonly phase: BugReportPhase;
  readonly screenshotState: BugReportScreenshotState;
};

/** SPEC §A.5 varsayılanları: günlükler açık, ekran görüntüsü ve cihaz bilgisi kapalı. */
export function createBugReportDraft(): BugReportDraft {
  return {
    body: "",
    category: null,
    error: null,
    includesDeviceInfo: false,
    includesLogs: true,
    includesScreenshot: false,
    phase: "form",
    screenshotState: "none",
  };
}

export type BugReportValidationReason = "body-short" | "category";

export type BugReportValidation =
  { readonly valid: true } | { readonly reason: BugReportValidationReason; readonly valid: false };

export function validateBugReportDraft(input: {
  readonly body: string;
  readonly category: MobileBugReportCategory | null;
}): BugReportValidation {
  if (input.category === null) {
    return { reason: "category", valid: false };
  }

  if (input.body.trim().length < REPORT_BODY_MIN_LENGTH) {
    return { reason: "body-short", valid: false };
  }

  return { valid: true };
}

/** SPEC §A.4 — giriş 1000 karakterde kesilir, hata verilmez. */
export function clampBugReportBody(value: string): string {
  return value.slice(0, REPORT_BODY_MAX_LENGTH);
}

export type BugReportCounterTone = "danger" | "muted" | "warning";

/** ≤900 `text-muted` · >900 `warning` · =1000 `danger`. */
export function bugReportCounterTone(length: number): BugReportCounterTone {
  if (length >= REPORT_BODY_MAX_LENGTH) {
    return "danger";
  }

  return length > REPORT_COUNTER_WARNING_THRESHOLD ? "warning" : "muted";
}

export function canSubmitBugReport(input: {
  readonly body: string;
  readonly category: MobileBugReportCategory | null;
  readonly offline: boolean;
  readonly phase: BugReportPhase;
}): boolean {
  return validateBugReportDraft(input).valid && !input.offline && input.phase !== "busy";
}

export type BugReportFooterNote = {
  readonly key: string;
  readonly params?: Readonly<Record<string, number | string>>;
  readonly tone: "muted" | "warning";
};

/** SPEC §A.8 tablosu, yukarıdan aşağı — ilk eşleşen kazanır. */
export function bugReportFooterNote(input: {
  readonly body: string;
  readonly category: MobileBugReportCategory | null;
  readonly offline: boolean;
  readonly phase: BugReportPhase;
}): BugReportFooterNote {
  if (input.phase === "busy") {
    return { key: "report.footer.sending", tone: "muted" };
  }

  if (input.offline) {
    return { key: "report.footer.offline", tone: "warning" };
  }

  if (input.category === null) {
    return { key: "report.footer.category", tone: "muted" };
  }

  const missing = REPORT_BODY_MIN_LENGTH - input.body.trim().length;
  if (missing > 0) {
    return { key: "report.footer.short", params: { count: missing }, tone: "muted" };
  }

  return { key: "report.footer.ready", tone: "muted" };
}

/**
 * SPEC §A.1 — boş taslak doğrudan kapanır, dolu taslak onay sorar. "Dolu"nun
 * tanımı referans akıştan alındı: seçili kategori **veya** yazılmış metin.
 * Toggle varsayılanından sapmak tek başına onay açmaz.
 */
export function isBugReportDirty(draft: Pick<BugReportDraft, "body" | "category">): boolean {
  return draft.category !== null || draft.body.length > 0;
}

/**
 * SPEC §A.11 — gönderilmiş raporda ve gönderim sırasında X onay sormaz,
 * doğrudan kapatır.
 */
export function shouldConfirmBugReportClose(draft: BugReportDraft): boolean {
  if (draft.phase === "done" || draft.phase === "busy") {
    return false;
  }

  return isBugReportDirty(draft);
}

export type BugReportScreenshotAction = "add" | "remove" | "retry";

/** Satır içi eylem ve kutuya tıklama aynı kararı verir. */
export function bugReportScreenshotAction(
  state: BugReportScreenshotState,
): BugReportScreenshotAction {
  if (state === "ready") {
    return "remove";
  }

  return state === "failed" ? "retry" : "add";
}

/** Kutuya tıklama: hazırsa tam ekran, başarısızsa tekrar dene, boşsa ekle. */
export function bugReportScreenshotBoxIntent(
  state: BugReportScreenshotState,
): "add" | "retry" | "view" {
  if (state === "ready") {
    return "view";
  }

  return state === "failed" ? "retry" : "add";
}

/** Yükleniyorken satır içi eylem çizilmez (SPEC §A.5 tablosu). */
export function isBugReportScreenshotActionVisible(state: BugReportScreenshotState): boolean {
  return state !== "uploading";
}

/**
 * SPEC §A.5: toggle açılınca durum `yok → var`, kapanınca `var → yok` ve
 * bekleyen ek yükleme hatası temizlenir.
 */
export function toggleBugReportScreenshot(draft: BugReportDraft): BugReportDraft {
  const next = !draft.includesScreenshot;

  return {
    ...draft,
    error: draft.error === "attach" ? null : draft.error,
    includesScreenshot: next,
    screenshotState: next ? "ready" : "none",
  };
}

/** Kategori seçmek ve yazmak bekleyen **doğrulama** hatasını temizler, diğerlerini değil. */
export function clearPendingValidationError(draft: BugReportDraft): BugReportErrorKind | null {
  return draft.error === "validate" ? null : draft.error;
}

const KILOBYTE = 1_024;

/**
 * `284 KB`. Tasarımdaki tek biçim bu; megabaytın altındaki her şey KB olarak
 * yazılır ve ondalık gösterilmez.
 */
export function formatScreenshotSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }

  if (sizeBytes < KILOBYTE * KILOBYTE) {
    return `${Math.max(1, Math.round(sizeBytes / KILOBYTE))} KB`;
  }

  return `${(sizeBytes / (KILOBYTE * KILOBYTE)).toFixed(1)} MB`;
}

/** Yükleme yüzdesi hep tam sayı ve 0–100 arasında kalır. */
export function clampUploadPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

import { z } from "zod";

import {
  MOBILE_BUG_REPORT_LOG_MAX_LINES,
  MobileBugReportRequestSchema,
  MobileBugReportResponseSchema,
  type MobileReleaseChannel,
} from "./mobile";

/**
 * "Sorun bildir" akışının yüzeyden bağımsız parçaları.
 *
 * 2f mobil için yazıldı; web ve masaüstü aynı uca aynı gövdeyle konuşur. Şema
 * burada **çoğaltılmaz**, takma adla dışa verilir: iki ayrı şema iki ayrı
 * doğruluk kaynağı demekti ve biri diğerinden sessizce sapardı.
 */

/** Web ve masaüstü gövdesi mobil sözleşmenin ta kendisidir. */
export const WebBugReportRequestSchema = MobileBugReportRequestSchema;
export const WebBugReportResponseSchema = MobileBugReportResponseSchema;

export type WebBugReportRequest = z.infer<typeof WebBugReportRequestSchema>;
export type WebBugReportResponse = z.infer<typeof WebBugReportResponseSchema>;

/**
 * `platform` kolonu serbest metin (`VarChar(16)`) ama istemcinin yazabileceği
 * değerler sayılıdır: destek konsolu platforma göre süzebilsin diye.
 */
export const BugReportClientPlatformSchema = z.enum(["web", "desktop"]);
export type BugReportClientPlatform = z.infer<typeof BugReportClientPlatformSchema>;

/**
 * Masaüstü kabuğunun `window.__WHISPR_DESKTOP__.releaseRing` değeri. Sürüm
 * kanalı sözleşmesiyle (`stable | beta | uat`) aynı adları kullanmıyor, o
 * yüzden raporun kanal alanına girmeden önce çevrilir.
 */
export const DesktopReleaseRingSchema = z.enum(["stable", "production", "uat"]);
export type DesktopReleaseRing = z.infer<typeof DesktopReleaseRingSchema>;

/**
 * Bilinmeyen bir halka `stable`'a düşer: rapor kanalsız kalmaktansa en yaygın
 * kanalla etiketlenir, çünkü kanal triyaj bilgisidir, yetki değil.
 */
export function resolveBugReportReleaseChannel(ring: unknown): MobileReleaseChannel {
  const parsed = DesktopReleaseRingSchema.safeParse(ring);

  if (!parsed.success) {
    return "stable";
  }

  return parsed.data === "uat" ? "beta" : "stable";
}

/**
 * Günlük satırlarının son istemci sınırı.
 *
 * Tanılama zaten izin listesiyle toplanır; bu desen ikinci kapıdır. Şüpheli
 * satır kısmen maskelenmez, **tümüyle** atılır: kısmi maske bir kişi adını veya
 * dosya kökünü geride bırakabilir.
 *
 * Tek kopya burada durur; mobil `redactMobileBugReportLogLines` ve web fault
 * tamponu ikisi de bunu çağırır.
 */
export const SENSITIVE_BUG_REPORT_LOG_PATTERN =
  /(?:access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|authorization\s*:|bearer\s+[a-z0-9._~-]|(?:message|content|body|person(?:[_-]?name)?|contact|display[_-]?name|user[_-]?name|file[_-]?name|attachment[_-]?name)\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:^|[\\/])[^\\/\s]+\.(?:docx?|pdf|png|jpe?g|webp|gif|zip|txt|csv)\b)/i;

export const BUG_REPORT_REDACTED_LINE = "[redacted]";

/**
 * Son `limit` satırı tutar. Bir çökme günlüğün **sonundadır**, o yüzden baştan
 * kırpmak raporu açıklayan kısmı koruyan davranıştır.
 */
export function redactBugReportLogLines(
  lines: readonly string[],
  limit = MOBILE_BUG_REPORT_LOG_MAX_LINES,
): readonly string[] {
  const boundedLimit = Math.max(0, Math.min(MOBILE_BUG_REPORT_LOG_MAX_LINES, Math.trunc(limit)));

  if (boundedLimit === 0) {
    return [];
  }

  return lines.slice(-boundedLimit).map((line) => {
    const normalized = line.replace(/[\r\n]+/g, " ").trim();
    return SENSITIVE_BUG_REPORT_LOG_PATTERN.test(normalized)
      ? BUG_REPORT_REDACTED_LINE
      : normalized;
  });
}

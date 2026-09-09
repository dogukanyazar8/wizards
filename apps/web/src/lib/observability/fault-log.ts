import { redactBugReportLogLines } from "@wizards/types";

/**
 * SPEC-INDIRME §A.5 — "Sistem günlükleri · Son 500 satır · mesaj içeriği yok".
 *
 * Mobil `mobile-fault-log.ts`'in web karşılığı ve aynı sözü verir: ham hata
 * metni **hiçbir zaman** saklanmaz. Bir hata mesajı jeton, kanal adı veya mesaj
 * içeriği taşıyabilir; buradan çıkan tek şey kaba bir sınıf ile destek ekibinin
 * zaten telefonda okuduğu kısa referans kodudur.
 *
 * Bellekte durur ve **yalnız tarayıcıda** yazılır: sunucuda tutulan bir halka,
 * bir isteğin izini başka bir kullanıcının raporuna sızdırırdı.
 */

export type WebFaultKind = "bundle" | "network" | "render" | "storage";

export type WebFault = {
  readonly at: string;
  readonly kind: WebFaultKind;
  readonly reference: string;
};

/** SPEC A.5 tam olarak bu kadarını vaat ediyor. */
export const WEB_FAULT_LOG_LIMIT = 500;

const NETWORK_ERROR_NAMES = ["AbortError", "TimeoutError", "NetworkError"];
const NETWORK_MESSAGE =
  /failed to fetch|network ?error|networkerror|load failed|timed? ?out|econnreset|enotfound|err_internet_disconnected/i;
const BUNDLE_MESSAGE =
  /chunkloaderror|loading chunk|loading css chunk|failed to (?:import|load) (?:the )?(?:module|script)|dynamically imported module/i;
const STORAGE_MESSAGE =
  /localstorage|sessionstorage|indexeddb|quotaexceeded|quota_exceeded|opaque response blocked|access to storage/i;

const FAULT_KIND_PREFIX: Record<WebFaultKind, string> = {
  bundle: "B",
  network: "N",
  render: "R",
  storage: "S",
};

export function classifyWebFault(error: unknown): WebFaultKind {
  if (!(error instanceof Error)) {
    return "render";
  }

  if (NETWORK_ERROR_NAMES.includes(error.name) || NETWORK_MESSAGE.test(error.message)) {
    return "network";
  }

  if (error.name === "ChunkLoadError" || BUNDLE_MESSAGE.test(error.message)) {
    return "bundle";
  }

  if (error.name === "QuotaExceededError" || STORAGE_MESSAGE.test(error.message)) {
    return "storage";
  }

  return "render";
}

/**
 * `WW-<sınıf>-<dakika>`: telefonda okunacak kadar kısa, ve kullanıcıyı değil
 * çökme penceresini işaret edecek kadar kaba. Aynı dakikadaki aynı sınıftan iki
 * hata bilerek aynı kodu paylaşır — Sentry olayı sınıf ve zamandan bulunur, bu
 * dizgenin benzersizliğinden değil.
 */
export function createWebFaultReference(error: unknown, now = Date.now()): string {
  const kind = classifyWebFault(error);
  const minute = Math.floor(now / 60_000)
    .toString(36)
    .toUpperCase();

  return `WW-${FAULT_KIND_PREFIX[kind]}-${minute.slice(-6)}`;
}

let faults: readonly WebFault[] = [];

export function recordWebFault(error: unknown, now: Date = new Date()): void {
  if (typeof window === "undefined") {
    return;
  }

  const entry: WebFault = {
    at: now.toISOString(),
    kind: classifyWebFault(error),
    reference: createWebFaultReference(error, now.getTime()),
  };

  faults = [entry, ...faults].slice(0, WEB_FAULT_LOG_LIMIT);
}

/** En yeni önce; tanılama sözleşmesinin belgelediği sıra. */
export function readWebFaultLog(): readonly WebFault[] {
  return faults;
}

export function clearWebFaultLog(): void {
  faults = [];
}

export function formatWebFaultLine(fault: WebFault): string {
  return `${fault.at} kind=${fault.kind} reference=${fault.reference}`;
}

/**
 * Raporun `logExcerpt` alanına giren satırlar. Halka zaten hata metni tutmuyor,
 * yine de son bir kez maskeden geçer: iki kapı, çünkü buradan çıkan metin
 * kullanıcının "mesaj içeriği yok" yazısına güvenerek gönderdiği şeydir.
 */
export function collectWebBugReportLogLines(
  limit = WEB_FAULT_LOG_LIMIT,
  dependencies: { readonly readFaults?: () => readonly WebFault[] } = {},
): readonly string[] {
  const boundedLimit = Math.max(0, Math.min(WEB_FAULT_LOG_LIMIT, Math.trunc(limit)));

  if (boundedLimit === 0) {
    return [];
  }

  const readFaults = dependencies.readFaults ?? readWebFaultLog;

  return redactBugReportLogLines(
    readFaults().slice(0, boundedLimit).map(formatWebFaultLine),
    boundedLimit,
  );
}

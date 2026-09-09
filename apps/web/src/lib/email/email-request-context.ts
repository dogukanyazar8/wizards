import { getAnalyticsClientInfo, type HeaderSource } from "@/lib/analytics/client-info";
import type { AppLocale } from "@/lib/locale";

/**
 * Şifre sıfırlama mektubundaki "İstek özeti" bloğunun verisi — SPEC §5.
 *
 * İki satır var: istek zamanı ve cihaz. İkisi de istek başlıklarından türer; hiçbir değer
 * uydurulmaz. Cihaz satırının bir parçası çözülemezse o parça sessizce düşer, hiçbiri
 * çözülemezse satır `null` olur ve şablon hücreyi hiç çizmez.
 */

export type EmailRequestContext = {
  /** `Chrome · macOS · İstanbul, TR` — çözülemezse `null`. */
  deviceLine: string | null;
  /** `27 Ağustos 2026, 14:32 (GMT+3)` — her zaman üretilir. */
  requestedAtLabel: string;
};

/** Paket kararı K6 — kullanıcının kendi saat dilimi yoksa buraya düşülür. */
export const DEFAULT_EMAIL_TIME_ZONE = "Europe/Istanbul";

/**
 * Şehir yalnız burada okunur. `getAnalyticsClientInfo`a eklemek analitik uçlarının tel biçimini
 * genişletirdi; o sözleşme donmuş durumda ve şehir yalnız bu mektuba lazım.
 */
const CITY_HEADERS = ["x-vercel-ip-city", "cloudfront-viewer-city", "cf-ipcity"] as const;

const MAX_CITY_LENGTH = 64;

type HeaderRecord = Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderSource | null | undefined, name: string) {
  if (!headers) {
    return null;
  }

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? null;
  }

  const record = headers as HeaderRecord;
  const value = record[name] ?? record[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

/**
 * Vercel şehir başlığını yüzde kodlu gönderir (`%C4%B0stanbul`). Çözülemeyen bir değer
 * kullanıcıya ham hâliyle gösterilmez; şehir yokmuş gibi davranılır.
 */
function readCity(headers: HeaderSource | null | undefined) {
  for (const name of CITY_HEADERS) {
    const raw = readHeader(headers, name)?.trim();
    if (!raw) {
      continue;
    }

    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      continue;
    }

    /* Denetim karakterleri düşer; şehirdeki boşluk ve tire korunur ("Sankt-Peterburg"). */
    const normalized = decoded.replace(/\p{Cc}/gu, "").trim();
    if (normalized && normalized.length <= MAX_CITY_LENGTH) {
      return normalized;
    }
  }

  return null;
}

/** SPEC §5 — `Tarayıcı · OS · Şehir, Ülke`; eksik parçalar düşer. */
export function resolveEmailDeviceLine(headers: HeaderSource | null | undefined) {
  if (!headers) {
    return null;
  }

  const clientInfo = getAnalyticsClientInfo(headers);
  const city = readCity(headers);
  const location =
    city && clientInfo.countryCode
      ? `${city}, ${clientInfo.countryCode}`
      : (city ?? clientInfo.countryCode);

  const parts = [clientInfo.browser, clientInfo.os, location].filter((part): part is string =>
    Boolean(part),
  );

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Geçersiz saat dilimi dizesi `Intl` içinde `RangeError` atar; ayar bozuksa varsayılana düşülür. */
function resolveTimeZone(timeZone: string | null | undefined) {
  const candidate = timeZone?.trim();
  if (!candidate) {
    return DEFAULT_EMAIL_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return DEFAULT_EMAIL_TIME_ZONE;
  }
}

/**
 * `27 Ağustos 2026, 14:32 (GMT+3)`.
 *
 * İngilizce sürüm de 24 saat ve aynı sırayı kullanır (paket sapması E4): SPEC yalnız Türkçe
 * örnek veriyor ve `2:32 PM` iki kolonlu ızgarada satırı taşırırdı. Fark etiketi
 * `shortOffset`ten okunur, böylece yaz saati kendiliğinden doğru olur.
 */
export function formatEmailRequestTime(input: {
  locale: AppLocale;
  now: Date;
  timeZone?: string | null | undefined;
}) {
  const timeZone = resolveTimeZone(input.timeZone);
  const dateLocale = input.locale === "tr" ? "tr-TR" : "en-GB";

  const date = new Intl.DateTimeFormat(dateLocale, {
    day: "numeric",
    month: "long",
    timeZone,
    year: "numeric",
  }).format(input.now);

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(input.now);

  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(input.now)
      .find((part) => part.type === "timeZoneName")?.value ?? "";

  return offset ? `${date}, ${time} (${offset})` : `${date}, ${time}`;
}

export function resolveEmailRequestContext(input: {
  headers?: HeaderSource | null | undefined;
  locale: AppLocale;
  now: Date;
  timeZone?: string | null | undefined;
}): EmailRequestContext {
  return {
    deviceLine: resolveEmailDeviceLine(input.headers),
    requestedAtLabel: formatEmailRequestTime({
      locale: input.locale,
      now: input.now,
      timeZone: input.timeZone,
    }),
  };
}

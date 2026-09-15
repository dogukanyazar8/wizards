import { createHash } from "node:crypto";

import { resolveTrustedProxyClientIp } from "@/lib/security/client-ip";

export type AnalyticsClientInfo = {
  appVersion: string | null;
  /** True when `x-whispr-client` declared the platform instead of UA guessing. */
  attributionVerified: boolean;
  browser: string | null;
  clientType: "WEB" | "DESKTOP" | "MOBILE" | "UNKNOWN";
  countryCode: string | null;
  deviceType: "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";
  ipHash: string | null;
  os: string | null;
  userAgentHash: string | null;
};

/** Free text from a client is never stored: only a plain version string passes. */
const APP_VERSION_PATTERN = /^[0-9A-Za-z.\-+]{1,32}$/;

type HeaderRecord = Record<string, string | string[] | undefined>;

export type HeaderSource =
  | Headers
  | HeaderRecord
  | {
      get(name: string): string | null | undefined;
    };

function readHeader(headers: HeaderSource | null | undefined, name: string) {
  if (!headers) {
    return null;
  }

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? null;
  }

  const record = headers as HeaderRecord;
  const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeCountryCode(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) && normalized !== "XX" ? normalized : null;
}

export function hashAnalyticsValue(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const salt =
    process.env.ANALYTICS_HASH_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "whispr-analytics";

  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

function getIpAddress(headers: HeaderSource | null | undefined) {
  return resolveTrustedProxyClientIp({
    get: (name) => readHeader(headers, name),
  });
}

function detectBrowser(userAgent: string) {
  if (/Edg(?:A|iOS)?\//i.test(userAgent)) {
    return "Edge";
  }

  if (/OPR\//.test(userAgent)) {
    return "Opera";
  }

  if (/(?:Firefox|FxiOS)\//i.test(userAgent)) {
    return "Firefox";
  }

  if (/Chrome\//.test(userAgent) || /CriOS\//.test(userAgent)) {
    return "Chrome";
  }

  if (/Safari\//.test(userAgent)) {
    return "Safari";
  }

  return null;
}

function detectOs(userAgent: string) {
  if (/CrOS/i.test(userAgent)) {
    return "ChromeOS";
  }

  if (/Windows NT/i.test(userAgent)) {
    return "Windows";
  }

  if (/Android/i.test(userAgent)) {
    return "Android";
  }

  if (/(iPhone|iPad|iPod)/i.test(userAgent)) {
    return "iOS";
  }

  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return "macOS";
  }

  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return null;
}

function detectDeviceType(userAgent: string): AnalyticsClientInfo["deviceType"] {
  if (/iPad|Tablet/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobi/i.test(userAgent))) {
    return "TABLET";
  }

  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) {
    return "MOBILE";
  }

  return userAgent ? "DESKTOP" : "UNKNOWN";
}

function readDeclaredClient(headers: HeaderSource | null | undefined) {
  const value = readHeader(headers, "x-whispr-client")?.trim().toLowerCase();

  return value === "web" || value === "desktop" || value === "mobile" ? value : null;
}

function detectClientType(
  headers: HeaderSource | null | undefined,
  userAgent: string,
  deviceType: AnalyticsClientInfo["deviceType"],
): AnalyticsClientInfo["clientType"] {
  const explicitClient = readDeclaredClient(headers);

  if (explicitClient === "desktop" || /WhisprDesktop|Tauri|Wry/i.test(userAgent)) {
    return "DESKTOP";
  }

  if (explicitClient === "mobile") {
    return "MOBILE";
  }

  if (explicitClient === "web") {
    return "WEB";
  }

  if (deviceType === "MOBILE" || deviceType === "TABLET") {
    return "MOBILE";
  }

  return userAgent ? "WEB" : "UNKNOWN";
}

function detectAppVersion(headers: HeaderSource | null | undefined) {
  const value =
    readHeader(headers, "x-whispr-client-version")?.trim() ??
    /(?:^|\s)WhisprDesktop\/([0-9A-Za-z.+-]{1,32})(?:\s|$)/i.exec(
      readHeader(headers, "user-agent") ?? "",
    )?.[1];

  return value && APP_VERSION_PATTERN.test(value) ? value : null;
}

export function getAnalyticsClientInfo(
  headers: HeaderSource | null | undefined,
): AnalyticsClientInfo {
  const userAgent = readHeader(headers, "user-agent") ?? "";
  const deviceType = detectDeviceType(userAgent);
  const clientType = detectClientType(headers, userAgent, deviceType);
  const countryCode = normalizeCountryCode(
    readHeader(headers, "cf-ipcountry") ??
      readHeader(headers, "x-vercel-ip-country") ??
      readHeader(headers, "cloudfront-viewer-country") ??
      readHeader(headers, "x-country-code"),
  );

  return {
    appVersion: detectAppVersion(headers),
    attributionVerified: readDeclaredClient(headers) !== null,
    browser: clientType === "DESKTOP" ? "Whispr Desktop" : detectBrowser(userAgent),
    clientType,
    countryCode,
    deviceType,
    ipHash: hashAnalyticsValue(getIpAddress(headers)),
    os: detectOs(userAgent),
    userAgentHash: hashAnalyticsValue(userAgent),
  };
}

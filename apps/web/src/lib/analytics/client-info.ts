import { createHash } from "node:crypto";

export type AnalyticsClientInfo = {
  browser: string | null;
  clientType: "WEB" | "DESKTOP" | "MOBILE" | "UNKNOWN";
  countryCode: string | null;
  deviceType: "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";
  ipHash: string | null;
  os: string | null;
  userAgentHash: string | null;
};

type HeaderRecord = Record<string, string | string[] | undefined>;

type HeaderSource =
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

function getFirstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function getIpAddress(headers: HeaderSource | null | undefined) {
  return (
    readHeader(headers, "cf-connecting-ip") ??
    readHeader(headers, "x-real-ip") ??
    getFirstForwardedIp(readHeader(headers, "x-forwarded-for")) ??
    readHeader(headers, "x-client-ip")
  );
}

function detectBrowser(userAgent: string) {
  if (/Edg\//.test(userAgent)) {
    return "Edge";
  }

  if (/OPR\//.test(userAgent)) {
    return "Opera";
  }

  if (/Firefox\//.test(userAgent)) {
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
  if (/iPad|Tablet/i.test(userAgent)) {
    return "TABLET";
  }

  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) {
    return "MOBILE";
  }

  return userAgent ? "DESKTOP" : "UNKNOWN";
}

function detectClientType(
  headers: HeaderSource | null | undefined,
  userAgent: string,
  deviceType: AnalyticsClientInfo["deviceType"],
): AnalyticsClientInfo["clientType"] {
  const explicitClient = readHeader(headers, "x-whispr-client")?.trim().toLowerCase();

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

export function getAnalyticsClientInfo(headers: HeaderSource | null | undefined): AnalyticsClientInfo {
  const userAgent = readHeader(headers, "user-agent") ?? "";
  const deviceType = detectDeviceType(userAgent);
  const countryCode = normalizeCountryCode(
    readHeader(headers, "cf-ipcountry") ??
      readHeader(headers, "x-vercel-ip-country") ??
      readHeader(headers, "cloudfront-viewer-country") ??
      readHeader(headers, "x-country-code"),
  );

  return {
    browser: detectBrowser(userAgent),
    clientType: detectClientType(headers, userAgent, deviceType),
    countryCode,
    deviceType,
    ipHash: hashAnalyticsValue(getIpAddress(headers)),
    os: detectOs(userAgent),
    userAgentHash: hashAnalyticsValue(userAgent),
  };
}

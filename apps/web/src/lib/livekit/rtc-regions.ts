import { ApiError } from "@/lib/api";

const RTC_REGION_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/u;

export function parseLiveKitRtcRegionEndpoints(raw = process.env.LIVEKIT_RTC_REGION_ENDPOINTS) {
  if (!raw?.trim()) {
    return {} as Record<string, string>;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("LiveKit RTC region configuration is invalid", 500);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new ApiError("LiveKit RTC region configuration is invalid", 500);
  }

  const endpoints: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!RTC_REGION_KEY_PATTERN.test(key) || typeof value !== "string") {
      throw new ApiError("LiveKit RTC region configuration is invalid", 500);
    }

    let endpoint: URL;
    try {
      endpoint = new URL(value);
    } catch {
      throw new ApiError("LiveKit RTC region configuration is invalid", 500);
    }

    if (endpoint.protocol !== "wss:") {
      throw new ApiError("LiveKit RTC region endpoints must use wss", 500);
    }
    endpoints[key] = endpoint.toString().replace(/\/$/u, "");
  }

  return endpoints;
}

export function getLiveKitRtcRegionKeys() {
  return Object.keys(parseLiveKitRtcRegionEndpoints()).sort();
}

export function resolveLiveKitRtcUrl(
  region: string | null,
  defaultUrl: string,
  endpoints = parseLiveKitRtcRegionEndpoints(),
) {
  if (!region || region === "AUTO") {
    return defaultUrl;
  }

  const endpoint = endpoints[region];
  if (!endpoint) {
    throw new ApiError("Requested RTC region is not available", 400, "RTC_REGION_UNAVAILABLE");
  }

  return endpoint;
}

export function assertLiveKitRtcRegionAvailable(region: string | null | undefined) {
  if (!region || region === "AUTO") {
    return;
  }
  resolveLiveKitRtcUrl(region, "wss://automatic.invalid");
}

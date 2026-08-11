import { ApiError } from "@/lib/api";

type E2ERouteEnv = {
  APP_URL?: string | undefined;
  AUTH_URL?: string | undefined;
  E2E_ALLOW_PRODUCTION_BUILD?: string | undefined;
  E2E_BASE_URL?: string | undefined;
  E2E_TEST_MODE?: string | undefined;
  NEXTAUTH_URL?: string | undefined;
  NODE_ENV?: string | undefined;
};

const LOCAL_E2E_HOSTS = new Set(["localhost", "::1"]);
const CONFIGURED_E2E_URL_KEYS = ["APP_URL", "AUTH_URL", "E2E_BASE_URL", "NEXTAUTH_URL"] as const;

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
}

export function isLocalE2EHost(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname);

  return (
    LOCAL_E2E_HOSTS.has(normalizedHostname) ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname.startsWith("127.")
  );
}

export function assertE2EApiRouteEnabled(requestUrl: URL | string, env: E2ERouteEnv = process.env) {
  if (env.NODE_ENV === "production" && env.E2E_ALLOW_PRODUCTION_BUILD !== "true") {
    throw new ApiError("E2E helper is unavailable in production", 404);
  }

  if (env.E2E_TEST_MODE !== "true") {
    throw new ApiError("E2E helper is disabled", 404);
  }

  for (const key of CONFIGURED_E2E_URL_KEYS) {
    const value = env[key];
    if (!value) {
      continue;
    }

    try {
      const configuredUrl = new URL(value);
      if (!isLocalE2EHost(configuredUrl.hostname)) {
        throw new ApiError("E2E helper is unavailable outside local test hosts", 404);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError("E2E helper has invalid local test URL configuration", 404);
    }
  }

  const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  if (!isLocalE2EHost(url.hostname)) {
    throw new ApiError("E2E helper is unavailable outside local test hosts", 404);
  }
}

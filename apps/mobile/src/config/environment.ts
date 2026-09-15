export const MOBILE_ENVIRONMENTS = ["development", "uat", "production"] as const;

export type MobileEnvironmentName = (typeof MOBILE_ENVIRONMENTS)[number];

export type MobileEnvironmentConfig = {
  apiUrl: string;
  communityInviteSlug: string;
  environment: MobileEnvironmentName;
  /** Google *web* client id used as `serverClientId`; null disables native sign-in. */
  googleWebClientId: string | null;
  releaseChannel: MobileEnvironmentName;
  sentryDsn: string | null;
  socketUrl: string;
  webUrl: string;
};

type BuildMobileEnvironmentConfigInput = {
  mobileEnvironment?: string;
  publicApiUrl?: string;
  publicCommunityInviteSlug?: string;
  publicGoogleWebClientId?: string;
  publicSentryDsn?: string;
  publicSocketUrl?: string;
  publicWebUrl?: string;
};

const DEFAULT_PUBLIC_ENV: Record<
  MobileEnvironmentName,
  Pick<MobileEnvironmentConfig, "apiUrl" | "socketUrl" | "webUrl">
> = {
  development: {
    apiUrl: "http://localhost:3000",
    socketUrl: "http://localhost:3000",
    webUrl: "http://localhost:3000",
  },
  uat: {
    apiUrl: "https://wizardsweb-uat.up.railway.app",
    socketUrl: "https://wizardsweb-uat.up.railway.app",
    webUrl: "https://wizardsweb-uat.up.railway.app",
  },
  production: {
    apiUrl: "https://whispr.team",
    socketUrl: "https://whispr.team",
    webUrl: "https://whispr.team",
  },
};

export const DEFAULT_MOBILE_COMMUNITY_INVITE_SLUG = "whispr-community";

export function getDefaultMobilePublicEnv(environment: MobileEnvironmentName) {
  return DEFAULT_PUBLIC_ENV[environment];
}

export function normalizeMobileEnvironment(
  value: string | undefined,
  isDevelopment = typeof __DEV__ !== "undefined" && __DEV__,
): MobileEnvironmentName {
  if (MOBILE_ENVIRONMENTS.includes(value as MobileEnvironmentName)) {
    return value as MobileEnvironmentName;
  }

  // Release builds must never silently lose HTTPS enforcement because an EAS
  // profile misspelled the environment name.
  if (isDevelopment && value === undefined) {
    return "development";
  }

  throw new Error(
    `EXPO_PUBLIC_WHISPR_MOBILE_ENV must be one of: ${MOBILE_ENVIRONMENTS.join(", ")}.`,
  );
}

function normalizeUrl(value: string | undefined, fieldName: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required for Whispr mobile builds.`);
  }

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${fieldName} must be a valid absolute URL.`);
  }
}

function normalizeCommunityInviteSlug(value: string | undefined): string {
  const slug = value?.trim() || DEFAULT_MOBILE_COMMUNITY_INVITE_SLUG;
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(slug)) {
    throw new Error(
      "EXPO_PUBLIC_WHISPR_COMMUNITY_INVITE_SLUG must contain only letters, numbers, '-' or '_'.",
    );
  }
  return slug;
}

function isLocalOrInvalidUrl(value: string): boolean {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname === "whispr.invalid"
  );
}

function assertReleaseUrl(value: string, fieldName: string, environment: MobileEnvironmentName) {
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error(`${fieldName} must use HTTPS for ${environment} mobile builds.`);
  }

  if (isLocalOrInvalidUrl(value)) {
    throw new Error(
      `${fieldName} cannot point to local or invalid hosts for ${environment} builds.`,
    );
  }
}

export function buildMobileEnvironmentConfig(
  input: BuildMobileEnvironmentConfigInput,
): MobileEnvironmentConfig {
  const environment = normalizeMobileEnvironment(input.mobileEnvironment);
  const defaults = DEFAULT_PUBLIC_ENV[environment];
  const apiUrl = normalizeUrl(input.publicApiUrl ?? defaults.apiUrl, "EXPO_PUBLIC_WHISPR_API_URL");
  const socketUrl = normalizeUrl(
    input.publicSocketUrl ?? defaults.socketUrl,
    "EXPO_PUBLIC_WHISPR_SOCKET_URL",
  );
  const webUrl = normalizeUrl(input.publicWebUrl ?? defaults.webUrl, "EXPO_PUBLIC_WHISPR_WEB_URL");

  if (environment !== "development") {
    assertReleaseUrl(apiUrl, "EXPO_PUBLIC_WHISPR_API_URL", environment);
    assertReleaseUrl(socketUrl, "EXPO_PUBLIC_WHISPR_SOCKET_URL", environment);
    assertReleaseUrl(webUrl, "EXPO_PUBLIC_WHISPR_WEB_URL", environment);
  }

  return {
    apiUrl,
    communityInviteSlug: normalizeCommunityInviteSlug(input.publicCommunityInviteSlug),
    environment,
    googleWebClientId: normalizeGoogleWebClientId(input.publicGoogleWebClientId),
    releaseChannel: environment,
    sentryDsn: input.publicSentryDsn?.trim() || null,
    socketUrl,
    webUrl,
  };
}

/**
 * A misconfigured id would make the native sheet fail at tap time, so anything
 * that is not a Google OAuth client id is treated as "not configured" and the
 * sign-in falls back to the in-app browser hand-off.
 */
function normalizeGoogleWebClientId(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.endsWith(".apps.googleusercontent.com")) {
    return null;
  }

  return trimmed;
}

export function getMobileRuntimeConfig(): MobileEnvironmentConfig {
  return buildMobileEnvironmentConfig({
    mobileEnvironment: process.env.EXPO_PUBLIC_WHISPR_MOBILE_ENV ?? process.env.WHISPR_MOBILE_ENV,
    publicApiUrl: process.env.EXPO_PUBLIC_WHISPR_API_URL,
    publicCommunityInviteSlug: process.env.EXPO_PUBLIC_WHISPR_COMMUNITY_INVITE_SLUG,
    publicGoogleWebClientId: process.env.EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID,
    publicSentryDsn: process.env.EXPO_PUBLIC_WHISPR_SENTRY_DSN,
    publicSocketUrl: process.env.EXPO_PUBLIC_WHISPR_SOCKET_URL,
    publicWebUrl: process.env.EXPO_PUBLIC_WHISPR_WEB_URL,
  });
}

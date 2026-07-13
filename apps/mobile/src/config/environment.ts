export const MOBILE_ENVIRONMENTS = ["development", "uat", "canary", "production"] as const;

export type MobileEnvironmentName = (typeof MOBILE_ENVIRONMENTS)[number];

export type MobileEnvironmentConfig = {
  apiUrl: string;
  environment: MobileEnvironmentName;
  releaseChannel: MobileEnvironmentName;
  sentryDsn: string | null;
  socketUrl: string;
  webUrl: string;
};

type BuildMobileEnvironmentConfigInput = {
  mobileEnvironment?: string;
  publicApiUrl?: string;
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
  canary: {
    apiUrl: "https://whispr.team",
    socketUrl: "https://whispr.team",
    webUrl: "https://whispr.team",
  },
  production: {
    apiUrl: "https://whispr.team",
    socketUrl: "https://whispr.team",
    webUrl: "https://whispr.team",
  },
};

export function getDefaultMobilePublicEnv(environment: MobileEnvironmentName) {
  return DEFAULT_PUBLIC_ENV[environment];
}

export function normalizeMobileEnvironment(value: string | undefined): MobileEnvironmentName {
  if (MOBILE_ENVIRONMENTS.includes(value as MobileEnvironmentName)) {
    return value as MobileEnvironmentName;
  }

  return "development";
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
    throw new Error(`${fieldName} cannot point to local or invalid hosts for ${environment} builds.`);
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
    environment,
    releaseChannel: environment,
    sentryDsn: input.publicSentryDsn?.trim() || null,
    socketUrl,
    webUrl,
  };
}

export function getMobileRuntimeConfig(): MobileEnvironmentConfig {
  return buildMobileEnvironmentConfig({
    mobileEnvironment: process.env.EXPO_PUBLIC_WHISPR_MOBILE_ENV ?? process.env.WHISPR_MOBILE_ENV,
    publicApiUrl: process.env.EXPO_PUBLIC_WHISPR_API_URL,
    publicSentryDsn: process.env.EXPO_PUBLIC_WHISPR_SENTRY_DSN,
    publicSocketUrl: process.env.EXPO_PUBLIC_WHISPR_SOCKET_URL,
    publicWebUrl: process.env.EXPO_PUBLIC_WHISPR_WEB_URL,
  });
}

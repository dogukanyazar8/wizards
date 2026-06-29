import type { ConfigContext, ExpoConfig } from "expo/config";
import pkg from "./package.json";

const APP_NAME = "Whispr";
const APP_SLUG = "whispr-mobile";
const APP_SCHEME = "whispr";
const BUNDLE_IDENTIFIER = "team.whispr.mobile";
const ANDROID_PACKAGE = "team.whispr.mobile";
const EAS_PROJECT_ID = "3b8b3f68-dd6c-4c9c-84e7-10ed8f4b2aad";
const MOBILE_ENVIRONMENTS = ["development", "uat", "canary", "production"] as const;

type MobileEnvironmentName = (typeof MOBILE_ENVIRONMENTS)[number];

type MobilePublicConfig = {
  apiUrl: string;
  environment: MobileEnvironmentName;
  releaseChannel: MobileEnvironmentName;
  socketUrl: string;
  webUrl: string;
};

const DEFAULT_PUBLIC_ENV: Record<
  MobileEnvironmentName,
  Pick<MobilePublicConfig, "apiUrl" | "socketUrl" | "webUrl">
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

function readEnvironmentName(): MobileEnvironmentName {
  const value = process.env.WHISPR_MOBILE_ENV;

  return MOBILE_ENVIRONMENTS.includes(value as MobileEnvironmentName)
    ? (value as MobileEnvironmentName)
    : "development";
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

function assertReleaseUrl(value: string, fieldName: string, environment: MobileEnvironmentName) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const isLocalOrInvalid =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname === "whispr.invalid";

  if (url.protocol !== "https:") {
    throw new Error(`${fieldName} must use HTTPS for ${environment} mobile builds.`);
  }

  if (isLocalOrInvalid) {
    throw new Error(`${fieldName} cannot point to local or invalid hosts for ${environment} builds.`);
  }
}

function buildPublicConfig(environment: MobileEnvironmentName): MobilePublicConfig {
  const defaults = DEFAULT_PUBLIC_ENV[environment];
  const apiUrl = normalizeUrl(
    process.env.EXPO_PUBLIC_WHISPR_API_URL ?? defaults.apiUrl,
    "EXPO_PUBLIC_WHISPR_API_URL",
  );
  const socketUrl = normalizeUrl(
    process.env.EXPO_PUBLIC_WHISPR_SOCKET_URL ?? defaults.socketUrl,
    "EXPO_PUBLIC_WHISPR_SOCKET_URL",
  );
  const webUrl = normalizeUrl(
    process.env.EXPO_PUBLIC_WHISPR_WEB_URL ?? defaults.webUrl,
    "EXPO_PUBLIC_WHISPR_WEB_URL",
  );

  if (environment !== "development") {
    assertReleaseUrl(apiUrl, "EXPO_PUBLIC_WHISPR_API_URL", environment);
    assertReleaseUrl(socketUrl, "EXPO_PUBLIC_WHISPR_SOCKET_URL", environment);
    assertReleaseUrl(webUrl, "EXPO_PUBLIC_WHISPR_WEB_URL", environment);
  }

  return {
    apiUrl,
    environment,
    releaseChannel: environment,
    socketUrl,
    webUrl,
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = readEnvironmentName();
  const publicConfig = buildPublicConfig(environment);
  const easProjectId = process.env.EXPO_PROJECT_ID ?? EAS_PROJECT_ID;

  return {
    ...config,
    name: APP_NAME,
    slug: APP_SLUG,
    version: pkg.version,
    orientation: "portrait",
    icon: "./assets/whispr-icon.png",
    scheme: APP_SCHEME,
    userInterfaceStyle: "automatic",
    ios: {
      ...config.ios,
      bundleIdentifier: BUNDLE_IDENTIFIER,
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription:
          "Whispr uses the camera only when you choose to join video calls or share video.",
        NSMicrophoneUsageDescription:
          "Whispr uses the microphone only when you join voice channels or calls.",
        NSPhotoLibraryUsageDescription:
          "Whispr uses your photo library only when you choose media to upload.",
      },
    },
    android: {
      ...config.android,
      package: ANDROID_PACKAGE,
      adaptiveIcon: {
        backgroundColor: "#EEF2FF",
        foregroundImage: "./assets/whispr-icon.png",
      },
      permissions: ["CAMERA", "RECORD_AUDIO", "POST_NOTIFICATIONS"],
      predictiveBackGestureEnabled: true,
    },
    extra: {
      ...config.extra,
      whispr: publicConfig,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
    web: {
      ...config.web,
      favicon: "./assets/favicon.png",
    },
  };
};

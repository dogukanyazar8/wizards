"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pkg = require("./package.json");
const storeContractData = require("./src/release/mobile-store-contract-data.json");

// FCM credential file for Android push. Optional on purpose: builds must keep
// working before Firebase is configured (push then degrades silently).
const GOOGLE_SERVICES_FILE = path.join(__dirname, "google-services.json");

const EAS_PROJECT_ID = "3b8b3f68-dd6c-4c9c-84e7-10ed8f4b2aad";
const MOBILE_ENVIRONMENTS = ["development", "uat", "canary", "production"];
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;

const WHISPR_MOBILE_APP_IDENTITY = storeContractData.appIdentity;
const WHISPR_MOBILE_ICON = storeContractData.icon;

const DEFAULT_PUBLIC_ENV = {
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

function getWhisprMobileAndroidPermissions() {
  return storeContractData.permissionDisclosures.flatMap((disclosure) =>
    disclosure.androidPermission ? [disclosure.androidPermission] : [],
  );
}

function getWhisprMobileIosInfoPlistUsageDescriptions() {
  return Object.fromEntries(
    storeContractData.permissionDisclosures.flatMap((disclosure) =>
      disclosure.iosInfoPlistKey ? [[disclosure.iosInfoPlistKey, disclosure.usageDescription]] : [],
    ),
  );
}

function readEnvironmentName() {
  const value = process.env.WHISPR_MOBILE_ENV;

  return MOBILE_ENVIRONMENTS.includes(value) ? value : "development";
}

function readBuildId() {
  const value = process.env.WHISPR_MOBILE_BUILD_ID?.trim();

  if (!value) {
    return "unknown";
  }
  if (!GIT_SHA_PATTERN.test(value)) {
    throw new Error("WHISPR_MOBILE_BUILD_ID must be a full Git SHA.");
  }

  return value.toLowerCase();
}

function normalizeUrl(value, fieldName) {
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

function assertReleaseUrl(value, fieldName, environment) {
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
    throw new Error(
      `${fieldName} cannot point to local or invalid hosts for ${environment} builds.`,
    );
  }
}

function assertCanonicalUatEndpoint(value, expectedValue, fieldName) {
  if (value !== expectedValue) {
    throw new Error(`${fieldName} must use the canonical UAT endpoint.`);
  }
}

function buildPublicConfig(environment) {
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
  if (environment === "uat") {
    assertCanonicalUatEndpoint(apiUrl, defaults.apiUrl, "EXPO_PUBLIC_WHISPR_API_URL");
    assertCanonicalUatEndpoint(socketUrl, defaults.socketUrl, "EXPO_PUBLIC_WHISPR_SOCKET_URL");
    assertCanonicalUatEndpoint(webUrl, defaults.webUrl, "EXPO_PUBLIC_WHISPR_WEB_URL");
  }

  return {
    apiUrl,
    buildId: readBuildId(),
    environment,
    releaseChannel: environment,
    sentryDsn: process.env.EXPO_PUBLIC_WHISPR_SENTRY_DSN?.trim() || null,
    socketUrl,
    webUrl,
  };
}

module.exports = ({ config }) => {
  const environment = readEnvironmentName();
  const publicConfig = buildPublicConfig(environment);
  const easProjectId = process.env.EXPO_PROJECT_ID ?? EAS_PROJECT_ID;

  return {
    ...config,
    name: WHISPR_MOBILE_APP_IDENTITY.name,
    slug: WHISPR_MOBILE_APP_IDENTITY.slug,
    version: pkg.version,
    orientation: "portrait",
    icon: WHISPR_MOBILE_ICON.icon,
    scheme: WHISPR_MOBILE_APP_IDENTITY.scheme,
    userInterfaceStyle: "automatic",
    ios: {
      ...config.ios,
      bundleIdentifier: WHISPR_MOBILE_APP_IDENTITY.iosBundleIdentifier,
      supportsTablet: true,
      infoPlist: getWhisprMobileIosInfoPlistUsageDescriptions(),
    },
    android: {
      ...config.android,
      package: WHISPR_MOBILE_APP_IDENTITY.androidPackage,
      adaptiveIcon: {
        backgroundColor: WHISPR_MOBILE_ICON.adaptiveBackgroundColor,
        foregroundImage: WHISPR_MOBILE_ICON.adaptiveForegroundImage,
      },
      permissions: getWhisprMobileAndroidPermissions(),
      predictiveBackGestureEnabled: true,
      ...(fs.existsSync(GOOGLE_SERVICES_FILE)
        ? { googleServicesFile: "./google-services.json" }
        : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      "@livekit/react-native-expo-plugin",
      "./plugins/withWebRtc",
      "expo-image",
      [
        "expo-audio",
        {
          enableBackgroundPlayback: false,
          enableBackgroundRecording: false,
          recordAudioAndroid: true,
        },
      ],
      "expo-localization",
      [
        // Message bodies are the one thing the app keeps out of AsyncStorage,
        // which is not encrypted. SQLCipher is what lets them be cached locally
        // at all: the database is encrypted at rest with a key that only ever
        // lives in the keychain/keystore.
        "expo-sqlite",
        { useSQLCipher: true },
      ],
      [
        // Edge-to-edge draws the app behind the navigation bar. Android's contrast
        // scrim would paint a grey band over the themed background there, and it
        // also suppresses the runtime button style, so the app owns both instead:
        // every surface pads past the bar and MobileThemeSystemSurfaces picks the
        // button style that contrasts with the active theme.
        "expo-navigation-bar",
        { enforceContrast: false },
      ],
      // Native Google account sheet (Credential Manager on Android). The client
      // only ever receives an ID token; no browser and no client secret ship
      // inside the app.
      "@react-native-google-signin/google-signin",
      "./plugins/withScreenShare",
      "./plugins/withWhisprCallNotifications",
      [
        "@sentry/react-native/expo",
        {
          organization: process.env.SENTRY_ORG ?? "whispr-p0",
          project: "whispr-mobile",
        },
      ],
    ],
    extra: {
      ...config.extra,
      whispr: publicConfig,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
    web: {
      ...config.web,
      favicon: WHISPR_MOBILE_ICON.webFavicon,
    },
  };
};

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
const DEFAULT_COMMUNITY_INVITE_SLUG = "whispr-community";
const OTA_SIGNING_PROFILES = {
  uat: {
    certificate: "./certs/ota/uat/certificate.pem",
    keyid: "whispr-mobile-ota-uat-2026-01",
  },
};

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

function getWhisprMobileAndroidPermissions({ includeStoreBlockers = false } = {}) {
  return storeContractData.permissionDisclosures.flatMap((disclosure) =>
    disclosure.androidPermission && (includeStoreBlockers || disclosure.storeBlocker !== true)
      ? [disclosure.androidPermission]
      : [],
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

const BUILD_ID_PATTERN = /^[0-9a-f]{12,40}$/i;
const LOCAL_UAT_BUILD_ID_PATTERN = /^[0-9a-f]{12,40}-dirty$/i;

/**
 * Which build a measurement came from.
 *
 * The telemetry dimension has read `extra.whispr.buildId` since it was written,
 * and nothing ever wrote it — every device sample so far reports `unknown`, so a
 * p95 cannot be pinned to a release or matched against the edge's own record of
 * the same request. The build pipeline supplies the commit; an unrecognisable
 * value stays `unknown` rather than becoming one.
 */
function readBuildId(environment) {
  const value = (
    process.env.EXPO_PUBLIC_WHISPR_BUILD_ID ??
    process.env.WHISPR_MOBILE_BUILD_ID ??
    ""
  ).trim();

  if (
    BUILD_ID_PATTERN.test(value) ||
    (environment === "uat" && LOCAL_UAT_BUILD_ID_PATTERN.test(value))
  ) {
    return value.toLowerCase();
  }

  if (environment === "development") {
    return "dev-local";
  }

  throw new Error(
    "EXPO_PUBLIC_WHISPR_BUILD_ID or WHISPR_MOBILE_BUILD_ID must be a valid Git SHA (12-40 hex characters); local UAT builds may append '-dirty'.",
  );
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

  return {
    apiUrl,
    buildId: readBuildId(environment),
    communityInviteSlug:
      process.env.EXPO_PUBLIC_WHISPR_COMMUNITY_INVITE_SLUG?.trim() || DEFAULT_COMMUNITY_INVITE_SLUG,
    environment,
    releaseChannel: environment,
    sentryDsn: process.env.EXPO_PUBLIC_WHISPR_SENTRY_DSN?.trim() || null,
    socketUrl,
    webUrl,
  };
}

function buildUpdatesConfig(environment, publicConfig) {
  const enabled = process.env.WHISPR_MOBILE_OTA_ENABLED === "true";
  const base = {
    enabled,
    url: `${publicConfig.apiUrl}/api/v1/app/updates/manifest`,
    // About 1A's explicit action owns checks; cold start never waits on network.
    checkAutomatically: "NEVER",
    fallbackToCacheTimeout: 0,
    requestHeaders: { "expo-channel-name": environment },
  };

  if (!enabled) {
    return base;
  }

  const signingProfile = OTA_SIGNING_PROFILES[environment];
  if (!signingProfile) {
    throw new Error(
      `Signed OTA is not configured for ${environment}; provide a separate certificate before enabling it.`,
    );
  }

  const certificate =
    process.env.WHISPR_MOBILE_OTA_CERTIFICATE_PATH?.trim() || signingProfile.certificate;
  if (!fs.existsSync(path.resolve(__dirname, certificate))) {
    throw new Error(`OTA certificate does not exist: ${certificate}`);
  }

  return {
    ...base,
    codeSigningCertificate: certificate,
    codeSigningMetadata: {
      alg: "rsa-v1_5-sha256",
      keyid: signingProfile.keyid,
    },
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
    /*
     * Native açılış katmanı (SPEC-SPLASH K11).
     *
     * Statik pencere arka planı aurora ya da metin çizemez; tek işi JS açılış ekranı
     * devralana kadar **zemini ve işareti** aynı tutmak. Zemin değerleri temanın
     * `redesignLight.bg` / `redesignDark.bg` renkleridir, işaret 52dp Whispr markasıdır.
     * Android tarafı `res/drawable/splashscreen.xml` ile zaten bu düzende; buradaki
     * yapılandırma iOS'un prebuild'de aynı kareyi üretmesi içindir.
     */
    splash: {
      backgroundColor: "#F6F7FB",
      dark: {
        backgroundColor: "#131529",
        image: "./assets/whispr-splash.png",
        resizeMode: "contain",
      },
      image: "./assets/whispr-splash.png",
      resizeMode: "contain",
    },
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
      permissions: getWhisprMobileAndroidPermissions({
        includeStoreBlockers: environment === "uat" || environment === "canary",
      }),
      predictiveBackGestureEnabled: true,
      ...(fs.existsSync(GOOGLE_SERVICES_FILE)
        ? { googleServicesFile: "./google-services.json" }
        : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      "@livekit/react-native-expo-plugin",
      "./plugins/withWebRtc",
      "./plugins/withWhisprApkIntegrity",
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
      "./plugins/withWhisprGradleMemory",
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
    runtimeVersion: { policy: "fingerprint" },
    updates: buildUpdatesConfig(environment, publicConfig),
    web: {
      ...config.web,
      favicon: WHISPR_MOBILE_ICON.webFavicon,
    },
  };
};

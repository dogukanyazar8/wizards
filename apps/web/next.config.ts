import { resolveWebReleaseChannel } from "./src/lib/build-release-channel";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: string };

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean);
}

function shortId(value: string | undefined, length = 8) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, length) : undefined;
}

function isProductionValue(value: string | undefined) {
  return ["prod", "production", "stable"].includes(value?.trim().toLowerCase() ?? "");
}

const whisprVersion = firstNonEmpty(process.env.WHISPR_VERSION, packageJson.version) ?? "0.0.0";
const whisprBuildTime = firstNonEmpty(process.env.WHISPR_BUILD_TIME) ?? new Date().toISOString();
const whisprCommitId = shortId(
  firstNonEmpty(
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
  ),
);
const whisprDeployId = shortId(
  firstNonEmpty(process.env.RAILWAY_DEPLOYMENT_ID, process.env.VERCEL_DEPLOYMENT_ID),
);
const whisprGeneratedBuildId = [whisprCommitId, whisprDeployId].filter(Boolean).join("-");
const whisprBuildId =
  firstNonEmpty(
    whisprGeneratedBuildId,
    process.env.WHISPR_BUILD_ID,
    `${whisprVersion}-${whisprBuildTime.replace(/[:.]/g, "-")}`,
  ) ?? "development";
const whisprReleaseChannel =
  firstNonEmpty(
    process.env.WHISPR_RELEASE_CHANNEL,
    process.env.RAILWAY_ENVIRONMENT_NAME,
    process.env.VERCEL_ENV,
    process.env.NODE_ENV,
  ) ?? "development";
/**
 * Açılış ekranının sürüm satırı (SPEC-SPLASH §3.4): `Whispr 2.4.1 (1187) · Resonance`.
 *
 * `WHISPR_BUILD_ID` bu satıra giremez — o commit/deploy kimliğinden türeyen bir dize
 * (`a1b2c3d-4e5f6a7`) ve güncelleme bildiricisinin sözleşmesi. Parantezdeki sayı ayrı
 * bir yayın numarasıdır; verilmezse satır kısalır (`Whispr 2.4.1 · Resonance`), boş
 * parantez yazılmaz.
 */
const whisprBuildNumber = firstNonEmpty(process.env.WHISPR_BUILD_NUMBER) ?? "";
const whisprReleaseCodename =
  firstNonEmpty(
    process.env.WHISPR_RELEASE_CODENAME,
    process.env.NEXT_PUBLIC_WHISPR_RELEASE_CODENAME,
  ) ?? "Resonance";
const isProductionDeployment =
  isProductionValue(whisprReleaseChannel) ||
  isProductionValue(process.env.RAILWAY_ENVIRONMENT_NAME);
// pnpm can resolve the analyzer's `next` type import through another peer-dependency
// instance. Both instances are the same Next version, so normalize the wrapper at
// this boundary instead of leaking incompatible nominal types into this config.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
}) as unknown as (config: NextConfig) => NextConfig;
const turbopackRoot = fileURLToPath(new URL("../..", import.meta.url));

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=()",
  },
];

/**
 * Next'in geliştirme göstergesi (`<nextjs-portal>`) görünüm alanının sol alt köşesinde durur.
 * Sunucu rayının alt bloğu (`indirme` ve `sorun bildir` düğmeleri) tam olarak orada bitiyor;
 * gösterge ikisinin üstüne oturunca Playwright'in tıklaması
 * "`<nextjs-portal>` subtree intercepts pointer events" ile düşüyor — dokuz e2e kırığının
 * tamamı buydu. Gösterge yalnız geliştirme sunucusunda vardır (CI production build koşar),
 * bu yüzden kapatma da yalnız e2e kipinde: normal `pnpm dev` göstergeyi görmeye devam eder.
 */
const isE2ETestMode = process.env.E2E_TEST_MODE === "true";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  ...(isE2ETestMode ? { devIndicators: false as const } : {}),
  env: {
    NEXT_PUBLIC_WHISPR_BUILD_ID: whisprBuildId,
    NEXT_PUBLIC_WHISPR_BUILD_NUMBER: whisprBuildNumber,
    NEXT_PUBLIC_WHISPR_BUILD_TIME: whisprBuildTime,
    NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL: resolveWebReleaseChannel(whisprReleaseChannel),
    NEXT_PUBLIC_WHISPR_RELEASE_CODENAME: whisprReleaseCodename,
    NEXT_PUBLIC_WHISPR_VERSION: whisprVersion,
  },
  experimental: {
    cpus: 4,
    useTypeScriptCli: false,
  },
  reactCompiler: true,
  reactStrictMode: true,
  // Keep the patched Node 24 ESM entrypoint out of Turbopack's server bundle.
  serverExternalPackages: ["next-auth"],
  transpilePackages: ["@wizards/ui", "@wizards/types", "@wizards/db"],
  turbopack: {
    root: turbopackRoot,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: isProductionDeployment
          ? [
              ...securityHeaders,
              {
                key: "Strict-Transport-Security",
                value: "max-age=63072000; includeSubDomains; preload",
              },
            ]
          : securityHeaders,
      },
    ];
  },
};

const sentryOrg = firstNonEmpty(process.env.SENTRY_ORG);
const sentryProject = firstNonEmpty(process.env.SENTRY_PROJECT);
const sentryAuthToken = firstNonEmpty(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  ...(sentryOrg ? { org: sentryOrg } : {}),
  ...(sentryProject ? { project: sentryProject } : {}),
  ...(sentryAuthToken ? { authToken: sentryAuthToken } : {}),
  sentryUrl: process.env.SENTRY_URL || "https://de.sentry.io",
  silent: true,
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  release: { name: whisprBuildId },
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});

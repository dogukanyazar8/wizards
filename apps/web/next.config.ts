import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
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
  return value?.trim().toLowerCase() === "production";
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
const isProductionDeployment =
  isProductionValue(whisprReleaseChannel) ||
  isProductionValue(process.env.RAILWAY_ENVIRONMENT_NAME);
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});
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

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  env: {
    NEXT_PUBLIC_WHISPR_BUILD_ID: whisprBuildId,
    NEXT_PUBLIC_WHISPR_BUILD_TIME: whisprBuildTime,
    NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL: whisprReleaseChannel,
    NEXT_PUBLIC_WHISPR_VERSION: whisprVersion,
  },
  reactCompiler: true,
  reactStrictMode: true,
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

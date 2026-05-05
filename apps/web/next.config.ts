import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: string };

const whisprVersion = packageJson.version ?? "0.0.0";
const whisprBuildTime =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_TIME ?? new Date().toISOString();
const whisprBuildId =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_ID ??
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  `${whisprVersion}-${whisprBuildTime}`;
const whisprReleaseChannel =
  process.env.NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL ??
  process.env.RAILWAY_ENVIRONMENT_NAME ??
  process.env.NODE_ENV ??
  "development";

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
  env: {
    NEXT_PUBLIC_WHISPR_BUILD_ID: whisprBuildId,
    NEXT_PUBLIC_WHISPR_BUILD_TIME: whisprBuildTime,
    NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL: whisprReleaseChannel,
    NEXT_PUBLIC_WHISPR_VERSION: whisprVersion,
  },
  reactStrictMode: true,
  transpilePackages: ["@wizards/ui", "@wizards/types", "@wizards/db"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers:
          process.env.NODE_ENV === "production"
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

export default nextConfig;

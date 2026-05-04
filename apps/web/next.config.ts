import type { NextConfig } from "next";

function getOrigin(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function buildContentSecurityPolicy() {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const appOrigins = unique([
    getOrigin(process.env.APP_URL),
    getOrigin(process.env.AUTH_URL),
    getOrigin(process.env.NEXTAUTH_URL),
  ]);
  const liveKitOrigins = unique([
    getOrigin(process.env.LIVEKIT_URL),
    getOrigin(process.env.NEXT_PUBLIC_LIVEKIT_URL),
  ]);

  const directives = {
    "base-uri": ["'self'"],
    "connect-src": unique([
      "'self'",
      ...appOrigins,
      ...liveKitOrigins,
      "https://api.giphy.com",
      "https://*.giphy.com",
      "https://*.livekit.cloud",
      "https://*.ufs.sh",
      "https://*.uploadthing.com",
      "https://challenges.cloudflare.com",
      "wss://*.livekit.cloud",
      ...(isDevelopment
        ? ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"]
        : []),
    ]),
    "default-src": ["'self'"],
    "font-src": ["'self'", "data:"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    "img-src": [
      "'self'",
      "blob:",
      "data:",
      "https://*.giphy.com",
      "https://*.googleusercontent.com",
      "https://*.ufs.sh",
      "https://*.uploadthing.com",
      "https://avatars.githubusercontent.com",
      "https://media*.giphy.com",
    ],
    "media-src": [
      "'self'",
      "blob:",
      "data:",
      "https://*.ufs.sh",
      "https://*.uploadthing.com",
    ],
    "object-src": ["'none'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      "https://challenges.cloudflare.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "worker-src": ["'self'", "blob:"],
    ...(isDevelopment ? {} : { "upgrade-insecure-requests": [] }),
  };

  return Object.entries(directives)
    .map(([key, values]) => (values.length > 0 ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
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

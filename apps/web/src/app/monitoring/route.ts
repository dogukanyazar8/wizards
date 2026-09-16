import { createSentryTunnelHandler } from "@/lib/observability/sentry-tunnel";

export const runtime = "nodejs";

export const POST = createSentryTunnelHandler({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN });

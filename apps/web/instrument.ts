// Server ve outbox worker süreçleri için Sentry başlatma girişi.
// `node --import ./dist/instrument.js` ile uygulama kodundan ÖNCE yüklenir.
// KURAL: Bu dosya yalnız dış paket import edebilir. Yerel modüller esbuild
// tarafından entry başına kopyalandığından buradan import edilirse uygulama
// bundle'ındaki instance ile ayrışır.
import * as Sentry from "@sentry/nextjs";

// KAYNAK-DOĞRU: apps/web/src/lib/logger.ts. instrument.ts import-bağımsız
// olmak zorunda olduğundan bu iki desen kasıtlı olarak burada tekrarlanır;
// logger.ts değişirse burayı da güncelle.
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g;
const SECRET_PATTERN = /\b(?:sk|pk|ya29|gh[opsu])_[a-zA-Z0-9_-]{16,}\b/g;
function scrub(value: string) {
  return value.replace(JWT_PATTERN, "[redacted-jwt]").replace(SECRET_PATTERN, "[redacted-secret]");
}

function parseSampleRate(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

const dsn = process.env.SENTRY_DSN?.trim();

if (!dsn) {
  console.info("[observability] SENTRY_DSN not set; Sentry disabled.");
} else {
  Sentry.init({
    dsn,
    environment:
      process.env.WHISPR_RELEASE_CHANNEL?.trim() ||
      process.env.RAILWAY_ENVIRONMENT_NAME?.trim() ||
      process.env.NODE_ENV ||
      "development",
    release:
      process.env.WHISPR_BUILD_ID?.trim() ||
      process.env.RAILWAY_GIT_COMMIT_SHA?.trim()?.slice(0, 8) ||
      undefined,
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    ignoreTransactions: [/^GET \/(ready|health)$/, /^POST \/monitoring/],
    initialScope: {
      tags: {
        process: process.env.WHISPR_OUTBOX_WORKER === "true" ? "outbox-worker" : "web",
      },
    },
    beforeSend(event) {
      if (process.env.E2E_TEST_MODE === "true") {
        return null;
      }
      if (event.message) {
        event.message = scrub(event.message);
      }
      for (const value of event.exception?.values ?? []) {
        if (value.value) {
          value.value = scrub(value.value);
        }
      }
      for (const crumb of event.breadcrumbs ?? []) {
        if (crumb.message) {
          crumb.message = scrub(crumb.message);
        }
      }
      return event;
    },
  });
  console.info("[observability] Sentry initialized for server process.");
}

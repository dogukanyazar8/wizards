import { createRequire } from "node:module";
import type * as SentryNextjs from "@sentry/nextjs";

// tsx runs this script directly (not through Next's build or the esbuild
// pipeline), so plain `import * as Sentry` only resolves a partial CJS
// export surface (init works, captureMessage/flush do not). See the
// "Known Quirks" section of docs/operations/observability.md.
const require = createRequire(import.meta.url);
const Sentry = require("@sentry/nextjs") as typeof SentryNextjs;

const dsn = process.env.SENTRY_DSN?.trim();

if (!dsn) {
  console.error(
    "SENTRY_DSN gerekli. Örnek: SENTRY_DSN=... pnpm --filter @wizards/web exec tsx scripts/send-sentry-test-event.ts",
  );
  process.exit(1);
}

Sentry.init({ dsn, environment: "smoke-test", sendDefaultPii: false });
Sentry.captureMessage(`whispr observability smoke ${new Date().toISOString()}`);

const flushed = await Sentry.flush(5000);
console.info(flushed ? "Test olayı gönderildi." : "Flush zaman aşımı — DSN/ağ kontrol et.");
process.exit(flushed ? 0 : 1);

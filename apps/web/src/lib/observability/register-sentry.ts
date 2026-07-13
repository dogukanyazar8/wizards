import { createRequire } from "node:module";
import type * as SentryNextjs from "@sentry/nextjs";
import { redactErrorForReport, redactText } from "@/lib/logger";
import { registerErrorReporter } from "@/lib/observability/reporter";

// @sentry/nextjs bir CJS pakettir. Bu dosya esbuild ile server.js/
// outbox-worker.js içine bundle'lanır (Next'in webpack/turbopack build-time
// Sentry aliaslamasından GEÇMEZ), bu yüzden plain `import * as Sentry` yalnız
// Node'un ESM named-export statik analizinin (cjs-module-lexer) çözebildiği
// kısıtlı bir alt kümeyi verir ve isInitialized/captureException gibi
// fonksiyonlar sessizce undefined kalabilir. createRequire tam CJS
// çözümlemesini garanti eder; `import type` yalnız derleme-zamanı tip
// bilgisi taşır, ayrı bir runtime modül örneği oluşturmaz.
const require = createRequire(import.meta.url);
const Sentry = require("@sentry/nextjs") as typeof SentryNextjs;

export function registerSentryErrorReporter() {
  if (!Sentry.isInitialized()) {
    return false;
  }

  registerErrorReporter((scope, error) => {
    Sentry.captureException(redactErrorForReport(error), {
      tags: { "log.scope": redactText(scope) },
    });
  });

  return true;
}

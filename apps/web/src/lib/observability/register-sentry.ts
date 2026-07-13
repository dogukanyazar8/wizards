import * as Sentry from "@sentry/nextjs";
import { redactErrorForReport, redactText } from "@/lib/logger";
import { registerErrorReporter } from "@/lib/observability/reporter";

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

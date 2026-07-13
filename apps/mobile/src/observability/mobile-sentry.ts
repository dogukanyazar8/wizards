import * as Sentry from "@sentry/react-native";

// KAYNAK-DOĞRU: apps/web/src/lib/logger.ts — mobil web logger'ı paylaşmaz,
// desen kasıtlı olarak burada tekrarlanır.
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g;
const SECRET_PATTERN = /\b(?:sk|pk|ya29|gh[opsu])_[a-zA-Z0-9_-]{16,}\b/g;
function scrub(value: string) {
  return value.replace(JWT_PATTERN, "[redacted-jwt]").replace(SECRET_PATTERN, "[redacted-secret]");
}

interface MobileSentryConfig {
  environment: string;
  sentryDsn: string | null;
}

let initialized = false;

export function initMobileSentry(config: MobileSentryConfig) {
  if (initialized || !config.sentryDsn || __DEV__) {
    return false;
  }

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    enableAppHangTracking: true,
    beforeSend(event) {
      if (event.message) {
        event.message = scrub(event.message);
      }
      for (const value of event.exception?.values ?? []) {
        if (value.value) {
          value.value = scrub(value.value);
        }
      }
      return event;
    },
  });

  initialized = true;
  return true;
}

export function reportMobileBoundaryError(error: unknown, componentStack: string | null | undefined) {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
    contexts: {
      react: { componentStack: componentStack ?? "unavailable" },
    },
  });
}

export function addMobileSecurityBreadcrumb(event: string) {
  if (!initialized) {
    return;
  }

  Sentry.addBreadcrumb({ category: "security", level: "warning", message: event });
}

export const wrapWithSentry = Sentry.wrap;

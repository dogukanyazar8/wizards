import * as Sentry from "@sentry/nextjs";
import { redactText } from "@/lib/logger";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn && process.env.NEXT_PUBLIC_E2E_TEST_MODE !== "true") {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL || "development",
    release: process.env.NEXT_PUBLIC_WHISPR_BUILD_ID || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    tunnel: "/monitoring",
    beforeSend(event) {
      if (event.message) {
        event.message = redactText(event.message);
      }
      for (const value of event.exception?.values ?? []) {
        if (value.value) {
          value.value = redactText(value.value);
        }
      }
      return event;
    },
  });

  Sentry.setTag(
    "app_surface",
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "desktop" : "web",
  );
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

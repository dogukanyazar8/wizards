import { recordWebFault } from "@/lib/observability/fault-log";

export type ErrorReporter = (scope: string, error: unknown) => void;

let activeReporter: ErrorReporter | null = null;

export function registerErrorReporter(reporter: ErrorReporter) {
  activeReporter = reporter;
}

export function clearErrorReporter() {
  activeReporter = null;
}

export function reportError(scope: string, error: unknown) {
  // The fault trail is written before the reporter guard on purpose: a report
  // written on a build with no Sentry DSN must still carry its crash trail.
  // `recordWebFault` is a no-op outside the browser, so a server request can
  // never leave a line behind for someone else's report to pick up.
  try {
    recordWebFault(error);
  } catch {
    // A diagnostics buffer must never break the flow it observes.
  }

  if (!activeReporter) {
    return;
  }
  try {
    activeReporter(scope, error);
  } catch {
    // Raporlayıcı asla uygulama akışını kıramaz; hata izleme best-effort'tur.
  }
}

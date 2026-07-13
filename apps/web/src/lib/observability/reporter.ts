export type ErrorReporter = (scope: string, error: unknown) => void;

let activeReporter: ErrorReporter | null = null;

export function registerErrorReporter(reporter: ErrorReporter) {
  activeReporter = reporter;
}

export function clearErrorReporter() {
  activeReporter = null;
}

export function reportError(scope: string, error: unknown) {
  if (!activeReporter) {
    return;
  }
  try {
    activeReporter(scope, error);
  } catch {
    // Raporlayıcı asla uygulama akışını kıramaz; hata izleme best-effort'tur.
  }
}

import { recordMobilePerformanceSample } from "./mobile-performance-metrics";

/**
 * Sending, as two numbers the reader feels separately.
 *
 * `send-echo` is the bubble appearing — pure client work, and the one that has to
 * be immediate. `send-ack` is the server confirming it. A single "send latency"
 * hides which of the two is slow, and they have different budgets and different
 * fixes.
 *
 * Keyed by the client nonce, which is already the identity of an in-flight send.
 */
type MobileSendSpan = {
  echoReportedAt: number | null;
  startedAtMs: number;
};

const openSends = new Map<string, MobileSendSpan>();

export function beginMobileSendSpan(
  clientNonce: string,
  startedAtMs: number = globalThis.performance.now(),
): void {
  if (clientNonce.length === 0) {
    return;
  }

  openSends.set(clientNonce, { echoReportedAt: null, startedAtMs });
}

export function completeMobileSendEcho(
  clientNonce: string,
  completedAtMs: number = globalThis.performance.now(),
): number | null {
  const span = openSends.get(clientNonce);
  if (!span || span.echoReportedAt !== null) {
    return null;
  }

  span.echoReportedAt = completedAtMs;
  const durationMs = completedAtMs - span.startedAtMs;
  recordMobilePerformanceSample({
    context: { phase: "send-echo" },
    durationMs,
    metric: "navigation",
    surface: "navigation",
  });

  return durationMs;
}

export function completeMobileSendAck(
  clientNonce: string,
  completedAtMs: number = globalThis.performance.now(),
): number | null {
  const span = openSends.get(clientNonce);
  if (!span) {
    return null;
  }

  openSends.delete(clientNonce);
  const durationMs = completedAtMs - span.startedAtMs;
  recordMobilePerformanceSample({
    context: { phase: "send-ack" },
    durationMs,
    metric: "navigation",
    surface: "navigation",
  });

  return durationMs;
}

/** A failed send is not a slow send; the span goes without reporting a number. */
export function abandonMobileSendSpan(clientNonce: string): void {
  openSends.delete(clientNonce);
}

export function resetMobileSendTimingForTests(): void {
  openSends.clear();
}

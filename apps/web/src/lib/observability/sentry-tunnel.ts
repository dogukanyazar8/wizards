import { postSentryEnvelope } from "./sentry-tunnel-transport";

const MAX_ENVELOPE_BYTES = 1_048_576;
const MAX_HEADER_BYTES = 16_384;

class EnvelopeError extends Error {
  constructor(readonly status: number) {
    super("Invalid Sentry envelope");
  }
}

function parseDsn(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.password ||
      url.search ||
      url.hash ||
      !/^[a-zA-Z0-9_-]+$/.test(url.username) ||
      !/^o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io$/.test(url.hostname) ||
      !/^\/[1-9]\d*\/?$/.test(url.pathname)
    )
      return null;
    url.pathname = url.pathname.replace(/\/$/, "");
    return url;
  } catch {
    return null;
  }
}

function respond(status: number, extra: Record<string, string> = {}) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

function unavailable(status: number, seconds = 30) {
  return respond(status, {
    "Retry-After": String(seconds),
    "X-Sentry-Rate-Limits": `${seconds}::organization`,
  });
}

async function readEnvelope(request: Request, signal: AbortSignal) {
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity") throw new EnvelopeError(415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_ENVELOPE_BYTES)) {
    throw new EnvelopeError(413);
  }
  if (!request.body) throw new EnvelopeError(400);
  const reader = request.body.getReader();
  // A byte limit alone does not bound an array of arbitrarily tiny chunks.
  // At most 8 requests hold this fixed buffer; only initialized bytes are sent.
  const body = Buffer.allocUnsafe(MAX_ENVELOPE_BYTES);
  let size = 0;
  let complete = false;
  // Cancellation may race the underlying HTTP stream closing. Its rejection
  // is cleanup-only; the original abort/read error still determines the response.
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        complete = true;
        break;
      }
      if (size + value.byteLength > MAX_ENVELOPE_BYTES) throw new EnvelopeError(413);
      body.set(value, size);
      size += value.byteLength;
    }
    return body.subarray(0, size);
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

export function createSentryTunnelHandler({
  dsn,
  transport = postSentryEnvelope,
  timeoutMs = 8_000,
  maxConcurrent = 8,
}: {
  dsn: string | undefined;
  transport?: typeof postSentryEnvelope;
  timeoutMs?: number;
  maxConcurrent?: number;
}) {
  const configured = parseDsn(dsn);
  const target = configured
    ? new URL(`/api${configured.pathname}/envelope/`, configured.origin)
    : null;
  let active = 0;
  let lastWarning = 0;

  return async function handleSentryTunnel(request: Request): Promise<Response> {
    if (request.method !== "POST") return respond(405, { Allow: "POST" });
    if (request.signal.aborted) return respond(499);
    if (!configured || !target) return unavailable(503);
    if (active >= maxConcurrent) return unavailable(503, 1);
    active++;
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(), timeoutMs);
    const signal = AbortSignal.any([request.signal, deadline.signal]);
    let forwarding = false;
    try {
      const body = await readEnvelope(request, signal);
      const newline = body.indexOf(10);
      if (newline < 1 || newline > MAX_HEADER_BYTES || newline === body.length - 1) {
        throw new EnvelopeError(400);
      }
      let envelopeDsn: unknown;
      try {
        const header: unknown = JSON.parse(body.subarray(0, newline).toString("utf8"));
        envelopeDsn = header && typeof header === "object" && "dsn" in header ? header.dsn : null;
      } catch {
        throw new EnvelopeError(400);
      }
      if (parseDsn(envelopeDsn)?.href !== configured.href) throw new EnvelopeError(400);
      signal.throwIfAborted();
      forwarding = true;
      // Query parameters and envelope DSNs can never select the outbound target.
      const result = await transport(target, body, signal);
      if (
        result.status < 200 ||
        result.status >= 500 ||
        (result.status >= 300 && result.status < 400)
      ) {
        return unavailable(502);
      }
      const headers: Record<string, string> = {};
      for (const key of ["retry-after", "x-sentry-rate-limits"]) {
        const value = result.headers[key];
        if (typeof value === "string") headers[key] = value;
      }
      return respond(result.status, headers);
    } catch (error) {
      if (request.signal.aborted) return respond(499);
      if (deadline.signal.aborted) return unavailable(forwarding ? 504 : 408);
      if (error instanceof EnvelopeError) return respond(error.status);
      if (!forwarding) return respond(400);
      // Do not report a telemetry transport failure back through Sentry. Keep
      // diagnostics bounded and exclude payloads, URLs, credentials and stacks.
      const now = Date.now();
      if (now - lastWarning >= 60_000) {
        lastWarning = now;
        console.warn("[observability] Sentry tunnel upstream connection failed.");
      }
      return unavailable(502);
    } finally {
      clearTimeout(timeout);
      active--;
    }
  };
}

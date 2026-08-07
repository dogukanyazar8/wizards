import { timingSafeEqual } from "node:crypto";

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export const securityHeaders = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export function assertLoopbackHost(hostHeader, { port } = {}) {
  if (
    typeof hostHeader !== "string" ||
    hostHeader.trim() !== hostHeader ||
    hostHeader === "" ||
    hostHeader.includes("@") ||
    hostHeader.includes("/") ||
    hostHeader.includes("\\")
  ) {
    throw new HttpError(403, "invalid_host", "Loopback Host header required.");
  }
  let parsed;
  try {
    parsed = new URL(`http://${hostHeader}`);
  } catch {
    throw new HttpError(403, "invalid_host", "Loopback Host header required.");
  }
  if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(parsed.hostname)) {
    throw new HttpError(403, "invalid_host", "Loopback Host header required.");
  }
  if (port !== undefined && parsed.port !== String(port)) {
    throw new HttpError(403, "invalid_host", "Host port does not match dashboard listener.");
  }
}

function tokenMatches(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") {
    return false;
  }
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function assertMutationRequest(request, { expectedOrigin, token }) {
  if (request.headers.origin !== expectedOrigin) {
    throw new HttpError(403, "invalid_origin", "Same-origin request required.");
  }
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string" ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)
  ) {
    throw new HttpError(415, "invalid_content_type", "application/json required.");
  }
  if (!tokenMatches(request.headers["x-whispr-quality-token"], token)) {
    throw new HttpError(403, "invalid_token", "Valid local dashboard token required.");
  }
}

export async function readJsonBody(request, { maxBytes = 16_384 } = {}) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new HttpError(413, "body_too_large", "Request body is too large.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function assertExactKeys(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_body", "Request body must be a JSON object.");
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new HttpError(400, "unknown_field", `Unsupported request field: ${key}.`);
    }
  }
}

export function applySecurityHeaders(response, extraHeaders = {}) {
  for (const [name, value] of Object.entries({ ...securityHeaders, ...extraHeaders })) {
    response.setHeader(name, value);
  }
}

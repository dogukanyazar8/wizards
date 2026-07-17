import { reportError } from "@/lib/observability/reporter";

const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|authorization|cookie|hash|password|recovery[_-]?code|secret|token)/i;
const PII_KEY_NAMES = new Set(["email", "emailaddress", "ip", "ipaddress", "useragent"]);
const SAFE_DIAGNOSTIC_HASH_KEY_NAMES = new Set(["ipaddresshash", "useragenthash"]);
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g;
const LONG_SECRET_PATTERN = /\b(?:sk|pk|ya29|gh[opsu])_[a-zA-Z0-9_-]{16,}\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const KEYED_PII_PATTERN =
  /(\b(?:email|emailAddress|ip|ipAddress|query|search|userId|username|userAgent)\b\s*[:=]\s*)([^\s,;&]+)/gi;

function shouldRedactKey(key: string) {
  const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();

  // PII uses exact normalized names so emailVerified remains useful. Only known
  // diagnostic hashes are exempt; password and token hashes stay protected.
  if (SAFE_DIAGNOSTIC_HASH_KEY_NAMES.has(normalizedKey)) {
    return false;
  }

  return PII_KEY_NAMES.has(normalizedKey) || SENSITIVE_KEY_PATTERN.test(key);
}

export function redactText(value: string) {
  return value
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(LONG_SECRET_PATTERN, "[redacted-secret]")
    .replace(KEYED_PII_PATTERN, "$1[redacted-value]")
    .replace(EMAIL_PATTERN, "[redacted-email]");
}

export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (value instanceof Error) {
    const errorWithCode = value as Error & { code?: unknown };

    return {
      name: value.name,
      message: redactText(value.message),
      ...(typeof errorWithCode.code === "string" ? { code: errorWithCode.code } : {}),
    };
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : redactValue(item, seen),
    ]),
  );
}

function stringifyStructuredLog(entry: Record<string, unknown>) {
  try {
    return JSON.stringify(entry, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  } catch {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      scope: "logger",
      error: {
        message: "Failed to serialize structured log entry",
      },
    });
  }
}

export function formatErrorLog(scope: string, error: unknown, now = new Date()) {
  return stringifyStructuredLog({
    timestamp: now.toISOString(),
    level: "error",
    scope: redactText(scope),
    error: redactValue(error),
  });
}

export function formatWarningLog(scope: string, error: unknown, now = new Date()) {
  return stringifyStructuredLog({
    timestamp: now.toISOString(),
    level: "warn",
    scope: redactText(scope),
    error: redactValue(error),
  });
}

export function logError(scope: string, error: unknown) {
  console.error(formatErrorLog(scope, error));
  // Errors keep their class for the reporter's stack grouping; other payloads
  // stay plain so structured diagnostics are not flattened into a message.
  reportError(
    redactText(scope),
    error instanceof Error ? redactErrorForReport(error) : redactValue(error),
  );
}

export function logWarning(scope: string, error: unknown) {
  console.warn(formatWarningLog(scope, error));
}

export function redactErrorForReport(error: unknown): Error {
  if (error instanceof Error) {
    const redacted = new Error(redactText(error.message));
    redacted.name = error.name;
    if (error.stack) {
      redacted.stack = redactText(error.stack);
    }
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === "string") {
      (redacted as Error & { code?: string }).code = code;
    }
    return redacted;
  }

  const safe = redactValue(error);
  return new Error(redactText(typeof safe === "string" ? safe : JSON.stringify(safe)));
}

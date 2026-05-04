const SENSITIVE_KEY_PATTERN = /(api[_-]?key|authorization|cookie|hash|password|secret|token)/i;
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g;
const LONG_SECRET_PATTERN = /\b(?:sk|pk|ya29|gh[opsu])_[a-zA-Z0-9_-]{16,}\b/g;

function redactText(value: string) {
  return value
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(LONG_SECRET_PATTERN, "[redacted-secret]");
}

function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (value instanceof Error) {
    const errorWithCode = value as Error & { code?: unknown };

    return {
      name: value.name,
      message: redactText(value.message),
      ...(typeof errorWithCode.code === "string"
        ? { code: errorWithCode.code }
        : {}),
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
      SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactValue(item, seen),
    ]),
  );
}

export function logError(scope: string, error: unknown) {
  console.error(scope, redactValue(error));
}

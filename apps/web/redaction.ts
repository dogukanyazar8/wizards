const SENSITIVE_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|authorization|cookie|hash|password|recovery[_-]?code|secret|token)/i;

export const TEXT_REDACTION_RULES = [
  {
    pattern: /\b((?:postgres(?:ql)?|rediss?|https?):\/\/)[^/?#\s]*@/giu,
    replacement: "$1[redacted-userinfo]@",
  },
  {
    pattern: /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g,
    replacement: "[redacted-jwt]",
  },
  {
    pattern: /\b(?:sk|pk|ya29|gh[opsu])_[a-zA-Z0-9_-]{16,}\b/g,
    replacement: "[redacted-secret]",
  },
  {
    pattern:
      /(\b(?:email|emailAddress|ip|ipAddress|query|search|userId|username|userAgent)\b\s*[:=]\s*)([^\s,;&]+)/gi,
    replacement: "$1[redacted-value]",
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[redacted-email]",
  },
] as const;

export function redactText(value: string) {
  return TEXT_REDACTION_RULES.reduce(
    (redacted, rule) => redacted.replace(rule.pattern, rule.replacement),
    value,
  );
}

function isSensitiveQueryKey(key: string) {
  return SENSITIVE_QUERY_KEY_PATTERN.test(key);
}

function redactQueryString(value: string) {
  const query = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
  for (const key of Array.from(query.keys())) {
    if (isSensitiveQueryKey(key)) {
      query.delete(key);
      continue;
    }

    const values = query.getAll(key).map(redactText);
    query.delete(key);
    for (const item of values) {
      query.append(key, item);
    }
  }
  return query.toString();
}

function redactRequestUrl(value: string) {
  try {
    const url = new URL(value);
    url.search = redactQueryString(url.search);
    return url.toString();
  } catch {
    return redactText(value);
  }
}

type RedactableSentryEvent = {
  breadcrumbs?: Array<{ message?: string | undefined }> | undefined;
  exception?: { values?: Array<{ value?: string | undefined }> | undefined } | undefined;
  message?: string | undefined;
  request?:
    | {
        query_string?: unknown;
        url?: string | undefined;
      }
    | undefined;
};

export function redactSentryEvent<T extends RedactableSentryEvent>(event: T): T {
  if (event.message) {
    event.message = redactText(event.message);
  }
  for (const value of event.exception?.values ?? []) {
    if (value.value) {
      value.value = redactText(value.value);
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) {
      crumb.message = redactText(crumb.message);
    }
  }
  if (event.request?.url) {
    event.request.url = redactRequestUrl(event.request.url);
  }
  if (typeof event.request?.query_string === "string") {
    event.request.query_string = redactQueryString(event.request.query_string);
  } else if (
    event.request?.query_string &&
    !Array.isArray(event.request.query_string) &&
    typeof event.request.query_string === "object"
  ) {
    event.request.query_string = Object.fromEntries(
      Object.entries(event.request.query_string as Record<string, unknown>)
        .filter(([key]) => !isSensitiveQueryKey(key))
        .map(([key, value]) => [key, typeof value === "string" ? redactText(value) : value]),
    );
  } else if (Array.isArray(event.request?.query_string)) {
    event.request.query_string = event.request.query_string
      .filter(
        (entry): entry is [string, unknown] =>
          Array.isArray(entry) && typeof entry[0] === "string" && !isSensitiveQueryKey(entry[0]),
      )
      .map(([key, value]) => [key, typeof value === "string" ? redactText(value) : value]);
  }
  return event;
}

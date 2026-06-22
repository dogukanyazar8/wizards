export type E2EDiagnosticEntry = {
  failure?: string | undefined;
  level?: string | undefined;
  message?: string | undefined;
  method?: string | undefined;
  type: "console" | "pageerror" | "requestfailed";
  url?: string | undefined;
};

export const E2E_DIAGNOSTIC_ENTRY_LIMIT = 80;
const E2E_DIAGNOSTIC_TEXT_LIMIT = 2_000;

const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(access_token|auth|code|csrf|email|id_token|loginProof|password|refresh_token|secret|session|state|token)=([^&\s"'<>]+)/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function boundDiagnosticText(value: string): string {
  if (value.length <= E2E_DIAGNOSTIC_TEXT_LIMIT) {
    return value;
  }

  return `${value.slice(0, E2E_DIAGNOSTIC_TEXT_LIMIT)}...[truncated]`;
}

export function redactE2EDiagnosticText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return boundDiagnosticText(
    value
      .replace(SENSITIVE_ASSIGNMENT_PATTERN, (_match, key: string) => `${key}=[redacted]`)
      .replace(EMAIL_PATTERN, "[redacted-email]"),
  );
}

export function pushBoundedE2EDiagnosticEntry(
  entries: E2EDiagnosticEntry[],
  entry: E2EDiagnosticEntry,
  limit = E2E_DIAGNOSTIC_ENTRY_LIMIT,
): void {
  entries.push({
    failure: redactE2EDiagnosticText(entry.failure),
    level: redactE2EDiagnosticText(entry.level),
    message: redactE2EDiagnosticText(entry.message),
    method: redactE2EDiagnosticText(entry.method),
    type: entry.type,
    url: redactE2EDiagnosticText(entry.url),
  });

  while (entries.length > limit) {
    entries.shift();
  }
}

export function formatE2EDiagnosticEntries(entries: readonly E2EDiagnosticEntry[]): string {
  if (entries.length === 0) {
    return "No browser warnings, errors, page errors, or failed requests were captured.";
  }

  return entries
    .map((entry, index) => {
      const fields = [
        `#${index + 1}`,
        `type=${entry.type}`,
        entry.level ? `level=${entry.level}` : null,
        entry.method ? `method=${entry.method}` : null,
        entry.url ? `url=${entry.url}` : null,
        entry.failure ? `failure=${entry.failure}` : null,
        entry.message ? `message=${entry.message}` : null,
      ].filter(Boolean);

      return fields.join(" | ");
    })
    .join("\n");
}

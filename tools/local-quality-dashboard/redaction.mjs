const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/giu;
const CREDENTIAL_URL_PATTERN =
  /\b((?:postgres(?:ql)?|redis(?:s)?|https?):\/\/)[^\s/@:]+:[^\s/@]+@/giu;
const AUTHORIZATION_PATTERN = /(\bauthorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/giu;
const SECRET_ASSIGNMENT_PATTERN =
  /\b([a-z0-9_-]*(?:token|secret|password|private[_-]?key)[a-z0-9_-]*)\s*([=:])\s*(?!(?:postgres(?:ql)?|redis(?:s)?|https?):\/\/)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu;
const SENSITIVE_ENVIRONMENT_NAME =
  /(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|DATABASE_URL|REDIS_URL|AUTH)/u;

function replacementForKey(key) {
  return `${key}=[REDACTED]`;
}

export function collectSensitiveEnvironmentValues(environment = process.env) {
  return Object.entries(environment)
    .filter(
      ([name, value]) =>
        SENSITIVE_ENVIRONMENT_NAME.test(name) && typeof value === "string" && value.length >= 4,
    )
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

export function redactText(value, sensitiveValues = [], { maxLength = 8_192 } = {}) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 32) {
    throw new Error("Redaction maxLength must be an integer of at least 32.");
  }

  let output = String(value ?? "").replaceAll("\0", "");
  for (const secret of [...new Set(sensitiveValues)].sort(
    (left, right) => right.length - left.length,
  )) {
    if (typeof secret === "string" && secret.length >= 4) {
      output = output.replaceAll(secret, "[REDACTED]");
    }
  }
  output = output
    .replace(PRIVATE_KEY_PATTERN, "[REDACTED PRIVATE KEY]")
    .replace(CREDENTIAL_URL_PATTERN, "$1[REDACTED]@")
    .replace(AUTHORIZATION_PATTERN, "$1[REDACTED]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (_, key) => replacementForKey(key));

  if (output.length > maxLength) {
    const suffix = "…[TRUNCATED]";
    output = `${output.slice(0, maxLength - suffix.length)}${suffix}`;
  }
  return output;
}

export function redactObject(value, sensitiveValues = [], options = {}) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactObject(entry, sensitiveValues, options));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /(?:token|secret|password|private[_-]?key|authorization)/iu.test(key)
          ? "[REDACTED]"
          : redactObject(entry, sensitiveValues, options),
      ]),
    );
  }
  return typeof value === "string" ? redactText(value, sensitiveValues, options) : value;
}

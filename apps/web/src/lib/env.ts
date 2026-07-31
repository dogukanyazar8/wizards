import { parseTotpSecretKeyring } from "./auth/totp-secret-encryption";

export type WebRuntimeEnvironment = "development" | "production" | "test";

export type EnvValidationResult = {
  missing: string[];
  invalid: string[];
};
export type EnvSource = Record<string, string | undefined>;

const REQUIRED_PRODUCTION_ENV_VARS = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "APP_URL",
  "NEXTAUTH_URL",
  "SOCKET_ALLOWED_ORIGINS",
] as const;

const REQUIRED_OUTBOX_WORKER_PRODUCTION_ENV_VARS = ["DATABASE_URL", "REDIS_URL"] as const;
const REQUIRED_TOTP_SECRET_ENV_VARS = [
  "TOTP_SECRET_ENCRYPTION_KEYS",
  "TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION",
] as const;

const REQUIRED_URL_ENV_VARS = [
  "APP_URL",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "DATABASE_URL",
  "REDIS_URL",
] as const;

const OPTIONAL_BOOLEAN_ENV_VARS = [
  "NEXT_PUBLIC_VOICE_NOISE_FILTER_EXPERIMENTS",
  "NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS",
  "PERMISSION_CACHE_DISABLED",
  "PERMISSION_CACHE_METRICS",
  "VOICE_PERFORMANCE_METRICS",
  "WHISPR_OUTBOX_WORKER",
  "WORKSPACE_PERFORMANCE_METRICS",
] as const;

const OPTIONAL_POSITIVE_INTEGER_ENV_VARS = [
  "ATTACHMENT_SCAN_MAX_BYTES",
  "ATTACHMENT_SCAN_TIMEOUT_MS",
  "CLAMAV_PORT",
  "WHISPR_ADMIN_DASHBOARD_CACHE_MS",
  "WHISPR_OUTBOX_BATCH_SIZE",
  "WHISPR_OUTBOX_INTERVAL_MS",
  "WHISPR_OUTBOX_SHUTDOWN_TIMEOUT_MS",
  "WHISPR_READY_CACHE_MS",
  "WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS",
] as const;

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBooleanFlag(value: string) {
  return value === "true" || value === "false";
}

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function validateWebEnvironment(
  env: EnvSource,
  runtime: WebRuntimeEnvironment = env.NODE_ENV === "production"
    ? "production"
    : env.NODE_ENV === "test"
      ? "test"
      : "development",
): EnvValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of REQUIRED_TOTP_SECRET_ENV_VARS) {
    if (!isPresent(env[key])) {
      missing.push(key);
    }
  }

  if (REQUIRED_TOTP_SECRET_ENV_VARS.every((key) => isPresent(env[key]))) {
    try {
      parseTotpSecretKeyring(env);
    } catch {
      invalid.push("TOTP_SECRET_ENCRYPTION_KEYS");
    }
  }

  if (runtime === "production") {
    for (const key of REQUIRED_PRODUCTION_ENV_VARS) {
      if (!isPresent(env[key])) {
        missing.push(key);
      }
    }

    if (!isPresent(env.AUTH_SECRET) && !isPresent(env.NEXTAUTH_SECRET)) {
      missing.push("AUTH_SECRET");
    }

    if (
      isPresent(env.AUTH_SECRET) &&
      isPresent(env.NEXTAUTH_SECRET) &&
      env.AUTH_SECRET.trim() !== env.NEXTAUTH_SECRET.trim()
    ) {
      invalid.push("AUTH_SECRET/NEXTAUTH_SECRET");
    }
  }

  for (const key of REQUIRED_URL_ENV_VARS) {
    const value = env[key];
    if (isPresent(value) && !isValidUrl(value)) {
      invalid.push(key);
    }
  }

  for (const key of OPTIONAL_BOOLEAN_ENV_VARS) {
    const value = env[key];
    if (isPresent(value) && !isBooleanFlag(value)) {
      invalid.push(key);
    }
  }

  for (const key of OPTIONAL_POSITIVE_INTEGER_ENV_VARS) {
    const value = env[key];
    if (isPresent(value) && !isPositiveInteger(value)) {
      invalid.push(key);
    }
  }

  if (runtime === "production" && env.SOCKET_ALLOW_EMPTY_ORIGIN === "true") {
    invalid.push("SOCKET_ALLOW_EMPTY_ORIGIN");
  }

  return {
    invalid: Array.from(new Set(invalid)),
    missing: Array.from(new Set(missing)),
  };
}

export function assertWebEnvironment(
  env: EnvSource = process.env,
  runtime?: WebRuntimeEnvironment,
) {
  const result = validateWebEnvironment(env, runtime);

  if (result.missing.length > 0 || result.invalid.length > 0) {
    const parts = [
      result.missing.length > 0 ? `missing: ${result.missing.join(", ")}` : null,
      result.invalid.length > 0 ? `invalid: ${result.invalid.join(", ")}` : null,
    ].filter(Boolean);

    throw new Error(`Invalid Whispr web environment (${parts.join("; ")}).`);
  }
}

export function validateOutboxWorkerEnvironment(
  env: EnvSource,
  runtime: WebRuntimeEnvironment = env.NODE_ENV === "production"
    ? "production"
    : env.NODE_ENV === "test"
      ? "test"
      : "development",
): EnvValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (runtime === "production") {
    for (const key of REQUIRED_OUTBOX_WORKER_PRODUCTION_ENV_VARS) {
      if (!isPresent(env[key])) {
        missing.push(key);
      }
    }
  }

  for (const key of REQUIRED_OUTBOX_WORKER_PRODUCTION_ENV_VARS) {
    const value = env[key];
    if (isPresent(value) && !isValidUrl(value)) {
      invalid.push(key);
    }
  }

  for (const key of OPTIONAL_BOOLEAN_ENV_VARS) {
    const value = env[key];
    if (isPresent(value) && !isBooleanFlag(value)) {
      invalid.push(key);
    }
  }

  for (const key of OPTIONAL_POSITIVE_INTEGER_ENV_VARS) {
    const value = env[key];
    if (isPresent(value) && !isPositiveInteger(value)) {
      invalid.push(key);
    }
  }

  return {
    invalid: Array.from(new Set(invalid)),
    missing: Array.from(new Set(missing)),
  };
}

export function assertOutboxWorkerEnvironment(
  env: EnvSource = process.env,
  runtime?: WebRuntimeEnvironment,
) {
  const result = validateOutboxWorkerEnvironment(env, runtime);

  if (result.missing.length > 0 || result.invalid.length > 0) {
    const parts = [
      result.missing.length > 0 ? `missing: ${result.missing.join(", ")}` : null,
      result.invalid.length > 0 ? `invalid: ${result.invalid.join(", ")}` : null,
    ].filter(Boolean);

    throw new Error(`Invalid Whispr outbox worker environment (${parts.join("; ")}).`);
  }
}

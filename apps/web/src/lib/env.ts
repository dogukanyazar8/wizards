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

const REQUIRED_URL_ENV_VARS = [
  "APP_URL",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "DATABASE_URL",
  "REDIS_URL",
] as const;

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

  if (runtime === "production") {
    for (const key of REQUIRED_PRODUCTION_ENV_VARS) {
      if (!isPresent(env[key])) {
        missing.push(key);
      }
    }

    if (!isPresent(env.AUTH_SECRET) && !isPresent(env.NEXTAUTH_SECRET)) {
      missing.push("AUTH_SECRET");
    }
  }

  for (const key of REQUIRED_URL_ENV_VARS) {
    const value = env[key];
    if (isPresent(value) && !isValidUrl(value)) {
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
      result.missing.length > 0
        ? `missing: ${result.missing.join(", ")}`
        : null,
      result.invalid.length > 0
        ? `invalid: ${result.invalid.join(", ")}`
        : null,
    ].filter(Boolean);

    throw new Error(`Invalid Whispr web environment (${parts.join("; ")}).`);
  }
}

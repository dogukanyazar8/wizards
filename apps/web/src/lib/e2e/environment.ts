type E2EEnvironment = Record<string, string | undefined>;

type E2EEnvironmentIssue = {
  code: string;
  message: string;
  hint?: string;
};

type E2EEnvironmentSummary = {
  baseUrl: string;
  databaseTarget?: string | undefined;
  redisTarget?: string | undefined;
  skipWebServer: boolean;
};

export type E2EEnvironmentValidation = {
  ok: boolean;
  errors: E2EEnvironmentIssue[];
  warnings: E2EEnvironmentIssue[];
  summary: E2EEnvironmentSummary;
};

const SAFE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db"]);
const FORBIDDEN_HOST_PARTS = [
  "railway",
  "neon",
  "supabase",
  "render",
  "amazonaws",
  "azure",
  "google",
  "vercel",
] as const;

const LOCAL_APP_URL_KEYS = ["E2E_BASE_URL", "APP_URL", "AUTH_URL", "NEXTAUTH_URL"] as const;

function readEnv(env: E2EEnvironment, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function describeUrlTarget(url: URL): string {
  const databaseName = url.pathname.replace(/^\//, "");
  const port = url.port ? `:${url.port}` : "";
  return databaseName ? `${url.protocol}//${url.hostname}${port}/${databaseName}` : `${url.protocol}//${url.hostname}${port}`;
}

function describeOptionalUrlTarget(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return describeUrlTarget(new URL(value));
  } catch {
    return undefined;
  }
}

function parseUrl(value: string, issueLabel: string): URL | E2EEnvironmentIssue {
  try {
    return new URL(value);
  } catch {
    return {
      code: `${issueLabel}_invalid_url`,
      message: `${issueLabel} is not a valid URL.`,
    };
  }
}

function hasForbiddenHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  return FORBIDDEN_HOST_PARTS.some((part) => normalizedHost.includes(part));
}

function isTestLikeDatabaseName(databaseName: string): boolean {
  return /(^|[_-])(e2e|test)([_-]|$)/.test(databaseName) || databaseName.includes("whispr_e2e");
}

function validateLocalAppUrl(env: E2EEnvironment, key: (typeof LOCAL_APP_URL_KEYS)[number]): E2EEnvironmentIssue[] {
  const value = readEnv(env, key);
  if (!value) {
    return [];
  }

  const parsed = parseUrl(value, key.toLowerCase());
  if (!(parsed instanceof URL)) {
    return [parsed];
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return [
      {
        code: `${key.toLowerCase()}_invalid_protocol`,
        message: `${key} must use http or https for local Playwright runs.`,
      },
    ];
  }

  if (!SAFE_LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    return [
      {
        code: `${key.toLowerCase()}_not_loopback`,
        message: `${key} must point to a local loopback host for Playwright E2E.`,
        hint: "Do not run the session helper against remote UAT/staging/production URLs.",
      },
    ];
  }

  return [];
}

export function resolveE2EDatabaseUrl(env: E2EEnvironment = process.env): string {
  return readEnv(env, "E2E_DATABASE_URL") ?? readEnv(env, "DATABASE_URL") ?? "";
}

export function validateSafeE2EDatabaseUrl(
  databaseUrl: string,
  env: E2EEnvironment = process.env,
): E2EEnvironmentIssue[] {
  const errors: E2EEnvironmentIssue[] = [];

  if (env.E2E_TEST_MODE !== "true") {
    errors.push({
      code: "e2e_test_mode_required",
      message: 'E2E_TEST_MODE must be "true" before Playwright can reset test data.',
    });
  }

  if (env.NODE_ENV === "production") {
    errors.push({
      code: "node_env_production",
      message: "NODE_ENV must not be production for Playwright reset/seed operations.",
    });
  }

  if (!databaseUrl) {
    errors.push({
      code: "database_url_required",
      message: "E2E_DATABASE_URL or DATABASE_URL is required for Playwright reset/seed operations.",
    });
    return errors;
  }

  const parsed = parseUrl(databaseUrl, "e2e_database_url");
  if (!(parsed instanceof URL)) {
    errors.push(parsed);
    return errors;
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    errors.push({
      code: "database_url_invalid_protocol",
      message: "E2E database URL must use postgres/postgresql.",
    });
    return errors;
  }

  const normalizedHost = parsed.hostname.toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//, "").toLowerCase();
  const isLocalHost = SAFE_LOCAL_HOSTS.has(normalizedHost);
  const isTestDatabase = isTestLikeDatabaseName(databaseName);

  if (hasForbiddenHost(normalizedHost) || (!isLocalHost && !isTestDatabase)) {
    errors.push({
      code: "database_url_not_safe",
      message: `Refusing to reset non-test database target "${describeUrlTarget(parsed)}".`,
      hint: "Use a disposable local/test database such as whispr_e2e.",
    });
  }

  if (!isTestDatabase) {
    errors.push({
      code: "database_name_not_test_like",
      message: `Refusing to reset database "${databaseName}" because its name is not test-like.`,
      hint: 'Include "e2e", "test", or "whispr_e2e" in the database name.',
    });
  }

  return errors;
}

export function assertSafeE2EDatabaseUrl(
  databaseUrl: string,
  env: E2EEnvironment = process.env,
): void {
  const errors = validateSafeE2EDatabaseUrl(databaseUrl, env);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("\n"));
  }
}

export function validateSafeE2ERedisUrl(
  redisUrl: string,
  env: E2EEnvironment = process.env,
): E2EEnvironmentIssue[] {
  const errors: E2EEnvironmentIssue[] = [];

  if (env.E2E_TEST_MODE !== "true") {
    errors.push({
      code: "e2e_test_mode_required",
      message: 'E2E_TEST_MODE must be "true" before Playwright can reset Redis state.',
    });
  }

  const parsed = parseUrl(redisUrl, "redis_url");
  if (!(parsed instanceof URL)) {
    errors.push(parsed);
    return errors;
  }

  if (!["redis:", "rediss:"].includes(parsed.protocol)) {
    errors.push({
      code: "redis_url_invalid_protocol",
      message: "E2E Redis URL must use redis/rediss.",
    });
    return errors;
  }

  const normalizedHost = parsed.hostname.toLowerCase();
  const isLocalHost = SAFE_LOCAL_HOSTS.has(normalizedHost);
  const isTestHost = normalizedHost.includes("test") || normalizedHost.includes("e2e");

  if (hasForbiddenHost(normalizedHost) || (!isLocalHost && !isTestHost)) {
    errors.push({
      code: "redis_url_not_safe",
      message: `Refusing to reset non-test Redis target "${describeUrlTarget(parsed)}".`,
    });
  }

  return errors;
}

export function assertSafeE2ERedisUrl(redisUrl: string, env: E2EEnvironment = process.env): void {
  const errors = validateSafeE2ERedisUrl(redisUrl, env);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("\n"));
  }
}

export function validateE2EEnvironment(env: E2EEnvironment = process.env): E2EEnvironmentValidation {
  const errors: E2EEnvironmentIssue[] = [];
  const warnings: E2EEnvironmentIssue[] = [];
  const databaseUrl = resolveE2EDatabaseUrl(env);
  const redisUrl = readEnv(env, "REDIS_URL");
  const baseUrl = readEnv(env, "E2E_BASE_URL") ?? "http://127.0.0.1:3000";

  errors.push(...validateSafeE2EDatabaseUrl(databaseUrl, env));

  const password = readEnv(env, "E2E_TEST_PASSWORD");
  if (!password) {
    errors.push({
      code: "e2e_password_required",
      message: "E2E_TEST_PASSWORD is required and must be generated locally/inside CI.",
      hint: "Do not add fallback passwords to source code.",
    });
  } else if (password.length < 8) {
    errors.push({
      code: "e2e_password_too_short",
      message: "E2E_TEST_PASSWORD must be at least 8 characters.",
    });
  }

  for (const key of LOCAL_APP_URL_KEYS) {
    errors.push(...validateLocalAppUrl(env, key));
  }

  if (redisUrl) {
    errors.push(...validateSafeE2ERedisUrl(redisUrl, env));
  } else {
    warnings.push({
      code: "redis_url_missing",
      message: "REDIS_URL is not set. E2E can run without Redis, but realtime/rate-limit behavior will be less production-like.",
      hint: "Use REDIS_URL=redis://localhost:6379 for local parity with CI.",
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      baseUrl,
      databaseTarget: describeOptionalUrlTarget(databaseUrl),
      redisTarget: describeOptionalUrlTarget(redisUrl),
      skipWebServer: env.PLAYWRIGHT_SKIP_WEB_SERVER === "1",
    },
  };
}

export function assertE2EEnvironmentReady(env: E2EEnvironment = process.env): void {
  const validation = validateE2EEnvironment(env);
  if (!validation.ok) {
    throw new Error(formatE2EEnvironmentValidation(validation));
  }
}

export function formatE2EEnvironmentValidation(validation: E2EEnvironmentValidation): string {
  const lines: string[] = [];

  if (validation.ok) {
    lines.push("E2E environment preflight passed.");
    lines.push(`Database: ${validation.summary.databaseTarget ?? "not configured"}`);
    lines.push(`Redis: ${validation.summary.redisTarget ?? "not configured"}`);
    lines.push(`Base URL: ${validation.summary.baseUrl}`);
    lines.push(`Web server: ${validation.summary.skipWebServer ? "external server" : "Playwright-managed server"}`);
  } else {
    lines.push("E2E environment preflight failed.");
    lines.push("");
    lines.push("Problems:");
    for (const issue of validation.errors) {
      lines.push(`- ${issue.message}`);
      if (issue.hint) {
        lines.push(`  Hint: ${issue.hint}`);
      }
    }
  }

  if (validation.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const issue of validation.warnings) {
      lines.push(`- ${issue.message}`);
      if (issue.hint) {
        lines.push(`  Hint: ${issue.hint}`);
      }
    }
  }

  if (!validation.ok) {
    lines.push("");
    lines.push("PowerShell quick start:");
    lines.push('$env:E2E_TEST_MODE="true"');
    lines.push('$env:E2E_DATABASE_URL="postgresql://wizards:wizards@localhost:5432/whispr_e2e"');
    lines.push('$env:DATABASE_URL=$env:E2E_DATABASE_URL');
    lines.push('$env:REDIS_URL="redis://localhost:6379"');
    lines.push('$env:E2E_BASE_URL="http://127.0.0.1:3000"');
    lines.push('$env:APP_URL=$env:E2E_BASE_URL');
    lines.push('$env:AUTH_URL=$env:E2E_BASE_URL');
    lines.push('$env:NEXTAUTH_URL=$env:E2E_BASE_URL');
    lines.push('$env:AUTH_SECRET="whispr-e2e-auth-secret-change-me-local-only"');
    lines.push('$env:NEXTAUTH_SECRET=$env:AUTH_SECRET');
    lines.push('$env:E2E_TEST_PASSWORD="<generate-a-local-random-password>"');
  }

  return lines.join("\n");
}

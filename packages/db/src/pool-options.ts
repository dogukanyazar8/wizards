export type PrismaPoolOptions = {
  connectionString: string;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  max: number;
};

export type PrismaPoolEnvironment = NodeJS.Dict<string>;

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function readBoundedInteger(
  environment: PrismaPoolEnvironment,
  key: keyof PrismaPoolEnvironment,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = environment[key]?.trim();

  if (!value) {
    return fallback;
  }

  if (!/^\d+$/u.test(value)) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
  }

  return parsed;
}

export function readPrismaPoolOptions(
  environment: PrismaPoolEnvironment = process.env,
): PrismaPoolOptions {
  const connectionString = environment.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the PostgreSQL Prisma adapter.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid direct PostgreSQL URL.");
  }

  if (!POSTGRES_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(
      "DATABASE_URL must be a direct PostgreSQL URL, not an Accelerate or proxy URL.",
    );
  }

  return {
    connectionString,
    connectionTimeoutMillis: readBoundedInteger(
      environment,
      "DATABASE_CONNECTION_TIMEOUT_MS",
      5_000,
      1_000,
      60_000,
    ),
    idleTimeoutMillis: readBoundedInteger(
      environment,
      "DATABASE_IDLE_TIMEOUT_MS",
      300_000,
      10_000,
      600_000,
    ),
    max: readBoundedInteger(environment, "DATABASE_POOL_MAX", 10, 1, 20),
  };
}

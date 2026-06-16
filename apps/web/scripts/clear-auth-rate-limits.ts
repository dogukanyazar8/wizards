import Redis from "ioredis";

type Scope = "all" | "email-verification" | "login" | "password-reset" | "register";

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const LOCAL_REDIS_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const SCOPE_PATTERNS = {
  "email-verification": ["rate:email-verification:*"],
  login: ["rate:login:*"],
  "password-reset": ["rate:password-reset:*"],
  register: ["rate:register:*"],
} satisfies Record<Exclude<Scope, "all">, string[]>;

function parseArgs(argv: string[]) {
  let dryRun = false;
  let scope: Scope = "login";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--scope") {
      const next = argv[index + 1] as Scope | undefined;
      if (!next || !isScope(next)) {
        throw new Error(
          `Invalid --scope value. Expected one of: ${getScopes().join(", ")}.`,
        );
      }
      scope = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, scope };
}

function getScopes() {
  return ["login", "register", "password-reset", "email-verification", "all"] as const;
}

function isScope(value: string): value is Scope {
  return (getScopes() as readonly string[]).includes(value);
}

function assertLocalDevelopmentRedis(redisUrl: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to clear auth rate limits when NODE_ENV=production.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL.");
  }

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!LOCAL_REDIS_HOSTS.has(host)) {
    throw new Error(`Refusing to clear non-local Redis host: ${host}.`);
  }
}

function getPatterns(scope: Scope) {
  if (scope === "all") {
    return Object.values(SCOPE_PATTERNS).flat();
  }

  return SCOPE_PATTERNS[scope];
}

async function scanKeys(redis: Redis, pattern: string) {
  let cursor = "0";
  const keys: string[] = [];

  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", "100");
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== "0");

  return keys;
}

async function main() {
  const { dryRun, scope } = parseArgs(process.argv.slice(2));
  const redisUrl = process.env.REDIS_URL?.trim() || DEFAULT_REDIS_URL;
  assertLocalDevelopmentRedis(redisUrl);

  const redis = new Redis(redisUrl, {
    connectionName: "whispr:dev-clear-auth-rate-limits",
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();

    let matched = 0;
    let deleted = 0;
    for (const pattern of getPatterns(scope)) {
      const keys = await scanKeys(redis, pattern);
      matched += keys.length;

      if (!dryRun && keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    }

    const action = dryRun ? "Matched" : "Deleted";
    console.info(`${action} ${dryRun ? matched : deleted} auth rate-limit key(s).`);
    console.info(`Scope: ${scope}`);
    console.info(`Redis: ${new URL(redisUrl).host}`);
  } finally {
    await redis.quit();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

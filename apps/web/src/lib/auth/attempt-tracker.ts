export type AttemptState = {
  failures: number;
  lockedUntilMs: number | null;
};

export type AtomicAttemptFailureInput = {
  freeFailures: number;
  initialBackoffMs: number;
  key: string;
  maxBackoffMs: number;
  nowMs: number;
  windowSeconds: number;
};

export type AttemptStore = {
  del: (key: string) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  recordFailure?: (input: AtomicAttemptFailureInput) => Promise<AttemptState>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<unknown>;
};

export type AttemptTrackerConfig = {
  freeFailures: number;
  initialBackoffMs: number;
  keyPrefix: string;
  maxBackoffMs: number;
  windowSeconds: number;
};

type AttemptRedis = Pick<AttemptStore, "del" | "get" | "set"> & {
  eval: (script: string, keyCount: number, ...args: Array<number | string>) => Promise<unknown>;
};

const RECORD_ATTEMPT_FAILURE_SCRIPT = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
local freeFailures = tonumber(ARGV[2])
local initialBackoffMs = tonumber(ARGV[3])
local maxBackoffMs = tonumber(ARGV[4])
local windowSeconds = tonumber(ARGV[5])

local failures = 0
local lockedUntilMs = 0
local rawState = redis.call("GET", key)
if rawState then
  local decoded, state = pcall(cjson.decode, rawState)
  if decoded and type(state) == "table" then
    if type(state.failures) == "number" and state.failures >= 0 then
      failures = math.floor(state.failures)
    end
    if type(state.lockedUntilMs) == "number" then
      lockedUntilMs = state.lockedUntilMs
    end
  end
end

if lockedUntilMs > nowMs then
  return { failures, lockedUntilMs }
end

failures = failures + 1
lockedUntilMs = 0
if failures > freeFailures then
  local exponent = math.min(failures - freeFailures - 1, 8)
  local backoffMs = math.min(initialBackoffMs * (2 ^ exponent), maxBackoffMs)
  lockedUntilMs = nowMs + backoffMs
end

local storedLockedUntilMs = cjson.null
if lockedUntilMs > 0 then
  storedLockedUntilMs = lockedUntilMs
end

redis.call(
  "SET",
  key,
  cjson.encode({ failures = failures, lockedUntilMs = storedLockedUntilMs }),
  "EX",
  windowSeconds
)
return { failures, lockedUntilMs }
`;

function parseAttemptState(rawValue: string | null): AttemptState {
  if (!rawValue) {
    return { failures: 0, lockedUntilMs: null };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AttemptState>;
    return {
      failures: Number.isInteger(parsed.failures) ? Math.max(0, parsed.failures ?? 0) : 0,
      lockedUntilMs:
        typeof parsed.lockedUntilMs === "number" && Number.isFinite(parsed.lockedUntilMs)
          ? parsed.lockedUntilMs
          : null,
    };
  } catch {
    return { failures: 0, lockedUntilMs: null };
  }
}

function validateConfig(config: AttemptTrackerConfig) {
  if (!Number.isInteger(config.freeFailures) || config.freeFailures < 0) {
    throw new RangeError("Attempt tracker freeFailures must be a non-negative integer.");
  }
  if (!Number.isFinite(config.initialBackoffMs) || config.initialBackoffMs <= 0) {
    throw new RangeError("Attempt tracker initialBackoffMs must be positive.");
  }
  if (!Number.isFinite(config.maxBackoffMs) || config.maxBackoffMs < config.initialBackoffMs) {
    throw new RangeError("Attempt tracker maxBackoffMs must cover the initial backoff.");
  }
  if (!Number.isInteger(config.windowSeconds) || config.windowSeconds <= 0) {
    throw new RangeError("Attempt tracker windowSeconds must be a positive integer.");
  }
  if (!config.keyPrefix.trim()) {
    throw new TypeError("Attempt tracker keyPrefix is required.");
  }
}

function getBackoffMs(
  config: Pick<AttemptTrackerConfig, "freeFailures" | "initialBackoffMs" | "maxBackoffMs">,
  failures: number,
) {
  if (failures <= config.freeFailures) {
    return 0;
  }

  const exponent = Math.min(failures - config.freeFailures - 1, 8);
  return Math.min(config.initialBackoffMs * 2 ** exponent, config.maxBackoffMs);
}

function getRetryAfterSeconds(lockedUntilMs: number, nowMs: number) {
  return Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1_000));
}

async function readAttemptState(store: AttemptStore, key: string) {
  return parseAttemptState(await store.get(key));
}

async function writeAttemptState(
  store: AttemptStore,
  key: string,
  state: AttemptState,
  windowSeconds: number,
) {
  await store.set(key, JSON.stringify(state), "EX", windowSeconds);
}

async function recordFailureWithFallback(store: AttemptStore, input: AtomicAttemptFailureInput) {
  const previous = await readAttemptState(store, input.key);
  if (previous.lockedUntilMs && previous.lockedUntilMs > input.nowMs) {
    return previous;
  }

  const failures = previous.failures + 1;
  const backoffMs = getBackoffMs(input, failures);
  const state = {
    failures,
    lockedUntilMs: backoffMs > 0 ? input.nowMs + backoffMs : null,
  } satisfies AttemptState;

  await writeAttemptState(store, input.key, state, input.windowSeconds);
  return state;
}

function parseAtomicFailureResult(result: unknown): AttemptState {
  if (!Array.isArray(result) || result.length < 2) {
    throw new TypeError("Attempt tracker Redis result is invalid.");
  }

  const failures = Number(result[0]);
  const lockedUntilMs = Number(result[1]);
  if (!Number.isInteger(failures) || failures < 0 || !Number.isFinite(lockedUntilMs)) {
    throw new TypeError("Attempt tracker Redis state is invalid.");
  }

  return {
    failures,
    lockedUntilMs: lockedUntilMs > 0 ? lockedUntilMs : null,
  };
}

export function createRedisAttemptStore(redis: AttemptRedis): AttemptStore {
  return {
    del: (key) => redis.del(key),
    get: (key) => redis.get(key),
    recordFailure: async (input) =>
      parseAtomicFailureResult(
        await redis.eval(
          RECORD_ATTEMPT_FAILURE_SCRIPT,
          1,
          input.key,
          input.nowMs,
          input.freeFailures,
          input.initialBackoffMs,
          input.maxBackoffMs,
          input.windowSeconds,
        ),
      ),
    set: (key, value, mode, seconds) => redis.set(key, value, mode, seconds),
  };
}

export function createMemoryAttemptStore(): AttemptStore {
  const values = new Map<string, string>();

  return {
    async del(key) {
      values.delete(key);
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async recordFailure(input) {
      const previous = parseAttemptState(values.get(input.key) ?? null);
      if (previous.lockedUntilMs && previous.lockedUntilMs > input.nowMs) {
        return previous;
      }

      const failures = previous.failures + 1;
      const backoffMs = getBackoffMs(input, failures);
      const state = {
        failures,
        lockedUntilMs: backoffMs > 0 ? input.nowMs + backoffMs : null,
      } satisfies AttemptState;
      values.set(input.key, JSON.stringify(state));
      return state;
    },
    async set(key, value) {
      values.set(key, value);
    },
  };
}

export function createAttemptTracker(config: AttemptTrackerConfig) {
  validateConfig(config);
  const normalizedConfig = { ...config, keyPrefix: config.keyPrefix.trim() };

  function getKey(identifier: string) {
    if (!identifier) {
      throw new TypeError("Attempt tracker identifier is required.");
    }
    return `${normalizedConfig.keyPrefix}:${identifier}`;
  }

  return {
    async assertAllowed(args: { identifier: string; nowMs: number; store: AttemptStore }) {
      const state = await readAttemptState(args.store, getKey(args.identifier));
      if (state.lockedUntilMs && state.lockedUntilMs > args.nowMs) {
        return {
          allowed: false as const,
          retryAfterSeconds: getRetryAfterSeconds(state.lockedUntilMs, args.nowMs),
        };
      }

      return { allowed: true as const };
    },
    getKey,
    async recordFailure(args: { identifier: string; nowMs: number; store: AttemptStore }) {
      const input = {
        ...normalizedConfig,
        key: getKey(args.identifier),
        nowMs: args.nowMs,
      } satisfies AtomicAttemptFailureInput;
      const state = args.store.recordFailure
        ? await args.store.recordFailure(input)
        : await recordFailureWithFallback(args.store, input);

      if (state.lockedUntilMs && state.lockedUntilMs > args.nowMs) {
        return {
          failures: state.failures,
          locked: true as const,
          retryAfterSeconds: getRetryAfterSeconds(state.lockedUntilMs, args.nowMs),
        };
      }

      return { failures: state.failures, locked: false as const };
    },
    async resetFailures(args: { identifier: string; store: AttemptStore }) {
      await args.store.del(getKey(args.identifier));
    },
  };
}

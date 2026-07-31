import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

const MOBILE_REFRESH_TOKEN_KEY_PREFIX = "auth:mobile-refresh:";
const MOBILE_REFRESH_RETRY_KEY_PREFIX = "auth:mobile-refresh-retry:";
const MOBILE_SESSION_KEY_PREFIX = "auth:mobile-session:";
const MOBILE_REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{48,192}$/;
const RETRY_RECEIPT_HKDF_SALT = Buffer.from("whispr-mobile-refresh-family-v1", "utf8");
const RETRY_RECEIPT_HKDF_INFO = Buffer.from("retry-receipt-aes-256-gcm", "utf8");
const RETRY_RECEIPT_VERSION = 1;

const CREATE_MOBILE_REFRESH_FAMILY_SCRIPT = `
-- mobile-refresh-family:create-v1
if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
  return {"COLLISION"}
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])
return {"CREATED"}
`;

const ROTATE_MOBILE_REFRESH_FAMILY_SCRIPT = `
-- mobile-refresh-family:rotate-v1
local function decode(value)
  local ok, decoded = pcall(cjson.decode, value)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

local function revoke()
  redis.call("DEL", KEYS[2])
  return {"REPLAY"}
end

local oldRaw = redis.call("GET", KEYS[1])
if not oldRaw then
  return {"INVALID"}
end

local old = decode(oldRaw)
if not old or old.sessionId ~= ARGV[5] or old.userId ~= ARGV[6] then
  return {"INVALID"}
end

local sessionRaw = redis.call("GET", KEYS[2])
if not sessionRaw then
  return {"INVALID"}
end

local session = decode(sessionRaw)
if not session or session.userId ~= ARGV[6] then
  return {"INVALID"}
end

local nowMs = tonumber(ARGV[1])
local graceMs = tonumber(ARGV[2])
local expectedGeneration = tonumber(ARGV[8])
if not nowMs or not graceMs or not expectedGeneration then
  return {"INVALID"}
end

local legacyToken = old.familyId == nil and old.generation == nil
local legacySession =
  session.familyId == nil and
  session.currentGeneration == nil and
  session.currentTokenHash == nil

if not legacyToken then
  if old.familyId ~= ARGV[7] or tonumber(old.generation) ~= expectedGeneration then
    return {"INVALID"}
  end
end

local consumedAt = tonumber(old.consumedAt)
if consumedAt then
  if legacyToken then
    return revoke()
  end
  if nowMs - consumedAt > graceMs then
    return revoke()
  end
  if
    session.familyId ~= ARGV[7] or
    tonumber(session.currentGeneration) ~= expectedGeneration + 1 or
    session.currentTokenHash ~= old.successorTokenHash
  then
    return revoke()
  end

  local receipt = redis.call("GET", KEYS[4])
  if not receipt then
    return revoke()
  end
  return {"RETRY", receipt, old.successorTokenHash}
end

if legacyToken then
  if not legacySession then
    return revoke()
  end
else
  if
    session.familyId ~= ARGV[7] or
    tonumber(session.currentGeneration) ~= expectedGeneration or
    session.currentTokenHash ~= ARGV[9]
  then
    return revoke()
  end
end

old.kind = "rotated"
old.familyId = ARGV[7]
old.generation = expectedGeneration
old.consumedAt = nowMs
old.successorTokenHash = ARGV[10]

session.familyId = ARGV[7]
session.currentGeneration = expectedGeneration + 1
session.currentTokenHash = ARGV[10]
session.lastRotatedAt = nowMs

local encodedOld = cjson.encode(old)
local encodedSession = cjson.encode(session)
local successorStored = redis.call("SET", KEYS[3], ARGV[11], "EX", ARGV[3], "NX")
if not successorStored then
  return {"COLLISION"}
end

redis.call("SET", KEYS[1], encodedOld, "EX", ARGV[3])
redis.call("SET", KEYS[2], encodedSession, "EX", ARGV[3])
redis.call("SET", KEYS[4], ARGV[12], "EX", ARGV[4])
return {"ROTATED"}
`;

const REVOKE_MOBILE_REFRESH_FAMILY_SCRIPT = `
-- mobile-refresh-family:revoke-v1
redis.call("DEL", KEYS[1])
redis.call("DEL", KEYS[2])
redis.call("DEL", KEYS[3])
return "REVOKED"
`;

export interface MobileRefreshFamilyRedis {
  eval(script: string, keyCount: number, ...args: string[]): Promise<unknown>;
}

interface MobileRefreshTokenRecord {
  consumedAt?: number;
  createdAt: number;
  familyId?: string;
  generation?: number;
  kind?: "active" | "rotated";
  sessionId: string;
  successorTokenHash?: string;
  userId: string;
}

interface MobileRefreshSessionRecord {
  createdAt: number;
  currentGeneration?: number;
  currentTokenHash?: string;
  familyId?: string;
  lastRotatedAt: number;
  userId: string;
}

interface MobileRefreshRetryReceipt {
  familyId: string;
  generation: number;
  refreshToken: string;
  sessionId: string;
  successorTokenHash: string;
  userId: string;
}

interface EncryptedMobileRefreshRetryReceipt {
  ciphertext: string;
  iv: string;
  tag: string;
  v: 1;
}

export interface MobileRefreshRotationResult {
  refreshToken: string;
  sessionId: string;
  userId: string;
}

function isNonEmptyString(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function redisValueToString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return null;
}

function parseScriptResult(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Mobile refresh Redis script returned an invalid result.");
  }

  return value.map((entry) => {
    const parsed = redisValueToString(entry);
    if (parsed === null) {
      throw new Error("Mobile refresh Redis script returned an invalid value.");
    }
    return parsed;
  });
}

function parseMobileRefreshTokenRecord(value: unknown): MobileRefreshTokenRecord | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MobileRefreshTokenRecord>;
    if (
      !isNonEmptyString(parsed.userId) ||
      !isNonEmptyString(parsed.sessionId) ||
      !isNonNegativeInteger(parsed.createdAt)
    ) {
      return null;
    }

    const hasFamily = parsed.familyId !== undefined;
    const hasGeneration = parsed.generation !== undefined;
    if (
      hasFamily !== hasGeneration ||
      (hasFamily && !isNonEmptyString(parsed.familyId)) ||
      (hasGeneration && !isNonNegativeInteger(parsed.generation)) ||
      (parsed.consumedAt !== undefined && !isNonNegativeInteger(parsed.consumedAt)) ||
      (parsed.successorTokenHash !== undefined &&
        !isNonEmptyString(parsed.successorTokenHash, 128)) ||
      (parsed.kind !== undefined && parsed.kind !== "active" && parsed.kind !== "rotated")
    ) {
      return null;
    }

    return {
      ...(parsed.consumedAt === undefined ? {} : { consumedAt: parsed.consumedAt }),
      createdAt: parsed.createdAt,
      ...(parsed.familyId === undefined ? {} : { familyId: parsed.familyId }),
      ...(parsed.generation === undefined ? {} : { generation: parsed.generation }),
      ...(parsed.kind === undefined ? {} : { kind: parsed.kind }),
      sessionId: parsed.sessionId,
      ...(parsed.successorTokenHash === undefined
        ? {}
        : { successorTokenHash: parsed.successorTokenHash }),
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

function parseMobileRefreshSessionRecord(value: unknown): MobileRefreshSessionRecord | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MobileRefreshSessionRecord>;
    if (
      !isNonEmptyString(parsed.userId) ||
      !isNonNegativeInteger(parsed.createdAt) ||
      !isNonNegativeInteger(parsed.lastRotatedAt)
    ) {
      return null;
    }

    const familyFields = [
      parsed.familyId !== undefined,
      parsed.currentGeneration !== undefined,
      parsed.currentTokenHash !== undefined,
    ];
    if (
      familyFields.some(Boolean) &&
      (!familyFields.every(Boolean) ||
        !isNonEmptyString(parsed.familyId) ||
        !isNonNegativeInteger(parsed.currentGeneration) ||
        !isNonEmptyString(parsed.currentTokenHash, 128))
    ) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      ...(parsed.currentGeneration === undefined
        ? {}
        : { currentGeneration: parsed.currentGeneration }),
      ...(parsed.currentTokenHash === undefined
        ? {}
        : { currentTokenHash: parsed.currentTokenHash }),
      ...(parsed.familyId === undefined ? {} : { familyId: parsed.familyId }),
      lastRotatedAt: parsed.lastRotatedAt,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

function hashMobileRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function getMobileRefreshTokenKeyFromHash(tokenHash: string) {
  return `${MOBILE_REFRESH_TOKEN_KEY_PREFIX}${tokenHash}`;
}

function getMobileRefreshRetryKeyFromHash(tokenHash: string) {
  return `${MOBILE_REFRESH_RETRY_KEY_PREFIX}${tokenHash}`;
}

function getMobileSessionKey(sessionId: string) {
  return `${MOBILE_SESSION_KEY_PREFIX}${sessionId}`;
}

async function readRedisValue(redis: MobileRefreshFamilyRedis, key: string) {
  return redisValueToString(await redis.eval("return redis.call('GET', KEYS[1])", 1, key));
}

function deriveRetryReceiptKey(secret: string) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      RETRY_RECEIPT_HKDF_SALT,
      RETRY_RECEIPT_HKDF_INFO,
      32,
    ),
  );
}

function encryptRetryReceipt(
  receipt: MobileRefreshRetryReceipt,
  oldTokenHash: string,
  secret: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveRetryReceiptKey(secret), iv);
  cipher.setAAD(Buffer.from(oldTokenHash, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(receipt), "utf8"),
    cipher.final(),
  ]);

  return JSON.stringify({
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    v: RETRY_RECEIPT_VERSION,
  } satisfies EncryptedMobileRefreshRetryReceipt);
}

function decryptRetryReceipt(value: string, oldTokenHash: string, secret: string) {
  let envelope: Partial<EncryptedMobileRefreshRetryReceipt>;
  try {
    envelope = JSON.parse(value) as Partial<EncryptedMobileRefreshRetryReceipt>;
  } catch {
    throw new Error("Mobile refresh retry receipt is invalid.");
  }

  if (
    envelope.v !== RETRY_RECEIPT_VERSION ||
    !isNonEmptyString(envelope.iv, 32) ||
    !isNonEmptyString(envelope.ciphertext, 1024) ||
    !isNonEmptyString(envelope.tag, 32)
  ) {
    throw new Error("Mobile refresh retry receipt is invalid.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveRetryReceiptKey(secret),
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(oldTokenHash, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<MobileRefreshRetryReceipt>;

    if (
      !isNonEmptyString(parsed.familyId) ||
      !isNonNegativeInteger(parsed.generation) ||
      !isNonEmptyString(parsed.sessionId) ||
      !isNonEmptyString(parsed.userId) ||
      !isNonEmptyString(parsed.successorTokenHash, 128) ||
      typeof parsed.refreshToken !== "string" ||
      !MOBILE_REFRESH_TOKEN_PATTERN.test(parsed.refreshToken)
    ) {
      throw new Error("Mobile refresh retry receipt is invalid.");
    }

    return parsed as MobileRefreshRetryReceipt;
  } catch (error) {
    if (error instanceof Error && error.message === "Mobile refresh retry receipt is invalid.") {
      throw error;
    }
    throw new Error("Mobile refresh retry receipt is invalid.", { cause: error });
  }
}

export async function createMobileRefreshFamily(input: {
  nowMs: number;
  redis: MobileRefreshFamilyRedis;
  sessionId: string;
  tokenTtlSeconds: number;
  userId: string;
}) {
  const familyId = randomBytes(24).toString("base64url");
  const refreshToken = randomBytes(48).toString("base64url");
  const tokenHash = hashMobileRefreshToken(refreshToken);
  const tokenRecord: MobileRefreshTokenRecord = {
    createdAt: input.nowMs,
    familyId,
    generation: 0,
    kind: "active",
    sessionId: input.sessionId,
    userId: input.userId,
  };
  const sessionRecord: MobileRefreshSessionRecord = {
    createdAt: input.nowMs,
    currentGeneration: 0,
    currentTokenHash: tokenHash,
    familyId,
    lastRotatedAt: input.nowMs,
    userId: input.userId,
  };
  const result = parseScriptResult(
    await input.redis.eval(
      CREATE_MOBILE_REFRESH_FAMILY_SCRIPT,
      2,
      getMobileSessionKey(input.sessionId),
      getMobileRefreshTokenKeyFromHash(tokenHash),
      JSON.stringify(sessionRecord),
      JSON.stringify(tokenRecord),
      String(input.tokenTtlSeconds),
    ),
  );

  if (result[0] !== "CREATED") {
    throw new Error("Mobile refresh token family could not be created.");
  }

  return refreshToken;
}

export async function rotateMobileRefreshFamily(input: {
  graceMs: number;
  nowMs: number;
  redis: MobileRefreshFamilyRedis;
  refreshToken: string;
  secret: string;
  tokenTtlSeconds: number;
}): Promise<MobileRefreshRotationResult | null> {
  const oldTokenHash = hashMobileRefreshToken(input.refreshToken);
  const oldTokenKey = getMobileRefreshTokenKeyFromHash(oldTokenHash);
  const oldRecord = parseMobileRefreshTokenRecord(await readRedisValue(input.redis, oldTokenKey));
  if (!oldRecord) {
    return null;
  }

  const familyId = oldRecord.familyId ?? oldRecord.sessionId;
  const generation = oldRecord.generation ?? 0;
  const successorRefreshToken = randomBytes(48).toString("base64url");
  const successorTokenHash = hashMobileRefreshToken(successorRefreshToken);
  const successorRecord: MobileRefreshTokenRecord = {
    createdAt: input.nowMs,
    familyId,
    generation: generation + 1,
    kind: "active",
    sessionId: oldRecord.sessionId,
    userId: oldRecord.userId,
  };
  const encryptedReceipt = encryptRetryReceipt(
    {
      familyId,
      generation: generation + 1,
      refreshToken: successorRefreshToken,
      sessionId: oldRecord.sessionId,
      successorTokenHash,
      userId: oldRecord.userId,
    },
    oldTokenHash,
    input.secret,
  );
  const receiptTtlSeconds = Math.ceil(input.graceMs / 1000) + 1;
  const result = parseScriptResult(
    await input.redis.eval(
      ROTATE_MOBILE_REFRESH_FAMILY_SCRIPT,
      4,
      oldTokenKey,
      getMobileSessionKey(oldRecord.sessionId),
      getMobileRefreshTokenKeyFromHash(successorTokenHash),
      getMobileRefreshRetryKeyFromHash(oldTokenHash),
      String(input.nowMs),
      String(input.graceMs),
      String(input.tokenTtlSeconds),
      String(receiptTtlSeconds),
      oldRecord.sessionId,
      oldRecord.userId,
      familyId,
      String(generation),
      oldTokenHash,
      successorTokenHash,
      JSON.stringify(successorRecord),
      encryptedReceipt,
    ),
  );

  if (result[0] === "INVALID" || result[0] === "REPLAY") {
    return null;
  }
  if (result[0] === "COLLISION") {
    throw new Error("Mobile refresh successor token collided.");
  }
  if (result[0] === "ROTATED") {
    return {
      refreshToken: successorRefreshToken,
      sessionId: oldRecord.sessionId,
      userId: oldRecord.userId,
    };
  }
  if (result[0] !== "RETRY" || !result[1] || !result[2]) {
    throw new Error("Mobile refresh Redis script returned an unknown outcome.");
  }

  let receipt: MobileRefreshRetryReceipt;
  try {
    receipt = decryptRetryReceipt(result[1], oldTokenHash, input.secret);
  } catch (error) {
    await revokeMobileRefreshFamily(input.redis, { sessionId: oldRecord.sessionId });
    throw error;
  }

  if (
    receipt.familyId !== familyId ||
    receipt.generation !== generation + 1 ||
    receipt.sessionId !== oldRecord.sessionId ||
    receipt.userId !== oldRecord.userId ||
    receipt.successorTokenHash !== result[2] ||
    hashMobileRefreshToken(receipt.refreshToken) !== result[2]
  ) {
    await revokeMobileRefreshFamily(input.redis, { sessionId: oldRecord.sessionId });
    throw new Error("Mobile refresh retry receipt does not match its token family.");
  }

  return {
    refreshToken: receipt.refreshToken,
    sessionId: receipt.sessionId,
    userId: receipt.userId,
  };
}

export async function revokeMobileRefreshFamily(
  redis: MobileRefreshFamilyRedis,
  input: {
    refreshToken?: string | null;
    sessionId?: string | null;
  },
) {
  let sessionId = input.sessionId ?? null;
  let refreshTokenKey = "";
  let retryKey = "";

  if (input.refreshToken && MOBILE_REFRESH_TOKEN_PATTERN.test(input.refreshToken)) {
    const tokenHash = hashMobileRefreshToken(input.refreshToken);
    refreshTokenKey = getMobileRefreshTokenKeyFromHash(tokenHash);
    retryKey = getMobileRefreshRetryKeyFromHash(tokenHash);
    const tokenRecord = parseMobileRefreshTokenRecord(await readRedisValue(redis, refreshTokenKey));
    sessionId = tokenRecord?.sessionId ?? sessionId;
  }

  if (!sessionId) {
    return;
  }

  await redis.eval(
    REVOKE_MOBILE_REFRESH_FAMILY_SCRIPT,
    3,
    getMobileSessionKey(sessionId),
    refreshTokenKey || `${MOBILE_REFRESH_TOKEN_KEY_PREFIX}none`,
    retryKey || `${MOBILE_REFRESH_RETRY_KEY_PREFIX}none`,
  );
}

export async function isMobileRefreshFamilyActive(
  redis: MobileRefreshFamilyRedis,
  input: {
    sessionId: string;
    userId: string;
  },
) {
  const session = parseMobileRefreshSessionRecord(
    await readRedisValue(redis, getMobileSessionKey(input.sessionId)),
  );
  return Boolean(session && session.userId === input.userId);
}

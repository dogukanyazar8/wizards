import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

const MOBILE_REFRESH_FAMILY_KEY_PREFIX = "auth:mobile-refresh-family:";
const MOBILE_REFRESH_LEGACY_TOKEN_KEY_PREFIX = "auth:mobile-refresh:";
const MOBILE_REFRESH_RETRY_KEY_PREFIX = "auth:mobile-refresh-retry:";
const MOBILE_SESSION_KEY_PREFIX = "auth:mobile-session:";
const MOBILE_REFRESH_TOKEN_PREFIX = "mrf1";
const MOBILE_REFRESH_TOKEN_AAD = Buffer.from("whispr-mobile-refresh-token-v1", "utf8");
const MOBILE_REFRESH_TOKEN_HKDF_SALT = Buffer.from("whispr-mobile-refresh-family-v1", "utf8");
const MOBILE_REFRESH_TOKEN_HKDF_INFO = Buffer.from("token-aes-256-gcm", "utf8");
const RETRY_RECEIPT_HKDF_INFO = Buffer.from("retry-receipt-aes-256-gcm", "utf8");
const RETRY_RECEIPT_VERSION = 1;
const MOBILE_REFRESH_TOKEN_VERSION = 1;
const MOBILE_REFRESH_TOKEN_PATTERN =
  /^mrf1\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{16,2048}\.[A-Za-z0-9_-]{16,64}$/u;
const MOBILE_LEGACY_REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{48,192}$/u;

const CREATE_MOBILE_REFRESH_FAMILY_SCRIPT = `
-- mobile-refresh-family:create-v2
if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
  return {"COLLISION"}
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])
return {"CREATED"}
`;

const ROTATE_MOBILE_REFRESH_FAMILY_SCRIPT = `
-- mobile-refresh-family:rotate-v2
local function decode(value)
  local ok, decoded = pcall(cjson.decode, value)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

local function revoke()
  redis.call("DEL", KEYS[1])
  redis.call("DEL", KEYS[2])
  redis.call("DEL", KEYS[3])
  return {"REPLAY"}
end

local familyRaw = redis.call("GET", KEYS[1])
local sessionRaw = redis.call("GET", KEYS[2])
if not familyRaw or not sessionRaw then
  return {"INVALID"}
end

local family = decode(familyRaw)
local session = decode(sessionRaw)
if not family or not session then
  return {"INVALID"}
end

local nowMs = tonumber(ARGV[1])
local graceMs = tonumber(ARGV[2])
local tokenTtlSeconds = tonumber(ARGV[3])
local generation = tonumber(ARGV[6])
if not nowMs or not graceMs or not tokenTtlSeconds or not generation then
  return {"INVALID"}
end

if
  family.v ~= 1 or
  family.familyId ~= ARGV[5] or
  family.sessionId ~= ARGV[4] or
  session.familyId ~= ARGV[5] or
  session.userId ~= family.userId
then
  return {"INVALID"}
end

if family.currentGeneration == generation then
  if family.currentTokenHash ~= ARGV[7] then
    return {"INVALID"}
  end

  family.previousGeneration = generation
  family.previousRotatedAt = nowMs
  family.previousTokenHash = ARGV[7]
  family.currentGeneration = generation + 1
  family.currentTokenHash = ARGV[8]
  family.retryExpiresAt = nowMs + graceMs
  family.expiresAt = tonumber(ARGV[9])

  redis.call("SET", KEYS[1], cjson.encode(family), "EX", tokenTtlSeconds)
  redis.call("SET", KEYS[2], sessionRaw, "EX", tokenTtlSeconds)
  redis.call("SET", KEYS[3], ARGV[10], "EX", ARGV[11])
  return {"ROTATED"}
end

if family.previousGeneration == generation then
  if family.previousTokenHash ~= ARGV[7] then
    return {"INVALID"}
  end
  if nowMs > (tonumber(family.previousRotatedAt) or -1) + graceMs then
    return revoke()
  end
  if not family.retryExpiresAt or nowMs > tonumber(family.retryExpiresAt) then
    return revoke()
  end
  local receipt = redis.call("GET", KEYS[3])
  if not receipt then
    return revoke()
  end
  return {"RETRY", receipt, family.currentTokenHash}
end

if generation < (tonumber(family.currentGeneration) or -1) then
  return revoke()
end

return {"INVALID"}
`;

const ADOPT_LEGACY_MOBILE_REFRESH_FAMILY_SCRIPT = `
-- mobile-refresh-family:adopt-legacy-v2
local function decode(value)
  local ok, decoded = pcall(cjson.decode, value)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

local function revoke()
  redis.call("DEL", KEYS[2])
  redis.call("DEL", KEYS[3])
  redis.call("DEL", KEYS[4])
  return {"REPLAY"}
end

local legacyRaw = redis.call("GET", KEYS[1])
local sessionRaw = redis.call("GET", KEYS[2])
if not legacyRaw or not sessionRaw then
  return {"INVALID"}
end

local legacy = decode(legacyRaw)
local session = decode(sessionRaw)
if not legacy or not session then
  return {"INVALID"}
end

local nowMs = tonumber(ARGV[1])
local graceMs = tonumber(ARGV[2])
local tokenTtlSeconds = tonumber(ARGV[3])
local generation = tonumber(ARGV[7])
if not nowMs or not graceMs or not tokenTtlSeconds or not generation then
  return {"INVALID"}
end

if legacy.sessionId ~= ARGV[4] or legacy.userId ~= ARGV[5] or session.userId ~= ARGV[5] then
  return {"INVALID"}
end
if (legacy.familyId or legacy.sessionId) ~= ARGV[6] or (tonumber(legacy.generation) or 0) ~= generation then
  return {"INVALID"}
end
if session.currentGeneration and session.currentTokenHash then
  if session.familyId ~= ARGV[6] or tonumber(session.currentGeneration) ~= generation or session.currentTokenHash ~= ARGV[8] then
    return revoke()
  end
end

if legacy.consumedAt then
  local familyRaw = redis.call("GET", KEYS[3])
  local family = familyRaw and decode(familyRaw) or nil
  if
    not family or
    family.previousGeneration ~= generation or
    family.previousTokenHash ~= ARGV[8] or
    nowMs > (tonumber(family.previousRotatedAt) or -1) + graceMs or
    not redis.call("GET", KEYS[4])
  then
    return revoke()
  end
  return {"RETRY", redis.call("GET", KEYS[4]), family.currentTokenHash}
end

if redis.call("EXISTS", KEYS[3]) == 1 then
  return {"COLLISION"}
end

legacy.familyId = ARGV[6]
legacy.generation = generation
legacy.consumedAt = nowMs
legacy.successorTokenHash = ARGV[9]
legacy.kind = "rotated"

local legacyTtl = redis.call("TTL", KEYS[1])
if legacyTtl <= 0 then
  legacyTtl = tokenTtlSeconds
end
redis.call("SET", KEYS[1], cjson.encode(legacy), "EX", legacyTtl)
redis.call("SET", KEYS[2], ARGV[12], "EX", tokenTtlSeconds)
redis.call("SET", KEYS[3], ARGV[11], "EX", tokenTtlSeconds)
redis.call("SET", KEYS[4], ARGV[10], "EX", ARGV[13])
return {"ROTATED"}
`;

const REVOKE_MOBILE_REFRESH_FAMILY_SCRIPT = `
-- mobile-refresh-family:revoke-v2
local sessionRaw = redis.call("GET", KEYS[1])
if sessionRaw then
  local ok, session = pcall(cjson.decode, sessionRaw)
  if ok and type(session) == "table" and type(session.familyId) == "string" then
    redis.call("DEL", "auth:mobile-refresh-family:" .. session.familyId)
    redis.call("DEL", "auth:mobile-refresh-retry:" .. session.familyId)
  end
end
redis.call("DEL", KEYS[1])
return "REVOKED"
`;

export interface MobileRefreshFamilyRedis {
  eval(script: string, keyCount: number, ...args: string[]): Promise<unknown>;
}

interface MobileRefreshTokenClaims {
  exp: number;
  familyId: string;
  generation: number;
  sessionId: string;
  tokenId: string;
  v: 1;
}

interface MobileRefreshFamilyState {
  currentGeneration: number;
  currentTokenHash: string;
  expiresAt: number;
  familyId: string;
  previousGeneration?: number;
  previousRotatedAt?: number;
  previousTokenHash?: string;
  retryExpiresAt?: number;
  sessionId: string;
  userId: string;
  v: 1;
}

interface MobileRefreshSessionRecord {
  expiresAt?: number;
  familyId?: string;
  userId: string;
  v?: 1;
}

interface MobileRefreshLegacyRecord {
  consumedAt?: number;
  familyId?: string;
  generation?: number;
  sessionId: string;
  successorTokenHash?: string;
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

function isNonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function redisValueToString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  return Buffer.isBuffer(value) ? value.toString("utf8") : null;
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

function hashMobileRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function getMobileRefreshFamilyKey(familyId: string) {
  return `${MOBILE_REFRESH_FAMILY_KEY_PREFIX}${familyId}`;
}

function getMobileLegacyRefreshTokenKey(tokenHash: string) {
  return `${MOBILE_REFRESH_LEGACY_TOKEN_KEY_PREFIX}${tokenHash}`;
}

function getMobileRefreshRetryKey(familyId: string) {
  return `${MOBILE_REFRESH_RETRY_KEY_PREFIX}${familyId}`;
}

function getMobileSessionKey(sessionId: string) {
  return `${MOBILE_SESSION_KEY_PREFIX}${sessionId}`;
}

async function readRedisValue(redis: MobileRefreshFamilyRedis, key: string) {
  return redisValueToString(await redis.eval("return redis.call('GET', KEYS[1])", 1, key));
}

function deriveAeadKey(secret: string, purpose: Buffer) {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), MOBILE_REFRESH_TOKEN_HKDF_SALT, purpose, 32),
  );
}

function assertTokenClaims(value: unknown): value is MobileRefreshTokenClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const claims = value as Partial<MobileRefreshTokenClaims>;
  return (
    claims.v === MOBILE_REFRESH_TOKEN_VERSION &&
    isNonEmptyString(claims.sessionId) &&
    isNonEmptyString(claims.familyId) &&
    isNonNegativeInteger(claims.generation) &&
    isNonEmptyString(claims.tokenId) &&
    isNonNegativeInteger(claims.exp)
  );
}

function createMobileRefreshToken(claims: MobileRefreshTokenClaims, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveAeadKey(secret, MOBILE_REFRESH_TOKEN_HKDF_INFO),
    iv,
  );
  cipher.setAAD(MOBILE_REFRESH_TOKEN_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  return [
    MOBILE_REFRESH_TOKEN_PREFIX,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

function decryptMobileRefreshToken(token: string, secret: string, nowMs?: number) {
  if (!MOBILE_REFRESH_TOKEN_PATTERN.test(token)) {
    return null;
  }

  const [prefix, ivValue, ciphertextValue, tagValue] = token.split(".");
  if (prefix !== MOBILE_REFRESH_TOKEN_PREFIX || !ivValue || !ciphertextValue || !tagValue) {
    return null;
  }

  try {
    const iv = Buffer.from(ivValue, "base64url");
    const ciphertext = Buffer.from(ciphertextValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    if (
      iv.length !== 12 ||
      tag.length !== 16 ||
      iv.toString("base64url") !== ivValue ||
      ciphertext.toString("base64url") !== ciphertextValue ||
      tag.toString("base64url") !== tagValue
    ) {
      return null;
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveAeadKey(secret, MOBILE_REFRESH_TOKEN_HKDF_INFO),
      iv,
    );
    decipher.setAAD(MOBILE_REFRESH_TOKEN_AAD);
    decipher.setAuthTag(tag);
    const claims = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
    ) as unknown;
    if (!assertTokenClaims(claims) || (nowMs !== undefined && claims.exp < nowMs)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

function parseLegacyRecord(value: string | null): MobileRefreshLegacyRecord | null {
  if (!value) {
    return null;
  }
  try {
    const record = JSON.parse(value) as Partial<MobileRefreshLegacyRecord>;
    if (
      !isNonEmptyString(record.sessionId) ||
      !isNonEmptyString(record.userId) ||
      (record.familyId !== undefined && !isNonEmptyString(record.familyId)) ||
      (record.generation !== undefined && !isNonNegativeInteger(record.generation)) ||
      (record.consumedAt !== undefined && !isNonNegativeInteger(record.consumedAt)) ||
      (record.successorTokenHash !== undefined && !isNonEmptyString(record.successorTokenHash, 128))
    ) {
      return null;
    }
    return record as MobileRefreshLegacyRecord;
  } catch {
    return null;
  }
}

function parseSessionRecord(value: string | null): MobileRefreshSessionRecord | null {
  if (!value) {
    return null;
  }
  try {
    const record = JSON.parse(value) as Partial<MobileRefreshSessionRecord>;
    if (
      !isNonEmptyString(record.userId) ||
      (record.familyId !== undefined && !isNonEmptyString(record.familyId)) ||
      (record.expiresAt !== undefined && !isNonNegativeInteger(record.expiresAt)) ||
      (record.v !== undefined && record.v !== MOBILE_REFRESH_TOKEN_VERSION)
    ) {
      return null;
    }
    return record as MobileRefreshSessionRecord;
  } catch {
    return null;
  }
}

function encryptRetryReceipt(
  receipt: MobileRefreshRetryReceipt,
  oldTokenHash: string,
  secret: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveAeadKey(secret, RETRY_RECEIPT_HKDF_INFO), iv);
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
  try {
    const envelope = JSON.parse(value) as Partial<EncryptedMobileRefreshRetryReceipt>;
    if (
      envelope.v !== RETRY_RECEIPT_VERSION ||
      !isNonEmptyString(envelope.iv, 64) ||
      !isNonEmptyString(envelope.ciphertext, 2048) ||
      !isNonEmptyString(envelope.tag, 64)
    ) {
      throw new Error("invalid");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveAeadKey(secret, RETRY_RECEIPT_HKDF_INFO),
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(oldTokenHash, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const receipt = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as Partial<MobileRefreshRetryReceipt>;
    if (
      !isNonEmptyString(receipt.familyId) ||
      !isNonNegativeInteger(receipt.generation) ||
      !isNonEmptyString(receipt.sessionId) ||
      !isNonEmptyString(receipt.userId) ||
      !isNonEmptyString(receipt.successorTokenHash, 128) ||
      !isMobileRefreshToken(receipt.refreshToken)
    ) {
      throw new Error("invalid");
    }
    return receipt as MobileRefreshRetryReceipt;
  } catch {
    throw new Error("Mobile refresh retry receipt is invalid.");
  }
}

function createSuccessor(input: {
  familyId: string;
  generation: number;
  nowMs: number;
  secret: string;
  sessionId: string;
  tokenTtlSeconds: number;
  userId: string;
}) {
  const refreshToken = createMobileRefreshToken(
    {
      exp: input.nowMs + input.tokenTtlSeconds * 1_000,
      familyId: input.familyId,
      generation: input.generation,
      sessionId: input.sessionId,
      tokenId: randomBytes(24).toString("base64url"),
      v: MOBILE_REFRESH_TOKEN_VERSION,
    },
    input.secret,
  );
  return { refreshToken, tokenHash: hashMobileRefreshToken(refreshToken) };
}

function validateRetryReceipt(input: {
  expected: {
    familyId: string;
    generation: number;
    sessionId: string;
    successorTokenHash: string;
    userId: string;
  };
  oldTokenHash: string;
  receipt: string;
  secret: string;
}) {
  const receipt = decryptRetryReceipt(input.receipt, input.oldTokenHash, input.secret);
  if (
    receipt.familyId !== input.expected.familyId ||
    receipt.generation !== input.expected.generation ||
    receipt.sessionId !== input.expected.sessionId ||
    receipt.userId !== input.expected.userId ||
    receipt.successorTokenHash !== input.expected.successorTokenHash ||
    hashMobileRefreshToken(receipt.refreshToken) !== input.expected.successorTokenHash
  ) {
    throw new Error("Mobile refresh retry receipt does not match its token family.");
  }
  return receipt;
}

export function isMobileRefreshToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (MOBILE_REFRESH_TOKEN_PATTERN.test(value) || MOBILE_LEGACY_REFRESH_TOKEN_PATTERN.test(value))
  );
}

export async function createMobileRefreshFamily(input: {
  nowMs: number;
  redis: MobileRefreshFamilyRedis;
  secret: string;
  sessionId: string;
  tokenTtlSeconds: number;
  userId: string;
}) {
  const familyId = randomBytes(24).toString("base64url");
  const successor = createSuccessor({
    familyId,
    generation: 0,
    nowMs: input.nowMs,
    secret: input.secret,
    sessionId: input.sessionId,
    tokenTtlSeconds: input.tokenTtlSeconds,
    userId: input.userId,
  });
  const expiresAt = input.nowMs + input.tokenTtlSeconds * 1_000;
  const family: MobileRefreshFamilyState = {
    currentGeneration: 0,
    currentTokenHash: successor.tokenHash,
    expiresAt,
    familyId,
    sessionId: input.sessionId,
    userId: input.userId,
    v: MOBILE_REFRESH_TOKEN_VERSION,
  };
  const session: MobileRefreshSessionRecord = {
    expiresAt,
    familyId,
    userId: input.userId,
    v: MOBILE_REFRESH_TOKEN_VERSION,
  };
  const result = parseScriptResult(
    await input.redis.eval(
      CREATE_MOBILE_REFRESH_FAMILY_SCRIPT,
      2,
      getMobileSessionKey(input.sessionId),
      getMobileRefreshFamilyKey(familyId),
      JSON.stringify(session),
      JSON.stringify(family),
      String(input.tokenTtlSeconds),
    ),
  );
  if (result[0] !== "CREATED") {
    throw new Error("Mobile refresh token family could not be created.");
  }
  return successor.refreshToken;
}

async function rotateAuthenticatedFamily(input: {
  claims: MobileRefreshTokenClaims;
  graceMs: number;
  nowMs: number;
  redis: MobileRefreshFamilyRedis;
  refreshToken: string;
  secret: string;
  tokenTtlSeconds: number;
}) {
  const oldTokenHash = hashMobileRefreshToken(input.refreshToken);
  const session = parseSessionRecord(
    await readRedisValue(input.redis, getMobileSessionKey(input.claims.sessionId)),
  );
  if (!session?.familyId || session.familyId !== input.claims.familyId) {
    return null;
  }
  const successor = createSuccessor({
    familyId: input.claims.familyId,
    generation: input.claims.generation + 1,
    nowMs: input.nowMs,
    secret: input.secret,
    sessionId: input.claims.sessionId,
    tokenTtlSeconds: input.tokenTtlSeconds,
    userId: session.userId,
  });
  const receipt = encryptRetryReceipt(
    {
      familyId: input.claims.familyId,
      generation: input.claims.generation + 1,
      refreshToken: successor.refreshToken,
      sessionId: input.claims.sessionId,
      successorTokenHash: successor.tokenHash,
      userId: session.userId,
    },
    oldTokenHash,
    input.secret,
  );
  const result = parseScriptResult(
    await input.redis.eval(
      ROTATE_MOBILE_REFRESH_FAMILY_SCRIPT,
      3,
      getMobileRefreshFamilyKey(input.claims.familyId),
      getMobileSessionKey(input.claims.sessionId),
      getMobileRefreshRetryKey(input.claims.familyId),
      String(input.nowMs),
      String(input.graceMs),
      String(input.tokenTtlSeconds),
      input.claims.sessionId,
      input.claims.familyId,
      String(input.claims.generation),
      oldTokenHash,
      successor.tokenHash,
      String(input.nowMs + input.tokenTtlSeconds * 1_000),
      receipt,
      String(Math.ceil(input.graceMs / 1_000) + 1),
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
      refreshToken: successor.refreshToken,
      sessionId: input.claims.sessionId,
      userId: session.userId,
    };
  }
  if (result[0] !== "RETRY" || !result[1] || !result[2]) {
    throw new Error("Mobile refresh Redis script returned an unknown outcome.");
  }
  const retry = validateRetryReceipt({
    expected: {
      familyId: input.claims.familyId,
      generation: input.claims.generation + 1,
      sessionId: input.claims.sessionId,
      successorTokenHash: result[2],
      userId: session.userId,
    },
    oldTokenHash,
    receipt: result[1],
    secret: input.secret,
  });
  return { refreshToken: retry.refreshToken, sessionId: retry.sessionId, userId: retry.userId };
}

async function rotateLegacyFamily(input: {
  graceMs: number;
  nowMs: number;
  redis: MobileRefreshFamilyRedis;
  refreshToken: string;
  secret: string;
  tokenTtlSeconds: number;
}) {
  const oldTokenHash = hashMobileRefreshToken(input.refreshToken);
  const legacyKey = getMobileLegacyRefreshTokenKey(oldTokenHash);
  const legacy = parseLegacyRecord(await readRedisValue(input.redis, legacyKey));
  if (!legacy) {
    return null;
  }
  const familyId = legacy.familyId ?? legacy.sessionId;
  const generation = legacy.generation ?? 0;
  const successor = createSuccessor({
    familyId,
    generation: generation + 1,
    nowMs: input.nowMs,
    secret: input.secret,
    sessionId: legacy.sessionId,
    tokenTtlSeconds: input.tokenTtlSeconds,
    userId: legacy.userId,
  });
  const receipt = encryptRetryReceipt(
    {
      familyId,
      generation: generation + 1,
      refreshToken: successor.refreshToken,
      sessionId: legacy.sessionId,
      successorTokenHash: successor.tokenHash,
      userId: legacy.userId,
    },
    oldTokenHash,
    input.secret,
  );
  const family: MobileRefreshFamilyState = {
    currentGeneration: generation + 1,
    currentTokenHash: successor.tokenHash,
    expiresAt: input.nowMs + input.tokenTtlSeconds * 1_000,
    familyId,
    previousGeneration: generation,
    previousRotatedAt: input.nowMs,
    previousTokenHash: oldTokenHash,
    retryExpiresAt: input.nowMs + input.graceMs,
    sessionId: legacy.sessionId,
    userId: legacy.userId,
    v: MOBILE_REFRESH_TOKEN_VERSION,
  };
  const session: MobileRefreshSessionRecord = {
    expiresAt: family.expiresAt,
    familyId,
    userId: legacy.userId,
    v: MOBILE_REFRESH_TOKEN_VERSION,
  };
  const result = parseScriptResult(
    await input.redis.eval(
      ADOPT_LEGACY_MOBILE_REFRESH_FAMILY_SCRIPT,
      4,
      legacyKey,
      getMobileSessionKey(legacy.sessionId),
      getMobileRefreshFamilyKey(familyId),
      getMobileRefreshRetryKey(familyId),
      String(input.nowMs),
      String(input.graceMs),
      String(input.tokenTtlSeconds),
      legacy.sessionId,
      legacy.userId,
      familyId,
      String(generation),
      oldTokenHash,
      successor.tokenHash,
      receipt,
      JSON.stringify(family),
      JSON.stringify(session),
      String(Math.ceil(input.graceMs / 1_000) + 1),
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
      refreshToken: successor.refreshToken,
      sessionId: legacy.sessionId,
      userId: legacy.userId,
    };
  }
  if (result[0] !== "RETRY" || !result[1] || !result[2]) {
    throw new Error("Mobile refresh Redis script returned an unknown outcome.");
  }
  const retry = validateRetryReceipt({
    expected: {
      familyId,
      generation: generation + 1,
      sessionId: legacy.sessionId,
      successorTokenHash: result[2],
      userId: legacy.userId,
    },
    oldTokenHash,
    receipt: result[1],
    secret: input.secret,
  });
  return { refreshToken: retry.refreshToken, sessionId: retry.sessionId, userId: retry.userId };
}

export async function rotateMobileRefreshFamily(input: {
  graceMs: number;
  nowMs: number;
  redis: MobileRefreshFamilyRedis;
  refreshToken: string;
  secret: string;
  tokenTtlSeconds: number;
}): Promise<MobileRefreshRotationResult | null> {
  const claims = decryptMobileRefreshToken(input.refreshToken, input.secret, input.nowMs);
  if (claims) {
    return rotateAuthenticatedFamily({ ...input, claims });
  }
  if (!MOBILE_LEGACY_REFRESH_TOKEN_PATTERN.test(input.refreshToken)) {
    return null;
  }
  return rotateLegacyFamily(input);
}

export async function revokeMobileRefreshFamily(
  redis: MobileRefreshFamilyRedis,
  input: {
    nowMs?: number;
    refreshToken?: string | null;
    secret?: string;
    sessionId?: string | null;
  },
) {
  let sessionId = input.sessionId ?? null;
  if (!sessionId && input.refreshToken && input.secret) {
    const claims = decryptMobileRefreshToken(input.refreshToken, input.secret);
    sessionId = claims?.sessionId ?? null;
    if (!sessionId && MOBILE_LEGACY_REFRESH_TOKEN_PATTERN.test(input.refreshToken)) {
      const legacy = parseLegacyRecord(
        await readRedisValue(
          redis,
          getMobileLegacyRefreshTokenKey(hashMobileRefreshToken(input.refreshToken)),
        ),
      );
      sessionId = legacy?.sessionId ?? null;
    }
  }
  if (!sessionId) {
    return;
  }
  await redis.eval(REVOKE_MOBILE_REFRESH_FAMILY_SCRIPT, 1, getMobileSessionKey(sessionId));
}

export async function isMobileRefreshFamilyActive(
  redis: MobileRefreshFamilyRedis,
  input: { sessionId: string; userId: string },
) {
  const session = parseSessionRecord(
    await readRedisValue(redis, getMobileSessionKey(input.sessionId)),
  );
  if (!session || session.userId !== input.userId) {
    return false;
  }
  if (!session.familyId) {
    return true;
  }
  const familyRaw = await readRedisValue(redis, getMobileRefreshFamilyKey(session.familyId));
  if (!familyRaw) {
    return false;
  }
  try {
    const family = JSON.parse(familyRaw) as Partial<MobileRefreshFamilyState>;
    return (
      family.v === MOBILE_REFRESH_TOKEN_VERSION &&
      family.sessionId === input.sessionId &&
      family.userId === input.userId &&
      family.familyId === session.familyId
    );
  } catch {
    return false;
  }
}

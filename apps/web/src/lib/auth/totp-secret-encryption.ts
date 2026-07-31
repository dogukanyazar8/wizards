import { createCipheriv, createDecipheriv, randomBytes as cryptoRandomBytes } from "node:crypto";

const TOTP_SECRET_ENVELOPE_VERSION = 1;
const TOTP_SECRET_KEY_BYTES = 32;
const TOTP_SECRET_NONCE_BYTES = 12;
const TOTP_SECRET_TAG_BYTES = 16;
const TOTP_SECRET_PURPOSE = "totp-secret";
const KEY_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

type RandomBytes = (size: number) => Buffer;

export type TotpSecretKeyring = {
  activeKeyVersion: string;
  keys: ReadonlyMap<string, Buffer>;
};

export type EncryptedTotpSecret = {
  ciphertext: string;
  keyVersion: string;
};

export type StoredTotpSecret = {
  twoFactorSecret?: string | null;
  twoFactorSecretCiphertext?: string | null;
  twoFactorSecretKeyVersion?: string | null;
};

type TotpSecretEnvelope = {
  ciphertext: string;
  nonce: string;
  tag: string;
  v: 1;
};

type EnvSource = Record<string, string | undefined>;

function configurationError(): Error {
  return new Error("Invalid TOTP secret encryption configuration.");
}

function decryptionError(): Error {
  return new Error("TOTP secret decryption failed.");
}

function decodeCanonicalBase64Url(value: string, expectedBytes?: number) {
  if (!value || !BASE64URL_PATTERN.test(value)) {
    throw decryptionError();
  }

  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    (expectedBytes !== undefined && decoded.length !== expectedBytes)
  ) {
    throw decryptionError();
  }
  return decoded;
}

function parseKey(value: unknown) {
  if (typeof value !== "string" || !BASE64URL_PATTERN.test(value)) {
    throw configurationError();
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== TOTP_SECRET_KEY_BYTES || decoded.toString("base64url") !== value) {
    throw configurationError();
  }
  return decoded;
}

function createAad(userId: string, keyVersion: string) {
  return Buffer.from(
    JSON.stringify({
      keyVersion,
      purpose: TOTP_SECRET_PURPOSE,
      userId,
    }),
    "utf8",
  );
}

function assertUserId(userId: string) {
  if (!userId || userId.length > 256) {
    throw new TypeError("TOTP secret user identifier is invalid.");
  }
}

function parseEnvelope(value: string): TotpSecretEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw decryptionError();
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as Partial<TotpSecretEnvelope>).v !== TOTP_SECRET_ENVELOPE_VERSION ||
    typeof (parsed as Partial<TotpSecretEnvelope>).ciphertext !== "string" ||
    typeof (parsed as Partial<TotpSecretEnvelope>).nonce !== "string" ||
    typeof (parsed as Partial<TotpSecretEnvelope>).tag !== "string"
  ) {
    throw decryptionError();
  }

  return parsed as TotpSecretEnvelope;
}

export function parseTotpSecretKeyring(env: EnvSource = process.env): TotpSecretKeyring {
  const activeKeyVersion = env.TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION?.trim();
  const serializedKeys = env.TOTP_SECRET_ENCRYPTION_KEYS?.trim();
  if (!activeKeyVersion || !KEY_VERSION_PATTERN.test(activeKeyVersion) || !serializedKeys) {
    throw configurationError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys);
  } catch {
    throw configurationError();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw configurationError();
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw configurationError();
  }

  const keys = new Map<string, Buffer>();
  for (const [keyVersion, value] of entries) {
    if (!KEY_VERSION_PATTERN.test(keyVersion)) {
      throw configurationError();
    }
    keys.set(keyVersion, parseKey(value));
  }

  if (!keys.has(activeKeyVersion)) {
    throw configurationError();
  }

  return {
    activeKeyVersion,
    keys,
  };
}

export function encryptTotpSecret(args: {
  keyring: TotpSecretKeyring;
  plaintext: string;
  randomBytes?: RandomBytes;
  userId: string;
}): EncryptedTotpSecret {
  assertUserId(args.userId);
  if (!args.plaintext || args.plaintext.length > 512) {
    throw new TypeError("TOTP secret plaintext is invalid.");
  }

  const keyVersion = args.keyring.activeKeyVersion;
  const key = args.keyring.keys.get(keyVersion);
  if (!key || key.length !== TOTP_SECRET_KEY_BYTES) {
    throw configurationError();
  }

  try {
    const nonce = (args.randomBytes ?? cryptoRandomBytes)(TOTP_SECRET_NONCE_BYTES);
    if (nonce.length !== TOTP_SECRET_NONCE_BYTES) {
      throw new RangeError("Invalid nonce length.");
    }
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(createAad(args.userId, keyVersion));
    const ciphertext = Buffer.concat([cipher.update(args.plaintext, "utf8"), cipher.final()]);
    const envelope = {
      ciphertext: ciphertext.toString("base64url"),
      nonce: nonce.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      v: TOTP_SECRET_ENVELOPE_VERSION,
    } satisfies TotpSecretEnvelope;

    return {
      ciphertext: JSON.stringify(envelope),
      keyVersion,
    };
  } catch (error) {
    throw new Error("TOTP secret encryption failed.", { cause: error });
  }
}

export function decryptTotpSecret(args: {
  ciphertext: string;
  keyVersion: string;
  keyring: TotpSecretKeyring;
  userId: string;
}) {
  assertUserId(args.userId);
  if (!KEY_VERSION_PATTERN.test(args.keyVersion)) {
    throw decryptionError();
  }

  const key = args.keyring.keys.get(args.keyVersion);
  if (!key || key.length !== TOTP_SECRET_KEY_BYTES) {
    throw decryptionError();
  }

  try {
    const envelope = parseEnvelope(args.ciphertext);
    const nonce = decodeCanonicalBase64Url(envelope.nonce, TOTP_SECRET_NONCE_BYTES);
    const tag = decodeCanonicalBase64Url(envelope.tag, TOTP_SECRET_TAG_BYTES);
    const ciphertext = decodeCanonicalBase64Url(envelope.ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(createAad(args.userId, args.keyVersion));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw decryptionError();
  }
}

export function resolveTotpSecret(
  record: StoredTotpSecret,
  userId: string,
  keyring: TotpSecretKeyring = parseTotpSecretKeyring(),
) {
  if (record.twoFactorSecretCiphertext !== null && record.twoFactorSecretCiphertext !== undefined) {
    if (!record.twoFactorSecretKeyVersion) {
      throw decryptionError();
    }
    return decryptTotpSecret({
      ciphertext: record.twoFactorSecretCiphertext,
      keyVersion: record.twoFactorSecretKeyVersion,
      keyring,
      userId,
    });
  }

  return record.twoFactorSecret || null;
}

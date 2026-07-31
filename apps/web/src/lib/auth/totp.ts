import {
  createHash,
  createHmac,
  randomBytes as cryptoRandomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_SECRET_BYTES = 20;
const RECOVERY_CODE_BYTES = 10;

type RandomBytes = (size: number) => Buffer;

type TotpOptions = {
  digits?: number;
  nowMs?: number;
  periodSeconds?: number;
};

export type TotpSetup = {
  manualEntryKey: string;
  otpauthUri: string;
  secret: string;
};

export type RecoveryCode = {
  hash: string;
  plaintext: string;
};

export type TotpMatch = {
  counter: number;
};

function encodeBase32(input: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(secret: string) {
  const normalized = secret.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error("Invalid TOTP secret.");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function counterBuffer(counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  return buffer;
}

function normalizeRecoveryCode(code: string) {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatRecoveryCode(raw: string, index: number) {
  const suffix = index.toString(36).toUpperCase().padStart(2, "0");
  const value = `${raw.slice(0, 18)}${suffix}`;
  return value.match(/.{1,5}/g)?.join("-") ?? value;
}

export function generateTotpSecret(randomBytes: RandomBytes = cryptoRandomBytes) {
  return encodeBase32(randomBytes(DEFAULT_SECRET_BYTES));
}

export function generateTotpCode(secret: string, options: TotpOptions = {}) {
  const digits = options.digits ?? DEFAULT_DIGITS;
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const nowMs = options.nowMs ?? Date.now();
  const counter = Math.floor(nowMs / 1000 / periodSeconds);
  return generateTotpCodeForCounter(secret, counter, digits);
}

function generateTotpCodeForCounter(secret: string, counter: number, digits: number) {
  const hmac = createHmac("sha1", decodeBase32(secret)).update(counterBuffer(counter)).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function verifyTotpCode(secret: string, code: string, options: TotpOptions = {}) {
  if (!/^\d{6,8}$/.test(code)) {
    return null;
  }

  const digits = options.digits ?? DEFAULT_DIGITS;
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const nowMs = options.nowMs ?? Date.now();
  const currentCounter = Math.floor(nowMs / 1000 / periodSeconds);

  for (const offset of [-1, 0, 1]) {
    const counter = currentCounter + offset;
    if (counter < 0) {
      continue;
    }
    const expected = generateTotpCodeForCounter(secret, counter, digits);
    const expectedBuffer = Buffer.from(expected);
    const codeBuffer = Buffer.from(code);

    if (
      expectedBuffer.length === codeBuffer.length &&
      timingSafeEqual(expectedBuffer, codeBuffer)
    ) {
      return { counter } satisfies TotpMatch;
    }
  }

  return null;
}

export function verifyTwoFactorLoginCode(args: {
  code: string;
  enabled: boolean;
  nowMs?: number;
  secret: string | null | undefined;
}) {
  if (!args.enabled) {
    return true;
  }

  if (!args.secret || !args.code.trim()) {
    return false;
  }

  return (
    verifyTotpCode(
      args.secret,
      args.code.trim(),
      args.nowMs === undefined ? {} : { nowMs: args.nowMs },
    ) !== null
  );
}

export function createTotpSetup(args: {
  accountName: string;
  issuer: string;
  randomBytes?: RandomBytes;
}): TotpSetup {
  const secret = generateTotpSecret(args.randomBytes);
  const issuer = encodeURIComponent(args.issuer);
  const accountName = encodeURIComponent(args.accountName);
  const otpauthUri = `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DEFAULT_DIGITS}&period=${DEFAULT_PERIOD_SECONDS}`;

  return {
    manualEntryKey: secret,
    otpauthUri,
    secret,
  };
}

export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function verifyRecoveryCode(code: string, hash: string) {
  const expected = Buffer.from(hashRecoveryCode(code), "hex");
  const actual = Buffer.from(hash, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateRecoveryCodes(args: {
  count: number;
  randomBytes?: RandomBytes;
}): RecoveryCode[] {
  const randomBytes = args.randomBytes ?? cryptoRandomBytes;

  return Array.from({ length: args.count }, (_, index) => {
    const raw = randomBytes(RECOVERY_CODE_BYTES).toString("hex").toUpperCase();
    const plaintext = formatRecoveryCode(raw, index);

    return {
      hash: hashRecoveryCode(plaintext),
      plaintext,
    };
  });
}

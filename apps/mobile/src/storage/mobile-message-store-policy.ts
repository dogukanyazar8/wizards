/**
 * What the encrypted message cache is allowed to keep, and for how long.
 *
 * Message content is kept out of the AsyncStorage query cache, which is not
 * encrypted: the persisted payloads that carry a preview line have it stripped on
 * the way to disk (`query/mobile-query-cache-policy.ts`). Bodies live here
 * instead — in a SQLCipher database whose key never leaves the keychain, and which
 * refuses to open at all on a build without the cipher
 * (`assertMobileMessageStoreEncrypted`).
 *
 * Encryption is not a licence to keep everything: only the newest page of the few
 * most recently read targets is stored, per account, it expires, and the sign-out
 * wipe drops the lot.
 */
export const MOBILE_MESSAGE_STORE_MAX_AGE_MS = 24 * 60 * 60_000;

/** Per scope, so a reader with many conversations cannot grow the file forever. */
export const MOBILE_MESSAGE_STORE_MAX_TARGETS = 8;

/**
 * Bump when the stored page shape changes incompatibly. An older envelope is
 * never read, so no migration code is needed.
 */
export const MOBILE_MESSAGE_STORE_SCHEMA_VERSION = 1;

type MobileStoredMessageEnvelope = {
  readonly payload: unknown;
  readonly version: number;
};

export function serializeMobileStoredMessagePage(payload: unknown): string {
  return JSON.stringify({
    payload,
    version: MOBILE_MESSAGE_STORE_SCHEMA_VERSION,
  } satisfies MobileStoredMessageEnvelope);
}

export function parseMobileStoredMessagePage(raw: string): unknown {
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!envelope || typeof envelope !== "object") {
    return null;
  }

  const { payload, version } = envelope as Partial<MobileStoredMessageEnvelope>;
  if (version !== MOBILE_MESSAGE_STORE_SCHEMA_VERSION || !payload || typeof payload !== "object") {
    return null;
  }

  return payload;
}

export function isMobileStoredMessagePageFresh(
  updatedAt: number,
  now: number,
  maxAgeMs: number = MOBILE_MESSAGE_STORE_MAX_AGE_MS,
): boolean {
  return now - updatedAt <= maxAgeMs;
}

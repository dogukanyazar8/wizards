import { getRandomBytesAsync } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { openDatabaseAsync } from "expo-sqlite";
import { getMobileRuntimeConfig, type MobileEnvironmentName } from "../config/environment";
import {
  assertMobileMessageStoreEncrypted,
  createMobileMessageStore,
  type MobileMessageStoreDatabase,
} from "./mobile-message-store";

const MOBILE_MESSAGE_STORE_KEY_BYTES = 32;

/**
 * One database file and one key per environment, so a UAT build can never read a
 * production build's cache on the same device. Accounts are separated *inside*
 * the file by the `user_id` primary-key column.
 */
function getMobileMessageStoreDatabaseName(environment: MobileEnvironmentName): string {
  return `whispr-messages.${environment}.db`;
}

function getMobileMessageStoreKeyName(environment: MobileEnvironmentName): string {
  return `whispr.messages.sqlcipher.key.${environment}`;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * The SQLCipher key, kept in the keychain/keystore and nowhere else.
 *
 * Generated once per install from the platform CSPRNG, and deliberately **not**
 * deleted on sign-out: a key that disappears while the database file remains
 * leaves an unreadable file behind that the next launch cannot open or repair.
 * Sign-out drops the rows instead (see `runMobileSessionWipe`), which is what
 * actually protects the next account.
 */
export async function getOrCreateMobileMessageStoreKey(
  environment: MobileEnvironmentName,
): Promise<string> {
  const keyName = getMobileMessageStoreKeyName(environment);
  const existing = await SecureStore.getItemAsync(keyName);
  if (existing && existing.length === MOBILE_MESSAGE_STORE_KEY_BYTES * 2) {
    return existing;
  }

  const key = toHex(await getRandomBytesAsync(MOBILE_MESSAGE_STORE_KEY_BYTES));
  await SecureStore.setItemAsync(keyName, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return key;
}

async function openEncryptedMobileMessageDatabase(): Promise<MobileMessageStoreDatabase> {
  const { environment } = getMobileRuntimeConfig();
  const key = await getOrCreateMobileMessageStoreKey(environment);
  const database = await openDatabaseAsync(getMobileMessageStoreDatabaseName(environment));
  // Must be the first statement on the connection — SQLCipher cannot read the
  // header before it is keyed. The raw-hex form skips the KDF salt dance and
  // keeps the key exactly what the keystore handed over.
  await database.execAsync(`PRAGMA key = "x'${key}'";`);

  // Fail closed: a build without SQLCipher accepts the pragma above and would
  // then store message bodies in plaintext.
  const cipher = await database.getFirstAsync<{ cipher_version?: unknown }>(
    "PRAGMA cipher_version;",
    [],
  );
  if (!assertMobileMessageStoreEncrypted(cipher)) {
    await database.closeAsync();
    throw new Error("SQLCipher unavailable; refusing to cache message bodies unencrypted.");
  }

  return database;
}

/** One store for the process; the connection is opened lazily on first use. */
export const mobileMessageStore = createMobileMessageStore({
  openDatabase: openEncryptedMobileMessageDatabase,
});

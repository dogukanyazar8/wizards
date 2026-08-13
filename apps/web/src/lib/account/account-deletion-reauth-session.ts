const ACCOUNT_DELETION_REAUTH_STORAGE_KEY = "whispr:account-delete:reauth";
const REAUTH_TOKEN_PATTERN = /^[A-Za-z0-9._-]{16,512}$/;

type SessionStoragePort = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function storeAccountDeletionReauthToken(storage: SessionStoragePort, token: string) {
  if (!REAUTH_TOKEN_PATTERN.test(token)) {
    throw new TypeError("Account deletion reauth token is invalid.");
  }
  storage.setItem(ACCOUNT_DELETION_REAUTH_STORAGE_KEY, token);
}

export function consumeAccountDeletionReauthToken(storage: SessionStoragePort) {
  const token = storage.getItem(ACCOUNT_DELETION_REAUTH_STORAGE_KEY);
  storage.removeItem(ACCOUNT_DELETION_REAUTH_STORAGE_KEY);
  return token && REAUTH_TOKEN_PATTERN.test(token) ? token : null;
}

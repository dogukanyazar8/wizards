import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consumeAccountDeletionReauthToken,
  storeAccountDeletionReauthToken,
} from "./account-deletion-reauth-session";

describe("account deletion reauth session handoff", () => {
  it("stores a short-lived token for one read only", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => void values.delete(key),
      setItem: (key: string, value: string) => void values.set(key, value),
    };

    storeAccountDeletionReauthToken(storage, "abcdefghijklmnopqrstuvwxyzABCDEF123456");
    assert.equal(
      consumeAccountDeletionReauthToken(storage),
      "abcdefghijklmnopqrstuvwxyzABCDEF123456",
    );
    assert.equal(consumeAccountDeletionReauthToken(storage), null);
  });
});

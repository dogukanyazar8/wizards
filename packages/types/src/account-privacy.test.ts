import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AccountDeletionPreflightSchema, AccountDeletionRequestSchema } from "./account-privacy";

describe("account privacy contracts", () => {
  it("accepts a bounded deletion preflight and rejects unknown fields", () => {
    const payload = {
      canDelete: false,
      confirmationPhrase: "DELETE MY ACCOUNT",
      emailVerified: true,
      ownedServers: [{ id: "server-1", name: "Wizards" }],
      reauthMethod: "PASSWORD",
    } as const;

    assert.deepEqual(AccountDeletionPreflightSchema.parse(payload), payload);
    assert.throws(() => AccountDeletionPreflightSchema.parse({ ...payload, userId: "other-user" }));
  });

  it("requires the exact destructive confirmation phrase", () => {
    assert.deepEqual(AccountDeletionRequestSchema.parse({ confirmation: "DELETE MY ACCOUNT" }), {
      confirmation: "DELETE MY ACCOUNT",
    });
    assert.throws(() => AccountDeletionRequestSchema.parse({ confirmation: "delete my account" }));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rollbackUnverifiedUser } from "./registration-compensation";

describe("registration compensation", () => {
  it("deletes the unverified registration user", async () => {
    const calls: unknown[] = [];

    const result = await rollbackUnverifiedUser({
      email: "new-user@example.com",
      userDelegate: {
        async delete(args) {
          calls.push(args);
        },
      },
      userId: "user_1",
    });

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [
      {
        where: {
          id: "user_1",
        },
      },
    ]);
  });

  it("logs rollback failures instead of swallowing them", async () => {
    const error = new Error("database unavailable");
    const logs: Array<{ error: unknown; scope: string }> = [];

    const result = await rollbackUnverifiedUser({
      email: "new-user@example.com",
      logger(scope, loggedError) {
        logs.push({ error: loggedError, scope });
      },
      userDelegate: {
        async delete() {
          throw error;
        },
      },
      userId: "user_2",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, error);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.scope, "[auth] Failed to roll back unverified registration user");
    assert.deepEqual(logs[0]?.error, {
      email: "new-user@example.com",
      error,
      userId: "user_2",
    });
  });
});

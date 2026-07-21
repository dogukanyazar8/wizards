import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@wizards/db";
import { getCurrentUserForSession } from "./utils";

type UnknownRecord = Record<string, unknown>;

const restores: Array<() => void> = [];

function patchPrismaUserFindUnique(value: unknown) {
  const record = prisma.user as unknown as UnknownRecord;
  const original = record.findUnique;
  record.findUnique = value;
  restores.push(() => {
    record.findUnique = original;
  });
}

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) {
    restore();
  }
});

function session(userId: string | null | undefined) {
  return { expires: "2099-01-01T00:00:00.000Z", user: { id: userId } } as never;
}

describe("authenticated data access layer", () => {
  it("loads the user by a primitive id so the request cache can actually hit", async () => {
    const calls: unknown[] = [];
    patchPrismaUserFindUnique(async (args: unknown) => {
      calls.push(args);
      return { id: "user-1", username: "ada" };
    });

    const user = await getCurrentUserForSession(session("user-1"));

    assert.deepEqual(user, { id: "user-1", username: "ada" });
    assert.equal(calls.length, 1);
    // Keying on the session object would never dedupe: next-auth returns a
    // fresh object per resolution, so the cache key has to be the id.
    assert.deepEqual((calls[0] as { where?: unknown }).where, { id: "user-1" });
  });

  it("never queries when the session carries no user id", async () => {
    let queried = false;
    patchPrismaUserFindUnique(async () => {
      queried = true;
      return null;
    });

    assert.equal(await getCurrentUserForSession(null), null);
    assert.equal(await getCurrentUserForSession(undefined), null);
    assert.equal(await getCurrentUserForSession(session(null)), null);
    assert.equal(await getCurrentUserForSession(session(undefined)), null);
    assert.equal(await getCurrentUserForSession(session("")), null);
    assert.equal(queried, false);
  });

  it("keeps the projection narrow enough to stay out of credential columns", async () => {
    let selected: Record<string, unknown> = {};
    patchPrismaUserFindUnique(async (args: unknown) => {
      selected = ((args as { select?: Record<string, unknown> }).select ?? {}) as Record<
        string,
        unknown
      >;
      return null;
    });

    await getCurrentUserForSession(session("user-1"));

    for (const forbidden of ["passwordHash", "twoFactorSecret", "sessionsRevokedAfter"]) {
      assert.equal(forbidden in selected, false, `${forbidden} must not be selected`);
    }
    assert.equal(selected.id, true);
    assert.equal(selected.username, true);
  });
});

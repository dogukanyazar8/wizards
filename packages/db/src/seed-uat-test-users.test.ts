import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "./index";

import {
  readUatTestUsersSeedOptions,
  seedUatTestUsers,
  UAT_TEST_USERS,
  UAT_TEST_USERS_CONFIRMATION,
} from "./seed-uat-test-users";

type UpsertCall = {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
  where: { email: string };
};

function createPrismaStub(calls: UpsertCall[]): Pick<PrismaClient, "user"> {
  return {
    user: {
      async upsert(call: UpsertCall) {
        calls.push(call);
        return call;
      },
    },
  } as unknown as Pick<PrismaClient, "user">;
}

test("seeds exactly five verified UAT accounts without workspace writes", async () => {
  const calls: UpsertCall[] = [];

  await seedUatTestUsers({
    password: "UatTestUsers!2026",
    prisma: createPrismaStub(calls),
    hashPassword: async () => "hash",
  });

  assert.equal(UAT_TEST_USERS.length, 5);
  assert.equal(calls.length, 5);
  assert.deepEqual(
    calls.map((call) => call.where.email),
    UAT_TEST_USERS.map((user) => user.email),
  );

  for (const call of calls) {
    assert.equal(call.create.emailVerified, true);
    assert.equal(call.create.passwordHash, "hash");
    assert.deepEqual(call.create.notificationSettings, { create: {} });
    assert.deepEqual(call.create.settings, { create: {} });
    assert.equal(call.update.emailVerified, true);
    assert.equal("passwordHash" in call.update, false);
  }
});

test("resets an existing test-account password only when explicitly requested", async () => {
  const calls: UpsertCall[] = [];

  await seedUatTestUsers({
    password: "UatTestUsers!2026",
    prisma: createPrismaStub(calls),
    resetPassword: true,
    hashPassword: async () => "hash",
  });

  assert.equal(calls.length, 5);
  assert.ok(calls.every((call) => call.update.passwordHash === "hash"));
});

test("requires an explicit confirmation and a non-default password", () => {
  assert.throws(() => readUatTestUsersSeedOptions({}), /UAT_TEST_USERS_CONFIRM/);
  assert.throws(
    () =>
      readUatTestUsersSeedOptions({
        UAT_TEST_USERS_CONFIRM: UAT_TEST_USERS_CONFIRMATION,
        UAT_TEST_USERS_PASSWORD: "short",
      }),
    /at least 12 characters/,
  );
  assert.throws(
    () =>
      readUatTestUsersSeedOptions({
        UAT_TEST_USERS_CONFIRM: UAT_TEST_USERS_CONFIRMATION,
        UAT_TEST_USERS_PASSWORD: "🙂".repeat(19),
      }),
    /72 UTF-8 bytes/,
  );

  assert.deepEqual(
    readUatTestUsersSeedOptions({
      UAT_TEST_USERS_CONFIRM: UAT_TEST_USERS_CONFIRMATION,
      UAT_TEST_USERS_PASSWORD: "UatTestUsers!2026",
      UAT_TEST_USERS_RESET_PASSWORD: "true",
    }),
    { password: "UatTestUsers!2026", resetPassword: true },
  );
});

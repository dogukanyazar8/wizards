import assert from "node:assert/strict";
import test from "node:test";
import { readPrismaPoolOptions } from "./pool-options";

test("uses deliberate Prisma 7 PostgreSQL adapter pool defaults", () => {
  assert.deepEqual(
    readPrismaPoolOptions({
      DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/wizards",
    }),
    {
      connectionString: "postgresql://user:password@127.0.0.1:5432/wizards",
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
      max: 10,
    },
  );
});

test("rejects missing, unsupported, and out-of-range connection settings", () => {
  assert.throws(() => readPrismaPoolOptions({}), /DATABASE_URL/);
  assert.throws(
    () =>
      readPrismaPoolOptions({
        DATABASE_URL: "prisma://accelerate.example",
      }),
    /direct PostgreSQL URL/i,
  );
  assert.throws(
    () =>
      readPrismaPoolOptions({
        DATABASE_POOL_MAX: "21",
        DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/wizards",
      }),
    /DATABASE_POOL_MAX/,
  );
});

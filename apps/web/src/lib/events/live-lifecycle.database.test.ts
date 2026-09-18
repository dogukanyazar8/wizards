import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it } from "node:test";

import { prisma } from "@wizards/db";

import { lockEventLiveChannel } from "./live-lifecycle";

after(async () => {
  if (process.env.RUN_LIVE_LIFECYCLE_DB_TESTS === "1") {
    await prisma.$disconnect();
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

it(
  "serializes concurrent event lifecycle transactions for the same channel",
  { skip: process.env.RUN_LIVE_LIFECYCLE_DB_TESTS !== "1", timeout: 5_000 },
  async () => {
    const channelId = `live-lifecycle-test:${randomUUID()}`;
    const firstLocked = deferred();
    const releaseFirst = deferred();
    const secondReady = deferred();
    let secondAcquired = false;

    const firstTransaction = prisma.$transaction(async (transaction) => {
      await lockEventLiveChannel(transaction, channelId);
      firstLocked.resolve();
      await releaseFirst.promise;
    });

    await firstLocked.promise;

    const secondTransaction = prisma.$transaction(async (transaction) => {
      // Proves this transaction has a live database connection before it attempts the lock.
      await transaction.$queryRaw`SELECT 1`;
      secondReady.resolve();
      await lockEventLiveChannel(transaction, channelId);
      secondAcquired = true;
    });

    try {
      await secondReady.promise;
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(secondAcquired, false);
    } finally {
      releaseFirst.resolve();
      await Promise.all([firstTransaction, secondTransaction]);
    }

    assert.equal(secondAcquired, true);
  },
);

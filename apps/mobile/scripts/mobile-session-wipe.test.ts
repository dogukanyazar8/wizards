import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  planMobileSessionWipe,
  runMobileSessionWipe,
  type MobileSessionWipeDependencies,
} from "../src/state/mobile-session-wipe";

function createDependencies(
  overrides: Partial<MobileSessionWipeDependencies> = {},
): MobileSessionWipeDependencies & { readonly steps: string[] } {
  const steps: string[] = [];
  return {
    steps,
    cancelRealtimeWork: async () => {
      steps.push("cancel-realtime");
    },
    closeMessageStore: async () => {
      steps.push("close-store");
    },
    dropMemoryCaches: () => {
      steps.push("drop-memory");
    },
    purgeMessageStore: async () => {
      steps.push("purge-store");
    },
    purgeQueryCache: async () => {
      steps.push("purge-query-cache");
    },
    report: (result) => {
      steps.push(`report:${result.status}`);
    },
    ...overrides,
  };
}

describe("planMobileSessionWipe", () => {
  it("never wipes while the stored session is still being checked", () => {
    assert.equal(
      planMobileSessionWipe(
        { status: "checking", userId: null },
        { status: "checking", userId: null },
      ),
      null,
    );
    assert.equal(
      planMobileSessionWipe(
        { status: "checking", userId: null },
        { status: "signed-in", userId: "user-1" },
      ),
      null,
    );
  });

  it("never wipes on a transient auth error", () => {
    assert.equal(
      planMobileSessionWipe(
        { status: "error", userId: null },
        { status: "signed-in", userId: "user-1" },
      ),
      null,
    );
  });

  it("wipes when a signed-in session ends", () => {
    assert.deepEqual(
      planMobileSessionWipe(
        { status: "signed-out", userId: null },
        { status: "signed-in", userId: "user-1" },
      ),
      { previousUserId: "user-1", reason: "sign-out" },
    );
  });

  it("wipes when the signed-in account changes on the same device", () => {
    assert.deepEqual(
      planMobileSessionWipe(
        { status: "signed-in", userId: "user-2" },
        { status: "signed-in", userId: "user-1" },
      ),
      { previousUserId: "user-1", reason: "account-switch" },
    );
  });

  it("does not wipe while the same account stays signed in", () => {
    assert.equal(
      planMobileSessionWipe(
        { status: "signed-in", userId: "user-1" },
        { status: "signed-in", userId: "user-1" },
      ),
      null,
    );
  });

  it("does not wipe on a cold start that lands straight on signed-out", () => {
    // No session was ever established in this process, so there is nothing of
    // this account's to remove — and the persisted cache belongs to whoever
    // signs in next, which the sign-in path decides.
    assert.equal(planMobileSessionWipe({ status: "signed-out", userId: null }, null), null);
  });
});

describe("runMobileSessionWipe", () => {
  it("stops writes, cancels work and closes the store before deleting anything", async () => {
    const dependencies = createDependencies();

    const result = await runMobileSessionWipe(
      { previousUserId: "user-1", reason: "sign-out" },
      dependencies,
    );

    assert.equal(result.status, "complete");
    assert.deepEqual(dependencies.steps, [
      "cancel-realtime",
      "drop-memory",
      "purge-store",
      "close-store",
      "purge-query-cache",
      "report:complete",
    ]);
  });

  it("finishes the remaining steps when one of them fails", async () => {
    const dependencies = createDependencies({
      purgeMessageStore: async () => {
        throw new Error("database locked");
      },
    });

    const result = await runMobileSessionWipe(
      { previousUserId: "user-1", reason: "account-switch" },
      dependencies,
    );

    assert.equal(result.status, "partial");
    assert.deepEqual(result.failedSteps, ["purge-message-store"]);
    assert.deepEqual(dependencies.steps, [
      "cancel-realtime",
      "drop-memory",
      "close-store",
      "purge-query-cache",
      "report:partial",
    ]);
  });

  it("awaits every step so a caller can gate sign-in on the result", async () => {
    const order: string[] = [];
    let resolvePurge: () => void = () => undefined;
    const purgePending = new Promise<void>((resolve) => {
      resolvePurge = resolve;
    });

    const dependencies = createDependencies({
      purgeMessageStore: async () => {
        order.push("purge:start");
        await purgePending;
        order.push("purge:end");
      },
      closeMessageStore: async () => {
        order.push("close");
      },
    });

    const wipe = runMobileSessionWipe(
      { previousUserId: "user-1", reason: "sign-out" },
      dependencies,
    );
    resolvePurge();
    await wipe;

    assert.deepEqual(order, ["purge:start", "purge:end", "close"]);
  });
});

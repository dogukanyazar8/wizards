import assert from "node:assert/strict";
import { test } from "node:test";
import { startGoLivePolling } from "./use-go-live-candidate";

test("Go Live polls every 15s, resets absence on transport failure, and cancels pending work", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const snapshots: Array<{ missingCount: number }> = [];
  let fail = false;
  let calls = 0;
  const stop = startGoLivePolling(
    async () => {
      calls++;
      if (fail) throw new Error("transport failed");
      return {
        enabled: true,
        gameId: null,
        label: null,
        foregroundIsGame: false,
        canOfferGoLive: false,
      };
    },
    (snapshot) => snapshots.push(snapshot),
  );
  await Promise.resolve();
  assert.equal(snapshots.at(-1)?.missingCount, 1);
  context.mock.timers.tick(14_999);
  assert.equal(calls, 1);
  context.mock.timers.tick(1);
  await Promise.resolve();
  assert.equal(snapshots.at(-1)?.missingCount, 2);
  fail = true;
  context.mock.timers.tick(15_000);
  await Promise.resolve();
  assert.equal(snapshots.at(-1)?.missingCount, 0);
  stop();
  context.mock.timers.tick(30_000);
  assert.equal(calls, 3);
});

test("foreground loss hides CTA without counting a running game as closed", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let snapshot: unknown;
  const stop = startGoLivePolling(
    async () => ({
      enabled: true,
      gameId: "valorant",
      label: null,
      foregroundIsGame: false,
      canOfferGoLive: false,
    }),
    (next) => {
      snapshot = next;
    },
  );
  await Promise.resolve();
  assert.deepEqual(snapshot, { candidate: null, missingCount: 0 });
  stop();
});

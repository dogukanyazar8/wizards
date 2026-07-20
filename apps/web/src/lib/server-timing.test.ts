import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServerTiming } from "./server-timing";

function fakeClock(steps: number[]) {
  let index = 0;
  return () => steps[Math.min(index++, steps.length - 1)] ?? 0;
}

describe("server timing", () => {
  it("reports each measured bucket plus a total", async () => {
    // start=0, auth start=0, auth end=12, db start=12, db end=112, header=120
    const timing = createServerTiming(fakeClock([0, 0, 12, 12, 112, 120]));

    await timing.measure("auth", async () => "user-1");
    await timing.measure("db", async () => "rows");

    assert.equal(timing.header(), "auth;dur=12.0, db;dur=100.0, total;dur=120.0");
  });

  it("accumulates repeated buckets instead of keeping only the last", async () => {
    const timing = createServerTiming(fakeClock([0, 0, 10, 10, 25, 30]));

    await timing.measure("db", async () => 1);
    await timing.measure("db", async () => 2);

    assert.match(timing.header(), /^db;dur=25\.0, total;dur=30\.0$/);
  });

  it("still records the bucket when the measured work throws", async () => {
    const timing = createServerTiming(fakeClock([0, 0, 40, 45]));

    await assert.rejects(() =>
      timing.measure("db", async () => {
        throw new Error("query failed");
      }),
    );

    assert.match(timing.header(), /^db;dur=40\.0, total;dur=45\.0$/);
  });

  it("refuses to echo an unsafe metric name into the response header", async () => {
    const timing = createServerTiming(fakeClock([0, 0, 5, 6]));

    await timing.measure('db";injected', async () => 1);

    assert.equal(timing.header().includes("injected"), false);
    assert.match(timing.header(), /^unknown;dur=5\.0/);
  });

  it("times manually started buckets and ignores a repeated stop", async () => {
    const timing = createServerTiming(fakeClock([0, 0, 30, 90, 95]));

    const stop = timing.start("auth");
    stop();
    stop();

    assert.match(timing.header(), /^auth;dur=30\.0, total;dur=90\.0$/);
  });

  it("merges into existing response headers without dropping them", async () => {
    const timing = createServerTiming(fakeClock([0, 1]));

    assert.deepEqual(timing.headers({ "Cache-Control": "no-store" }), {
      "Cache-Control": "no-store",
      "Server-Timing": "total;dur=1.0",
    });
  });
});

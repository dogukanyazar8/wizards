import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deferMessageFanout } from "./deferred-fanout";

describe("deferMessageFanout", () => {
  it("runs the work", async () => {
    let ran = false;

    await deferMessageFanout(
      "[test] fan-out",
      async () => {
        ran = true;
      },
      () => assert.fail("must not report a success"),
    );

    assert.equal(ran, true);
  });

  it("starts the work without waiting for it", async () => {
    let resolveTask!: () => void;
    let finished = false;
    const pending = deferMessageFanout(
      "[test] fan-out",
      () =>
        new Promise<void>((resolve) => {
          resolveTask = () => {
            finished = true;
            resolve();
          };
        }),
      () => undefined,
    );

    // The sender's ack is already gone by this point; the fan-out is still open.
    assert.equal(finished, false);
    resolveTask();
    await pending;
    assert.equal(finished, true);
  });

  it("reports a rejected fan-out instead of leaving it unhandled", async () => {
    const reported: Array<{ error: unknown; scope: string }> = [];

    await deferMessageFanout(
      "[test] fan-out",
      async () => {
        throw new Error("presence lookup failed");
      },
      (scope, error) => reported.push({ error, scope }),
    );

    assert.equal(reported.length, 1);
    assert.equal(reported[0]?.scope, "[test] fan-out");
    assert.match(String(reported[0]?.error), /presence lookup failed/u);
  });

  it("reports a task that throws before it returns a promise", async () => {
    const reported: unknown[] = [];

    await deferMessageFanout(
      "[test] fan-out",
      () => {
        throw new Error("socket server missing");
      },
      (_scope, error) => reported.push(error),
    );

    assert.equal(reported.length, 1);
    assert.match(String(reported[0]), /socket server missing/u);
  });

  it("never rejects, so a send that already answered cannot crash the process", async () => {
    await assert.doesNotReject(
      deferMessageFanout(
        "[test] fan-out",
        async () => {
          throw new Error("boom");
        },
        () => undefined,
      ),
    );
  });
});

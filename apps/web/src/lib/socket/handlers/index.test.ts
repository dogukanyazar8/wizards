import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeSocketHandlerRegistration } from "./index";

import type { SocketHandlerRegistration } from "./index";

function requireCleanup(registration: SocketHandlerRegistration) {
  assert.ok(registration.cleanup);
  return registration.cleanup;
}

describe("socket handler registration cleanup", () => {
  it("runs child cleanup handlers only once across repeated cleanup calls", async () => {
    const cleanupCalls: string[] = [];
    const stopDMTyping = async () => undefined;
    const registration = composeSocketHandlerRegistration(
      [
        {
          async cleanup() {
            cleanupCalls.push("first");
          },
        },
        {
          async cleanup() {
            cleanupCalls.push("second");
          },
        },
      ],
      { stopDMTyping },
    );
    const cleanup = requireCleanup(registration);

    await cleanup();
    await cleanup();

    assert.deepEqual(cleanupCalls, ["first", "second"]);
    assert.equal(registration.stopDMTyping, stopDMTyping);
  });

  it("coalesces concurrent cleanup calls into the same cleanup pass", async () => {
    let cleanupCalls = 0;
    let releaseCleanup!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const registration = composeSocketHandlerRegistration([
      {
        async cleanup() {
          cleanupCalls += 1;
          await cleanupStarted;
        },
      },
    ]);
    const cleanup = requireCleanup(registration);

    const firstCleanup = cleanup();
    const secondCleanup = cleanup();

    releaseCleanup();
    await Promise.all([firstCleanup, secondCleanup]);

    assert.equal(cleanupCalls, 1);
  });

  it("allows retry after a cleanup failure", async () => {
    let cleanupCalls = 0;
    const registration = composeSocketHandlerRegistration([
      {
        async cleanup() {
          cleanupCalls += 1;
          if (cleanupCalls === 1) {
            throw new Error("transient cleanup failure");
          }
        },
      },
    ]);
    const cleanup = requireCleanup(registration);

    await assert.rejects(cleanup(), /transient cleanup failure/);
    await cleanup();

    assert.equal(cleanupCalls, 2);
  });
});

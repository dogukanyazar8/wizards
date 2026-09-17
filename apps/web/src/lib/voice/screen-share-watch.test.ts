import assert from "node:assert/strict";
import { test } from "node:test";
import { runScreenShareWatch } from "../socket/handlers/voice";

test("watch authorization, rate limit and no-op updates gate fanout", async () => {
  for (const mode of ["rate", "self", "outsider", "stopped", "noop", "changed"]) {
    let updates = 0,
      emits = 0,
      authorizations = 0;
    const work = runScreenShareWatch({
      watching: true,
      isSelf: mode === "self",
      isParticipant: mode !== "outsider",
      checkRateLimit: async () => mode !== "rate",
      authorize: async () => {
        authorizations++;
      },
      update: async () => {
        updates++;
        return mode === "stopped" ? -1 : mode === "noop" ? 0 : 1;
      },
      emit: async () => {
        emits++;
      },
    });
    if (["self", "outsider", "stopped"].includes(mode)) await assert.rejects(work);
    else await work;
    assert.equal(emits, mode === "changed" ? 1 : 0);
    assert.equal(updates, ["stopped", "noop", "changed"].includes(mode) ? 1 : 0);
    assert.equal(authorizations, updates);
  }
});

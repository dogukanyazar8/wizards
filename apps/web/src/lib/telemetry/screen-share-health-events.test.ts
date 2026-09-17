import assert from "node:assert/strict";
import { test } from "node:test";
import { createScreenShareModeChangeEvent } from "./screen-share-health-events";
import { parseClientHealthBatch } from "./client-health-service";

test("mode switches use the existing bounded health endpoint without identity or error details", () => {
  for (const result of ["success", "error"] as const) {
    const event = createScreenShareModeChangeEvent({ mode: "motion", durationMs: 12.8, result });
    assert.deepEqual(event.context, { event: "mode_change", mode: "motion", result });
    assert.equal(event.value, 13);
    assert.deepEqual(parseClientHealthBatch({ events: [event] }).events, [event]);
  }
  assert.equal(
    createScreenShareModeChangeEvent({ mode: "text", durationMs: 700_000, result: "success" })
      .value,
    600_000,
  );
});

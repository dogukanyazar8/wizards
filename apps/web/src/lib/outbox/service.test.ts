import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getOutboxRetryDelayMs } from "./service";

describe("outbox service", () => {
  it("backs off retries without exceeding the worker cap", () => {
    assert.equal(getOutboxRetryDelayMs(1), 1000);
    assert.equal(getOutboxRetryDelayMs(2), 2000);
    assert.equal(getOutboxRetryDelayMs(8), 60000);
    assert.equal(getOutboxRetryDelayMs(20), 60000);
  });
});

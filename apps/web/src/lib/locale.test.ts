import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_MESSAGES } from "./locale";

describe("locale dictionaries", () => {
  it("keeps EN and TR translation keys in parity", () => {
    assert.deepEqual(
      Object.keys(APP_MESSAGES.tr).sort(),
      Object.keys(APP_MESSAGES.en).sort(),
    );
  });
});

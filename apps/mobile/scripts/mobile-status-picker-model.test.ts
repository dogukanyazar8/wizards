import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  toMobilePresenceStatus,
  toMobilePresenceStatusOrNull,
  toMobileStatusPickerOption,
} from "../src/social/mobile-status-picker-model";

describe("mobile status picker model", () => {
  it("narrows a loose wire status to the presence union", () => {
    assert.equal(toMobilePresenceStatusOrNull("ONLINE"), "ONLINE");
    assert.equal(toMobilePresenceStatusOrNull("IDLE"), "IDLE");
    assert.equal(toMobilePresenceStatusOrNull("DND"), "DND");
    assert.equal(toMobilePresenceStatusOrNull("OFFLINE"), "OFFLINE");
  });

  it("rejects anything that is not a real presence value", () => {
    assert.equal(toMobilePresenceStatusOrNull(null), null);
    assert.equal(toMobilePresenceStatusOrNull(undefined), null);
    assert.equal(toMobilePresenceStatusOrNull("INVISIBLE"), null);
    assert.equal(toMobilePresenceStatusOrNull("busy"), null);
  });

  it("round-trips OFFLINE through the invisible row so the two sheets agree", () => {
    assert.equal(toMobileStatusPickerOption("OFFLINE"), "INVISIBLE");
    assert.equal(toMobilePresenceStatus("INVISIBLE"), "OFFLINE");
  });
});

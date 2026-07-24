import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUpdateDismissed } from "./app-update-notifier";

describe("app update dismissal", () => {
  it("only hides the matching update build", () => {
    assert.equal(isUpdateDismissed("build-2", "build-2"), true);
    assert.equal(isUpdateDismissed("build-2", "build-1"), false);
    assert.equal(isUpdateDismissed(undefined, "build-2"), false);
  });
});

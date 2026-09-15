import assert from "node:assert/strict";
import { it } from "node:test";
import {
  confirmAction,
  confirmationSnapshot,
  finishConfirmation,
  subscribeConfirmation,
} from "./confirmation";
it("confirmation is explicit, exclusive, and cancelled when its host closes", async () => {
  assert.equal(await confirmAction("No UI"), false);
  const unsubscribe = subscribeConfirmation(() => {});
  const first = confirmAction("Delete?", true);
  assert.equal(confirmationSnapshot()?.danger, true);
  assert.equal(await confirmAction("Concurrent"), false);
  finishConfirmation(false);
  assert.equal(await first, false);
  const second = confirmAction("Continue?");
  finishConfirmation(true);
  assert.equal(await second, true);
  const third = confirmAction("Unmount?");
  unsubscribe();
  assert.equal(await third, false);
  assert.equal(confirmationSnapshot(), null);
});

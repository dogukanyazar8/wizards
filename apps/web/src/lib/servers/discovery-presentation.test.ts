import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveServerJoinErrorMessageKey } from "@/lib/servers/discovery-presentation";

describe("resolveServerJoinErrorMessageKey", () => {
  it("maps a ban to its own key", () => {
    assert.equal(resolveServerJoinErrorMessageKey("SERVER_BANNED"), "discover.joinError.banned");
  });

  it("maps a full server to its own key", () => {
    assert.equal(resolveServerJoinErrorMessageKey("SERVER_FULL"), "discover.joinError.full");
  });

  it("maps not-found (private or nonexistent, indistinguishable) to 'unavailable'", () => {
    assert.equal(
      resolveServerJoinErrorMessageKey("SERVER_NOT_FOUND"),
      "discover.joinError.unavailable",
    );
  });

  it("falls back to a generic key for an unmapped code", () => {
    assert.equal(resolveServerJoinErrorMessageKey("SOMETHING_NEW"), "discover.joinError.generic");
  });

  it("falls back to a generic key when there is no code at all", () => {
    assert.equal(resolveServerJoinErrorMessageKey(undefined), "discover.joinError.generic");
  });
});

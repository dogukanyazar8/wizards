import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseInboxSource } from "./side-screens";

/**
 * Ş10 — bu süitin etkinlik yarısı (`?view=` ayrıştırıcısı, ay ızgarası, takvim klavye
 * gezinmesi, gün gruplayıcısı) modülleriyle birlikte silindi. Geriye gelen kutusunun tek
 * kararı kaldı.
 */
describe("side screen URL state", () => {
  it("falls back to the widest inbox chip for an unknown filter", () => {
    assert.equal(parseInboxSource("friend_request"), "friend_request");
    assert.equal(parseInboxSource("nonsense"), "all");
    assert.equal(parseInboxSource(null), "all");
  });
});

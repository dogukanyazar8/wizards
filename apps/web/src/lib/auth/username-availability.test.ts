import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  USERNAME_SUGGESTION_COUNT,
  checkUsernameAvailability,
} from "@/lib/auth/username-availability";

/**
 * SPEC-GIRIS-KAYIT §10 ve §7/4 — kullanıcı adı müsaitliği ve üç öneri etiketi.
 *
 * Öneriler paket kararı K8 gereği ürün kuralına uyar (`a-zA-Z0-9_`); tasarımın `ada.dev`
 * örneğindeki nokta üründe geçerli bir karakter değil.
 */

function withTaken(taken: string[]) {
  return {
    findTaken: async (candidates: string[]) => candidates.filter((name) => taken.includes(name)),
  };
}

describe("username availability", () => {
  it("reports a free username without suggestions", async () => {
    assert.deepEqual(await checkUsernameAvailability("ada", withTaken([])), {
      available: true,
      suggestions: [],
      valid: true,
    });
  });

  it("offers exactly three suggestions when taken", async () => {
    const result = await checkUsernameAvailability("ada", withTaken(["ada"]));

    assert.equal(result.available, false);
    assert.equal(result.valid, true);
    assert.equal(result.suggestions.length, USERNAME_SUGGESTION_COUNT);
  });

  it("never suggests a name that is also taken", async () => {
    const result = await checkUsernameAvailability("ada", withTaken(["ada", "ada_dev", "ada_42"]));

    assert.equal(result.suggestions.includes("ada_dev"), false);
    assert.equal(result.suggestions.includes("ada_42"), false);
    assert.equal(result.suggestions.length, USERNAME_SUGGESTION_COUNT);
  });

  it("keeps every suggestion inside the product rule (K8)", async () => {
    const result = await checkUsernameAvailability("ada", withTaken(["ada"]));

    for (const suggestion of result.suggestions) {
      assert.match(suggestion, /^[a-zA-Z0-9_]{2,32}$/, suggestion);
    }
  });

  it("marks an invalid username instead of guessing", async () => {
    assert.deepEqual(await checkUsernameAvailability("ada-lovelace", withTaken([])), {
      available: false,
      suggestions: [],
      valid: false,
    });
    assert.deepEqual(await checkUsernameAvailability("a", withTaken([])), {
      available: false,
      suggestions: [],
      valid: false,
    });
  });

  it("trims the incoming value", async () => {
    const result = await checkUsernameAvailability("  ada  ", withTaken([]));

    assert.equal(result.available, true);
  });
});

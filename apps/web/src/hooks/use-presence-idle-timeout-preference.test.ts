import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IDLE_TIMEOUT_MINUTE_OPTIONS } from "@/app/api/v1/users/me/settings/route-logic";
import {
  DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES,
  LEGACY_PRESENCE_IDLE_TIMEOUT_STORAGE_KEY,
  PRESENCE_IDLE_TIMEOUT_OPTIONS,
  normalizeIdleTimeoutMinutes,
  planIdleTimeoutMigration,
} from "@/hooks/use-presence-idle-timeout-preference";

/** Ş12 §6 — K9 taşıması. */

describe("K9 — boşta sayılma süresi sözleşmesi", () => {
  it("istemci ve sunucu aynı beş değeri kabul ediyor", () => {
    assert.deepEqual([...PRESENCE_IDLE_TIMEOUT_OPTIONS], [...IDLE_TIMEOUT_MINUTE_OPTIONS]);
  });

  it("listede olmayan değer varsayılana düşer", () => {
    assert.equal(normalizeIdleTimeoutMinutes(30), 30);
    assert.equal(normalizeIdleTimeoutMinutes(7), DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES);
    assert.equal(normalizeIdleTimeoutMinutes(null), DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES);
    assert.equal(normalizeIdleTimeoutMinutes("60"), 60);
  });
});

describe("yerel tercihin göçü", () => {
  it("anahtar yoksa göç yok", () => {
    assert.equal(planIdleTimeoutMigration(null), null);
  });

  it("anahtar varsa değeri sunucuya taşınır", () => {
    assert.equal(planIdleTimeoutMigration("30"), 30);
  });

  it("bozuk yerel değer varsayılan olarak taşınır, atılmaz", () => {
    assert.equal(planIdleTimeoutMigration("abc"), DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES);
  });

  it("eski anahtarın adı sözleşmenin parçası", () => {
    assert.equal(LEGACY_PRESENCE_IDLE_TIMEOUT_STORAGE_KEY, "wizards.presence.idleTimeoutMinutes");
  });
});

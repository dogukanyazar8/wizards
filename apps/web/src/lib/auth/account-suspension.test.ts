import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSuspensionReference, resolveAccountSuspension } from "@/lib/auth/account-suspension";

/**
 * SPEC-GIRIS-KAYIT §7/10 — `Referans · WSP-40219`.
 *
 * Kısa referansın kendi kolonu yok; moderasyon vakasının kimliğinden türetiliyor. Vaka yoksa
 * referans **üretilmez** — uydurulmuş bir numara destek ekibini boş aramaya gönderir.
 */

describe("account suspension", () => {
  it("derives a stable reference from the moderation case id", () => {
    assert.equal(formatSuspensionReference("3f9a1c04-7d21-4b0e-9a11-2c8f5d6e7a90"), "WSP-3F9A1C04");
  });

  it("returns no reference when there is no case", () => {
    assert.equal(formatSuspensionReference(null), null);
    assert.equal(formatSuspensionReference(""), null);
    assert.equal(formatSuspensionReference("abc"), null);
  });

  it("carries the ban metadata with the reference", async () => {
    const bannedAt = new Date("2026-08-26T14:02:00.000Z");
    const result = await resolveAccountSuspension(
      { bannedAt, bannedReason: "spam", id: "user_ada" },
      { findLatestCaseId: async () => "3f9a1c04-7d21-4b0e-9a11-2c8f5d6e7a90" },
    );

    assert.deepEqual(result, {
      bannedAt,
      reason: "spam",
      reference: "WSP-3F9A1C04",
    });
  });

  it("survives a lookup failure without breaking the block screen", async () => {
    const result = await resolveAccountSuspension(
      { bannedAt: null, bannedReason: null, id: "user_ada" },
      {
        findLatestCaseId: async () => {
          throw new Error("db down");
        },
      },
    );

    assert.deepEqual(result, { bannedAt: null, reason: null, reference: null });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RATE_MAX_REQUESTS,
  EMAIL_CODE_RATE_PENALTY_MS,
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  requestEmailVerificationCode,
  submitEmailVerificationCode,
  type EmailVerificationCodeRecord,
} from "@/lib/auth/email-verification-code";

/**
 * SPEC-GIRIS-KAYIT §4.5 ve §10 — "6 hane, 10 dakika geçerli", 60 saniyelik yeniden gönderme
 * kilidi, üç istekten sonra iki dakikalık hız sınırı (SPEC §7/9).
 */

const USER = { email: "ada@whispr.app", id: "user_ada" };

function createHarness(startMs = 1_700_000_000_000) {
  let now = startMs;
  let sequence = 0;
  const rows: EmailVerificationCodeRecord[] = [];
  const codes = ["290418", "731905", "118842", "556677"];
  let codeIndex = 0;

  const dependencies = {
    async cancelOutstanding(userId: string) {
      for (const row of rows) {
        if (row.userId === userId && !row.consumedAt) {
          row.consumedAt = new Date(now);
        }
      }
    },
    async consume(id: string) {
      const row = rows.find((entry) => entry.id === id);
      if (row) {
        row.consumedAt = new Date(now);
      }
    },
    async create(input: { codeHash: string; email: string; expiresAt: Date; userId: string }) {
      sequence += 1;
      const row: EmailVerificationCodeRecord = {
        attempts: 0,
        codeHash: input.codeHash,
        consumedAt: null,
        createdAt: new Date(now),
        email: input.email,
        expiresAt: input.expiresAt,
        id: `code_${sequence}`,
        userId: input.userId,
      };
      rows.push(row);
      return row;
    },
    async findActive(userId: string) {
      return [...rows].reverse().find((row) => row.userId === userId && !row.consumedAt) ?? null;
    },
    async listRecent(userId: string, sinceMs: number) {
      return rows
        .filter((row) => row.userId === userId && row.createdAt.getTime() >= sinceMs)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((row) => ({ createdAt: row.createdAt }));
    },
    nowMs: () => now,
    randomCode: () => {
      const code = codes[codeIndex] ?? "000000";
      codeIndex += 1;
      return code;
    },
    async registerFailure(id: string, attempts: number) {
      const row = rows.find((entry) => entry.id === id);
      if (row) {
        row.attempts = attempts;
      }
    },
  };

  return {
    advance(ms: number) {
      now += ms;
    },
    dependencies,
    rows,
  };
}

describe("email verification code", () => {
  it("issues a six-digit code valid for ten minutes", async () => {
    const harness = createHarness();
    const result = await requestEmailVerificationCode(USER, harness.dependencies);

    assert.equal(result.status, "sent");
    if (result.status === "sent") {
      assert.match(result.code, /^\d{6}$/);
      assert.equal(result.expiresAtMs - harness.dependencies.nowMs(), EMAIL_CODE_TTL_MS);
    }
  });

  it("never stores the code in plain text", async () => {
    const harness = createHarness();
    const result = await requestEmailVerificationCode(USER, harness.dependencies);
    assert.equal(result.status, "sent");

    if (result.status === "sent") {
      assert.equal(
        harness.rows.some((row) => row.codeHash.includes(result.code)),
        false,
      );
    }
  });

  it("verifies the right code once", async () => {
    const harness = createHarness();
    const issued = await requestEmailVerificationCode(USER, harness.dependencies);
    assert.equal(issued.status, "sent");
    if (issued.status !== "sent") {
      return;
    }

    assert.deepEqual(
      await submitEmailVerificationCode(
        { code: issued.code, userId: USER.id },
        harness.dependencies,
      ),
      { status: "verified", userId: USER.id },
    );

    // Aynı kod ikinci kez çalışmaz.
    assert.deepEqual(
      await submitEmailVerificationCode(
        { code: issued.code, userId: USER.id },
        harness.dependencies,
      ),
      { status: "expired" },
    );
  });

  it("counts wrong codes and cancels the code on the fifth", async () => {
    const harness = createHarness();
    await requestEmailVerificationCode(USER, harness.dependencies);

    for (let attempt = 1; attempt < EMAIL_CODE_MAX_ATTEMPTS; attempt += 1) {
      assert.deepEqual(
        await submitEmailVerificationCode(
          { code: "000000", userId: USER.id },
          harness.dependencies,
        ),
        { attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - attempt, status: "invalid" },
      );
    }

    assert.deepEqual(
      await submitEmailVerificationCode({ code: "000000", userId: USER.id }, harness.dependencies),
      { status: "expired" },
    );
  });

  it("expires after ten minutes", async () => {
    const harness = createHarness();
    const issued = await requestEmailVerificationCode(USER, harness.dependencies);
    assert.equal(issued.status, "sent");
    if (issued.status !== "sent") {
      return;
    }

    harness.advance(EMAIL_CODE_TTL_MS + 1);

    assert.deepEqual(
      await submitEmailVerificationCode(
        { code: issued.code, userId: USER.id },
        harness.dependencies,
      ),
      { status: "expired" },
    );
  });

  it("holds a resend for sixty seconds", async () => {
    const harness = createHarness();
    await requestEmailVerificationCode(USER, harness.dependencies);

    const early = await requestEmailVerificationCode(USER, harness.dependencies);
    assert.equal(early.status, "cooldown");
    if (early.status === "cooldown") {
      assert.equal(early.retryAfterMs, EMAIL_CODE_RESEND_COOLDOWN_MS);
    }

    harness.advance(EMAIL_CODE_RESEND_COOLDOWN_MS);

    assert.equal((await requestEmailVerificationCode(USER, harness.dependencies)).status, "sent");
  });

  it("rate limits the fourth request for two minutes", async () => {
    const harness = createHarness();

    for (let request = 0; request < EMAIL_CODE_RATE_MAX_REQUESTS; request += 1) {
      assert.equal(
        (await requestEmailVerificationCode(USER, harness.dependencies)).status,
        "sent",
        `istek ${request + 1}`,
      );
      harness.advance(EMAIL_CODE_RESEND_COOLDOWN_MS);
    }

    const limited = await requestEmailVerificationCode(USER, harness.dependencies);

    assert.equal(limited.status, "rateLimited");
    if (limited.status === "rateLimited") {
      // Ceza son istekten itibaren iki dakika; 60 saniye zaten geçti.
      assert.equal(
        limited.retryAfterMs,
        EMAIL_CODE_RATE_PENALTY_MS - EMAIL_CODE_RESEND_COOLDOWN_MS,
      );
    }

    harness.advance(EMAIL_CODE_RATE_PENALTY_MS);

    assert.equal((await requestEmailVerificationCode(USER, harness.dependencies)).status, "sent");
  });

  it("cancels the previous code when a new one is issued", async () => {
    const harness = createHarness();
    const first = await requestEmailVerificationCode(USER, harness.dependencies);
    harness.advance(EMAIL_CODE_RESEND_COOLDOWN_MS);
    const second = await requestEmailVerificationCode(USER, harness.dependencies);

    assert.equal(first.status, "sent");
    assert.equal(second.status, "sent");
    if (first.status !== "sent" || second.status !== "sent") {
      return;
    }

    assert.deepEqual(
      await submitEmailVerificationCode(
        { code: first.code, userId: USER.id },
        harness.dependencies,
      ),
      { attemptsLeft: 4, status: "invalid" },
    );
    assert.deepEqual(
      await submitEmailVerificationCode(
        { code: second.code, userId: USER.id },
        harness.dependencies,
      ),
      { status: "verified", userId: USER.id },
    );
  });

  it("reports expired when no code was ever issued", async () => {
    const harness = createHarness();

    assert.deepEqual(
      await submitEmailVerificationCode({ code: "290418", userId: USER.id }, harness.dependencies),
      { status: "expired" },
    );
  });
});

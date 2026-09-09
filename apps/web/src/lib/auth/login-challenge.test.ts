import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOGIN_CHALLENGE_MAX_CODE_ATTEMPTS,
  LOGIN_CHALLENGE_TTL_MS,
  LOGIN_TICKET_TTL_MS,
  createLoginChallengeStore,
  createMemoryChallengeStore,
  createRequestFingerprint,
} from "@/lib/auth/login-challenge";

/**
 * K2 güvenlik sözleşmesi.
 *
 * Bu modül parolayı ikinci kez sormadan oturum açmanın önünü açıyor; bu yüzden testlerin çoğu
 * **negatif**: challenge tahmin edilemez, tek kullanımlıktır, süresi vardır, başka tarayıcıda
 * çalışmaz ve bilet başka hesabın oturumunu açamaz.
 */

const ADA = {
  clientIp: "203.0.113.7",
  email: "ada@example.com",
  redirectTo: "/channels",
  rememberMe: true,
  userAgent: "Mozilla/5.0 (Whispr Test)",
  userId: "user_ada",
};

const ADA_FINGERPRINT = createRequestFingerprint(ADA);

function createHarness(startMs = 1_700_000_000_000) {
  let now = startMs;
  let counter = 0;
  const store = createMemoryChallengeStore(() => now);
  const challenges = createLoginChallengeStore({
    getRedisRate: () => {
      throw new Error("Redis kullanılmamalı — test bellek deposu veriyor.");
    },
    isProduction: false,
    logError: () => {},
    nowMs: () => now,
    randomToken: () => {
      counter += 1;
      return `token-${counter}`.padEnd(32, "x");
    },
    store,
  });

  return {
    advance(ms: number) {
      now += ms;
    },
    challenges,
  };
}

describe("login challenge", () => {
  it("issues an opaque id that carries no account information", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);

    assert.equal(challengeId.includes(ADA.userId), false);
    assert.equal(challengeId.includes(ADA.email), false);
  });

  it("returns the login intent on consume", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);
    const record = await challenges.consume(challengeId, ADA_FINGERPRINT);

    assert.equal(record?.userId, ADA.userId);
    assert.equal(record?.email, ADA.email);
    assert.equal(record?.rememberMe, true);
    assert.equal(record?.redirectTo, "/channels");
  });

  it("never lets the same challenge be consumed twice", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);

    assert.ok(await challenges.consume(challengeId, ADA_FINGERPRINT));
    assert.equal(await challenges.consume(challengeId, ADA_FINGERPRINT), null);
  });

  it("expires after five minutes", async () => {
    const { advance, challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);

    advance(LOGIN_CHALLENGE_TTL_MS + 1);

    assert.equal(await challenges.consume(challengeId, ADA_FINGERPRINT), null);
  });

  it("refuses a challenge presented from another browser", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);
    const attacker = createRequestFingerprint({
      clientIp: "198.51.100.9",
      userAgent: "curl/8.0",
    });

    assert.equal(await challenges.consume(challengeId, attacker), null);
  });

  it("destroys the challenge after a fingerprint mismatch on read", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);
    const attacker = createRequestFingerprint({ clientIp: "198.51.100.9", userAgent: "curl/8.0" });

    assert.equal(await challenges.peek(challengeId, attacker), null);
    // Gerçek tarayıcı da artık kullanamaz: çalınmış bir challenge yeniden kullanılmaz.
    assert.equal(await challenges.peek(challengeId, ADA_FINGERPRINT), null);
  });

  it("counts wrong codes and drops the challenge on the third", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);

    assert.deepEqual(await challenges.registerCodeFailure(challengeId, ADA_FINGERPRINT), {
      attemptsLeft: LOGIN_CHALLENGE_MAX_CODE_ATTEMPTS - 1,
      status: "retry",
    });
    assert.deepEqual(await challenges.registerCodeFailure(challengeId, ADA_FINGERPRINT), {
      attemptsLeft: LOGIN_CHALLENGE_MAX_CODE_ATTEMPTS - 2,
      status: "retry",
    });
    assert.deepEqual(await challenges.registerCodeFailure(challengeId, ADA_FINGERPRINT), {
      status: "exhausted",
    });
    assert.equal(await challenges.consume(challengeId, ADA_FINGERPRINT), null);
  });

  it("does not extend the challenge lifetime on a wrong code", async () => {
    const { advance, challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);

    advance(LOGIN_CHALLENGE_TTL_MS - 1_000);
    await challenges.registerCodeFailure(challengeId, ADA_FINGERPRINT);
    advance(2_000);

    assert.equal(await challenges.consume(challengeId, ADA_FINGERPRINT), null);
  });

  it("reports an unknown challenge as expired", async () => {
    const { challenges } = createHarness();

    assert.deepEqual(await challenges.registerCodeFailure("nope", ADA_FINGERPRINT), {
      status: "expired",
    });
  });

  it("mints a one-shot ticket bound to the account", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);
    const record = await challenges.consume(challengeId, ADA_FINGERPRINT);
    assert.ok(record);

    const ticket = await challenges.issueTicket(record);

    assert.ok(await challenges.consumeTicket(ticket, ADA.email));
    assert.equal(await challenges.consumeTicket(ticket, ADA.email), null);
  });

  it("refuses a ticket presented for another account", async () => {
    const { challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);
    const record = await challenges.consume(challengeId, ADA_FINGERPRINT);
    assert.ok(record);

    const ticket = await challenges.issueTicket(record);

    assert.equal(await challenges.consumeTicket(ticket, "grace@example.com"), null);
  });

  it("expires the ticket after thirty seconds", async () => {
    const { advance, challenges } = createHarness();
    const challengeId = await challenges.issue(ADA);
    const record = await challenges.consume(challengeId, ADA_FINGERPRINT);
    assert.ok(record);

    const ticket = await challenges.issueTicket(record);
    advance(LOGIN_TICKET_TTL_MS + 1);

    assert.equal(await challenges.consumeTicket(ticket, ADA.email), null);
  });

  it("refuses an empty ticket", async () => {
    const { challenges } = createHarness();

    assert.equal(await challenges.consumeTicket("", ADA.email), null);
  });

  it("fails closed in production when the store is unavailable", async () => {
    const challenges = createLoginChallengeStore({
      getRedisRate: () => {
        throw new Error("redis down");
      },
      isProduction: true,
      logError: () => {},
      nowMs: () => 1_700_000_000_000,
      randomToken: () => "token".padEnd(32, "x"),
    });

    await assert.rejects(() => challenges.issue(ADA), /Login challenge store is unavailable/);
  });

  it("derives a stable fingerprint from address and client", () => {
    const first = createRequestFingerprint({ clientIp: "203.0.113.7", userAgent: "UA" });
    const second = createRequestFingerprint({ clientIp: "203.0.113.7", userAgent: "UA" });
    const third = createRequestFingerprint({ clientIp: "203.0.113.8", userAgent: "UA" });

    assert.equal(first, second);
    assert.notEqual(first, third);
    assert.equal(first.includes("203.0.113.7"), false);
  });
});

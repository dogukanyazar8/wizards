import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { checkRateLimit } from "@/lib/rate-limit";
import type { getRedisRate } from "@/lib/redis";
import {
  checkLoginRequestRateLimit,
  checkPasswordResetConsumeRateLimit,
  checkPasswordResetRequestRateLimit,
  checkRegistrationRequestRateLimit,
  checkVerificationResendRequestRateLimit,
  checkVerificationSendRequestRateLimit,
  type AuthRequestRateLimitDependencies,
} from "./request-rate-limits";

type RateCall = {
  key: string;
  limit: number;
  windowSeconds: number;
};

function createDependencies(calls: RateCall[]): AuthRequestRateLimitDependencies {
  return {
    checkRateLimit: (async (_redis, key, limit, windowSeconds) => {
      calls.push({ key, limit, windowSeconds });
      return true;
    }) as typeof checkRateLimit,
    getRedisRate: (() => ({}) as ReturnType<typeof getRedisRate>) as typeof getRedisRate,
    logError: () => undefined,
  };
}

function findCall(calls: RateCall[], layer: "network" | "subject") {
  return calls.find((call) => call.key.includes(`:${layer}:`));
}

describe("web auth request rate limits", () => {
  process.env.TRUSTED_PROXY_HOPS = "1";

  it("shares login network bucket but separates accounts on the same IP", async () => {
    const alice: RateCall[] = [];
    const bob: RateCall[] = [];
    const headers = new Headers({ "x-forwarded-for": "198.51.100.7" });

    assert.equal(
      await checkLoginRequestRateLimit(
        { email: "alice@example.com", headers },
        createDependencies(alice),
      ),
      true,
    );
    assert.equal(
      await checkLoginRequestRateLimit(
        { email: "bob@example.com", headers },
        createDependencies(bob),
      ),
      true,
    );

    assert.equal(findCall(alice, "network")?.key, findCall(bob, "network")?.key);
    assert.notEqual(findCall(alice, "subject")?.key, findCall(bob, "subject")?.key);
  });

  it("separates login network buckets but shares account bucket across IPs", async () => {
    const first: RateCall[] = [];
    const second: RateCall[] = [];

    await checkLoginRequestRateLimit(
      {
        email: "alice@example.com",
        headers: new Headers({ "x-forwarded-for": "198.51.100.7" }),
      },
      createDependencies(first),
    );
    await checkLoginRequestRateLimit(
      {
        email: "alice@example.com",
        headers: new Headers({ "x-forwarded-for": "203.0.113.7" }),
      },
      createDependencies(second),
    );

    assert.notEqual(findCall(first, "network")?.key, findCall(second, "network")?.key);
    assert.equal(findCall(first, "subject")?.key, findCall(second, "subject")?.key);
    assert.deepEqual(
      first.map(({ limit, windowSeconds }) => ({ limit, windowSeconds })),
      [
        { limit: 30, windowSeconds: 15 * 60 },
        { limit: 5, windowSeconds: 15 * 60 },
      ],
    );
  });

  it("applies independent registration network and email limits", async () => {
    const calls: RateCall[] = [];

    await checkRegistrationRequestRateLimit(
      {
        email: "alice@example.com",
        headers: new Headers({ "x-forwarded-for": "198.51.100.7" }),
      },
      createDependencies(calls),
    );

    assert.deepEqual(
      calls.map(({ limit, windowSeconds }) => ({ limit, windowSeconds })),
      [
        { limit: 10, windowSeconds: 60 * 60 },
        { limit: 5, windowSeconds: 60 * 60 },
      ],
    );
  });

  it("limits reset consumption by network and token across IPs", async () => {
    const first: RateCall[] = [];
    const second: RateCall[] = [];

    await checkPasswordResetConsumeRateLimit(
      {
        headers: new Headers({ "x-forwarded-for": "198.51.100.7" }),
        token: "reset-secret",
      },
      createDependencies(first),
    );
    await checkPasswordResetConsumeRateLimit(
      {
        headers: new Headers({ "x-forwarded-for": "203.0.113.7" }),
        token: "reset-secret",
      },
      createDependencies(second),
    );

    assert.notEqual(findCall(first, "network")?.key, findCall(second, "network")?.key);
    assert.equal(findCall(first, "subject")?.key, findCall(second, "subject")?.key);
    assert.deepEqual(
      first.map(({ limit, windowSeconds }) => ({ limit, windowSeconds })),
      [
        { limit: 10, windowSeconds: 60 * 60 },
        { limit: 5, windowSeconds: 60 * 60 },
      ],
    );
  });

  it("uses one untrusted bucket and keeps raw identities out of keys", async () => {
    const missing: RateCall[] = [];
    const invalid: RateCall[] = [];

    await checkLoginRequestRateLimit(
      {
        email: "alice@example.com",
        headers: new Headers(),
      },
      createDependencies(missing),
    );
    await checkLoginRequestRateLimit(
      {
        email: "alice@example.com",
        headers: new Headers({ "x-forwarded-for": "invalid" }),
      },
      createDependencies(invalid),
    );

    assert.deepEqual(missing, invalid);
    assert.match(findCall(missing, "network")?.key ?? "", /:network:untrusted$/);
    assert.doesNotMatch(
      missing.map(({ key }) => key).join("\n"),
      /alice@example\.com|198\.51\.100\.99/,
    );
  });

  it("preserves password-reset cooldown, network, and email limits", async () => {
    const calls: RateCall[] = [];

    assert.equal(
      await checkPasswordResetRequestRateLimit(
        {
          email: "alice@example.com",
          headers: new Headers({ "x-forwarded-for": "198.51.100.7" }),
        },
        createDependencies(calls),
      ),
      true,
    );

    assert.deepEqual(
      calls.map(({ limit, windowSeconds }) => ({ limit, windowSeconds })),
      [
        { limit: 1, windowSeconds: 60 },
        { limit: 10, windowSeconds: 60 * 60 },
        { limit: 5, windowSeconds: 60 * 60 },
      ],
    );
  });

  it("preserves verification resend cooldown, network, and email limits", async () => {
    const calls: RateCall[] = [];

    assert.equal(
      await checkVerificationResendRequestRateLimit(
        {
          email: "alice@example.com",
          headers: new Headers({ "x-forwarded-for": "198.51.100.7" }),
        },
        createDependencies(calls),
      ),
      true,
    );

    assert.deepEqual(
      calls.map(({ limit, windowSeconds }) => ({ limit, windowSeconds })),
      [
        { limit: 1, windowSeconds: 60 },
        { limit: 5, windowSeconds: 60 * 60 },
        { limit: 5, windowSeconds: 60 * 60 },
      ],
    );
  });

  it("preserves verification send network and user limits", async () => {
    const calls: RateCall[] = [];

    assert.equal(
      await checkVerificationSendRequestRateLimit(
        {
          headers: new Headers({ "x-forwarded-for": "198.51.100.7" }),
          userId: "user-1",
        },
        createDependencies(calls),
      ),
      true,
    );

    assert.deepEqual(
      calls.map(({ limit, windowSeconds }) => ({ limit, windowSeconds })),
      [
        { limit: 20, windowSeconds: 60 * 60 },
        { limit: 5, windowSeconds: 60 * 60 },
      ],
    );
  });
});

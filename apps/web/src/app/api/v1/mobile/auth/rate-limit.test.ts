import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMobileAuthCredentialSubject, getMobileAuthRateLimitKeys } from "./rate-limit";

function collectKeys(request: Request, subject: { namespace: string; value: string }) {
  return getMobileAuthRateLimitKeys(request, "mobile:auth-login", subject).sort();
}

function networkKey(keys: string[]) {
  return keys.find((key) => key.includes(":network:")) ?? "";
}

function subjectKey(keys: string[]) {
  return keys.find((key) => key.includes(":subject:")) ?? "";
}

describe("mobile auth rate limit", () => {
  it("creates deterministic opaque credential subjects", () => {
    const first = createMobileAuthCredentialSubject("refresh-token", "secret-token-a");
    const same = createMobileAuthCredentialSubject("refresh-token", "secret-token-a");
    const other = createMobileAuthCredentialSubject("refresh-token", "secret-token-b");

    assert.deepEqual(first, same);
    assert.notDeepEqual(first, other);
    assert.equal(first.namespace, "refresh-token");
    assert.match(first.value, /^[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(first.value, /secret-token-a/);
  });

  it("ignores spoofed forwarded headers and User-Agent", () => {
    const first = collectKeys(
      new Request("http://localhost", {
        headers: {
          "cf-connecting-ip": "192.0.2.10",
          "user-agent": "agent-a",
          "x-forwarded-for": "192.0.2.11",
          "x-real-ip": "198.51.100.9",
        },
      }),
      { namespace: "email", value: "alice@example.com" },
    );
    const second = collectKeys(
      new Request("http://localhost", {
        headers: {
          "cf-connecting-ip": "203.0.113.10",
          "user-agent": "agent-b",
          "x-forwarded-for": "203.0.113.11",
          "x-real-ip": "198.51.100.9",
        },
      }),
      { namespace: "email", value: "alice@example.com" },
    );

    assert.deepEqual(first, second);
  });

  it("shares the network bucket but separates accounts on the same IP", () => {
    const headers = { "x-real-ip": "198.51.100.9" };
    const alice = collectKeys(new Request("http://localhost", { headers }), {
      namespace: "email",
      value: "alice@example.com",
    });
    const bob = collectKeys(new Request("http://localhost", { headers }), {
      namespace: "email",
      value: "bob@example.com",
    });

    assert.equal(networkKey(alice), networkKey(bob));
    assert.notEqual(subjectKey(alice), subjectKey(bob));
  });

  it("separates network buckets but shares the account bucket across IPs", () => {
    const alice = collectKeys(
      new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.9" } }),
      { namespace: "email", value: "alice@example.com" },
    );
    const otherIp = collectKeys(
      new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.9" } }),
      { namespace: "email", value: "alice@example.com" },
    );

    assert.notEqual(networkKey(alice), networkKey(otherIp));
    assert.equal(subjectKey(alice), subjectKey(otherIp));
  });

  it("uses deterministic subject fallback for invalid or missing trusted IP", () => {
    const invalid = collectKeys(
      new Request("http://localhost", { headers: { "x-real-ip": "invalid" } }),
      { namespace: "email", value: "alice@example.com" },
    );
    const missing = collectKeys(
      new Request("http://localhost", {
        headers: { "x-forwarded-for": "198.51.100.99" },
      }),
      { namespace: "email", value: "alice@example.com" },
    );

    assert.equal(networkKey(invalid), networkKey(missing));
    assert.match(networkKey(invalid), /:network:fallback:/);
  });

  it("never stores raw security identity in Redis keys", () => {
    const keys = collectKeys(
      new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.9" } }),
      { namespace: "email", value: "alice@example.com" },
    );
    const serialized = keys.join("\n");

    assert.doesNotMatch(serialized, /198\.51\.100\.9|alice@example\.com/);
  });
});

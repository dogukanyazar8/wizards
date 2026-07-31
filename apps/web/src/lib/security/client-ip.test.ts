import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClientRateLimitIdentity,
  createSubjectRateLimitIdentity,
  getTrustedClientIp,
  normalizeIpAddress,
} from "./client-ip";

describe("trusted client IP", () => {
  it("normalizes IPv4, IPv6, and IPv4-mapped IPv6", () => {
    assert.equal(normalizeIpAddress("192.0.2.1"), "192.0.2.1");
    assert.equal(normalizeIpAddress("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
    assert.equal(normalizeIpAddress("::ffff:192.0.2.1"), "192.0.2.1");
    assert.equal(normalizeIpAddress("::ffff:c000:201"), "192.0.2.1");
  });

  it("rejects empty, invalid, multiple, port-bearing, and zone-scoped values", () => {
    for (const value of [
      "",
      " ",
      "not-an-ip",
      "198.51.100.7, 203.0.113.4",
      "198.51.100.7:443",
      "[2001:db8::1]:443",
      "fe80::1%eth0",
    ]) {
      assert.equal(normalizeIpAddress(value), null, value);
    }
  });

  it("trusts only one valid X-Real-IP value", () => {
    const headers = new Headers({
      "cf-connecting-ip": "192.0.2.50",
      "user-agent": "spoof-a",
      "x-forwarded-for": "192.0.2.60, 192.0.2.61",
      "x-real-ip": "2001:0db8:0:0:0:0:0:1",
    });

    assert.equal(getTrustedClientIp(headers), "2001:db8::1");
    assert.equal(
      getTrustedClientIp(
        new Headers({
          "cf-connecting-ip": "192.0.2.50",
          "x-forwarded-for": "192.0.2.60",
        }),
      ),
      null,
    );
  });

  it("ignores spoofable headers and User-Agent in security identity", () => {
    const first = createClientRateLimitIdentity({
      fallbackNamespace: "email",
      fallbackValue: "alice@example.com",
      headers: new Headers({
        "cf-connecting-ip": "192.0.2.10",
        "user-agent": "agent-a",
        "x-forwarded-for": "192.0.2.11",
        "x-real-ip": "198.51.100.7",
      }),
    });
    const second = createClientRateLimitIdentity({
      fallbackNamespace: "email",
      fallbackValue: "alice@example.com",
      headers: new Headers({
        "cf-connecting-ip": "203.0.113.10",
        "user-agent": "agent-b",
        "x-forwarded-for": "203.0.113.11",
        "x-real-ip": "198.51.100.7",
      }),
    });

    assert.equal(first, second);
    assert.match(first, /^ip:[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(first, /198\.51\.100\.7|alice@example\.com/);
  });

  it("uses a deterministic subject fallback for missing or invalid trusted IP", () => {
    const missing = createClientRateLimitIdentity({
      fallbackNamespace: "email",
      fallbackValue: "alice@example.com",
      headers: new Headers({ "x-forwarded-for": "192.0.2.11" }),
    });
    const invalid = createClientRateLimitIdentity({
      fallbackNamespace: "email",
      fallbackValue: "alice@example.com",
      headers: new Headers({ "x-real-ip": "invalid" }),
    });
    const otherSubject = createClientRateLimitIdentity({
      fallbackNamespace: "email",
      fallbackValue: "bob@example.com",
      headers: new Headers(),
    });

    assert.equal(missing, invalid);
    assert.notEqual(missing, otherSubject);
    assert.match(missing, /^fallback:[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(missing, /alice@example\.com/);
  });

  it("namespaces and hashes secondary identities", () => {
    const email = createSubjectRateLimitIdentity("email", "alice@example.com");
    const user = createSubjectRateLimitIdentity("user", "alice@example.com");

    assert.match(email, /^subject:[A-Za-z0-9_-]{43}$/);
    assert.notEqual(email, user);
    assert.doesNotMatch(email, /alice@example\.com/);
  });
});

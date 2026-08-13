import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createNetworkRateLimitIdentity,
  createSubjectRateLimitIdentity,
  normalizeIpAddress,
  resolveTrustedProxyClientIp,
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

  it("resolves the client from the configured fixed-hop X-Forwarded-For chain", () => {
    assert.equal(
      resolveTrustedProxyClientIp(new Headers({ "x-forwarded-for": "192.0.2.60, 192.0.2.61" }), {
        TRUSTED_PROXY_HOPS: "1",
      }),
      "192.0.2.61",
    );
    assert.equal(
      resolveTrustedProxyClientIp(new Headers({ "x-forwarded-for": "192.0.2.60, 192.0.2.61" }), {
        TRUSTED_PROXY_HOPS: "2",
      }),
      "192.0.2.60",
    );
  });

  it("uses one untrusted bucket for missing and malformed proxy data", () => {
    const missing = createNetworkRateLimitIdentity({
      env: { TRUSTED_PROXY_HOPS: "1" },
      headers: new Headers(),
    });
    const malformed = createNetworkRateLimitIdentity({
      env: { TRUSTED_PROXY_HOPS: "1" },
      headers: new Headers({ "x-forwarded-for": "192.0.2.11, invalid" }),
    });
    const noConfig = createNetworkRateLimitIdentity({
      headers: new Headers({
        "x-forwarded-for": "198.51.100.7",
      }),
    });

    assert.equal(missing, "untrusted");
    assert.equal(malformed, missing);
    assert.equal(noConfig, missing);
    assert.doesNotMatch(missing, /alice|bob|email/u);
  });

  it("hashes a valid fixed-hop client without trusting attacker-prepended values", () => {
    const first = createNetworkRateLimitIdentity({
      env: { TRUSTED_PROXY_HOPS: "1" },
      headers: new Headers({
        "x-forwarded-for": "192.0.2.11, 198.51.100.7",
      }),
    });
    const second = createNetworkRateLimitIdentity({
      env: { TRUSTED_PROXY_HOPS: "1" },
      headers: new Headers({ "x-forwarded-for": "203.0.113.11, 198.51.100.7" }),
    });

    assert.equal(first, second);
    assert.match(first, /^ip:[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(first, /198\.51\.100\.7|192\.0\.2\.11|203\.0\.113\.11/u);
  });

  it("namespaces and hashes secondary identities", () => {
    const email = createSubjectRateLimitIdentity("email", "alice@example.com");
    const user = createSubjectRateLimitIdentity("user", "alice@example.com");

    assert.match(email, /^subject:[A-Za-z0-9_-]{43}$/);
    assert.notEqual(email, user);
    assert.doesNotMatch(email, /alice@example\.com/);
  });
});

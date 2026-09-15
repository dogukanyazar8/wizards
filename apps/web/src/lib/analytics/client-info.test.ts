import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAnalyticsClientInfo, hashAnalyticsValue } from "@/lib/analytics/client-info";

process.env.TRUSTED_PROXY_HOPS = "1";

describe("analytics client info", () => {
  it("distinguishes Android tablets, phones and ChromeOS while preserving explicit web clients", () => {
    for (const [userAgent, deviceType, os] of [
      [
        "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) Chrome/140.0 Safari/537.36",
        "TABLET",
        "Android",
      ],
      ["Mozilla/5.0 (Linux; Android 14; SM-X700) Chrome/140.0 Safari/537.36", "TABLET", "Android"],
      [
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140.0 Mobile Safari/537.36",
        "MOBILE",
        "Android",
      ],
      [
        "Mozilla/5.0 (X11; CrOS x86_64 16093.0.0) Chrome/140.0 Safari/537.36",
        "DESKTOP",
        "ChromeOS",
      ],
      ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1", "TABLET", "iOS"],
    ] as const) {
      const info = getAnalyticsClientInfo({ "user-agent": userAgent, "x-whispr-client": "web" });
      assert.equal(info.deviceType, deviceType);
      assert.equal(info.os, os);
      assert.equal(info.clientType, "WEB");
    }
  });

  it("recognizes mobile Edge and Firefox before their compatible Chrome/Safari tokens", () => {
    for (const [userAgent, browser] of [
      ["Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36 EdgA/140.0", "Edge"],
      [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/605.1.15 EdgiOS/140.0",
        "Edge",
      ],
      [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/140.0 Mobile/15E148 Safari/605.1.15",
        "Firefox",
      ],
    ] as const) {
      assert.equal(getAnalyticsClientInfo({ "user-agent": userAgent }).browser, browser);
    }
    assert.equal(getAnalyticsClientInfo({}).deviceType, "UNKNOWN");
  });

  it("detects mobile browsers without storing raw IP or user-agent", () => {
    process.env.ANALYTICS_HASH_SECRET = "analytics-test";

    const headers = new Headers({
      "cf-ipcountry": "tr",
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      "x-forwarded-for": "203.0.113.10",
    });

    const info = getAnalyticsClientInfo(headers);

    assert.equal(info.clientType, "MOBILE");
    assert.equal(info.deviceType, "MOBILE");
    assert.equal(info.os, "iOS");
    assert.equal(info.browser, "Safari");
    assert.equal(info.countryCode, "TR");
    assert.equal(info.ipHash, hashAnalyticsValue("203.0.113.10"));
    assert.notEqual(info.ipHash, "203.0.113.10");
    assert.ok(info.userAgentHash);
  });

  it("hashes only the fixed-hop X-Forwarded-For client", () => {
    process.env.ANALYTICS_HASH_SECRET = "analytics-test";
    const info = getAnalyticsClientInfo({
      "cf-connecting-ip": "192.0.2.10",
      "x-forwarded-for": "192.0.2.11, 2001:0db8:0:0:0:0:0:1",
    });

    assert.equal(info.ipHash, hashAnalyticsValue("2001:db8::1"));
    assert.notEqual(info.ipHash, hashAnalyticsValue("192.0.2.10"));
    assert.notEqual(info.ipHash, hashAnalyticsValue("192.0.2.11"));
  });

  it("honors explicit desktop client headers", () => {
    const info = getAnalyticsClientInfo({
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
      "x-whispr-client": "desktop",
    });

    assert.equal(info.clientType, "DESKTOP");
    assert.equal(info.deviceType, "DESKTOP");
    assert.equal(info.os, "Windows");
    assert.equal(info.browser, "Whispr Desktop");
  });
});

it("native user agent marks every request without replacing engine compatibility tokens", () => {
  const info = getAnalyticsClientInfo({
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Edg/140.0 WhisprDesktop/0.8.15",
  });
  assert.equal(info.clientType, "DESKTOP");
  assert.equal(info.browser, "Whispr Desktop");
  assert.equal(info.appVersion, "0.8.15");
  assert.equal(info.os, "Windows");
  assert.equal(info.attributionVerified, false, "UA metadata is not an authorization signal");
});

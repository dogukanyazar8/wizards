import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAnalyticsClientInfo,
  hashAnalyticsValue,
} from "@/lib/analytics/client-info";

describe("analytics client info", () => {
  it("detects mobile browsers without storing raw IP or user-agent", () => {
    process.env.ANALYTICS_HASH_SECRET = "analytics-test";

    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "cf-ipcountry": "tr",
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
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

  it("honors explicit desktop client headers", () => {
    const info = getAnalyticsClientInfo({
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
      "x-whispr-client": "desktop",
    });

    assert.equal(info.clientType, "DESKTOP");
    assert.equal(info.deviceType, "DESKTOP");
    assert.equal(info.os, "Windows");
    assert.equal(info.browser, "Chrome");
  });
});

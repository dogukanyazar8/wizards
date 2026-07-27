import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readRequestAttribution,
  UNKNOWN_ATTRIBUTION,
  toClientAttribution,
} from "@/lib/analytics/client-attribution";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";

describe("client attribution", () => {
  it("carries the declared client and its version", () => {
    const attribution = toClientAttribution(
      getAnalyticsClientInfo({
        "user-agent": "okhttp/4.12.0",
        "x-whispr-client": "mobile",
        "x-whispr-client-version": "0.8.15",
      }),
    );

    assert.deepEqual(attribution, { appVersion: "0.8.15", clientType: "MOBILE" });
  });

  it("refuses a version that is not a plain version string", () => {
    for (const value of ["<img src=x>", "a".repeat(33), "0.8.15; DROP", " ", "sürüm"]) {
      const info = getAnalyticsClientInfo({
        "user-agent": "okhttp/4.12.0",
        "x-whispr-client": "mobile",
        "x-whispr-client-version": value,
      });

      assert.equal(info.appVersion, null, `accepted ${JSON.stringify(value)}`);
    }
  });

  it("accepts the shapes a real build number takes", () => {
    for (const value of ["0.8.15", "1.0.0-rc.2", "2026.07.27+build.4", "a".repeat(32)]) {
      const info = getAnalyticsClientInfo({
        "x-whispr-client": "mobile",
        "x-whispr-client-version": value,
      });

      assert.equal(info.appVersion, value);
    }
  });

  it("ignores the user agent entirely once the client declares itself", () => {
    const info = getAnalyticsClientInfo({
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      "x-whispr-client": "web",
    });

    assert.equal(info.clientType, "WEB");
    assert.equal(toClientAttribution(info).clientType, "WEB");
  });

  it("keeps the user-agent fallback for clients that never send the header", () => {
    const info = getAnalyticsClientInfo({
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    });

    assert.equal(info.clientType, "MOBILE");
    assert.equal(info.appVersion, null);
  });

  it("keeps the user-agent fallback when attributing a REST metric", () => {
    assert.deepEqual(
      readRequestAttribution({
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
      }),
      { appVersion: null, clientType: "WEB" },
    );
  });

  it("names the unknown case instead of leaving it to a default", () => {
    assert.deepEqual(UNKNOWN_ATTRIBUTION, { appVersion: null, clientType: "UNKNOWN" });
    assert.deepEqual(toClientAttribution(getAnalyticsClientInfo(null)), UNKNOWN_ATTRIBUTION);
  });
});

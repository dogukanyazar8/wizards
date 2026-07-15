import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMobileAuthRequestIp } from "./rate-limit";

describe("getMobileAuthRequestIp", () => {
  it("uses the first forwarded client address before the real IP header", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 198.51.100.3",
        "x-real-ip": "198.51.100.9",
      },
    });

    assert.equal(getMobileAuthRequestIp(request), "203.0.113.10");
  });

  it("falls back to the real IP header and then unknown", () => {
    assert.equal(
      getMobileAuthRequestIp(
        new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.9" } }),
      ),
      "198.51.100.9",
    );
    assert.equal(getMobileAuthRequestIp(new Request("http://localhost")), "unknown");
  });
});

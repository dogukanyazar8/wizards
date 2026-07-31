import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServerTimingForRequest } from "./server-timing";
import { REQUEST_ID_HEADER, readRequestId } from "./request-id";

function requestWithId(value: string): Request {
  return new Request("https://whispr.team/api/v1/mobile/bootstrap", {
    headers: { [REQUEST_ID_HEADER]: value },
  });
}

describe("request id", () => {
  it("reads an opaque client token", () => {
    assert.equal(
      readRequestId(requestWithId("6f1a2b3c4d5e6f708192a3b4c5d6e7f8").headers),
      "6f1a2b3c4d5e6f708192a3b4c5d6e7f8",
    );
  });

  it("treats an absent header as no correlation rather than inventing one", () => {
    assert.equal(readRequestId(new Request("https://whispr.team/").headers), null);
  });

  /**
   * The value is echoed into a response header and a log line, so it is
   * validated rather than trusted: a header is caller-controlled input. Fed
   * through a stub because the runtime's own `Headers` rejects some of these
   * before the validator would ever see them, and the validator must not depend
   * on that.
   */
  it("refuses a token that is not opaque, bounded, and printable", () => {
    for (const value of [
      "short",
      "a".repeat(65),
      "has spaces in it here",
      "carriage\r\nreturn-injection",
      "id;with=header-syntax",
      "",
    ]) {
      const headers = { get: () => value } as unknown as Headers;
      assert.equal(readRequestId(headers), null, `accepted ${JSON.stringify(value)}`);
    }
  });
});

describe("server timing correlation", () => {
  it("reflects the caller's id alongside the timing header", () => {
    const timing = createServerTimingForRequest(requestWithId("abcdef0123456789abcdef0123456789"));

    const headers = timing.headers({ "Cache-Control": "no-store" });
    assert.equal(headers["X-Request-Id"], "abcdef0123456789abcdef0123456789");
    assert.equal(headers["Cache-Control"], "no-store");
    assert.match(headers["Server-Timing"] ?? "", /^total;dur=/);
  });

  it("emits no correlation header when the caller sent none", () => {
    const timing = createServerTimingForRequest(new Request("https://whispr.team/"));

    assert.equal(timing.requestId, null);
    assert.equal(Object.hasOwn(timing.headers(), "X-Request-Id"), false);
  });
});

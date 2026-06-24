import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatE2EDiagnosticEntries,
  pushBoundedE2EDiagnosticEntry,
  redactE2EDiagnosticText,
  type E2EDiagnosticEntry,
} from "./diagnostics";

describe("E2E browser diagnostics", () => {
  it("redacts sensitive query values and emails", () => {
    const redacted = redactE2EDiagnosticText(
      "https://example.test/callback?code=oauth-code&state=oauth-state&email=alice@example.com&token=secret-token",
    );

    assert.equal(redacted.includes("oauth-code"), false);
    assert.equal(redacted.includes("oauth-state"), false);
    assert.equal(redacted.includes("alice@example.com"), false);
    assert.equal(redacted.includes("secret-token"), false);
    assert.match(redacted, /code=\[redacted\]/);
    assert.match(redacted, /state=\[redacted\]/);
    assert.match(redacted, /email=\[redacted\]/);
    assert.match(redacted, /token=\[redacted\]/);
  });

  it("redacts UUIDs and long opaque IDs from page snapshots", () => {
    const redacted = redactE2EDiagnosticText(
      [
        "url=/channels/6a481cbd-3706-4e14-978d-336a084ebed5/01jyy6rkkw2j5gdr2s2wvxfkry",
        "testid=server-rail-server-6a481cbd-3706-4e14-978d-336a084ebed5",
        "message-id=cabcdefghijklmnopqrstuvwx",
      ].join(" "),
    );

    assert.equal(redacted.includes("6a481cbd-3706-4e14-978d-336a084ebed5"), false);
    assert.equal(redacted.includes("01jyy6rkkw2j5gdr2s2wvxfkry"), false);
    assert.equal(redacted.includes("cabcdefghijklmnopqrstuvwx"), false);
    assert.match(redacted, /\[redacted-id\]/);
  });

  it("keeps only the newest bounded diagnostic entries", () => {
    const entries: E2EDiagnosticEntry[] = [];

    pushBoundedE2EDiagnosticEntry(entries, { message: "first", type: "console" }, 2);
    pushBoundedE2EDiagnosticEntry(entries, { message: "second", type: "console" }, 2);
    pushBoundedE2EDiagnosticEntry(entries, { message: "third", type: "pageerror" }, 2);

    assert.deepEqual(
      entries.map((entry) => entry.message),
      ["second", "third"],
    );
  });

  it("formats empty diagnostics without leaking unrelated context", () => {
    assert.equal(
      formatE2EDiagnosticEntries([]),
      "No browser warnings, errors, page errors, failed requests, or failing network responses were captured.",
    );
  });

  it("formats page, viewport, performance, network, and DOM diagnostics for Playwright attachments", () => {
    const formatted = formatE2EDiagnosticEntries([
      {
        message: "label=alice | title=Whispr | readyState=complete | viewport=1440x900",
        type: "page",
        url: "https://example.test/channels/[redacted-id]",
      },
      {
        message:
          "label=alice | viewport=390x844 | dpr=2 | scrollWidthDelta=0 | visibleDialogs=1",
        type: "viewport",
        url: "https://example.test/channels/[redacted-id]",
      },
      {
        message: "label=alice | loadMs=800 | resourceCount=120",
        type: "performance",
        url: "https://example.test/channels/[redacted-id]",
      },
      {
        failure: "status=500",
        method: "GET",
        type: "network",
        url: "https://example.test/api/v1/messages?token=[redacted]",
      },
      {
        message: "label=alice visibleTestIds=server-rail,message-list,message-input",
        type: "dom",
        url: "https://example.test/channels/[redacted-id]",
      },
    ]);

    assert.match(formatted, /type=page/);
    assert.match(formatted, /type=viewport/);
    assert.match(formatted, /type=performance/);
    assert.match(formatted, /type=network/);
    assert.match(formatted, /failure=status=500/);
    assert.match(formatted, /type=dom/);
    assert.match(formatted, /visibleTestIds=server-rail,message-list,message-input/);
  });
});

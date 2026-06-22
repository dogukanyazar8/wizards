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
      "No browser warnings, errors, page errors, or failed requests were captured.",
    );
  });
});

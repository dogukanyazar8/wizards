import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  WEB_FAULT_LOG_LIMIT,
  classifyWebFault,
  clearWebFaultLog,
  collectWebBugReportLogLines,
  createWebFaultReference,
  formatWebFaultLine,
  readWebFaultLog,
  recordWebFault,
  type WebFault,
} from "./fault-log";
import { clearErrorReporter, registerErrorReporter, reportError } from "./reporter";

/**
 * The buffer only writes in a browser, so these tests install a minimal window
 * for the cases that assert on stored rows.
 */
function withWindow(run: () => void) {
  const globals = globalThis as { window?: unknown };
  const had = "window" in globals;
  const previous = globals.window;
  globals.window = {};

  try {
    run();
  } finally {
    if (had) {
      globals.window = previous;
    } else {
      delete globals.window;
    }
  }
}

function fault(overrides: Partial<WebFault> = {}): WebFault {
  return {
    at: "2026-08-26T09:00:00.000Z",
    kind: "network",
    reference: "WW-N-1A2B3C",
    ...overrides,
  };
}

afterEach(() => {
  clearWebFaultLog();
  clearErrorReporter();
});

describe("web fault log", () => {
  it("classifies the failures a browser actually produces", () => {
    const chunk = new Error("Loading chunk 42 failed");
    chunk.name = "ChunkLoadError";
    const quota = new Error("The quota has been exceeded.");
    quota.name = "QuotaExceededError";

    assert.equal(classifyWebFault(new Error("Failed to fetch")), "network");
    assert.equal(classifyWebFault(chunk), "bundle");
    assert.equal(classifyWebFault(quota), "storage");
    assert.equal(classifyWebFault(new Error("Cannot read properties of undefined")), "render");
    assert.equal(classifyWebFault("not an error"), "render");
  });

  it("builds a reference that names the crash window, not the person", () => {
    const at = Date.parse("2026-08-26T09:00:00.000Z");

    assert.match(createWebFaultReference(new Error("Failed to fetch"), at), /^WW-N-[0-9A-Z]{1,6}$/);
    assert.equal(
      createWebFaultReference(new Error("Failed to fetch"), at),
      createWebFaultReference(new Error("Failed to fetch"), at + 59_000),
    );
    assert.notEqual(
      createWebFaultReference(new Error("Failed to fetch"), at),
      createWebFaultReference(new Error("Failed to fetch"), at + 61_000),
    );
  });

  it("stores no error text at all, only the kind and the reference", () => {
    withWindow(() => {
      recordWebFault(new Error("token=secret-abc for ada@example.com"));

      const [entry] = readWebFaultLog();
      assert.ok(entry);
      assert.deepEqual(Object.keys(entry).sort(), ["at", "kind", "reference"]);
      assert.equal(JSON.stringify(entry).includes("secret-abc"), false);
      assert.equal(JSON.stringify(entry).includes("ada@example.com"), false);
    });
  });

  it("keeps the newest 500 entries and drops the oldest", () => {
    withWindow(() => {
      for (let index = 0; index < WEB_FAULT_LOG_LIMIT + 20; index += 1) {
        recordWebFault(new Error("Failed to fetch"), new Date(1_800_000_000_000 + index * 60_000));
      }

      const entries = readWebFaultLog();
      assert.equal(entries.length, WEB_FAULT_LOG_LIMIT);
      assert.equal(entries[0]?.at, new Date(1_800_000_000_000 + 519 * 60_000).toISOString());
    });
  });

  it("never writes a line on the server, where the buffer would be shared", () => {
    assert.equal(typeof window, "undefined");
    recordWebFault(new Error("Failed to fetch"));
    assert.deepEqual(readWebFaultLog(), []);
  });

  it("records through the shared reporter even when no reporter is registered", () => {
    withWindow(() => {
      reportError("chat", new Error("Failed to fetch"));
      assert.equal(readWebFaultLog().length, 1);

      const seen: string[] = [];
      registerErrorReporter((scope) => seen.push(scope));
      reportError("voice", new Error("Failed to fetch"));

      assert.equal(readWebFaultLog().length, 2);
      assert.deepEqual(seen, ["voice"]);
    });
  });

  it("formats one report line per fault and masks anything suspicious", () => {
    const lines = collectWebBugReportLogLines(10, {
      readFaults: () => [fault(), fault({ reference: "password=hunter2" })],
    });

    assert.equal(lines[0], "2026-08-26T09:00:00.000Z kind=network reference=WW-N-1A2B3C");
    assert.equal(lines[1], "[redacted]");
  });

  it("collects nothing at limit zero and never more than the promised 500", () => {
    const many = Array.from({ length: 620 }, (_, index) => fault({ reference: `WW-N-${index}` }));

    assert.deepEqual(collectWebBugReportLogLines(0, { readFaults: () => many }), []);
    assert.equal(
      collectWebBugReportLogLines(5_000, { readFaults: () => many }).length,
      WEB_FAULT_LOG_LIMIT,
    );
    assert.equal(collectWebBugReportLogLines(3, { readFaults: () => many }).length, 3);
  });

  it("prints a line the support console can read back", () => {
    assert.equal(
      formatWebFaultLine(fault({ kind: "bundle", reference: "WW-B-ZZZ" })),
      "2026-08-26T09:00:00.000Z kind=bundle reference=WW-B-ZZZ",
    );
  });
});

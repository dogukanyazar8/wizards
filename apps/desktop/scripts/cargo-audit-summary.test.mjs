import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createCargoAuditSummary,
  parseCargoAuditSummaryCliArgs,
  writeCargoAuditSummary,
} from "./cargo-audit-summary.mjs";

describe("cargo audit summary", () => {
  it("summarizes vulnerabilities and informational warnings without dependency trees", () => {
    const summary = createCargoAuditSummary(buildCargoAuditPayload(), {
      source: "C:/tmp/cargo-audit.json",
    });

    assert.equal(summary.schemaVersion, 1);
    assert.equal(summary.source, "cargo-audit.json");
    assert.equal(summary.tool, "cargo-audit");
    assert.equal(summary.lockfile.dependencyCount, 558);
    assert.deepEqual(summary.vulnerabilities, {
      found: false,
      count: 0,
      advisories: [],
    });
    assert.equal(summary.warnings.count, 2);
    assert.deepEqual(
      summary.warnings.groups.map((group) => [group.kind, group.count]),
      [
        ["unmaintained", 1],
        ["unsound", 1],
      ],
    );
    assert.equal(summary.policy.releaseBlocker, false);
    assert.doesNotMatch(JSON.stringify(summary), /dependencies|checksum|PRIVATE KEY/);
  });

  it("marks vulnerability findings as release blockers", () => {
    const payload = buildCargoAuditPayload({
      vulnerabilities: {
        found: true,
        count: 1,
        list: [
          {
            package: { name: "danger", version: "1.2.3" },
            advisory: { id: "RUSTSEC-2099-0001", title: "Example vulnerability" },
          },
        ],
      },
    });

    const summary = createCargoAuditSummary(payload);

    assert.equal(summary.vulnerabilities.found, true);
    assert.equal(summary.vulnerabilities.count, 1);
    assert.equal(summary.policy.releaseBlocker, true);
    assert.deepEqual(summary.vulnerabilities.advisories, [
      {
        advisoryId: "RUSTSEC-2099-0001",
        crate: "danger",
        title: "Example vulnerability",
        url: "https://rustsec.org/advisories/RUSTSEC-2099-0001.html",
        version: "1.2.3",
      },
    ]);
  });

  it("writes a redacted summary from cargo-audit JSON", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "whispr-cargo-audit-summary-"));
    const inputPath = path.join(dir, "cargo-audit.json");
    const outputPath = path.join(dir, "summary.json");

    try {
      await writeFile(inputPath, `\uFEFF${JSON.stringify(buildCargoAuditPayload())}\n`, "utf8");

      const { summary } = await writeCargoAuditSummary({ inputPath, outputPath });
      const written = JSON.parse(await readFile(outputPath, "utf8"));

      assert.equal(summary.warnings.count, 2);
      assert.equal(written.warnings.count, 2);
      assert.doesNotMatch(JSON.stringify(written), /glib dependency tree/);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("parses CLI arguments safely", () => {
    assert.deepEqual(
      parseCargoAuditSummaryCliArgs(["--", "--input", "audit.json", "--out", "summary.json"]),
      {
        inputPath: "audit.json",
        outputPath: "summary.json",
      },
    );

    assert.throws(() => parseCargoAuditSummaryCliArgs(["unexpected"]), /Unexpected positional argument/);
    assert.throws(() => parseCargoAuditSummaryCliArgs(["--unknown", "value"]), /Unknown option/);
    assert.throws(() => parseCargoAuditSummaryCliArgs(["--input", "audit.json"]), /Missing required option/);
  });
});

function buildCargoAuditPayload(overrides = {}) {
  return {
    database: {
      "advisory-count": 1138,
      "last-commit": "49f543",
      "last-updated": "2026-06-23T13:22:47+02:00",
    },
    lockfile: {
      "dependency-count": 558,
    },
    vulnerabilities: {
      found: false,
      count: 0,
      list: [],
    },
    warnings: {
      unmaintained: [
        {
          kind: "unmaintained",
          package: {
            name: "gtk",
            version: "0.18.2",
            dependencies: [{ name: "glib", note: "glib dependency tree" }],
            checksum: "not retained",
          },
          advisory: {
            id: "RUSTSEC-2024-0415",
            title: "gtk-rs GTK3 bindings - no longer maintained",
            informational: "unmaintained",
          },
        },
      ],
      unsound: [
        {
          kind: "unsound",
          package: {
            name: "glib",
            version: "0.18.5",
          },
          advisory: {
            id: "RUSTSEC-2024-0429",
            title: "Unsoundness in glib iterator impls",
            informational: "unsound",
          },
        },
      ],
    },
    ...overrides,
  };
}

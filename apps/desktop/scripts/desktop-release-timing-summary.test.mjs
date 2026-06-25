import assert from "node:assert/strict";
import test from "node:test";
import {
  createDesktopReleaseTimingReport,
  parseDesktopReleaseTimingArgs,
} from "./desktop-release-timing-summary.mjs";

test("parses desktop release timing CLI args", () => {
  assert.deepEqual(
    parseDesktopReleaseTimingArgs([
      "--repo",
      "dogukanyazar8/wizards",
      "--run-id",
      "123",
      "--ring",
      "uat",
      "--out",
      "timing.json",
    ]),
    {
      outputPath: "timing.json",
      repo: "dogukanyazar8/wizards",
      ring: "uat",
      runId: "123",
      summaryOutputPath: undefined,
      token: process.env.GITHUB_TOKEN,
    },
  );
});

test("creates timing report with job, important step, slowest step, and budgets", () => {
  const report = createDesktopReleaseTimingReport({
    now: new Date("2026-06-25T10:00:00.000Z"),
    ring: "uat",
    jobs: [
      job("Validate desktop release contract", "2026-06-25T09:00:00Z", "2026-06-25T09:04:00Z", [
        step("Checkout", "2026-06-25T09:00:00Z", "2026-06-25T09:00:20Z"),
        step("Install dependencies", "2026-06-25T09:00:20Z", "2026-06-25T09:02:20Z"),
        step(
          "Validate desktop release dispatch contract",
          "2026-06-25T09:02:20Z",
          "2026-06-25T09:03:00Z",
        ),
      ]),
      job(
        "Build signed Windows desktop artifacts",
        "2026-06-25T09:04:00Z",
        "2026-06-25T09:24:00Z",
        [
          step("Setup Rust", "2026-06-25T09:04:00Z", "2026-06-25T09:04:30Z"),
          step("Cache Rust dependencies", "2026-06-25T09:04:30Z", "2026-06-25T09:05:30Z"),
          step("Resolve sccache directories", "2026-06-25T09:05:30Z", "2026-06-25T09:05:35Z"),
          step("Cache sccache compiler outputs", "2026-06-25T09:05:35Z", "2026-06-25T09:05:55Z"),
          step("Install and configure sccache", "2026-06-25T09:05:55Z", "2026-06-25T09:06:20Z"),
          step("Generate Prisma Client", "2026-06-25T09:06:20Z", "2026-06-25T09:06:50Z"),
          step("Resolve cargo-audit cache directory", "2026-06-25T09:06:50Z", "2026-06-25T09:07:00Z"),
          step("Cache cargo-audit binary", "2026-06-25T09:07:00Z", "2026-06-25T09:07:30Z"),
          step("Add cargo-audit to PATH", "2026-06-25T09:07:30Z", "2026-06-25T09:07:35Z"),
          step("Install cargo-audit", "2026-06-25T09:07:35Z", "2026-06-25T09:10:35Z"),
          step("Verify cargo-audit", "2026-06-25T09:10:35Z", "2026-06-25T09:10:50Z"),
          step("Run cargo audit and summarize", "2026-06-25T09:10:50Z", "2026-06-25T09:11:50Z"),
          step("Build desktop app", "2026-06-25T09:11:50Z", "2026-06-25T09:22:50Z"),
          step(
            "Generate and validate updater manifest evidence",
            "2026-06-25T09:22:50Z",
            "2026-06-25T09:23:50Z",
          ),
          step("Capture sccache stats", "2026-06-25T09:23:50Z", "2026-06-25T09:24:00Z"),
        ],
      ),
      job(
        "Publish desktop release artifacts",
        "2026-06-25T09:24:00Z",
        "2026-06-25T09:27:00Z",
        [
          step("Publish updater artifacts to Cloudflare R2", "2026-06-25T09:24:00Z", "2026-06-25T09:25:00Z"),
          step("Validate remote updater feed", "2026-06-25T09:25:00Z", "2026-06-25T09:26:00Z"),
          step("Publish GitHub Release", "2026-06-25T09:26:00Z", "2026-06-25T09:27:00Z"),
        ],
      ),
      job("Summarize desktop release timing", "2026-06-25T09:27:00Z", null, [
        step("Checkout", "2026-06-25T09:27:00Z", null),
      ]),
    ],
  });

  assert.equal(report.totalMs, 27 * 60 * 1000);
  assert.equal(report.jobRows.length, 3);
  assert.equal(report.topSlowSteps[0].name, "Build desktop app");
  assert.deepEqual(
    report.categoryRows
      .filter((row) => row.category === "sccache setup/cache")
      .map((row) => [row.category, row.durationMs]),
    [["sccache setup/cache", 60 * 1000]],
  );
  assert.deepEqual(
    report.categoryRows
      .filter((row) => row.category.startsWith("cargo-audit"))
      .map((row) => [row.category, row.durationMs]),
    [
      ["cargo-audit install", 3 * 60 * 1000],
      ["cargo-audit cache/verify", 60 * 1000],
      ["cargo-audit run/summarize", 60 * 1000],
    ],
  );
  assert.match(report.markdown, /Desktop release timing/);
  assert.match(report.markdown, /Category totals/);
  assert.match(report.markdown, /Tauri build step/);
  assert.match(report.markdown, /sccache setup\/cache/);
  assert.match(report.markdown, /cargo-audit total/);
  assert.match(report.markdown, /cargo-audit cache\/verify/);
  assert.match(report.markdown, /cargo-audit install/);
  assert.match(report.markdown, /Cache Rust dependencies/);
  assert.match(report.markdown, /cache hit\/miss is not exposed/);
});

test("keeps timing report observational when publish job is skipped", () => {
  const report = createDesktopReleaseTimingReport({
    now: new Date("2026-06-25T10:00:00.000Z"),
    ring: "uat",
    jobs: [
      job("Validate desktop release contract", "2026-06-25T09:00:00Z", "2026-06-25T09:01:00Z", []),
      job("Build signed Windows desktop artifacts", "2026-06-25T09:01:00Z", "2026-06-25T09:11:00Z", [
        step("Build desktop app", "2026-06-25T09:02:00Z", "2026-06-25T09:10:00Z"),
      ]),
    ],
  });

  assert.match(report.markdown, /Publish job/);
  assert.match(report.markdown, /not measured/);
  assert.match(report.markdown, /observational only/i);
});

function job(name, startedAt, completedAt, steps) {
  return {
    completed_at: completedAt,
    conclusion: completedAt ? "success" : null,
    name,
    started_at: startedAt,
    status: completedAt ? "completed" : "in_progress",
    steps,
  };
}

function step(name, startedAt, completedAt) {
  return {
    completed_at: completedAt,
    conclusion: completedAt ? "success" : null,
    name,
    started_at: startedAt,
    status: completedAt ? "completed" : "in_progress",
  };
}

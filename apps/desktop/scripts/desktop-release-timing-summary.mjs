import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BUDGETS = Object.freeze({
  cargoAuditMs: 5 * 60 * 1000,
  publishMs: 5 * 60 * 1000,
  stableTotalMs: 30 * 60 * 1000,
  tauriBuildMs: 15 * 60 * 1000,
  uatTotalMs: 25 * 60 * 1000,
});

const IMPORTANT_STEP_CATEGORIES = Object.freeze([
  "checkout",
  "pnpm setup/install",
  "Rust setup/cache restore",
  "Prisma generate",
  "desktop config generation",
  "release ops/tests",
  "cargo-audit install",
  "cargo-audit run/summarize",
  "cargo-audit install/run",
  "Tauri build",
  "signing",
  "manifest/audit/promotion generation",
  "artifact upload/download",
  "R2/GitHub publish",
  "remote manifest validation",
]);

export function parseDesktopReleaseTimingArgs(argv) {
  const values = new Map();
  const allowed = new Set(["out", "repo", "ring", "run-id", "summary-out", "token"]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const rawArg = arg.slice(2);
    const equalsIndex = rawArg.indexOf("=");
    const key = equalsIndex === -1 ? rawArg : rawArg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : rawArg.slice(equalsIndex + 1);

    if (!allowed.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || String(value).startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    values.set(key, value);
  }

  return {
    outputPath: values.get("out"),
    repo: values.get("repo"),
    ring: values.get("ring") || "uat",
    runId: values.get("run-id"),
    summaryOutputPath: values.get("summary-out"),
    token: values.get("token") || process.env.GITHUB_TOKEN,
  };
}

export async function fetchWorkflowJobs({ repo, runId, token }) {
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) {
    throw new Error("Desktop release timing requires --repo in owner/name form.");
  }

  if (!runId || !/^\d+$/.test(String(runId))) {
    throw new Error("Desktop release timing requires a numeric --run-id.");
  }

  if (!token) {
    throw new Error("Desktop release timing requires GITHUB_TOKEN or --token.");
  }

  const jobs = [];
  let url = `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=100&filter=all`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "whispr-desktop-release-timing",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub jobs API request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const payload = await response.json();
    jobs.push(...(payload.jobs || []));
    url = parseNextLink(response.headers.get("link"));
  }

  return jobs;
}

export function createDesktopReleaseTimingReport({ jobs, ring, now = new Date() }) {
  const relevantJobs = normalizeTimingJobs(jobs);
  const steps = relevantJobs.flatMap((job) =>
    (job.steps || []).map((step) => normalizeTimingStep(job, step)),
  );
  const importantSteps = steps.filter((step) => step.category !== "other");
  const cacheSteps = steps.filter((step) => step.category === "Rust setup/cache restore" || /cache/i.test(step.name));
  const topSlowSteps = [...importantSteps]
    .filter((step) => Number.isFinite(step.durationMs))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);
  const jobRows = relevantJobs.map(normalizeTimingJob);
  const runStartedAt = minDate(relevantJobs.map((job) => parseDate(job.started_at)));
  const runCompletedAt = maxDate(relevantJobs.map((job) => parseDate(job.completed_at)));
  const totalMs =
    runStartedAt && runCompletedAt
      ? Math.max(0, runCompletedAt.getTime() - runStartedAt.getTime())
      : null;
  const timedCategoryRows = buildCategoryRows({
    importantSteps,
    totalMs,
  });

  const budgetRows = buildBudgetRows({
    importantSteps,
    jobRows,
    ring,
    totalMs,
  });

  return {
    budgets: budgetRows,
    cacheSteps,
    categoryRows: timedCategoryRows,
    generatedAt: now.toISOString(),
    importantSteps,
    jobRows,
    markdown: renderTimingMarkdown({
      budgetRows,
      cacheSteps,
      categoryRows: timedCategoryRows,
      generatedAt: now.toISOString(),
      importantSteps,
      jobRows,
      ring,
      topSlowSteps,
      totalMs,
    }),
    ring,
    topSlowSteps,
    totalMs,
  };
}

function normalizeTimingJobs(jobs) {
  return (jobs || [])
    .filter((job) => {
      const name = String(job.name || "");
      return (
        !name.toLowerCase().includes("summarize desktop release timing") &&
        [
          "Validate desktop release contract",
          "Build signed Windows desktop artifacts",
          "Publish desktop release artifacts",
        ].includes(name)
      );
    })
    .sort((left, right) => {
      const leftDate = parseDate(left.started_at)?.getTime() ?? 0;
      const rightDate = parseDate(right.started_at)?.getTime() ?? 0;
      return leftDate - rightDate;
    });
}

function normalizeTimingJob(job) {
  return {
    conclusion: job.conclusion || job.status || "unknown",
    durationMs: durationBetween(job.started_at, job.completed_at),
    name: job.name || "unknown",
    startedAt: job.started_at || null,
  };
}

function normalizeTimingStep(job, step) {
  return {
    category: categorizeStep(step.name || ""),
    conclusion: step.conclusion || step.status || "unknown",
    durationMs: durationBetween(step.started_at, step.completed_at),
    jobName: job.name || "unknown",
    name: step.name || "unknown",
    number: step.number ?? null,
    startedAt: step.started_at || null,
  };
}

function categorizeStep(name) {
  const normalized = name.toLowerCase();

  if (normalized.includes("checkout")) {
    return "checkout";
  }

  if (
    normalized.includes("setup pnpm") ||
    normalized.includes("setup node") ||
    normalized.includes("install dependencies")
  ) {
    return "pnpm setup/install";
  }

  if (normalized.includes("setup rust") || normalized.includes("cache rust")) {
    return "Rust setup/cache restore";
  }

  if (normalized.includes("generate prisma")) {
    return "Prisma generate";
  }

  if (normalized.includes("generate desktop production config")) {
    return "desktop config generation";
  }

  if (
    normalized.includes("release operations") ||
    normalized.includes("release script tests") ||
    normalized.includes("release dispatch contract")
  ) {
    return "release ops/tests";
  }

  if (normalized.includes("install cargo-audit")) {
    return "cargo-audit install";
  }

  if (normalized.includes("run cargo audit")) {
    return "cargo-audit run/summarize";
  }

  if (normalized.includes("audit rust")) {
    return "cargo-audit install/run";
  }

  if (normalized.includes("build desktop app")) {
    return "Tauri build";
  }

  if (normalized.includes("sign stable desktop artifacts")) {
    return "signing";
  }

  if (
    normalized.includes("manifest evidence") ||
    normalized.includes("publish plan") ||
    normalized.includes("audit") ||
    normalized.includes("promotion")
  ) {
    return "manifest/audit/promotion generation";
  }

  if (
    normalized.includes("upload") ||
    normalized.includes("download desktop build artifact") ||
    normalized.includes("locate publish assets")
  ) {
    return "artifact upload/download";
  }

  if (
    normalized.includes("publish updater artifacts") ||
    normalized.includes("publish github release") ||
    normalized.includes("aws cli")
  ) {
    return "R2/GitHub publish";
  }

  if (normalized.includes("validate remote updater feed")) {
    return "remote manifest validation";
  }

  return "other";
}

function buildBudgetRows({ importantSteps, jobRows, ring, totalMs }) {
  const windowsJob = jobRows.find((job) => job.name === "Build signed Windows desktop artifacts");
  const publishJob = jobRows.find((job) => job.name === "Publish desktop release artifacts");
  const tauriBuild = importantSteps.find((step) => step.category === "Tauri build");
  const cargoAuditMs = importantSteps
    .filter((step) => step.category.startsWith("cargo-audit"))
    .reduce((total, step) => total + (Number.isFinite(step.durationMs) ? step.durationMs : 0), 0);
  const hasCargoAuditTiming = importantSteps.some(
    (step) => step.category.startsWith("cargo-audit") && Number.isFinite(step.durationMs),
  );
  const targetTotalMs = ring === "stable" ? DEFAULT_BUDGETS.stableTotalMs : DEFAULT_BUDGETS.uatTotalMs;

  return [
    {
      actualMs: totalMs,
      budgetMs: targetTotalMs,
      label: ring === "stable" ? "Stable total wall time" : "UAT/canary total wall time",
    },
    {
      actualMs: windowsJob?.durationMs ?? null,
      budgetMs: 25 * 60 * 1000,
      label: "Windows build job",
    },
    {
      actualMs: tauriBuild?.durationMs ?? null,
      budgetMs: DEFAULT_BUDGETS.tauriBuildMs,
      label: "Tauri build step",
    },
    {
      actualMs: hasCargoAuditTiming ? cargoAuditMs : null,
      budgetMs: DEFAULT_BUDGETS.cargoAuditMs,
      label: "cargo-audit total",
    },
    {
      actualMs: publishJob?.durationMs ?? null,
      budgetMs: DEFAULT_BUDGETS.publishMs,
      label: "Publish job",
    },
  ].map((row) => ({
    ...row,
    status:
      row.actualMs === null
        ? "not measured"
        : row.actualMs <= row.budgetMs
          ? "within budget"
          : "over budget",
  }));
}

function buildCategoryRows({ importantSteps, totalMs }) {
  const totals = new Map();
  const measuredImportantTotalMs = importantSteps.reduce(
    (total, step) => total + (Number.isFinite(step.durationMs) ? step.durationMs : 0),
    0,
  );

  for (const step of importantSteps) {
    if (!Number.isFinite(step.durationMs)) {
      continue;
    }

    totals.set(step.category, (totals.get(step.category) || 0) + step.durationMs);
  }

  return [...totals.entries()]
    .map(([category, durationMs]) => ({
      category,
      durationMs,
      importantShare:
        measuredImportantTotalMs > 0 ? Number(((durationMs / measuredImportantTotalMs) * 100).toFixed(1)) : null,
      wallShare: Number.isFinite(totalMs) && totalMs > 0 ? Number(((durationMs / totalMs) * 100).toFixed(1)) : null,
    }))
    .sort((left, right) => right.durationMs - left.durationMs);
}

function renderTimingMarkdown({
  budgetRows,
  cacheSteps,
  categoryRows,
  generatedAt,
  importantSteps,
  jobRows,
  ring,
  topSlowSteps,
  totalMs,
}) {
  const lines = [
    "### Desktop release timing",
    "",
    `Generated at: \`${generatedAt}\``,
    `Ring: \`${ring}\``,
    `Total wall time: \`${formatDuration(totalMs)}\``,
    "",
    "#### Performance budgets",
    "",
    "| Budget | Target | Actual | Status |",
    "| --- | ---: | ---: | --- |",
    ...budgetRows.map(
      (row) =>
        `| ${escapeTable(row.label)} | \`${formatDuration(row.budgetMs)}\` | \`${formatDuration(row.actualMs)}\` | \`${row.status}\` |`,
    ),
    "",
    "#### Category totals",
    "",
    "| Category | Duration | Wall share | Important-step share |",
    "| --- | ---: | ---: | ---: |",
    ...categoryRows.map(
      (row) =>
        `| ${escapeTable(row.category)} | \`${formatDuration(row.durationMs)}\` | \`${formatPercent(row.wallShare)}\` | \`${formatPercent(row.importantShare)}\` |`,
    ),
    "",
    "#### Job timings",
    "",
    "| Job | Duration | Conclusion |",
    "| --- | ---: | --- |",
    ...jobRows.map(
      (job) =>
        `| ${escapeTable(job.name)} | \`${formatDuration(job.durationMs)}\` | \`${job.conclusion}\` |`,
    ),
    "",
    "#### Important step timings",
    "",
    "| Job | Step | Category | Duration | Conclusion |",
    "| --- | --- | --- | ---: | --- |",
    ...importantSteps.map(
      (step) =>
        `| ${escapeTable(step.jobName)} | ${escapeTable(step.name)} | ${escapeTable(step.category)} | \`${formatDuration(step.durationMs)}\` | \`${step.conclusion}\` |`,
    ),
    "",
    "#### Slowest 5 important steps",
    "",
    "| Rank | Job | Step | Duration |",
    "| ---: | --- | --- | ---: |",
    ...topSlowSteps.map(
      (step, index) =>
        `| ${index + 1} | ${escapeTable(step.jobName)} | ${escapeTable(step.name)} | \`${formatDuration(step.durationMs)}\` |`,
    ),
    "",
    "#### Cache visibility",
    "",
  ];

  if (cacheSteps.length > 0) {
    lines.push(
      "| Step | Duration | Conclusion | Note |",
      "| --- | ---: | --- | --- |",
      ...cacheSteps.map(
        (step) =>
          `| ${escapeTable(step.name)} | \`${formatDuration(step.durationMs)}\` | \`${step.conclusion}\` | cache hit/miss is not exposed by the current action output; duration is tracked as the safe proxy |`,
      ),
      "",
    );
  } else {
    lines.push(
      "No explicit cache action step was observed in the completed release jobs. Cache hit/miss is not inferred from logs to avoid leaking or misreporting runner state.",
      "",
    );
  }

  lines.push(
    "#### Scope",
    "",
    "This timing report is observational only. It does not change signing, updater manifest generation, artifact hashing, R2/GitHub publishing, or release safety gates.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function durationBetween(startedAt, completedAt) {
  const started = parseDate(startedAt);
  const completed = parseDate(completedAt);

  if (!started || !completed) {
    return null;
  }

  return Math.max(0, completed.getTime() - started.getTime());
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minDate(values) {
  const dates = values.filter(Boolean);
  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function maxDate(values) {
  const dates = values.filter(Boolean);
  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return "not measured";
  }

  const roundedSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "not measured";
}

function escapeTable(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function parseNextLink(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  for (const entry of linkHeader.split(",")) {
    const match = entry.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseDesktopReleaseTimingArgs(process.argv.slice(2));
    const jobs = await fetchWorkflowJobs(options);
    const report = createDesktopReleaseTimingReport({
      jobs,
      ring: options.ring,
    });

    if (options.outputPath) {
      await writeFile(path.resolve(options.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }

    const summaryPath = options.summaryOutputPath || process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      await appendFile(summaryPath, report.markdown, "utf8");
    } else {
      process.stdout.write(report.markdown);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackMarkdown = [
      "### Desktop release timing",
      "",
      `::warning::Desktop release timing summary could not be generated: ${message}`,
      "",
      "The release artifacts are not modified by timing collection. Inspect the Actions step durations manually for this run.",
      "",
    ].join("\n");

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      await appendFile(summaryPath, fallbackMarkdown, "utf8");
    } else {
      process.stderr.write(`${message}\n`);
    }
  }
}

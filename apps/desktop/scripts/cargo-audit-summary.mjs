import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;

export function createCargoAuditSummary(payload, options = {}) {
  const vulnerabilities = payload?.vulnerabilities ?? {};
  const warnings = payload?.warnings ?? {};
  const vulnerabilityList = Array.isArray(vulnerabilities.list) ? vulnerabilities.list : [];
  const warningGroups = Object.entries(warnings)
    .map(([kind, entries]) => ({
      kind,
      count: Array.isArray(entries) ? entries.length : 0,
      advisories: Array.isArray(entries) ? entries.map(normalizeWarningEntry) : [],
    }))
    .filter((group) => group.count > 0)
    .sort((left, right) => left.kind.localeCompare(right.kind));
  const warningTotal = warningGroups.reduce((total, group) => total + group.count, 0);
  const vulnerabilityCount = Number(vulnerabilities.count ?? vulnerabilityList.length ?? 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: options.source ? path.basename(String(options.source)) : null,
    tool: "cargo-audit",
    advisoryDatabase: {
      advisoryCount: payload?.database?.["advisory-count"] ?? null,
      lastCommit: payload?.database?.["last-commit"] ?? null,
      lastUpdated: payload?.database?.["last-updated"] ?? null,
    },
    lockfile: {
      dependencyCount: payload?.lockfile?.["dependency-count"] ?? null,
    },
    vulnerabilities: {
      found: Boolean(vulnerabilities.found || vulnerabilityCount > 0),
      count: vulnerabilityCount,
      advisories: vulnerabilityList.map(normalizeVulnerabilityEntry),
    },
    warnings: {
      count: warningTotal,
      groups: warningGroups,
    },
    policy: {
      releaseBlocker: vulnerabilityCount > 0,
      warningPolicy:
        "informational cargo-audit warnings are tracked as release evidence and reviewed separately from vulnerability blockers",
    },
  };
}

export async function writeCargoAuditSummary(options) {
  const inputPath = path.resolve(String(options.inputPath || ""));
  const outputPath = path.resolve(String(options.outputPath || ""));
  const raw = await readFile(inputPath, "utf8");
  const payload = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const summary = createCargoAuditSummary(payload, {
    source: inputPath,
  });

  assertNoSensitiveValues(summary);
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return {
    outputPath,
    summary,
  };
}

export function parseCargoAuditSummaryCliArgs(argv) {
  const values = new Map();
  const allowed = new Set(["input", "out"]);

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
    if (!value || String(value).startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    values.set(key, value);
  }

  for (const required of ["input", "out"]) {
    if (!values.has(required)) {
      throw new Error(`Missing required option: --${required}`);
    }
  }

  return {
    inputPath: values.get("input"),
    outputPath: values.get("out"),
  };
}

function normalizeWarningEntry(entry) {
  return {
    crate: entry?.package?.name ?? null,
    version: entry?.package?.version ?? null,
    advisoryId: entry?.advisory?.id ?? null,
    title: entry?.advisory?.title ?? null,
    informational: entry?.advisory?.informational ?? entry?.kind ?? null,
    url: normalizeAdvisoryUrl(entry?.advisory?.id),
  };
}

function normalizeVulnerabilityEntry(entry) {
  return {
    crate: entry?.package?.name ?? null,
    version: entry?.package?.version ?? null,
    advisoryId: entry?.advisory?.id ?? null,
    title: entry?.advisory?.title ?? null,
    url: normalizeAdvisoryUrl(entry?.advisory?.id),
  };
}

function normalizeAdvisoryUrl(advisoryId) {
  if (!advisoryId) {
    return null;
  }

  return `https://rustsec.org/advisories/${advisoryId}.html`;
}

function assertNoSensitiveValues(summary) {
  const serialized = JSON.stringify(summary);

  for (const forbidden of [
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    "WINDOWS_CERTIFICATE_PASSWORD",
    "WINDOWS_CERTIFICATE_PFX_BASE64",
    "PRIVATE KEY",
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`cargo audit summary contains sensitive marker: ${forbidden}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseCargoAuditSummaryCliArgs(process.argv.slice(2));
    const { outputPath, summary } = await writeCargoAuditSummary(options);

    console.log(`[Whispr Desktop] cargo-audit vulnerabilities: ${summary.vulnerabilities.count}`);
    console.log(`[Whispr Desktop] cargo-audit warnings: ${summary.warnings.count}`);
    console.log(`[Whispr Desktop] cargo-audit summary: ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

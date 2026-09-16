import type { E2EEnvironmentValidation } from "./environment";

export const COVERAGE_THRESHOLDS = {
  branches: 67,
  functions: 51,
  lines: 23,
} as const;

export type ApiE2ECoverageMode = {
  mode: "fail" | "run" | "skip";
  reason?: string;
};

export type CoverageEnvironment = Record<string, string | undefined>;

const C8_REPORT_HEAP_MIB = 4096;

export function buildNodeCoverageEnv(
  env: CoverageEnvironment,
  tempDirectory: string,
): CoverageEnvironment {
  return {
    ...env,
    NODE_V8_COVERAGE: tempDirectory,
  };
}

/**
 * Incremental merging avoids retaining every raw V8 report at once. Keep its
 * heap below the hosted runner's total memory, leaving room for native memory
 * and the OS, and scope this budget to the report child only.
 */
export function buildC8ReportEnv(env: CoverageEnvironment): CoverageEnvironment {
  const nodeOptions = (env.NODE_OPTIONS ?? "")
    .split(/\s+/u)
    .filter(Boolean)
    .filter((option) => !/^--max-old-space-size(?:=|$)/u.test(option));

  return {
    ...env,
    NODE_OPTIONS: [...nodeOptions, `--max-old-space-size=${C8_REPORT_HEAP_MIB}`].join(" "),
  };
}

export function buildC8ReportArgs(args: { reportsDir: string; tempDirectory: string }) {
  return [
    "report",
    "--all",
    "--merge-async",
    "--reporter=text",
    "--reporter=json-summary",
    "--include=src/**/*.ts",
    "--include=src/**/*.tsx",
    "--exclude=src/**/*.test.ts",
    "--exclude=src/**/*.test.tsx",
    "--check-coverage",
    `--lines=${COVERAGE_THRESHOLDS.lines}`,
    `--branches=${COVERAGE_THRESHOLDS.branches}`,
    `--functions=${COVERAGE_THRESHOLDS.functions}`,
    `--temp-directory=${args.tempDirectory}`,
    `--reports-dir=${args.reportsDir}`,
  ];
}

export function getApiE2ECoverageMode(
  validation: E2EEnvironmentValidation,
  env: CoverageEnvironment,
): ApiE2ECoverageMode {
  if (env.WEB_COVERAGE_API_E2E === "0") {
    return {
      mode: "skip",
      reason: "WEB_COVERAGE_API_E2E=0",
    };
  }

  if (validation.ok) {
    return { mode: "run" };
  }

  const reason = validation.errors.map((error) => error.code).join(", ");

  if (env.WEB_COVERAGE_REQUIRE_API_E2E === "1" || env.CI === "true") {
    return {
      mode: "fail",
      reason,
    };
  }

  return {
    mode: "skip",
    reason,
  };
}

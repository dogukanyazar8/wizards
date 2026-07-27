import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DESKTOP_PERFORMANCE_BUDGETS } from "./release-ops.mjs";

export const DESKTOP_MEASUREMENT_METRIC_IDS = Object.freeze([
  "cold-start",
  "warm-start",
  "process-family-memory",
  "overlay-cpu",
  "shortcut-latency",
  "updater-check-install-relaunch",
]);

const allowedStatuses = new Set(["PASS", "FAIL", "NOT_RUN", "ENV_BLOCKED"]);
const allowedArtifactFields = new Set([
  "generatedAt",
  "idleSeconds",
  "iterations",
  "metrics",
  "platform",
  "schemaVersion",
  "tool",
]);
const allowedMetricFields = new Set([
  "budget",
  "diagnostic",
  "id",
  "limitations",
  "method",
  "status",
  "value",
]);

export function createDesktopWindowsMeasurementArtifact({
  generatedAt = new Date().toISOString(),
  idleSeconds = 60,
  iterations = 0,
  launchToProcessMs = [],
  memoryMb = null,
  memorySamplesMb = [],
  processFamilyComplete = false,
} = {}) {
  const launchDiagnostics = launchToProcessMs.filter(Number.isFinite).map(round);
  const memorySamples = memorySamplesMb.filter(Number.isFinite).map(round);
  const maxMemoryMb = memorySamples.length > 0 ? Math.max(...memorySamples) : null;
  const reportedMemoryMb = Number.isFinite(memoryMb) ? round(memoryMb) : null;
  const completeMemorySamples =
    processFamilyComplete &&
    Number.isInteger(iterations) &&
    iterations >= 1 &&
    Number.isInteger(idleSeconds) &&
    idleSeconds >= 60 &&
    memorySamples.length === iterations &&
    (reportedMemoryMb === null || reportedMemoryMb === maxMemoryMb);
  const memoryStatus = completeMemorySamples
    ? maxMemoryMb <= DESKTOP_PERFORMANCE_BUDGETS.memoryMb
      ? "PASS"
      : "FAIL"
    : "ENV_BLOCKED";

  return {
    schemaVersion: 1,
    tool: "measure-windows-desktop",
    platform: "windows",
    generatedAt,
    idleSeconds,
    iterations,
    metrics: [
      createMetric({
        id: "cold-start",
        status: "NOT_RUN",
        value: null,
        budget: `<= ${DESKTOP_PERFORMANCE_BUDGETS.warmStartMs}ms`,
        method: "No native interactive-ready acknowledgement bridge is available.",
        limitations:
          "Process creation timing is diagnostic-only and cannot prove a cold interactive desktop start.",
        diagnostic: { launchToProcessMs: launchDiagnostics },
      }),
      createMetric({
        id: "warm-start",
        status: "NOT_RUN",
        value: null,
        budget: `<= ${DESKTOP_PERFORMANCE_BUDGETS.warmStartMs}ms`,
        method: "No native interactive-ready acknowledgement bridge is available.",
        limitations:
          "Process creation timing is diagnostic-only and cannot prove a warm interactive desktop start.",
        diagnostic: { launchToProcessMs: launchDiagnostics },
      }),
      createMetric({
        id: "process-family-memory",
        status: memoryStatus,
        value: memoryStatus === "ENV_BLOCKED" ? null : maxMemoryMb,
        budget: `<= ${DESKTOP_PERFORMANCE_BUDGETS.memoryMb}MB`,
        method:
          "Sum working sets for the launched process and its observed descendants after idle.",
        limitations:
          "Detached or OS-owned WebView processes make the process-family sample incomplete.",
        diagnostic: { sampleCount: memorySamples.length, samplesMb: memorySamples },
      }),
      createMetric({
        id: "overlay-cpu",
        status: "NOT_RUN",
        value: null,
        budget: `<= ${DESKTOP_PERFORMANCE_BUDGETS.overlayCpuPercent}% average`,
        method: "No overlay-visible readiness or process attribution bridge is available.",
        limitations: "The harness does not inject input or open a companion window.",
      }),
      createMetric({
        id: "shortcut-latency",
        status: "NOT_RUN",
        value: null,
        budget: `<= ${DESKTOP_PERFORMANCE_BUDGETS.shortcutLatencyMs}ms p95`,
        method: "No trusted shortcut acknowledgement bridge is available.",
        limitations:
          "The harness does not inject global input or observe renderer acknowledgement.",
      }),
      createMetric({
        id: "updater-check-install-relaunch",
        status: "NOT_RUN",
        value: null,
        budget: "success",
        method: "Updater network, installation, and relaunch are intentionally not invoked.",
        limitations:
          "A signed artifact and controlled HTTPS feed are required for this smoke test.",
      }),
    ],
  };
}

export function assertDesktopWindowsMeasurementArtifact(artifact) {
  assertObject(artifact, "Desktop measurement artifact");

  for (const field of Object.keys(artifact)) {
    assert.ok(
      allowedArtifactFields.has(field),
      `Desktop measurement artifact has forbidden field: ${field}.`,
    );
  }

  assert.equal(artifact.schemaVersion, 1, "Desktop measurement schema version must be 1.");
  assert.equal(artifact.tool, "measure-windows-desktop");
  assert.equal(artifact.platform, "windows");
  assert.ok(
    typeof artifact.generatedAt === "string" && !Number.isNaN(Date.parse(artifact.generatedAt)),
    "Desktop measurement artifact needs an ISO timestamp.",
  );
  assert.ok(
    Number.isInteger(artifact.idleSeconds) &&
      artifact.idleSeconds >= 60 &&
      artifact.idleSeconds <= 600,
    "Desktop measurement artifact must record a 60-600 second idle period.",
  );
  assert.ok(Number.isInteger(artifact.iterations) && artifact.iterations >= 0);
  assert.ok(Array.isArray(artifact.metrics));
  assert.deepEqual(
    artifact.metrics.map((metric) => metric.id),
    DESKTOP_MEASUREMENT_METRIC_IDS,
    "Desktop measurement metrics must stay complete and ordered.",
  );

  for (const metric of artifact.metrics) {
    assertObject(metric, `Desktop measurement metric ${metric?.id ?? "unknown"}`);
    for (const field of Object.keys(metric)) {
      assert.ok(
        allowedMetricFields.has(field),
        `Desktop measurement metric ${metric.id} has forbidden field: ${field}.`,
      );
    }

    assert.ok(allowedStatuses.has(metric.status), `Invalid metric status: ${metric.status}.`);
    assert.ok(typeof metric.budget === "string" && metric.budget.length > 0);
    assert.ok(typeof metric.method === "string" && metric.method.length >= 20);
    assert.ok(typeof metric.limitations === "string" && metric.limitations.length >= 20);
    assert.ok(metric.value === null || Number.isFinite(metric.value));

    if (metric.diagnostic !== undefined) {
      assertObject(metric.diagnostic, `Desktop measurement metric ${metric.id} diagnostic`);
      assertDiagnostic(metric.diagnostic, metric.id);
    }

    if (metric.id !== "process-family-memory") {
      assert.ok(
        metric.status !== "PASS" && metric.status !== "FAIL",
        `${metric.id} must not report PASS before an interactive readiness bridge exists.`,
      );
      assert.equal(metric.value, null, `${metric.id} must not report an untrusted value.`);
      continue;
    }

    assert.ok(metric.diagnostic, "Process-family memory must include sample evidence.");
    const { sampleCount, samplesMb } = metric.diagnostic;
    const isScored = metric.status === "PASS" || metric.status === "FAIL";

    if (!isScored) {
      assert.equal(metric.value, null, "Unscored memory must not report a value.");
      continue;
    }

    assert.ok(
      artifact.iterations >= 1 &&
        sampleCount === artifact.iterations &&
        samplesMb.length === artifact.iterations,
      "Process-family memory sample count must match iterations and include at least one complete sample.",
    );
    const worstMemoryMb = Math.max(...samplesMb);
    assert.equal(metric.value, worstMemoryMb, "Scored memory must use the worst complete sample.");
    assert.equal(
      metric.status,
      worstMemoryMb <= DESKTOP_PERFORMANCE_BUDGETS.memoryMb ? "PASS" : "FAIL",
      "Scored memory status must match the memory budget.",
    );
  }

  return artifact;
}

function createMetric({ diagnostic, ...metric }) {
  return diagnostic ? { ...metric, diagnostic } : metric;
}

function assertDiagnostic(diagnostic, metricId) {
  const allowedFields = new Set(
    metricId === "process-family-memory" ? ["sampleCount", "samplesMb"] : ["launchToProcessMs"],
  );

  for (const field of Object.keys(diagnostic)) {
    assert.ok(
      allowedFields.has(field),
      `Desktop measurement metric ${metricId} diagnostic has forbidden field: ${field}.`,
    );
  }

  if (metricId === "process-family-memory") {
    assert.ok(Number.isInteger(diagnostic.sampleCount) && diagnostic.sampleCount >= 0);
    assert.ok(Array.isArray(diagnostic.samplesMb));
    assert.equal(diagnostic.samplesMb.length, diagnostic.sampleCount);
    assert.ok(diagnostic.samplesMb.every((sample) => Number.isFinite(sample) && sample >= 0));
    return;
  }

  assert.ok(Array.isArray(diagnostic.launchToProcessMs));
  assert.ok(diagnostic.launchToProcessMs.every(Number.isFinite));
}

function assertObject(value, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`,
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function main() {
  const [artifactPath] = process.argv.slice(2);
  if (!artifactPath || process.argv.length !== 3) {
    throw new Error("Usage: node measure-windows-desktop.contract.mjs <measurement.json>");
  }

  const source = await readFile(artifactPath, "utf8");
  assertDesktopWindowsMeasurementArtifact(JSON.parse(source.replace(/^\uFEFF/u, "")));
  console.log("Validated desktop Windows measurement artifact.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Desktop measurement artifact validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

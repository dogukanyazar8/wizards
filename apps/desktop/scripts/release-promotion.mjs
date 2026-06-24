import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDesktopReleaseAudit } from "./release-audit.mjs";
import {
  DESKTOP_PERFORMANCE_BUDGETS,
  DESKTOP_RELEASE_PERFORMANCE_EVIDENCE,
  DESKTOP_RELEASE_PROMOTION_RULES,
  DESKTOP_RELEASE_RINGS,
  DESKTOP_RELEASE_SAFETY_RULES,
  DESKTOP_REQUIRED_SMOKE_TESTS,
  assertDesktopReleaseOpsContract,
  getDesktopReleaseOpsContract,
} from "./release-ops.mjs";

const FORBIDDEN_SENSITIVE_MARKERS = Object.freeze([
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "WINDOWS_CERTIFICATE_PASSWORD",
  "WINDOWS_CERTIFICATE_PFX_BASE64",
  "PRIVATE KEY",
]);

export async function createDesktopReleasePromotionBundle(options = {}) {
  const artifactPath = assertExistingFile(options.artifactPath, "artifact");
  const signaturePath = assertExistingFile(options.signaturePath, "signature");
  const ring = normalizeReleaseRing(options.ring || "uat");
  const releaseOpsContract = assertDesktopReleaseOpsContract(getDesktopReleaseOpsContract());
  const audit = await createDesktopReleaseAudit({
    artifactPath,
    checkArtifactUrl: Boolean(options.checkArtifactUrl),
    expectedVersion: options.expectedVersion,
    manifestSource: options.manifestSource,
    manifestUrl: options.manifestUrl,
    platform: options.platform,
    releaseTag: options.releaseTag,
    requireManifest: true,
    ring,
    signaturePath,
    webUrl: options.webUrl,
  });

  assertReadyAudit(audit);

  const bundle = {
    generatedAt: new Date().toISOString(),
    status: "ready-for-promotion",
    release: {
      ring: audit.ring,
      version: audit.expectedVersion,
      webUrl: audit.webUrl,
      platform: audit.updaterFeed.platform,
      artifactFileName: audit.artifact.fileName,
      artifactSizeBytes: audit.artifact.sizeBytes,
      artifactSha256: audit.artifact.sha256,
      artifactUrl: audit.updaterFeed.artifactUrl,
      manifestUrl: audit.updaterFeed.manifestUrl,
      updaterManifestSource: audit.updaterFeed.source,
    },
    checks: audit.checks,
    requiredSmokeTests: DESKTOP_REQUIRED_SMOKE_TESTS.map((test) => ({ ...test })),
    performanceBudgets: { ...DESKTOP_PERFORMANCE_BUDGETS },
    performanceEvidence: DESKTOP_RELEASE_PERFORMANCE_EVIDENCE.map((item) => ({ ...item })),
    promotionRules: DESKTOP_RELEASE_PROMOTION_RULES.map((rule) => ({
      ...rule,
      entryCriteria: [...rule.entryCriteria],
      exitCriteria: [...rule.exitCriteria],
    })),
    safetyRules: DESKTOP_RELEASE_SAFETY_RULES.map((rule) => ({ ...rule })),
    manualQaSteps: buildManualQaSteps(audit.ring),
    operatorChecklist: buildOperatorChecklist(audit.ring),
    rollbackPlan: buildRollbackPlan(audit.ring),
    evidence: {
      audit,
      releaseOpsContract,
    },
  };

  assertNoSensitiveValues(bundle);

  return bundle;
}

export async function writeDesktopReleasePromotionBundle(options = {}) {
  const bundle = await createDesktopReleasePromotionBundle(options);
  const outputDir = path.resolve(options.outputDir || path.dirname(path.resolve(options.artifactPath)));
  const baseName = `desktop-release-promotion-${bundle.release.version}-${bundle.release.ring}`;
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const markdownPath = path.join(outputDir, `${baseName}.md`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderPromotionMarkdown(bundle), "utf8");

  return {
    bundle,
    jsonPath,
    markdownPath,
  };
}

export function parseReleasePromotionCliArgs(argv) {
  const values = new Map();
  const allowed = new Set([
    "artifact",
    "check-artifact-url",
    "expected-version",
    "manifest",
    "manifest-url",
    "out-dir",
    "platform",
    "release-tag",
    "ring",
    "signature",
    "web-url",
  ]);

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
    const rawKey = equalsIndex === -1 ? rawArg : rawArg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : rawArg.slice(equalsIndex + 1);

    if (!allowed.has(rawKey)) {
      throw new Error(`Unknown option: --${rawKey}`);
    }

    if (rawKey === "check-artifact-url") {
      values.set(rawKey, "true");
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    values.set(rawKey, value);
  }

  for (const required of ["artifact", "manifest", "signature", "web-url"]) {
    if (!values.has(required)) {
      throw new Error(`Missing required option: --${required}`);
    }
  }

  return {
    artifactPath: values.get("artifact"),
    checkArtifactUrl: values.get("check-artifact-url") === "true",
    expectedVersion: values.get("expected-version"),
    manifestSource: values.get("manifest"),
    manifestUrl: values.get("manifest-url"),
    outputDir: values.get("out-dir"),
    platform: values.get("platform"),
    releaseTag: values.get("release-tag"),
    ring: values.get("ring"),
    signaturePath: values.get("signature"),
    webUrl: values.get("web-url"),
  };
}

function assertReadyAudit(audit) {
  const failedCheck = audit.checks.find((check) => check.status !== "passed");
  if (failedCheck) {
    throw new Error(`Release promotion blocked by ${failedCheck.id}:${failedCheck.status}.`);
  }

  if (!audit.artifact) {
    throw new Error("Release promotion requires a local installer artifact.");
  }

  if (!audit.updaterFeed) {
    throw new Error("Release promotion requires a signed updater manifest.");
  }

  if (!audit.updaterFeed.signatureVerified) {
    throw new Error("Release promotion requires the updater manifest signature to match the .sig file.");
  }
}

function buildOperatorChecklist(ring) {
  return [
    `Confirm the workflow published the installer, .sig, and generated latest.json to the ${ring} update prefix.`,
    "Confirm remote manifest validation with --check-artifact-url passed after upload.",
    "Archive the release audit, promotion bundle, publish plan, and GitHub Release link with the release handoff.",
    "Install the previous desktop version and verify the title-bar update flow reaches the new version.",
    "Complete mandatory Windows smoke gates before promoting to the next ring.",
    "Record performance evidence for warm start, idle memory, updater install, overlay CPU, and shortcut latency.",
    "Keep generated private keys, signing passwords, PFX files, and temporary key material out of release assets.",
  ];
}

function buildManualQaSteps(ring) {
  const steps = [
    "Install the previous Windows desktop version for the same release ring.",
    "Launch the app, authenticate, and confirm the updater card sees the new version.",
    "Click Download and restart, then confirm the app relaunches and Settings -> About reports the new desktop runtime version.",
    "Run auth restore, close-to-tray, voice join/leave, global shortcut, notification, and overlay smoke checks.",
    "Export desktop diagnostics only if a failure occurs; redact user/session data before attaching it to support tickets.",
  ];

  if (ring === "stable") {
    steps.push("Confirm canary health and support signals are clean before broad stable rollout.");
  } else if (ring === "canary") {
    steps.push("Limit rollout to the monitored canary cohort and keep the previous stable manifest ready.");
  } else {
    steps.push("Keep UAT release marked as non-production until manual QA is complete.");
  }

  return steps;
}

function buildRollbackPlan(ring) {
  return [
    `Restore command: aws --endpoint-url <r2-endpoint> s3 cp <previous-latest.json> s3://<R2_BUCKET>/desktop/${ring}/latest.json --content-type application/json --cache-control "no-cache, no-store, must-revalidate".`,
    `Replace the ${ring} latest.json with the previous signed manifest if update installation regresses.`,
    "Keep the previous installer available until the new release has passed UAT/canary observation.",
    "Do not delete the previous artifact until update metrics and manual smoke tests are clean.",
    "If signature verification fails, rotate the updater manifest back before building a new signed artifact.",
  ];
}

function renderPromotionMarkdown(bundle) {
  return `${[
    `# Whispr Desktop Release Promotion - ${bundle.release.version} (${bundle.release.ring})`,
    "",
    `Generated: ${bundle.generatedAt}`,
    `Status: ${bundle.status}`,
    "",
    "## Release",
    "",
    `- Ring: \`${bundle.release.ring}\``,
    `- Version: \`${bundle.release.version}\``,
    `- Web URL: ${bundle.release.webUrl}`,
    `- Platform: \`${bundle.release.platform}\``,
    `- Artifact: \`${bundle.release.artifactFileName}\` (${bundle.release.artifactSizeBytes} bytes)`,
    `- Artifact SHA-256: \`${bundle.release.artifactSha256}\``,
    `- Updater artifact URL: ${bundle.release.artifactUrl}`,
    `- Updater manifest URL: ${bundle.release.manifestUrl || "not recorded"}`,
    `- Updater manifest source: ${bundle.release.updaterManifestSource}`,
    "",
    "## Automated Checks",
    "",
    ...bundle.checks.map((check) => `- [x] \`${check.id}\` - ${check.detail}`),
    "",
    "## Ring Promotion Rules",
    "",
    ...bundle.promotionRules.flatMap((rule) => [
      `### ${rule.ring}`,
      "",
      `- Rollout: ${rule.rollout}`,
      `- Entry: ${rule.entryCriteria.join("; ")}`,
      `- Exit: ${rule.exitCriteria.join("; ")}`,
      "",
    ]),
    "## Manual QA Steps",
    "",
    ...bundle.manualQaSteps.map((item) => `- [ ] ${item}`),
    "",
    "## Mandatory Smoke Tests",
    "",
    ...bundle.requiredSmokeTests.map((test) => `- [ ] \`${test.id}\` - ${test.description}`),
    "",
    "## Performance Budgets",
    "",
    `- Warm start: <= ${bundle.performanceBudgets.warmStartMs}ms`,
    `- Warm idle memory: <= ${bundle.performanceBudgets.memoryMb}MB`,
    `- Overlay CPU: <= ${bundle.performanceBudgets.overlayCpuPercent}%`,
    `- Shortcut latency p95: <= ${bundle.performanceBudgets.shortcutLatencyMs}ms`,
    "",
    "## Performance Evidence",
    "",
    ...bundle.performanceEvidence.map((item) => `- [ ] \`${item.id}\` - ${item.description} Budget: ${item.budget}.`),
    "",
    "## Operator Checklist",
    "",
    ...bundle.operatorChecklist.map((item) => `- [ ] ${item}`),
    "",
    "## Rollback Plan",
    "",
    ...bundle.rollbackPlan.map((item) => `- ${item}`),
    "",
    "## Safety Rules",
    "",
    ...bundle.safetyRules.map((rule) => `- \`${rule.id}\` - ${rule.description}`),
    "",
  ].join("\n")}\n`;
}

function normalizeReleaseRing(ring) {
  const value = String(ring || "").trim();

  if (!DESKTOP_RELEASE_RINGS.includes(value)) {
    throw new Error(`Release ring must be one of: ${DESKTOP_RELEASE_RINGS.join(", ")}.`);
  }

  return value;
}

function assertExistingFile(filePath, label) {
  const resolvedPath = path.resolve(String(filePath || ""));

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    throw new Error(`Desktop release ${label} file does not exist: ${resolvedPath}`);
  }

  return resolvedPath;
}

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value);

  for (const forbidden of FORBIDDEN_SENSITIVE_MARKERS) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Release promotion bundle contains sensitive marker: ${forbidden}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseReleasePromotionCliArgs(process.argv.slice(2));
    const { bundle, jsonPath, markdownPath } = await writeDesktopReleasePromotionBundle(options);

    console.log(`[Whispr Desktop] release promotion ring: ${bundle.release.ring}`);
    console.log(`[Whispr Desktop] release promotion version: ${bundle.release.version}`);
    console.log(`[Whispr Desktop] release promotion status: ${bundle.status}`);
    console.log(`[Whispr Desktop] release promotion JSON: ${jsonPath}`);
    console.log(`[Whispr Desktop] release promotion Markdown: ${markdownPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

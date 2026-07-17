import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";

const webRoot = process.cwd();
const workspaceRoot = join(webRoot, "..", "..");
const e2eSpecsRoot = join(webRoot, "e2e", "specs");

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function collectFiles(directory: string, predicate: (fileName: string) => boolean): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      const stats = statSync(path);

      if (stats.isDirectory()) {
        return collectFiles(path, predicate);
      }

      return stats.isFile() && predicate(entry) ? [path] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function readWorkspaceFile(path: string): string {
  return readFileSync(path, "utf8");
}

interface GitleaksAllowlistMetadata {
  schemaVersion: 1;
  entries: Array<{
    fingerprint: string;
    reason: string;
    owner: string;
    expiresOn: string;
  }>;
}

function describeFile(path: string): string {
  return toPosixPath(relative(webRoot, path));
}

const specFiles = collectFiles(e2eSpecsRoot, (fileName) => fileName.endsWith(".spec.ts"));

describe("Playwright E2E governance", () => {
  it("keeps the expected product-critical spec families present", () => {
    const expectedSpecs = [
      "e2e/specs/api/api-routes.spec.ts",
      "e2e/specs/a11y/a11y.spec.ts",
      "e2e/specs/attachments/attachments.spec.ts",
      "e2e/specs/message-interactions/message-interactions.spec.ts",
      "e2e/specs/mobile/mobile-responsive.spec.ts",
      "e2e/specs/realtime/realtime.spec.ts",
      "e2e/specs/settings/settings.spec.ts",
      "e2e/specs/smoke/app-shell.spec.ts",
      "e2e/specs/smoke/auth.spec.ts",
      "e2e/specs/smoke/dm.spec.ts",
      "e2e/specs/smoke/messaging.spec.ts",
      "e2e/specs/smoke/server.spec.ts",
      "e2e/specs/voice/voice.spec.ts",
      "e2e/specs/visual/visual.spec.ts",
    ];

    for (const expectedSpec of expectedSpecs) {
      assert.equal(
        existsSync(join(webRoot, expectedSpec)),
        true,
        `${expectedSpec} should remain covered by Playwright`,
      );
    }
  });

  it("uses the shared diagnostic fixture instead of raw Playwright runtime imports", () => {
    const runtimePlaywrightImport = /^import\s+(?!type\b)[^;]*from\s+["']@playwright\/test["'];/m;
    const offenders = specFiles
      .filter((file) => runtimePlaywrightImport.test(readWorkspaceFile(file)))
      .map(describeFile);

    assert.deepEqual(offenders, []);
  });

  it("does not leave focused tests in the committed E2E suite", () => {
    const focusedTestPattern = /\b(?:test|describe)\.only\s*\(/;
    const offenders = specFiles
      .filter((file) => focusedTestPattern.test(readWorkspaceFile(file)))
      .map(describeFile);

    assert.deepEqual(offenders, []);
  });

  it("does not use unconditional sleeps in Playwright specs", () => {
    const offenders = specFiles
      .filter((file) => readWorkspaceFile(file).includes("waitForTimeout("))
      .map(describeFile);

    assert.deepEqual(offenders, []);
  });

  it("routes protected app navigation through readiness helpers", () => {
    const protectedRouteGotoPattern = /page\.goto\s*\(\s*["']\/(?:channels|settings)(?:\/|["'])/;
    const offenders = specFiles
      .filter((file) => protectedRouteGotoPattern.test(readWorkspaceFile(file)))
      .map(describeFile);

    assert.deepEqual(offenders, []);
  });

  it("settles API-authenticated sessions on the stable DM route before follow-up navigation", () => {
    const authHelper = readWorkspaceFile(join(webRoot, "e2e", "helpers", "auth.ts"));
    const loginAsImplementation = authHelper.slice(
      authHelper.indexOf("export async function loginAs"),
      authHelper.indexOf("export async function logout"),
    );

    assert.match(loginAsImplementation, /gotoAppRoute\(page, "\/channels\/@me"\)/);
  });

  it("keeps every Playwright entrypoint behind the environment preflight", () => {
    const packageJson = JSON.parse(readWorkspaceFile(join(webRoot, "package.json"))) as {
      scripts: Record<string, string>;
    };
    const preflightedScripts = [
      "e2e",
      "e2e:a11y",
      "e2e:api",
      "e2e:headed",
      "e2e:mobile",
      "e2e:realtime",
      "e2e:seed",
      "e2e:smoke",
      "e2e:ui",
      "e2e:visual",
    ];

    for (const scriptName of preflightedScripts) {
      assert.match(
        packageJson.scripts[scriptName] ?? "",
        /e2e:check-env/,
        `${scriptName} must run the E2E environment preflight first`,
      );
    }
  });

  it("retains useful Playwright failure artifacts without recording every successful run", () => {
    const config = readWorkspaceFile(join(webRoot, "playwright.config.ts"));

    assert.match(config, /screenshot:\s*"only-on-failure"/);
    assert.match(config, /trace:\s*"on-first-retry"/);
    assert.match(config, /video:\s*"retain-on-failure"/);
    assert.match(config, /outputDir:\s*"test-results"/);
    assert.match(config, /outputFolder:\s*"playwright-report"/);
  });

  it("surfaces the Playwright preflight as a dedicated CI step", () => {
    const workflow = readWorkspaceFile(join(workspaceRoot, ".github", "workflows", "ci.yml"));

    assert.match(workflow, /Validate Playwright E2E environment/);
    assert.match(workflow, /pnpm --filter @wizards\/web e2e:check-env/);
  });

  it("grants the secret scanner least-privilege pull request access", () => {
    const workflow = readWorkspaceFile(join(workspaceRoot, ".github", "workflows", "ci.yml"));
    const permissionsStart = workflow.indexOf("\npermissions:");
    const jobsStart = workflow.indexOf("\njobs:");

    assert.notEqual(permissionsStart, -1);
    assert.notEqual(jobsStart, -1);

    const permissions = workflow.slice(permissionsStart, jobsStart);
    assert.match(permissions, /contents:\s+read/);
    assert.match(permissions, /pull-requests:\s+read/);
    assert.doesNotMatch(permissions, /:\s+write/);
  });

  it("governs every exact secret-scan suppression with owner, reason, and expiry", () => {
    const ignores = readWorkspaceFile(join(workspaceRoot, ".gitleaksignore"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const metadata = JSON.parse(
      readWorkspaceFile(join(workspaceRoot, ".gitleaksignore.metadata.json")),
    ) as GitleaksAllowlistMetadata;
    const mobileLinkingFixtureFingerprint =
      "edeab2d7f9eb4b96a22f0617500fb2a9d1d98e88:apps/mobile/scripts/mobile-linking-config.test.ts:generic-api-key:9";
    const documentationFixtureFingerprints = new Set([
      "8f18f2294b00bfe8d15eb2113d71a5f9423dc2b0:docs/superpowers/plans/2026-07-11-observability-stack.md:jwt:299",
      "8f18f2294b00bfe8d15eb2113d71a5f9423dc2b0:docs/superpowers/plans/2026-07-11-observability-stack.md:stripe-access-token:309",
    ]);
    const ignoreSet = new Set(ignores);
    const metadataByFingerprint = new Map(
      metadata.entries.map((entry) => [entry.fingerprint, entry] as const),
    );
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const maximumExpiryUtc = todayUtc + 90 * 24 * 60 * 60 * 1000;

    assert.equal(metadata.schemaVersion, 1);
    assert.equal(ignoreSet.size, ignores.length, "Gitleaks fingerprints must not be duplicated");
    assert.equal(
      metadataByFingerprint.size,
      metadata.entries.length,
      "Gitleaks metadata fingerprints must not be duplicated",
    );
    assert.equal(
      metadata.entries.length,
      ignores.length,
      "Every Gitleaks fingerprint must have exactly one metadata record",
    );
    assert.ok(ignores.includes(mobileLinkingFixtureFingerprint));

    for (const fingerprint of ignores) {
      const [commit, path, rule, line, ...extra] = fingerprint.split(":");
      const entry = metadataByFingerprint.get(fingerprint);

      assert.match(commit ?? "", /^[0-9a-f]{40}$/);
      assert.equal(
        /(?:\.test\.[cm]?[jt]sx?|^apps\/web\/e2e\/)/.test(path ?? "") ||
          documentationFixtureFingerprints.has(fingerprint),
        true,
        `${fingerprint} must remain scoped to a test fixture or an explicitly approved documentation fixture`,
      );
      assert.match(rule ?? "", /^[a-z0-9-]+$/);
      assert.match(line ?? "", /^\d+$/);
      assert.deepEqual(extra, []);
      assert.ok(entry, `${fingerprint} must have governance metadata`);
      assert.match(
        entry.owner,
        /^@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9-]*)?$/,
        `${fingerprint} must have an accountable GitHub owner or team`,
      );
      assert.ok(
        entry.reason.trim().length >= 24,
        `${fingerprint} must have a specific suppression reason`,
      );
      assert.match(entry.expiresOn, /^\d{4}-\d{2}-\d{2}$/);

      const expiresAtUtc = Date.parse(`${entry.expiresOn}T00:00:00.000Z`);

      assert.ok(Number.isFinite(expiresAtUtc), `${fingerprint} must have a valid expiry date`);
      assert.ok(expiresAtUtc > todayUtc, `${fingerprint} suppression has expired`);
      assert.ok(
        expiresAtUtc <= maximumExpiryUtc,
        `${fingerprint} suppression must expire within 90 days`,
      );
    }

    for (const entry of metadata.entries) {
      assert.ok(
        ignoreSet.has(entry.fingerprint),
        `${entry.fingerprint} metadata must reference an active exact fingerprint`,
      );
    }

    for (const fingerprint of documentationFixtureFingerprints) {
      assert.ok(ignoreSet.has(fingerprint), `${fingerprint} must remain an exact suppression`);
    }
  });

  it("keeps existing Playwright entrypoints Chromium-only and adds cross-browser smoke", () => {
    const packageJson = JSON.parse(readWorkspaceFile(join(webRoot, "package.json"))) as {
      scripts: Record<string, string>;
    };
    const chromiumScripts = [
      "e2e",
      "e2e:a11y",
      "e2e:api",
      "e2e:headed",
      "e2e:mobile",
      "e2e:realtime",
      "e2e:smoke",
      "e2e:ui",
      "e2e:visual",
    ];

    for (const scriptName of chromiumScripts) {
      assert.match(
        packageJson.scripts[scriptName] ?? "",
        /--project=chromium/,
        `${scriptName} must remain scoped to Chromium`,
      );
    }

    const crossBrowserSmoke = packageJson.scripts["e2e:smoke:cross-browser"] ?? "";
    assert.match(crossBrowserSmoke, /e2e:check-env/);
    assert.match(crossBrowserSmoke, /--project=firefox/);
    assert.match(crossBrowserSmoke, /--project=webkit/);
    assert.match(crossBrowserSmoke, /e2e\/specs\/smoke/);
    assert.match(
      crossBrowserSmoke,
      /playwright test --project=firefox e2e\/specs\/smoke\s+&&\s+playwright test --project=webkit e2e\/specs\/smoke/,
      "cross-browser projects must run in separate Playwright processes so each starts from a clean E2E seed and Redis rate-limit state",
    );
  });

  it("defines Firefox fake media and excludes WebKit voice capture explicitly", () => {
    const config = readWorkspaceFile(join(webRoot, "playwright.config.ts"));

    assert.match(config, /name:\s*"firefox"/);
    assert.match(config, /devices\["Desktop Firefox"\]/);
    assert.match(config, /"media\.navigator\.streams\.fake":\s*true/);
    assert.match(config, /"permissions\.default\.microphone":\s*1/);
    assert.match(config, /"permissions\.default\.camera":\s*1/);
    assert.match(config, /name:\s*"webkit"/);
    assert.match(config, /devices\["Desktop Safari"\]/);
    assert.match(config, /testIgnore:\s*"\*\*\/voice\/voice\.spec\.ts"/);
  });

  it("gives CI cross-browser smoke a timeout budget for authentication and app readiness", () => {
    const config = readWorkspaceFile(join(webRoot, "playwright.config.ts"));

    assert.match(config, /const crossBrowserTestTimeout = isCI \? 75_000 : 30_000;/);
    assert.match(config, /const crossBrowserExpectTimeout = isCI \? 30_000 : 10_000;/);
    assert.match(config, /const crossBrowserNavigationTimeout = isCI \? 60_000 : 30_000;/);
    assert.match(
      config,
      /const crossBrowserProjectConfig = \{\s*timeout: crossBrowserTestTimeout,\s*expect: \{\s*timeout: crossBrowserExpectTimeout,\s*\},\s*use: \{\s*actionTimeout: crossBrowserExpectTimeout,\s*navigationTimeout: crossBrowserNavigationTimeout,\s*\},\s*\};/,
    );
    assert.equal(config.match(/\.\.\.crossBrowserProjectConfig,/g)?.length, 2);
    assert.equal(config.match(/\.\.\.crossBrowserProjectConfig\.use,/g)?.length, 2);
  });

  it("keeps expensive Playwright suites in post-merge or scheduled gates", () => {
    const workflow = readWorkspaceFile(join(workspaceRoot, ".github", "workflows", "ci.yml"));
    const realtimeStepStart = workflow.indexOf("- name: Run Playwright realtime and voice tests");
    const fullStepStart = workflow.indexOf("- name: Run Playwright full suite");
    const uploadStepStart = workflow.indexOf("- name: Upload Playwright report");

    assert.notEqual(realtimeStepStart, -1);
    assert.notEqual(fullStepStart, -1);
    assert.notEqual(uploadStepStart, -1);

    const realtimeStep = workflow.slice(realtimeStepStart, fullStepStart);
    const fullStep = workflow.slice(fullStepStart, uploadStepStart);

    assert.match(realtimeStep, /github\.event_name == 'push'/);
    assert.match(realtimeStep, /inputs\.e2e_scope == 'realtime'/);
    assert.doesNotMatch(realtimeStep, /github\.event_name != 'workflow_dispatch'/);
    assert.doesNotMatch(realtimeStep, /github\.event_name == 'pull_request'/);

    assert.match(fullStep, /github\.event_name == 'schedule'/);
    assert.match(fullStep, /inputs\.e2e_scope == 'full'/);
  });

  it("runs Firefox and WebKit smoke tests in an isolated CI job", () => {
    const workflow = readWorkspaceFile(join(workspaceRoot, ".github", "workflows", "ci.yml"));
    const smokeStart = workflow.indexOf("\n  e2e-smoke:");
    const crossBrowserStart = workflow.indexOf("\n  e2e-cross-browser:");
    const a11yStart = workflow.indexOf("\n  e2e-a11y:");

    assert.notEqual(smokeStart, -1);
    assert.notEqual(crossBrowserStart, -1);
    assert.notEqual(a11yStart, -1);

    const smokeJob = workflow.slice(smokeStart, crossBrowserStart);
    const crossBrowserJob = workflow.slice(crossBrowserStart, a11yStart);
    const smokeRuntime = smokeJob.slice(
      smokeJob.indexOf("    services:"),
      smokeJob.indexOf("    steps:"),
    );
    const crossBrowserRuntime = crossBrowserJob.slice(
      crossBrowserJob.indexOf("    services:"),
      crossBrowserJob.indexOf("    steps:"),
    );

    assert.equal(
      crossBrowserRuntime.replaceAll("\r\n", "\n"),
      smokeRuntime.replaceAll("\r\n", "\n"),
    );
    assert.match(crossBrowserJob, /name:\s*Playwright Firefox\/WebKit Smoke/);
    assert.match(crossBrowserJob, /needs:\s*verify/);
    assert.match(crossBrowserJob, /playwright install --with-deps firefox webkit/);
    assert.match(crossBrowserJob, /@wizards\/web e2e:smoke:cross-browser/);
    assert.doesNotMatch(crossBrowserJob, /continue-on-error:/);
  });

  it("runs the accessibility scan in an isolated, mandatory CI job", () => {
    const workflow = readWorkspaceFile(join(workspaceRoot, ".github", "workflows", "ci.yml"));
    const smokeStart = workflow.indexOf("\n  e2e-smoke:");
    const a11yStart = workflow.indexOf("\n  e2e-a11y:");
    const visualStart = workflow.indexOf("\n  e2e-visual:");

    assert.notEqual(smokeStart, -1);
    assert.notEqual(a11yStart, -1);
    assert.notEqual(visualStart, -1);

    const smokeJob = workflow.slice(smokeStart, workflow.indexOf("\n  e2e-cross-browser:"));
    const a11yJob = workflow.slice(a11yStart, visualStart);
    const smokeRuntime = smokeJob.slice(
      smokeJob.indexOf("    services:"),
      smokeJob.indexOf("    steps:"),
    );
    const a11yRuntime = a11yJob.slice(
      a11yJob.indexOf("    services:"),
      a11yJob.indexOf("    steps:"),
    );

    assert.equal(a11yRuntime.replaceAll("\r\n", "\n"), smokeRuntime.replaceAll("\r\n", "\n"));
    assert.match(a11yJob, /name:\s*Playwright Accessibility Scan/);
    assert.match(a11yJob, /needs:\s*verify/);
    assert.match(a11yJob, /playwright install --with-deps chromium/);
    assert.match(a11yJob, /@wizards\/web e2e:a11y/);
    assert.doesNotMatch(a11yJob, /continue-on-error:/);
  });

  it("scopes the accessibility scan script to Chromium and the a11y spec directory", () => {
    const packageJson = JSON.parse(readWorkspaceFile(join(webRoot, "package.json"))) as {
      scripts: Record<string, string>;
    };
    const a11yScript = packageJson.scripts["e2e:a11y"] ?? "";

    assert.match(a11yScript, /e2e:check-env/);
    assert.match(a11yScript, /--project=chromium/);
    assert.match(a11yScript, /e2e\/specs\/a11y/);
  });

  it("keeps visual baselines deterministic and Docker-only", () => {
    const packageJson = JSON.parse(readWorkspaceFile(join(webRoot, "package.json"))) as {
      scripts: Record<string, string>;
    };
    const visualScript = packageJson.scripts["e2e:visual"] ?? "";
    const config = readWorkspaceFile(join(webRoot, "playwright.config.ts"));
    const visualSpecPath = join(e2eSpecsRoot, "visual", "visual.spec.ts");
    const e2eReadme = readWorkspaceFile(join(webRoot, "e2e", "README.md"));
    const gitignore = readWorkspaceFile(join(workspaceRoot, ".gitignore"));

    assert.match(visualScript, /e2e:check-env/);
    assert.match(visualScript, /--project=chromium/);
    assert.match(visualScript, /e2e\/specs\/visual/);
    assert.match(config, /toHaveScreenshot:\s*\{/);
    assert.match(config, /maxDiffPixelRatio:\s*0\.02/);
    assert.match(config, /animations:\s*"disabled"/);
    assert.match(config, /stylePath:\s*join\(webRoot,\s*"e2e",\s*"visual-screenshot\.css"\)/);
    assert.match(readWorkspaceFile(join(webRoot, "e2e", "visual-screenshot.css")), /nextjs-portal/);
    assert.equal(existsSync(visualSpecPath), true);

    const visualSpec = readWorkspaceFile(visualSpecPath);
    assert.equal(visualSpec.match(/\.toHaveScreenshot\(/g)?.length, 4);
    assert.match(e2eReadme, /mcr\.microsoft\.com\/playwright:v1\.59\.1-noble/);
    assert.match(e2eReadme, /baseline snapshots must only be updated inside Docker/i);
    assert.match(
      e2eReadme,
      /pnpm db:generate\s*&&\s*pnpm --filter @wizards\/web e2e:visual --update-snapshots/,
    );
    assert.match(e2eReadme, /--update-snapshots/);
    assert.match(gitignore, /^\*\*\/\*-actual\.png$/m);
    assert.match(gitignore, /^\*\*\/\*-diff\.png$/m);
    assert.doesNotMatch(gitignore, /\*-linux\.png/);
  });

  it("runs visual regression in an isolated staged CI job", () => {
    const workflow = readWorkspaceFile(join(workspaceRoot, ".github", "workflows", "ci.yml"));
    const smokeStart = workflow.indexOf("\n  e2e-smoke:");
    const crossBrowserStart = workflow.indexOf("\n  e2e-cross-browser:");
    const visualStart = workflow.indexOf("\n  e2e-visual:");
    const desktopOpsStart = workflow.indexOf("\n  desktop-ops:");

    assert.notEqual(smokeStart, -1);
    assert.notEqual(crossBrowserStart, -1);
    assert.notEqual(visualStart, -1);
    assert.notEqual(desktopOpsStart, -1);

    const smokeJob = workflow.slice(smokeStart, crossBrowserStart);
    const visualJob = workflow.slice(visualStart, desktopOpsStart);
    const smokeRuntime = smokeJob.slice(
      smokeJob.indexOf("    services:"),
      smokeJob.indexOf("    steps:"),
    );
    const visualRuntime = visualJob.slice(
      visualJob.indexOf("    services:"),
      visualJob.indexOf("    steps:"),
    );

    assert.equal(visualRuntime.replaceAll("\r\n", "\n"), smokeRuntime.replaceAll("\r\n", "\n"));
    assert.match(visualJob, /name:\s*Playwright Visual Regression/);
    assert.match(visualJob, /needs:\s*verify/);
    assert.match(visualJob, /continue-on-error:\s*true/);
    assert.match(visualJob, /playwright install --with-deps chromium/);
    assert.match(visualJob, /@wizards\/web e2e:visual/);
  });
});

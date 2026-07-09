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

function describeFile(path: string): string {
  return toPosixPath(relative(webRoot, path));
}

const specFiles = collectFiles(e2eSpecsRoot, (fileName) => fileName.endsWith(".spec.ts"));

describe("Playwright E2E governance", () => {
  it("keeps the expected product-critical spec families present", () => {
    const expectedSpecs = [
      "e2e/specs/api/api-routes.spec.ts",
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

  it("keeps every Playwright entrypoint behind the environment preflight", () => {
    const packageJson = JSON.parse(readWorkspaceFile(join(webRoot, "package.json"))) as {
      scripts: Record<string, string>;
    };
    const preflightedScripts = [
      "e2e",
      "e2e:api",
      "e2e:headed",
      "e2e:mobile",
      "e2e:realtime",
      "e2e:seed",
      "e2e:smoke",
      "e2e:ui",
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
});

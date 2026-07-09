import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const webRoot = process.cwd();
const workspaceRoot = join(webRoot, "..", "..");

function readWorkspaceFile(path: string) {
  return readFileSync(join(workspaceRoot, path), "utf8");
}

describe("next-auth beta dependency contract", () => {
  it("keeps next-auth pinned to the verified beta without a semver range", () => {
    const packageJson = JSON.parse(readWorkspaceFile("apps/web/package.json")) as {
      dependencies: Record<string, string>;
    };

    assert.equal(packageJson.dependencies["next-auth"], "5.0.0-beta.31");
    assert.doesNotMatch(packageJson.dependencies["next-auth"], /^[~^*><=]/);

    const lockfile = readWorkspaceFile("pnpm-lock.yaml");
    assert.match(lockfile, /next-auth@5\.0\.0-beta\.31:/);
  });

  it("keeps a deterministic auth regression E2E spec for future Auth.js upgrades", () => {
    const specPath = join(workspaceRoot, "apps/web/e2e/specs/api/auth-regression.spec.ts");

    assert.equal(existsSync(specPath), true);

    const spec = readFileSync(specPath, "utf8");
    for (const requiredScenario of [
      "credentials login uses the real Auth.js callback",
      "two-factor credentials login requires a valid second factor",
      "session revocation invalidates an already issued Auth.js session",
      "desktop OAuth handoff creates a one-time desktop claim URL",
      "Google OAuth remains tied to verified provider email",
      "registration remains covered by the auth upgrade safety net",
    ]) {
      assert.match(spec, new RegExp(requiredScenario.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("documents the Auth.js stable-v5 migration plan and rejected alternatives", () => {
    const runbookPath = join(workspaceRoot, "docs/operations/authjs-v5-beta-risk-runbook.md");

    assert.equal(existsSync(runbookPath), true);

    const runbook = readFileSync(runbookPath, "utf8");
    for (const requiredText of [
      "npm view next-auth dist-tags",
      "npm view next-auth versions",
      "5.0.0-beta.31",
      "stable 5.0.0",
      "pnpm --filter @wizards/web test:coverage",
      "pnpm --filter @wizards/web e2e:api",
      "v4 downgrade",
      "alternative auth library",
    ]) {
      assert.match(runbook, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });
});

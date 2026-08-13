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

    assert.equal(packageJson.dependencies["next-auth"], "5.0.0-beta.32");
    assert.doesNotMatch(packageJson.dependencies["next-auth"], /^[~^*><=]/);
    assert.equal(packageJson.dependencies["@auth/prisma-adapter"], "2.11.3");

    const lockfile = readWorkspaceFile("pnpm-lock.yaml");
    assert.match(lockfile, /next-auth@5\.0\.0-beta\.32:/);
    assert.match(lockfile, /@auth\/prisma-adapter@2\.11\.3['"]?:/);
    assert.match(lockfile, /@auth\/core@0\.41\.3['"]?:/);
  });

  it("keeps the Auth.js provider surface to credentials and verified OAuth providers", () => {
    const authSource = readWorkspaceFile("apps/web/src/auth.ts");

    assert.match(authSource, /Credentials\(/);
    assert.match(authSource, /GitHub\(/);
    assert.match(authSource, /Google\(/);
    assert.doesNotMatch(authSource, /next-auth\/providers\/email/);
  });

  it("keeps OAuth authorization before account linking in the pinned Auth.js callback", () => {
    const callbackSource = readWorkspaceFile(
      "node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/src/lib/actions/callback/index.ts",
    );
    const authorizeIndex = callbackSource.indexOf("const redirect = await handleAuthorized(");
    const redirectIndex = callbackSource.indexOf(
      "if (redirect) return { redirect, cookies }",
      authorizeIndex,
    );
    const linkIndex = callbackSource.indexOf("await handleLoginOrRegister(", redirectIndex);

    assert.ok(authorizeIndex >= 0);
    assert.ok(redirectIndex > authorizeIndex);
    assert.ok(linkIndex > redirectIndex);

    const authSource = readWorkspaceFile("apps/web/src/auth.ts");
    assert.match(authSource, /authorizeOAuthTwoFactorSignIn/);
  });

  it("keeps a deterministic auth regression E2E spec for future Auth.js upgrades", () => {
    const specPath = join(workspaceRoot, "apps/web/e2e/specs/api/auth-regression.spec.ts");

    assert.equal(existsSync(specPath), true);

    const spec = readFileSync(specPath, "utf8");
    for (const requiredScenario of [
      "credentials login uses the real Auth.js callback",
      "malformed Bearer authorization header never returns a server error",
      "two-factor credentials login rejects missing or incorrect second factor and accepts a valid one",
      "session revocation invalidates an already issued Auth.js session",
      "desktop OAuth handoff creates a one-time desktop claim URL",
      "Google and GitHub OAuth remain tied to verified provider email",
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
      "pnpm.cmd view next-auth dist-tags",
      "pnpm.cmd view next-auth versions",
      "5.0.0-beta.32",
      "@auth/prisma-adapter@2.11.3",
      "@auth/core@0.41.3",
      "github.com/nextauthjs/next-auth/releases/tag/next-auth%405.0.0-beta.32",
      "pnpm audit --audit-level moderate --json",
      "stable 5.0.0",
      "pnpm.cmd --filter @wizards/web e2e:api",
      "v4 downgrade",
      "alternative auth library",
    ]) {
      assert.match(runbook, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });
});

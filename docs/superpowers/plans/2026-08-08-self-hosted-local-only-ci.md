# Self-Hosted Local-Only CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove GitHub-hosted runner scheduling and retain only jobs executable on registered local Linux runners.

**Architecture:** `ci.yml` routes every surviving job to one of two capability-scoped Linux runner labels. Windows/macOS-only workflows are deleted rather than queued on unavailable labels or falsely reported as releases. Workflow contract tests scan all remaining workflow definitions for this invariant.

**Tech Stack:** GitHub Actions YAML, Node.js built-in test runner, actionlint.

## Global Constraints

- Only `[self-hosted, linux, x64, ci-fast]`, `[self-hosted, linux, x64, wizards-ci]`, and `[self-hosted, Linux, X64, mobile-release]` runner lists are valid.
- Persistent runners must not execute pull-request code.
- No Windows/macOS native artifacts, signature, release publication, or GitHub-hosted fallback remains.
- Preserve action SHA pins, permissions, secrets, and mobile release guards.

---

### Task 1: Encode Local-Only Runner Contract

**Files:**

- Modify: `scripts/quality/desktop-ops-workflow-contract.test.mjs:43-107`
- Modify: `scripts/quality/runtime-toolchain-contract.test.mjs:286-382`
- Modify: `apps/desktop/scripts/cargo-audit-ci-contract.test.mjs:27-71`
- Modify: `apps/desktop/scripts/release-ops.mjs:209-314`
- Modify: `apps/desktop/scripts/release-ops.test.mjs:127-173`
- Delete: `.github/workflows/desktop-native-build.yml`
- Delete: `.github/workflows/desktop-release.yml`
- Delete: `apps/desktop/scripts/desktop-native-build-ci-contract.test.mjs`

**Interfaces:**

- Consumes: `.github/workflows/*.yml` runner definitions.
- Produces: a test contract rejecting hosted runner labels and deleted native-only workflow names.

- [ ] **Step 1: Write the failing test**

```js
assert.doesNotMatch(
  workflowSource,
  /(?:ubuntu-(?:latest|\\d+\\.\\d+)|windows-latest|macos-latest)/u,
);
assert.equal(existsSync(join(workflowsDirectory, "desktop-native-build.yml")), false);
assert.equal(existsSync(join(workflowsDirectory, "desktop-release.yml")), false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs`

Expected: FAIL because the two desktop workflows and GitHub-hosted runner labels still exist.

- [ ] **Step 3: Write minimal implementation**

```yaml
node22-compatibility:
  if: github.event_name == 'workflow_dispatch'
  runs-on: [self-hosted, linux, x64, wizards-ci]
```

Remove `desktop_hosted`, Windows/macOS matrix entries, and both native-only workflow files. Convert Node 22 shell steps to Bash with `set -euo pipefail`; remove hosted cache assumptions.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/desktop-native-build.yml .github/workflows/desktop-release.yml scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs
git commit -m "ci: require local Linux runners"
```

### Task 2: Validate Workflow Surface

**Files:**

- Modify: `docs/superpowers/specs/2026-08-08-self-hosted-local-only-ci-design.md`
- Create: `docs/superpowers/plans/2026-08-08-self-hosted-local-only-ci.md`
- Modify: `apps/desktop/RELEASE.md`
- Modify: `apps/desktop/README.md`
- Modify: `docs/desktop/desktop-native-evolution.md`
- Modify: `docs/operations/desktop-linux-gtk3-rustsec-risk.md`
- Modify: `docs/development/windows-onboarding.md`

**Interfaces:**

- Consumes: all remaining `.github/workflows/*.yml` files.
- Produces: actionlint-clean, local-only workflow definitions and refreshed Graphify topology.

- [ ] **Step 1: Run workflow lint**

Run: `pnpm.cmd actionlint`

Expected: PASS; every workflow syntax and expression is valid.

- [ ] **Step 2: Run relevant toolchain contracts**

Run: `pnpm.cmd test:toolchain`

Expected: PASS; runner routing, action pins, Node policy, and trusted-runner guards remain valid.

- [ ] **Step 3: Check diff integrity**

Run: `git diff --check`

Expected: PASS with no whitespace errors.

- [ ] **Step 4: Refresh graph**

Run: `graphify update .`

Expected: graph update exits successfully; generated graph changes remain unstaged unless separately requested.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-08-self-hosted-local-only-ci-design.md docs/superpowers/plans/2026-08-08-self-hosted-local-only-ci.md
git commit -m "docs(ci): record local-only CI limits"
```

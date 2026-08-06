# Self-Hosted Hybrid CI Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route automatic Linux CI and Mobile Release to the existing self-hosted virtual-machine runners without losing optional Windows/macOS native coverage.

**Architecture:** Workflow jobs are assigned by capability labels: `wizards-ci` for Docker/heavy Linux work, `ci-fast` for lightweight contracts, and `mobile-release` for protected Android publication. Persistent runners reject pull-request events; Windows/macOS native jobs keep their explicit hosted runners.

**Tech Stack:** GitHub Actions YAML, Node.js `node:test` workflow contracts, actionlint, Graphify.

## Global Constraints

- Do not commit or push in this task.
- Preserve APK signing, immutable R2 publication, release registration, and scrubbing behavior.
- Never execute pull-request code on persistent self-hosted runners.
- Keep optional Windows/macOS native checks GitHub-hosted.
- Use only registered labels: `wizards-ci`, `ci-fast`, `mobile-release`.

---

### Task 1: Lock runner contracts

**Files:**

- Modify: `apps/mobile/scripts/mobile-release-workflow.test.mjs`
- Modify: `scripts/quality/runtime-toolchain-contract.test.mjs`
- Modify: `scripts/quality/desktop-ops-workflow-contract.test.mjs`
- Modify: `scripts/quality/semgrep-ci-contract.test.mjs`

**Interfaces:**

- Consumes: workflow YAML files and actionlint configuration.
- Produces: executable assertions for runner labels, PR isolation, cache policy, and hosted-only step removal.

- [ ] **Step 1: Change assertions to the approved self-hosted mapping**

  Require four `mobile-release` jobs, heavy `wizards-ci` jobs, lightweight `ci-fast` jobs, and pull-request isolation on persistent runners.

- [ ] **Step 2: Run focused tests and verify RED**

  Run: `node --test apps/mobile/scripts/mobile-release-workflow.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/semgrep-ci-contract.test.mjs`

  Expected: FAIL because workflows still select GitHub-hosted Ubuntu and include hosted-only APK disk reclamation.

### Task 2: Restore CI runner routing

**Files:**

- Modify: `.github/actionlint.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/mobile-redesign-device-gate-nightly.yml`

**Interfaces:**

- Consumes: registered runner labels and CI event metadata.
- Produces: protected-branch/schedule/dispatch Linux jobs routed to local VMs; optional Windows/macOS jobs unchanged.

- [ ] **Step 1: Restore actionlint label declarations**

  Declare `wizards-ci`, `playwright`, `ci-fast`, and `mobile-release` as accepted self-hosted labels.

- [ ] **Step 2: Route Linux jobs by capability**

  Use `wizards-ci` for heavy/Docker jobs, `ci-fast` for lightweight jobs, and the historical `ci-fast` default Desktop Ops matrix entry.

- [ ] **Step 3: Enforce persistent-runner trust boundary**

  Self-hosted jobs run only when `github.event_name != 'pull_request'`. Preserve existing job-specific conditions by combining them with this predicate.

- [ ] **Step 4: Remove hosted-only Linux setup**

  Restore `package-manager-cache: false` and remove the hosted Ubuntu Tauri package installation step from automatic Desktop Ops.

### Task 3: Restore Mobile Release runner routing

**Files:**

- Modify: `.github/workflows/mobile-release.yml`

**Interfaces:**

- Consumes: protected mobile UAT environment, dedicated `mobile-release` runner, persistent Android/Gradle toolchain.
- Produces: unchanged signed OTA/APK publication executed on the local release VM.

- [ ] **Step 1: Route all four jobs to the dedicated runner**

  Use `[self-hosted, Linux, X64, mobile-release]` for preflight, contract, OTA, and APK jobs.

- [ ] **Step 2: Remove hosted-only disk mutation**

  Delete the tool-cache/system-directory reclamation step and the GitHub-hosted scratch environment step.

- [ ] **Step 3: Restore persistent build scratch**

  Build under `$RUNNER_TEMP/eas-local-build`, retain disk telemetry, and preserve the existing artifact/signing/publication chain.

### Task 4: Verify implementation

**Files:**

- Update generated Graphify outputs through the repository command.

**Interfaces:**

- Consumes: completed workflow and contract changes.
- Produces: local verification evidence; no remote CI claim.

- [ ] **Step 1: Run focused workflow contracts**

  Run the four Node test files from Task 1. Expected: PASS.

- [ ] **Step 2: Run repository workflow gates**

  Run: `corepack pnpm actionlint` and `corepack pnpm test:toolchain`. Expected: PASS.

- [ ] **Step 3: Refresh Graphify**

  Run: `graphify update .`. Expected: exit `0`; generated topology changes are reviewed separately from workflow source changes.

- [ ] **Step 4: Validate final diff**

  Run: `git diff --check`, inspect `git status --short`, and confirm no hosted-only Linux runner remains in automatic Linux jobs.

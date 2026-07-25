# Index-Accurate ESLint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch staged web ESLint failures locally without linting working-tree content by mistake.

**Architecture:** `staged-eslint.mjs` snapshots index files and web flat-config inputs beneath the repository, loads ESLint with the snapshot web directory as CWD, and reports diagnostics using original repository-relative paths. `Fast` invokes it after the existing staged formatter. Notification push data remains a separate nested payload.

**Tech Stack:** Node.js test runner, ESLint 10 flat config, TypeScript, PowerShell local gate.

## Global Constraints

- Preserve index-only validation semantics.
- Do not modify Git configuration or add dependencies.
- Keep push lookup keyed by `userId` after `skipDuplicates`.

---

### Task 1: Specify and test lint semantics

**Files:**

- Modify: `apps/web/scripts/eslint-config.test.mjs`
- Create: `scripts/quality/staged-eslint.test.mjs`

- [x] Add failing assertions for underscore ignore options and staged source/config divergence.
- [x] Run the focused Node tests and observe failures before implementation.

### Task 2: Implement index-accurate staged lint

**Files:**

- Create: `scripts/quality/staged-eslint.mjs`
- Modify: `apps/web/eslint.config.mjs`
- Modify: `apps/web/src/lib/workspace/message-notification-service.ts`

- [x] Materialize staged files and required web config inputs under a repository child temporary directory.
- [x] Run ESLint against snapshot paths, map diagnostics back to repository paths, and clean up on success or failure.
- [x] Make the unused-value policy explicit and split database notification fields from `pushBody`.
- [x] Run focused tests and web lint.

### Task 3: Wire gate and document behavior

**Files:**

- Modify: `scripts/quality/local-gate-profiles.json`
- Modify: `scripts/quality/Invoke-LocalGate.ps1`
- Modify: `scripts/quality/local-gate-contract.test.mjs`
- Modify: `docs/development/local-quality-gates.md`

- [x] Allowlist and invoke staged ESLint from `Fast`.
- [x] Update command-contract tests and remove stale Standard-blocked guidance.
- [x] Run toolchain tests, Fast, Standard, root lint, then update the source graph.

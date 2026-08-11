# CircleCI Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every CircleCI protected-branch job pass reliably without weakening security or hiding resource leaks.

**Architecture:** Encode CI resource and privilege assumptions in executable contract tests, then make the smallest configuration and lifecycle changes that satisfy them. Browser/system tooling belongs in one immutable image; project jobs remain unprivileged and deterministic.

**Tech Stack:** CircleCI 2.1, Docker/BuildKit, pnpm 11, Node.js 24, Next.js 16, Playwright 1.61, Jest 29, Rust/cargo-audit, gitleaks 8.30.

## Global Constraints

- Preserve the user's dirty `uat` checkout; work only in `codex/circleci-fixes`.
- Keep image references digest-pinned and retain GHCR authentication boundaries.
- Keep full-history gitleaks coverage and redaction.
- Never use Jest `--forceExit` as a CI fix.
- Publish only the verified image and narrow CI-fix commit authorized by the user.

---

### Task 1: CI contract regressions

**Files:**

- Modify: `scripts/quality/circleci-config-contract.test.mjs`
- Test: `scripts/quality/circleci-config-contract.test.mjs`

- [ ] Add contract cases for the 4 GiB coverage heap, four Next workers, production E2E server, image-provided browsers, bounded gitleaks heartbeat, direct cargo-audit version check, and absence of Jest force-exit.
- [ ] Run `node --test scripts/quality/circleci-config-contract.test.mjs`; verify failures name the missing protections.

### Task 2: Deterministic Node and web jobs

**Files:**

- Modify: `.circleci/main.yml`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/package.json`

- [ ] Add `NODE_OPTIONS=--max-old-space-size=4096` only to coverage.
- [ ] Set `experimental.cpus` to four.
- [ ] Set the Playwright child server to production and make `e2e:web-server` build Next plus the custom server before startup.
- [ ] Run the contract test and a production web build.

### Task 3: Immutable browser and scanner tooling

**Files:**

- Modify: `docker/ci/Dockerfile`
- Modify: `.circleci/main.yml`
- Modify: `scripts/quality/circleci-config-contract.test.mjs`

- [ ] Install Chromium, Firefox, and WebKit with system dependencies in the golden image.
- [ ] Remove runtime Playwright browser installation and its workflow parameter.
- [ ] Wrap gitleaks in a 30-minute timeout with periodic non-sensitive heartbeat output and exact exit propagation.
- [ ] Verify contract tests.

### Task 4: Desktop and mobile process lifecycle

**Files:**

- Modify: `.circleci/main.yml`
- Modify: the mobile test or resource owner identified by `--detectOpenHandles`
- Test: nearest mobile component test

- [ ] Use `cargo-audit --version` for the pinned version check.
- [ ] Reproduce the mobile non-exit from the clean UAT tree, identify the owning resource, add a failing lifecycle test, and implement cleanup.
- [ ] Run the focused test and full component suite without `--forceExit`.

### Task 5: Golden image publication

**Files:**

- Modify: `docker/ci/IMAGE`
- Modify: `.circleci/main.yml`

- [ ] Build the image with pinned build arguments from `docker/ci/README.md`.
- [ ] Run non-root smoke checks for Node, pnpm, cargo-audit, gitleaks, Chromium, Firefox, and WebKit.
- [ ] Push the immutable image to GHCR, resolve its registry digest, and update both pinned references.
- [ ] Re-run contract tests.

### Task 6: Delivery and remote proof

**Files:**

- All files above only.

- [ ] Run focused tests, CircleCI config validation, formatting, and relevant builds.
- [ ] Run `graphify update .` and inspect only CI-fix diffs.
- [ ] Commit with a narrow conventional commit, push `HEAD:uat`, and monitor every CircleCI job.
- [ ] For any remaining failure, read the exact step log, add regression coverage, fix, verify, and repeat until the latest pipeline is green.

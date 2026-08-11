# CircleCI Path Filtering PEP 668 Fix Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `resolve-changed-paths` avoid the Python/PEP 668 failure by pinning the shell-based path-filtering orb.

**Architecture:** Keep the existing CircleCI setup pipeline and mapping unchanged. Replace only the exact orb version contract from `1.3.0` to compatibility-preserving `2.1.0`, then update the phase report with the verified resolution.

**Tech Stack:** CircleCI config, Node.js built-in test runner, Graphify.

---

### Task 1: Pin the shell-based path-filtering orb

**Files:**

- Modify: `scripts/quality/circleci-config-contract.test.mjs`
- Modify: `.circleci/config.yml`
- Modify: `docs/prompts/cicd-circleci-2026-08/raporlar/01-rapor.md`

1. Change the contract test to require exact `circleci/path-filtering@2.1.0`.
2. Run the focused test and confirm it fails against `1.3.0`.
3. Update the setup config pin to `2.1.0` and revise the report's version/S8 evidence.
4. Run the focused contract test and available local CircleCI validation.
5. Run `graphify update .`, inspect the final diff, and report remote rerun as not run until push.

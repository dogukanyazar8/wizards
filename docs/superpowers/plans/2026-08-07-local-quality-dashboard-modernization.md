# Local Quality Dashboard Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagent execution is disabled by repository-session policy. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the Whispr local quality dashboard and add persisted, source-aware FAIL/BLOCKED diagnostics.

**Architecture:** Add one focused diagnostic module, let the coordinator attach bounded issues to profile results, persist/read those results through the existing store, and render them in a redesigned static dashboard. The server continues to expose only fixed loopback routes and serves the canonical Whispr logo from its existing repository asset.

**Tech Stack:** Node.js ESM, Windows PowerShell 5.1, HTML/CSS/vanilla JavaScript, Node test runner, Playwright Chromium, axe-core.

## Global Constraints

- Bind only to `127.0.0.1`; preserve Host, Origin, token, CSP, allowlist, body-size, capability, and redaction controls.
- Store at most eight repository-relative source references and a bounded redacted excerpt per issue.
- Never serve source file content or execute a displayed command/path.
- Default issue filter is `FAIL`; `BLOCKED` is a separate tab.
- Use `apps/web/public/app-icons/whispr.png` as the single logo source.
- Preserve unrelated dirty UAT work; do not stage, commit, push, reset, clean, or stash.

---

### Task 1: Diagnostic extraction contract

**Files:**

- Create: `tools/local-quality-dashboard/diagnostics.mjs`
- Create: `tools/local-quality-dashboard/diagnostics.test.mjs`

**Interfaces:**

- Produces: `createSourceReferenceExtractor(repositoryRoot)`, `createProfileDiagnosticState()`, `recordDiagnosticLog(state, line, extractSources)`, `recordDiagnosticEvent(state, event)`, and `finalizeProfileIssues(state, outcome)`.
- Issue shape: `{ id, status, stepId, reason, command, exitCode, nextAction, sources, excerpt }`.

- [ ] Write failing tests proving TypeScript/Rust/PowerShell-style `path:line:column` references are normalized to repo-relative paths, outside-root/missing files are rejected, sources are deduplicated/capped, and excerpts are bounded.
- [ ] Run `node --test tools/local-quality-dashboard/diagnostics.test.mjs`; verify missing-module/test failures.
- [ ] Implement pure source extraction and bounded diagnostic state. Prefer structured event `detail`, then blocked precondition detail, then latest error-like log line, then deterministic exit-code copy.
- [ ] Run focused test; require all PASS.
- [ ] Review checkpoint: no commit.

### Task 2: Coordinator issue capture

**Files:**

- Modify: `tools/local-quality-dashboard/coordinator.mjs`
- Modify: `tools/local-quality-dashboard/coordinator.test.mjs`
- Modify: `tools/local-quality-dashboard/server.mjs`

**Interfaces:**

- Consumes Task 1 diagnostic functions.
- Produces `profiles[].issues` in every public run snapshot.

- [ ] Add failing coordinator tests for failed-step diagnostics, blocked precondition diagnostics, runner exceptions, source references, and persistence without verdict mutation.
- [ ] Run focused coordinator tests; verify new assertions fail.
- [ ] Initialize diagnostic state per profile, feed redacted log/event data into it, append issues before `profile.completed`, and provide the production repository-root extractor from `main()`.
- [ ] Extend deterministic browser runner with a stable failure detail and an existing repo source reference so browser tests exercise the real pipeline.
- [ ] Run coordinator/server unit tests; require PASS.
- [ ] Review checkpoint: no commit.

### Task 3: Persistence, history API, canonical logo

**Files:**

- Modify: `tools/local-quality-dashboard/store.mjs`
- Modify: `tools/local-quality-dashboard/store.test.mjs`
- Modify: `tools/local-quality-dashboard/server.mjs`
- Modify: `tools/local-quality-dashboard/server.test.mjs`

**Interfaces:**

- Produces: `store.readResult(runId)` and compact `store.listRecent(limit)` entries.
- `GET /api/runs/:id` returns `{ run, replayable }` using coordinator memory first, persisted result second.
- `GET /assets/whispr-logo.png` returns the canonical PNG through a fixed route.

- [ ] Add failing store tests for redacted issue persistence, Markdown diagnostics, compact history, valid result reads, corrupt/missing result handling.
- [ ] Add failing HTTP tests for persisted fallback, replayability, PNG content type/content bytes, and unchanged security headers.
- [ ] Implement validated result reading, compact history projection, Markdown issue details, fixed logo route, and persisted API fallback.
- [ ] Run store/server tests; require PASS.
- [ ] Review checkpoint: no commit.

### Task 4: Modern command-center UI and issue inbox

**Files:**

- Modify: `tools/local-quality-dashboard/public/index.html`
- Modify: `tools/local-quality-dashboard/public/dashboard.css`
- Modify: `tools/local-quality-dashboard/public/app.js`
- Modify: `tools/local-quality-dashboard/public-contract.test.mjs`

**Interfaces:**

- Consumes `profiles[].issues`, `{ run, replayable }`, compact recent history, and `/assets/whispr-logo.png`.
- Produces accessible FAIL/BLOCKED filtering, issue cards, copy controls, expandable excerpts, and selectable history.

- [ ] Add failing static-contract assertions for canonical logo markup, semantic issue tabs/panel, source/evidence containers, history buttons, safe DOM APIs, visible focus, responsive rules, and reduced motion.
- [ ] Run `node --test tools/local-quality-dashboard/public-contract.test.mjs`; verify failures.
- [ ] Restructure HTML into topbar, hero/actions, summary, profiles + issue inbox, live log + history. Keep existing IDs required by controller/tests.
- [ ] Render issue cards with `textContent`/`replaceChildren` only. Default to FAIL, keep BLOCKED separate, display deterministic empty states, disable historical failed-only rerun when `replayable` is false, and copy displayed evidence without execution.
- [ ] Replace legacy visual layer with responsive Whispr glass surfaces, canonical logo, clearer hierarchy, status accents, sticky actions, accessible focus, theme parity, and reduced-motion behavior.
- [ ] Run public contract and all dashboard unit tests; require PASS.
- [ ] Review checkpoint: no commit.

### Task 5: Browser acceptance, docs, and graph

**Files:**

- Modify: `apps/web/e2e/local-quality-dashboard/quality-dashboard.spec.ts`
- Modify: `docs/development/local-quality-gates.md`
- Modify: `graphify-out/*` through `graphify update` only.

**Interfaces:**

- Verifies the complete loopback dashboard behavior.

- [ ] Add browser assertions for real logo load, modern shell, default FAIL inbox, failure reason/command/source/evidence, BLOCKED tab, history selection, rerun availability, keyboard focus, dark/light persistence, responsive layout, reduced motion, and axe WCAG.
- [ ] Run browser suite; diagnose any regression before editing implementation.
- [ ] Update local dashboard documentation with issue inbox, source-boundary, and historical-run behavior.
- [ ] Run Prettier, ESLint, `corepack pnpm test:quality-dashboard`, `corepack pnpm test:quality-dashboard:browser`, local-gate contract tests, and `git diff --check`.
- [ ] Run `graphify update C:\Users\doguk\Desktop\Wizards`; verify dashboard files exist in `graphify-out/graph.json`.
- [ ] Final self-review: security boundaries, bounded data, no unrelated edits, no commit/push.

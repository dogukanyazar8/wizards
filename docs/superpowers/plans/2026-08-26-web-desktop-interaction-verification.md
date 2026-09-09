# Web/Desktop Interaction Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce fresh, separated evidence that the five approved interaction-parity packages work together in Web and the Tauri desktop WebView.

**Architecture:** Verify narrow behavior first, then static project gates, then browser/desktop acceptance. Keep test, browser, Tauri, Graphify, and dirty-worktree evidence separate.

**Tech Stack:** Node 24, pnpm 11, TypeScript, ESLint, Playwright, Tauri 2, Graphify.

**Spec:** `docs/superpowers/specs/2026-08-26-web-desktop-interaction-parity-design.md`

## Global Constraints

- No test may reset, seed, migrate, deploy, stop an existing service, or mutate live/UAT data without separate authorization.
- Preserve unrelated dirty-worktree changes.
- Report `PASS`, `FAIL`, `NOT RUN`, and `ENV BLOCKED` separately.
- No commit, push, PR, or publish.

---

### Task 1: Focused automated regression gate

**Files:**

- Test only the files named in the five implementation plans.
- No production modification unless a focused failure proves an in-scope defect.

**Interfaces:**

- Consumes: all five completed implementation plans.
- Produces: exact pass/fail counts per subsystem.

- [ ] **Step 1: Run message and search tests**

Run the double-click helper, message-item contracts, composer contract, server-channel frame, search panel, and setting-select tests in one Web `tsx --test` command.

- [ ] **Step 2: Run channel form tests**

Run workspace label, workspace schema, create-channel modal, advanced-settings, locale copy, and modal-focus tests.

- [ ] **Step 3: Run voice tests**

Run server voice surface, voice presentation, screen-share/store, and settings navigation contract tests.

- [ ] **Step 4: Run role and cursor tests**

Run permission-groups, role-editor, channels/roles section, cursor policy, and server rail cursor tests.

### Task 2: Static project gates

**Files:**

- No source modification expected.

**Interfaces:**

- Produces: current-checkout type, lint, formatting, and diff evidence.

- [ ] **Step 1: Run Web typecheck**

Run: `pnpm.cmd --filter @wizards/web typecheck`

- [ ] **Step 2: Run scoped lint**

Run ESLint only over task-modified source/test files first. Run the package lint only if scoped lint is green and existing WIP does not make attribution ambiguous.

- [ ] **Step 3: Run formatting and whitespace gates**

Run `pnpm.cmd --filter @wizards/web format`, then `git diff --check`. Inspect the resulting task-file diff; do not accept changes outside task scope.

### Task 3: Browser and desktop acceptance

**Files:**

- No source modification expected unless acceptance reproduces an in-scope defect.

**Interfaces:**

- Produces: Web browser and Tauri evidence separated by platform.

- [ ] **Step 1: Confirm a safe local runtime**

Check whether the Web server is already running and whether it is user-owned. Do not stop or replace an existing process without approval.

- [ ] **Step 2: Web acceptance**

Verify category copy; TEXT/VOICE modal geometry; preserved channel spaces/case; channel/DM/group double-click reply exclusions; search listboxes; voice control placement/icon/share layout/quality menu/settings navigation; role collapse/select-all; and cursors in light and dark themes.

- [ ] **Step 3: Desktop acceptance**

Launch Tauri only when the Web runtime and native prerequisites are available. Repeat cursor, modal, message, and voice navigation checks in the desktop WebView.

- [ ] **Step 4: Accessibility acceptance**

Keyboard-check every new listbox, popover, collapse trigger, tri-state group control, and existing Reply action. Confirm focus visibility and Escape behavior.

### Task 4: Graph and final audit

**Files:**

- Update generated graph only through `graphify update .`.

**Interfaces:**

- Produces: graph-update status, exact task diff, and requirement checklist.

- [ ] **Step 1: Update Graphify**

Run `graphify update .`. If the known Windows lock/hang recurs, terminate only the spawned Graphify process and report `ENV BLOCKED`; do not alter graph files manually.

- [ ] **Step 2: Audit requirements against the approved spec**

Check every heading in `2026-08-26-web-desktop-interaction-parity-design.md` against source and test evidence.

- [ ] **Step 3: Report exact state**

List modified task files, focused counts, typecheck/lint status, Web/Tauri visual status, Graphify status, and any source-verified unsupported messaging action. Do not imply unrun evidence.

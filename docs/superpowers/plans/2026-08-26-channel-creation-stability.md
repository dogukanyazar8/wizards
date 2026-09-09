# Channel Creation Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct category drop copy, preserve human-readable channel names, and keep create-channel modal geometry stable across type changes.

**Architecture:** Keep current schemas and normalizer. Fix misleading copy and constrain only the modal body geometry; the variable advanced-settings content scrolls internally.

**Tech Stack:** React 19, TypeScript, Zod, Tailwind CSS 4, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-web-desktop-interaction-parity-design.md`

## Global Constraints

- Name policy remains 1–48 characters with Unicode letters/numbers, spaces, `_`, and `-`.
- Preserve case and spaces; normalize only NFC, edge whitespace, repeated whitespace, and unsupported characters.
- No schema, database, dependency, or API expansion.
- Preserve unrelated dirty-worktree changes; no commit/push.

---

### Task 1: Category drop copy and channel-name contract

**Files:**

- Modify: `apps/web/src/lib/locale/messages/tr.ts`
- Modify: `apps/web/src/lib/locale/messages/en.ts`
- Modify: `apps/web/src/components/servers/modals/create-channel-modal.test.tsx`
- Modify: `packages/types/src/workspace.test.ts`
- Create: `apps/web/src/lib/workspace/workspace-label.test.ts`

**Interfaces:**

- Consumes: `normalizeWorkspaceLabel(value, 48)` and `CreateChannelSchema`.
- Produces: exact TR/EN drop and name-help copy.

- [ ] **Step 1: Write failing copy and normalization tests**

```ts
assert.equal(normalizeWorkspaceLabel("  Proje   Ekibi  "), "Proje Ekibi");
assert.equal(CreateChannelSchema.parse({ name: "Proje Ekibi", type: "TEXT" }).name, "Proje Ekibi");
```

Assert exact TR copy `Kanalları buraya sürükleyip bırakabilirsin` and an equivalent EN sentence.

- [ ] **Step 2: Run and verify RED**

Run the three focused test files. Expected: locale assertion fails on current copy; helper-copy assertion fails on the tire claim.

- [ ] **Step 3: Apply copy-only correction**

Update `shell.channelSidebar.dropChannelsHere` and channel-name help text. Do not alter schema/normalizer unless a failing approved contract proves divergence.

- [ ] **Step 4: Run and verify GREEN**

Run the same focused tests.

### Task 2: Stable create-channel modal geometry

**Files:**

- Modify: `apps/web/src/components/servers/modals/server-modal-shell.tsx`
- Modify: `apps/web/src/components/servers/modals/create-channel-modal.tsx`
- Modify: `apps/web/src/components/servers/modals/create-channel-modal.test.tsx`
- Modify: `apps/web/src/lib/servers/metrics.ts`

**Interfaces:**

- Produces: create-channel-specific stable body height with `overflow-y:auto`.
- Preserves: generic modal sizing for all other server modals.

- [ ] **Step 1: Add a failing geometry contract test**

Render TEXT and VOICE variants and assert the same outer geometry token/class, stable footer, and scrollable advanced region.

- [ ] **Step 2: Run and verify RED**

Run `create-channel-modal.test.tsx`. Expected: type variants expose different content-driven height.

- [ ] **Step 3: Implement the smallest modal-specific geometry**

Add a create-channel body metric and apply it only to the create-channel modal. Keep the shell width at 660px and move overflow to the body, not the page or footer.

- [ ] **Step 4: Run and verify GREEN**

Run create-channel, advanced-settings, and modal-focus contract tests; inspect light/dark DOM styles.

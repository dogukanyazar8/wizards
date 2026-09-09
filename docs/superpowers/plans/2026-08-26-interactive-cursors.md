# Interactive Cursor Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Web/Desktop semantic actions use the same pointer cursor while retaining truthful disabled and drag cursors.

**Architecture:** Add one Tailwind base-layer semantic cursor policy and remove the server rail’s resting `grab` override. Explicit component utilities continue to override the base layer for genuine drag/wait/disabled states.

**Tech Stack:** Tailwind CSS 4, React 19, Framer Motion, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-web-desktop-interaction-parity-design.md`

## Global Constraints

- Do not assign pointer to arbitrary `div`/`span` containers.
- Disabled controls and genuine drag handles keep truthful cursors.
- Web and Tauri consume the same stylesheet; no desktop-native cursor patch.
- Preserve unrelated dirty-worktree changes; no commit/push.

---

### Task 1: Semantic base cursor policy

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/lib/appearance/cursor-policy.test.ts`

**Interfaces:**

- Produces: base-layer pointer selectors for enabled buttons, `a[href]`, enabled selects, and explicit enabled button roles.

- [ ] **Step 1: Write a failing stylesheet contract test**

Assert the base rule exists, excludes disabled/`aria-disabled=true`, and does not include bare `div` or `span` selectors.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm.cmd --filter @wizards/web exec tsx --test src/lib/appearance/cursor-policy.test.ts`

Expected: FAIL because no shared semantic pointer rule exists.

- [ ] **Step 3: Add the minimal Tailwind base rule**

```css
@layer base {
  button:not(:disabled),
  a[href],
  select:not(:disabled),
  [role="button"]:not([aria-disabled="true"]) {
    cursor: pointer;
  }
}
```

Do not add a global disabled rule that would override existing `wait` states.

- [ ] **Step 4: Run and verify GREEN**

Run the cursor policy test and `git diff --check`.

### Task 2: Server rail resting cursor

**Files:**

- Modify: `apps/web/src/components/shell/server-rail.tsx`
- Create: `apps/web/src/components/shell/server-rail-cursor.test.ts`

**Interfaces:**

- Produces: `cursor-pointer` at rest and `cursor-grabbing` only for the actively reordered server.

- [ ] **Step 1: Write the failing rail contract test**

Assert the server icon class contains the approved two-state expression and no resting `cursor-grab`.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL on the current `cursor-grab` branch.

- [ ] **Step 3: Change only the resting class**

```tsx
draggingServerId === server.id ? "cursor-grabbing" : "cursor-pointer";
```

Keep Framer Motion reorder behavior and drag feedback unchanged.

- [ ] **Step 4: Run and verify GREEN**

Run cursor tests, relevant server rail/shell tests, Web typecheck, and lint.

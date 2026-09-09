# Role Permission Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe select-all and collapse controls to each categorized role permission group.

**Architecture:** Extend the existing pure permission-group model with group toggle helpers, then keep collapse state local to each card. Preserve unknown permissions and all owner/protected-role constraints.

**Tech Stack:** React 19, TypeScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-web-desktop-interaction-parity-design.md`

## Global Constraints

- Never add, expose, or grant a permission key that is not already in the approved group model.
- Preserve invisible permission keys in every update.
- `alwaysOn`, owner-only, protected-role, and `MANAGE_ROLES` rules remain authoritative.
- Expanded state is presentation-only and not persisted.
- Preserve unrelated dirty-worktree changes; no commit/push.

---

### Task 1: Pure group-selection semantics

**Files:**

- Modify: `apps/web/src/lib/servers/permission-groups.ts`
- Modify: `apps/web/src/lib/servers/permission-groups.test.ts`
- Modify: `apps/web/src/lib/servers/role-editor.ts`
- Modify: `apps/web/src/lib/servers/role-editor.test.ts`

**Interfaces:**

- Produces: `getPermissionGroupSelection(groupId, permissions, isOwner): "all" | "mixed" | "none"`.
- Produces: `setPermissionGroupSelection(permissions, groupId, selected, isOwner): WorkspacePermissionKey[]`.

- [ ] **Step 1: Write failing pure tests**

Cover all/mixed/none, always-on exclusion, non-owner management group, owner administrator inclusion, and preservation of unknown keys such as `BAN_MEMBERS`.

- [ ] **Step 2: Run and verify RED**

Run permission-group and role-editor tests. Expected: helper exports missing.

- [ ] **Step 3: Implement minimal set operations**

```ts
const editableKeys = group.rows.flatMap((row) =>
  row.key && (!row.ownerOnly || isOwner) ? [row.key] : [],
);
```

Add/remove only `editableKeys`; preserve every other input permission.

- [ ] **Step 4: Run and verify GREEN**

Run the same focused tests.

### Task 2: Collapsible accessible group cards

**Files:**

- Modify: `apps/web/src/components/servers/shared/permission-group-card.tsx`
- Modify: `apps/web/src/components/shell/server-settings/sections/roles-section.tsx`
- Modify: `apps/web/src/components/shell/server-settings/sections/channels-roles-sections.test.tsx`
- Modify: `apps/web/src/lib/locale/messages/tr.ts`
- Modify: `apps/web/src/lib/locale/messages/en.ts`

**Interfaces:**

- Consumes: pure group selection helpers.
- Produces: local expanded state, `aria-expanded`, controlled body ID, tri-state checkbox/button, and select-all callback.

- [ ] **Step 1: Write failing component contracts**

Assert default expanded state, collapse/expand, mixed `aria-checked`, select/clear behavior, disabled protected roles, and hidden owner-only permission handling.

- [ ] **Step 2: Run and verify RED**

Run `channels-roles-sections.test.tsx`. Expected: group header lacks both controls.

- [ ] **Step 3: Implement header controls**

Keep the title as the collapse trigger and the selection control as a separate button/checkbox so one click cannot perform both actions. Preserve the existing selected/total count.

- [ ] **Step 4: Run and verify GREEN**

Run component and pure-model tests; then web typecheck for prop consistency.

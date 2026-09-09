# Message Parity and Search Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give server text channels the applicable shared DM/group messaging presentation and add safe double-click reply plus account-settings-style search selectors.

**Architecture:** Keep `ChatArea` as the orchestrator and `MessageItem` as the shared row. Add one pure double-click guard, expose only backend-supported actions per mode, and reuse `SettingSelect` rather than cloning its listbox behavior.

**Tech Stack:** React 19, TypeScript, TanStack Query, Socket.IO, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-web-desktop-interaction-parity-design.md`

## Global Constraints

- No new dependency or messaging protocol.
- Preserve server permission and read-only gates.
- Do not fake an action without a real server-channel consumer.
- Preserve unrelated dirty-worktree changes; no commit/push.

---

### Task 1: Safe message double-click reply

**Files:**

- Create: `apps/web/src/components/chat/message-item-interactions.ts`
- Create: `apps/web/src/components/chat/message-item-interactions.test.ts`
- Modify: `apps/web/src/components/chat/message-item.tsx`

**Interfaces:**

- Produces: `shouldReplyFromDoubleClick(target: EventTarget | null, selection: Selection | null): boolean`.
- Consumes: existing `MessageItemProps.onReply`.

- [ ] **Step 1: Write the failing interaction tests**

Test a plain message-body target returning `true`; interactive descendants and non-collapsed selection returning `false`.

```ts
assert.equal(shouldReplyFromDoubleClick(body, collapsedSelection), true);
assert.equal(shouldReplyFromDoubleClick(link, collapsedSelection), false);
assert.equal(shouldReplyFromDoubleClick(body, selectedText), false);
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm.cmd --filter @wizards/web exec tsx --test src/components/chat/message-item-interactions.test.ts`

Expected: FAIL because the module/export does not exist.

- [ ] **Step 3: Implement the minimal guard**

```ts
const INTERACTIVE_TARGET = "a,button,input,textarea,select,[contenteditable]";

export function shouldReplyFromDoubleClick(
  target: EventTarget | null,
  selection: Selection | null,
) {
  if (selection && !selection.isCollapsed) return false;
  return target instanceof Element && !target.closest(INTERACTIVE_TARGET);
}
```

Bind the message-body double-click to the existing `onReply(message)` only when the message is replyable and the guard returns `true`.

- [ ] **Step 4: Run and verify GREEN**

Run the interaction test plus `message-item-contract.test.ts` and `message-item-memo.test.ts`.

### Task 2: Server-channel shared messaging capability audit and wiring

**Files:**

- Modify: `apps/web/src/components/chat/chat-area.tsx`
- Modify: `apps/web/src/components/chat/message-list.tsx`
- Modify: `apps/web/src/components/chat/message-input.tsx`
- Test: `apps/web/src/components/chat/server-channel-frame.test.tsx`

**Interfaces:**

- Consumes: existing `MessageList` callbacks and server permission flags.
- Produces: one explicit mode capability object for applicable message actions.

- [ ] **Step 1: Add failing server-channel parity assertions**

Assert that channel mode renders the shared message surface/composer, reply/thread/reaction controls, and only real server-supported pin/poll/forward actions. Assert locked/read-only channels still suppress mutations.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm.cmd --filter @wizards/web exec tsx --test src/components/chat/server-channel-frame.test.tsx`

Expected: FAIL on the currently omitted shared surface/action wiring.

- [ ] **Step 3: Implement minimal mode adapters**

Keep message rendering shared. Pass callbacks only where a concrete channel API/socket consumer exists. Wrap both modes with the same surface/composer primitives without moving server header/member/search responsibilities.

- [ ] **Step 4: Run and verify GREEN**

Run the server frame, composer contract, message item, and message list performance tests.

### Task 3: Settings-style advanced search selectors

**Files:**

- Modify: `apps/web/src/components/settings/rows/setting-select.tsx`
- Modify: `apps/web/src/components/chat/message-search-panel.tsx`
- Create: `apps/web/src/components/chat/message-search-panel.test.tsx`
- Test: `apps/web/src/components/settings/rows/setting-select.test.tsx`

**Interfaces:**

- Consumes: `SettingSelectOption` and `SettingSelect` controlled `value/onChange` contract.
- Produces: author/channel/date-range selectors with stable test IDs.

- [ ] **Step 1: Write failing search-selector tests**

Assert listbox role, selected option, Escape close, arrow navigation, and author/channel/date-range value propagation.

- [ ] **Step 2: Run and verify RED**

Run the new search panel test. Expected: FAIL because native `<select>` elements remain.

- [ ] **Step 3: Generalize only the required `SettingSelect` props**

Add optional label/test-id props without changing existing settings defaults. Replace the three native selects with controlled `SettingSelect` instances using existing filter values.

- [ ] **Step 4: Run and verify GREEN**

Run search panel and setting-select tests. Then run `git diff --check` on task files.

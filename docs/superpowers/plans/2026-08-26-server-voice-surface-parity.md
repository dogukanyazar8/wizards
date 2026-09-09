# Server Voice Surface Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the server voice-room reference layout, keep camera/share layouts stable, expose quality at stage top-right, and route settings to Ses ve Video.

**Architecture:** Keep LiveKit/provider state untouched. Correct composition between `VoiceChannelView` and the server voice primitives so only compact controls enter the stage overlay, while media panels remain in normal layout flow.

**Tech Stack:** React 19, TypeScript, LiveKit Client 2.21, Zustand, Framer Motion, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-web-desktop-interaction-parity-design.md`

## Global Constraints

- `Sunucu-referans.html` inline markup and measurements are authoritative.
- Reuse `SCREEN_SHARE_QUALITY_OPTIONS` and the persisted voice-store preference.
- No new capture, codec, API, migration, or dependency.
- Preserve unrelated dirty-worktree changes; no commit/push.

---

### Task 1: Reference controls and media-stage composition

**Files:**

- Modify: `apps/web/src/components/voice/server/server-voice-surface.tsx`
- Modify: `apps/web/src/components/voice/server/server-voice-surface.test.tsx`
- Modify: `apps/web/src/components/voice/voice-channel-view.tsx`

**Interfaces:**

- Produces: compact `ServerScreenShareStage` top-right controls.
- Preserves: normal-flow participant/media grids outside the absolute overlay.

- [ ] **Step 1: Write failing reference-contract tests**

Assert control order, post-stage placement, 44px buttons, 15px radius, exact camera SVG path, stage padding/gap, and no large panel inside `extraControls`.

- [ ] **Step 2: Run and verify RED**

Run `server-voice-surface.test.tsx`. Expected: camera path and stage composition assertions fail.

- [ ] **Step 3: Implement exact primitive/layout correction**

Replace the camera glyph with the reference `rect/path`. Pass only quality/fullscreen controls to `extraControls`; render media tiles and participant strip in normal flow. Keep control bar after the stage.

- [ ] **Step 4: Run and verify GREEN**

Run server voice surface and existing voice presentation tests.

### Task 2: Top-right quality popover and persisted start quality

**Files:**

- Modify: `apps/web/src/components/voice/voice-channel-view.tsx`
- Modify: `apps/web/src/components/voice/server/server-voice-surface.tsx`
- Modify: `apps/web/src/components/voice/server/server-voice-surface.test.tsx`
- Modify: `apps/web/e2e/specs/voice/voice.spec.ts`

**Interfaces:**

- Consumes: `SCREEN_SHARE_QUALITY_OPTIONS`, `screenShareQuality`, `setScreenShareQuality`.
- Produces: accessible top-right quality listbox/menu and compact selected-quality chip.

- [ ] **Step 1: Write failing popover tests**

Assert trigger label, current preset, menu option count/order, Escape close, keyboard selection, and `onQualityChange(option.id)`.

- [ ] **Step 2: Run and verify RED**

Run component tests. Expected: current side-panel native select does not satisfy top-right popover contract.

- [ ] **Step 3: Implement compact popover**

Reuse existing quality IDs and labels. Do not duplicate bitrate/frame-rate values. Remove the old side-panel quality select after the top-right control is functional.

- [ ] **Step 4: Verify store/provider flow**

Run focused store/screen-share tests proving a new share reads the current persisted `screenShareQuality` before publication.

### Task 3: Voice settings navigation

**Files:**

- Modify: `apps/web/src/components/voice/voice-channel-view.tsx`
- Modify: `apps/web/src/components/voice/room/voice-room-primitives.tsx`
- Modify: `apps/web/e2e/specs/voice/voice.spec.ts`

**Interfaces:**

- Consumes: `buildSettingsHref("av", "audio")`.
- Produces: settings gear navigation to `/settings/av/audio`.

- [ ] **Step 1: Change E2E/component expectation to the approved route and verify RED**

Expected: current local `VoiceSettingsModal` opens instead.

- [ ] **Step 2: Replace local modal ownership with settings navigation**

Use the existing app router/intercepting settings overlay. Remove dead local state/imports only where no remaining consumer exists.

- [ ] **Step 3: Run focused component, E2E-static contract, typecheck, and diff checks**

Report browser/LiveKit acceptance separately if the local runtime is unavailable.

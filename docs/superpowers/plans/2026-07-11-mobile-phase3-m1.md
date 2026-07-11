# Mobile Phase 3 M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 2 device evidence and replace the message copy/share placeholder with a real native clipboard action in the only Phase 3 native build.

**Architecture:** The message action remains owned by `MessagePreviewRow`; it invokes Expo Clipboard with message content and does not send content to a share sheet. The existing UAT build script remains the sole native build path, and all later Phase 3 work remains JavaScript-only.

**Tech Stack:** Expo SDK 56, expo-clipboard, React Native, Jest, Maestro, Android UAT dev client.

## Global Constraints

- Work directly on `uat`; create no branch or worktree.
- Add only `expo-clipboard` as an M1 native dependency.
- Never log copied message content, UAT credentials, 2FA material, or API secrets.
- Store device evidence under ignored `artifacts/mobile/phase2/closure/` only.

---

### Task 1: Lock the native clipboard contract

**Files:**
- Modify: `apps/mobile/component-tests/mobile-kit-overlays.test.tsx`
- Modify: `apps/mobile/src/app/components/message-primitives.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Write the failing component test**

```tsx
await fireEvent.press(view.getByLabelText(copy.messageCopyAction));
expect(Clipboard.setStringAsync).toHaveBeenCalledWith("Copy this message");
expect(Share.share).not.toHaveBeenCalled();
```

- [x] **Step 2: Run it red**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-kit-overlays.test.tsx`

Expected: FAIL because the action currently calls `Share.share`.

- [x] **Step 3: Add the SDK-compatible package and minimal implementation**

Run: `corepack pnpm --filter @wizards/mobile exec expo install expo-clipboard`.

Replace the copy action with `Clipboard.setStringAsync(message.content)` and retain the action only for non-empty message content.

- [x] **Step 4: Run it green and check Expo alignment**

Run:

```powershell
corepack pnpm --filter @wizards/mobile test:components -- mobile-kit-overlays.test.tsx
corepack pnpm --filter @wizards/mobile exec expo install --check
```

Expected: PASS and no SDK dependency corrections.

### Task 2: Create the single Phase 3 native build and close Phase 2 device evidence

**Files:**
- Modify: `apps/mobile/MIGRATION_PHASE_2.md`
- Create (ignored): `artifacts/mobile/phase2/closure/*`

- [x] **Step 1: Build and install the UAT dev client once**

Run: `corepack pnpm --filter @wizards/mobile android:uat:local`.

Expected: the emulator has the current dev client containing Expo Navigation Bar and Expo Clipboard native modules.

- [x] **Step 2: Run Phase 2 Maestro once with the local one-attempt login helper**

Run: `maestro test .maestro/phase2-messaging.yml` after confirming the local UAT rate-limit state is safe.

Expected: PASS; save light and dark screenshots under the ignored closure directory with no secret material.

- [x] **Step 3: Record closure evidence**

Update `MIGRATION_PHASE_2.md` with commands, PASS status, screenshot paths, and the note that all later Phase 3 tasks are JavaScript-only.

### Task 3: Verify M1 and ship one milestone

**Files:**
- Modify: this plan’s checkboxes only.

- [x] **Step 1: Run the complete M1 quality set**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm audit --prod
```

- [x] **Step 2: Inspect scoped diff, then commit and push**

```powershell
git add apps/mobile apps/mobile/MIGRATION_PHASE_2.md pnpm-lock.yaml docs/superpowers/plans/2026-07-11-mobile-phase3-m1.md
git commit -m "feat(mobile): close phase 2 evidence and clipboard action"
git push origin uat
```

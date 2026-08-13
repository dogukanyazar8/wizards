# Mobile Provider Identity Implementation Plan

> **For agentic workers:** Execute inline in this session. Do not dispatch subagents, commit, push, or create a branch.

**Goal:** Stop high-frequency realtime, voice, push-response, mutation, and overlay updates from changing root-provider or memoized prop identities when their observable inputs did not change.

**Architecture:** Keep the provider tree and existing libraries. Realtime event diagnostics move off the reducer path; TanStack callbacks depend on stable `mutate` methods; voice uses a provider-owned Zustand store for changing state plus a stable action context; push callbacks use refs; hosted overlay elements are memoized from their real inputs.

**Tech Stack:** React 19, React Native 0.86, Expo notifications, TanStack Query 5, Zustand 5, Jest/RNTL 14, Node test runner.

## Global Constraints

- Work on `uat`; do not create or switch branches.
- Do not commit, push, or create a PR.
- Do not add a state-management dependency, rearrange the provider tree, change `enableFreeze`, or edit screen components.
- Preserve unrelated dirty-worktree changes, especially `apps/mobile/src/app/mobile-product-app.tsx` app-lock work.
- Write each regression test first and observe the expected failure before production edits.
- Use awaited RNTL `render`, `rerender`, and `act` calls.

---

### Task 1: Realtime event identity

**Files:**

- Modify: `apps/mobile/src/app/providers/mobile-realtime-provider.tsx`
- Modify: `apps/mobile/src/realtime/mobile-realtime-state.ts`
- Test: `apps/mobile/scripts/mobile-realtime-state.test.ts`
- Test: `apps/mobile/component-tests/mobile-provider-identity.test.tsx`

**Interfaces:**

- Preserve `MobileRealtimeRuntime.connection` for connection and visibility transitions.
- Record event diagnostics in a ref; do not dispatch `event-received` through the connection reducer.

- [ ] Add a reducer/provider regression proving two socket events do not change the connection/context reference.
- [ ] Run the focused test and confirm it fails because `event-received` returns a new snapshot.
- [ ] Move event counters and redacted last-event data to a provider ref and remove event-rate dispatch.
- [ ] Run the focused test and confirm it passes.

### Task 2: Stable mutation callbacks

**Files:**

- Modify: `apps/mobile/src/query/use-mobile-message-mutations.ts`
- Modify: `apps/mobile/src/app/features/use-mobile-group-chat.ts`
- Test: `apps/mobile/component-tests/mobile-provider-identity.test.tsx`

**Interfaces:**

- `retryFailedMessage(messageId: string): boolean` remains unchanged.
- `MobileGroupChatState.onDismissPin` remains unchanged.

- [ ] Add hook rerender tests proving retry and dismiss callbacks retain identity when TanStack mutation result objects are replaced but their `mutate` methods are stable.
- [ ] Run the focused test and confirm current object dependencies break identity.
- [ ] Destructure or capture each stable `mutate` method and use it in callback bodies/dependency arrays.
- [ ] Run the focused test and confirm stable identities.

### Task 3: Voice action/state split

**Files:**

- Create: `apps/mobile/src/state/mobile-voice-runtime-store.ts`
- Modify: `apps/mobile/src/app/providers/mobile-voice-provider.tsx`
- Modify: `apps/mobile/src/app/features/use-mobile-voice-screen-props.ts`
- Modify: `apps/mobile/src/app/mobile-product-app.tsx`
- Test: `apps/mobile/component-tests/mobile-provider-identity.test.tsx`

**Interfaces:**

- Produce a provider-owned Zustand store containing `roomState`, `permissionState`, `pushToTalkState`, audio-processing preferences, screen-share preferences, and input mode.
- Produce stable action hooks whose callbacks invoke the latest `useMobileVoiceRoom` methods through refs.
- Provide selector hooks so the product root subscribes only to the scalar state it actually consumes; voice screen props subscribe to room state.

- [ ] Add a provider probe proving a participant-level update leaves stable action references and non-voice consumers unchanged.
- [ ] Run the focused test and confirm the current `voiceRoom` object dependency changes the runtime identity.
- [ ] Add the Zustand store, stable action context, latest-runtime ref, and state synchronization.
- [ ] Replace whole-runtime dependencies in `useMobileVoiceScreenProps` with the exact state fields and callbacks used.
- [ ] Update `MobileProductApp` call sites without overwriting the existing app-lock boundary diff.
- [ ] Run the focused test and existing voice provider tests.

### Task 4: Push bridge and overlay registration

**Files:**

- Modify: `apps/mobile/src/app/providers/mobile-push-response-bridge.tsx`
- Modify: `apps/mobile/src/app/components/kit/overlay-surface.tsx`
- Test: `apps/mobile/component-tests/mobile-provider-identity.test.tsx`
- Test: `apps/mobile/component-tests/mobile-overlay-host.test.tsx`

**Interfaces:**

- Push runtime mounts once; decline always calls the latest realtime action through a ref.
- Overlay registry updates only when `hostedNode` inputs or stable close handler change.

- [ ] Add tests proving realtime rerenders do not re-register notification hooks and unrelated owner rerenders do not notify the overlay registry.
- [ ] Run focused tests and confirm current effects re-register.
- [ ] Store decline action in a ref and mount push runtime with an empty dependency list.
- [ ] Memoize `surface` and `hostedNode`; key registry effect to `hostedNode`, `id`, and `requestClose`.
- [ ] Run focused tests and confirm one registration/notification.

### Task 5: Verification and graph refresh

**Files:**

- Update generated graph artifacts through the repository command only.

- [ ] Run focused Jest/Node tests for provider identity, realtime state, overlay host, and voice lifecycle.
- [ ] Run `pnpm --filter @wizards/mobile typecheck`.
- [ ] Run `pnpm --filter @wizards/mobile test`.
- [ ] Run `pnpm --filter @wizards/mobile exec jest component-tests --runInBand`.
- [ ] Run the configured Graphify interpreter with `-m graphify update .`.
- [ ] Inspect final diff and report exact pass/fail/not-run evidence; confirm no commit was created.

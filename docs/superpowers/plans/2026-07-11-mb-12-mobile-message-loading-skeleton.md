# MB-12 Mobile Message Loading Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the existing mobile Skeleton component for first-load channel and DM message lists while preserving ready-empty and populated message states.

**Architecture:** Add a shared `MessageListSkeleton` to the message primitives module, then substitute it solely in existing `status === "loading" && !payload` branches. Retain the memoized `ChannelMessageList` empty component so FlashList receives a stable loading component reference.

**Tech Stack:** React Native 0.85, React Native Testing Library, Jest, react-native-reanimated, TypeScript.

## Global Constraints

- Use `Skeleton` from `components/kit`; do not create a new skeleton animation.
- Keep both EmptyState implementations, do not add offline UI, and keep `home-screen.tsx` out of scope.
- Render skeletons only when the current state is loading with no payload; ready empty payloads keep their current empty copy.
- Verify reduced motion by mocking `useReducedMotion()` to `true` and asserting skeleton roots render without shimmer nodes.

---

### Task 1: Specify message loading behavior with a red component test

**Files:**
- Create: `apps/mobile/component-tests/mobile-message-loading-skeleton.test.tsx`
- Test: `apps/mobile/component-tests/mobile-message-loading-skeleton.test.tsx`

**Interfaces:**
- Consumes: `MessageListSkeleton`, `ChannelMessagesPreviewCard`, and `DMConversationPreviewCard`.
- Produces: proof that loading, ready-empty, ready-populated, and reduced-motion paths have exclusive visual states.

- [ ] **Step 1: Write the failing RNTL tests**

```tsx
expect(view.getByTestId("mobile-message-list-skeleton")).toBeTruthy();
expect(view.queryByText(copy.workspaceMessagesLoading)).toBeNull();
expect(view.queryByText(copy.workspaceNoMessages)).toBeNull();
expect(view.queryByTestId("mobile-message-list-skeleton")).toBeNull();
expect(view.getByText(copy.workspaceNoMessages)).toBeTruthy();
expect(view.getByText("hello")).toBeTruthy();
jest.mocked(useReducedMotion).mockReturnValue(true);
expect(view.getByTestId("mobile-message-list-skeleton")).toBeTruthy();
expect(view.queryByTestId("mobile-message-list-skeleton-row-0-shimmer")).toBeNull();
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pnpm --filter @wizards/mobile test:components -- mobile-message-loading-skeleton.test.tsx`

Expected: FAIL because `MessageListSkeleton` and its test IDs do not yet exist.

### Task 2: Implement the shared message-list skeleton and use it on message surfaces

**Files:**
- Modify: `apps/mobile/src/app/components/message-primitives.tsx`
- Modify: `apps/mobile/src/app/screens/channel-screen.tsx`
- Modify: `apps/mobile/src/app/screens/dm-screen.tsx`
- Modify: `apps/mobile/src/app/locale/mobile-copy.ts` only if the two retired loading keys have no other runtime references

**Interfaces:**
- Consumes: existing `Skeleton` API, `{ height: number; width: DimensionValue; borderRadius?: number }`.
- Produces: `MessageListSkeleton({ testID?: string })`, rendered by all three first-load message branches.

- [ ] **Step 1: Add the smallest shared presentation primitive**

```tsx
const MESSAGE_LIST_SKELETON_ROWS = ["74%", "56%", "82%"] as const;

export function MessageListSkeleton({ testID = "mobile-message-list-skeleton" }: { testID?: string }) {
  return (
    <View testID={testID}>
      {MESSAGE_LIST_SKELETON_ROWS.map((width, index) => (
        <Skeleton key={width} borderRadius={16} height={64} testID={`${testID}-row-${index}`} width={width} />
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Substitute only existing first-load branches**

```tsx
if (state.status === "loading" && !state.payload) {
  return <MessageListSkeleton />;
}
```

Use the same guarded element in `ChannelMessagesPreviewCard` and `DMConversationPreviewCard`; leave all ready-empty conditions unchanged.

- [ ] **Step 3: Run the focused component test to verify it passes**

Run: `pnpm --filter @wizards/mobile test:components -- mobile-message-loading-skeleton.test.tsx`

Expected: PASS with the four exclusive-state assertions and reduced-motion assertion green.

### Task 3: Verify package integration and refresh graph metadata

**Files:**
- Modify: `graphify-out/` generated graph files via `graphify update .`

- [ ] **Step 1: Confirm obsolete loading-copy references are absent from runtime screens**

Run: `rg -n "workspaceMessagesLoading|dmMessagesLoading" apps/mobile/src/app`

Expected: no runtime usage; remove locale entries only if this command shows no consumers.

- [ ] **Step 2: Run required quality gates**

Run: `pnpm --filter @wizards/mobile test`

Expected: PASS, 0 failures.

Run: `pnpm --filter @wizards/mobile test:components`

Expected: PASS, 0 failures.

Run: `pnpm --filter @wizards/mobile typecheck`

Expected: PASS, 0 TypeScript errors.

- [ ] **Step 3: Update the project graph**

Run: `graphify update .`

Expected: AST graph refresh completes without source extraction errors.

- [ ] **Step 4: Commit the scoped implementation**

```powershell
git add -- apps/mobile/src/app/components/message-primitives.tsx apps/mobile/src/app/screens/channel-screen.tsx apps/mobile/src/app/screens/dm-screen.tsx apps/mobile/component-tests/mobile-message-loading-skeleton.test.tsx docs/superpowers
git commit -m "feat(mobile): add message loading skeletons"
```

# MB-12 Mobile Message Loading Skeleton Design

## Goal

Replace the mobile channel and direct-message first-load text indicators with the existing themed `Skeleton` component, so their loading experience matches the web message surface without changing empty, error, or populated states.

## Design

`MessageListSkeleton` will live in `apps/mobile/src/app/components/message-primitives.tsx`, beside the existing message stream primitives. It composes several `Skeleton` blocks with stable test IDs, message-bubble height, and deliberately uneven widths. The component will not own any loading-state decision; channel and DM retain their existing state guards and render it only for `status === "loading" && !payload`.

`ChannelMessageList` keeps its `useMemo`-wrapped `emptyComponent` intact so the `ListEmptyComponent` reference remains stable across unrelated renders; its loading branch changes only from text to `MessageListSkeleton`. `ChannelMessagesPreviewCard` and `DMConversationPreviewCard` use the same primitive in their identical first-load branches. Ready-with-empty payloads retain their existing labels, and ready-with-messages retains the real message streams.

The existing `Skeleton` already suppresses its shimmer when `useReducedMotion()` is true. The new component test will mock that hook to true and prove the skeleton roots still render while shimmer children do not. No new animation or accessibility policy is introduced.

## Scope Boundaries

- Do not consolidate `ui-atoms.tsx` `EmptyState` with `kit/empty-state.tsx`; both remain intentional APIs.
- Do not add chat or DM offline UI without an observed, product-backed state gap.
- `home-screen.tsx` is intentionally excluded: its `workspaceLoading` represents server/workspace loading, not a message-list first load.
- Remove `workspaceMessagesLoading` and `dmMessagesLoading` only if the repository has no remaining runtime references after this change.

## Verification

RNTL coverage will assert the loading, ready-empty, and ready-populated render paths for channel and DM preview surfaces, plus the `MessageListSkeleton` reduced-motion path. The mobile package test, component test, and typecheck commands must all pass. Finally, run `graphify update .` to refresh the project graph.

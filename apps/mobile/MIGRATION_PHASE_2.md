# Whispr Mobile - Phase 2 Migration Notes

## Scope

Phase 2 brings the mobile channel and DM surfaces to the P0 messaging contract: reactions,
reply/edit/delete actions, threads, image lightbox, mention highlighting, DM typing, and narrow
realtime cache updates. The implementation is JavaScript-only and adds no native or package
dependency.

## API contracts

- Channel message actions use
  `/api/v1/mobile/channels/[channelId]/messages/[messageId]` with `PATCH` and `DELETE`.
- Channel reactions use the nested `/reactions` resource with `PUT` and `DELETE`.
- Channel threads use the cursor-bounded nested `/thread` resource.
- DM actions use the equivalent
  `/api/v1/mobile/dm/[conversationId]/messages/[messageId]` resources.
- Send contracts accept optional `replyToId` and `threadParentId` values.
- Routes retain bearer auth, rate limits, zod parsing, service-layer authorization, and bounded
  error responses. Web behavior is unchanged.

## Mobile hook and cache map

- `use-mobile-message-mutations.ts`: optimistic send, reaction, edit, soft-delete/remove, and exact
  snapshot rollback for channel and DM caches.
- `mobile-message-cache.ts`: targeted content/reaction updates, soft-delete placeholders, removal,
  deduplication, and rollback helpers.
- `use-mobile-messaging-feature.ts`: screen-owned send/reply/edit/delete/reaction handlers and
  channel/DM typing lifecycle.
- `mobile-message-thread-query.ts`: parent-scoped channel/DM thread queries; the thread screen sends
  replies with `threadParentId`.
- `realtime-query-bridge.ts`: validated channel events plus narrow DM upsert/reaction/removal cache
  updates; malformed or delete-placeholder events fall back to the existing 350 ms invalidation.

Query and optimistic state remain memory-only. No query persistence, offline queue, or message
content storage was added.

## UI contracts

- Long press exposes native clipboard copy, reply, owner-only edit/delete, thread, quick reactions, and the
  in-house emoji picker. Delete always requires destructive confirmation.
- Reply/edit state is visible above the composer and cancellable; replies render a quote and can
  scroll back to a loaded parent.
- Deleted messages retain a bounded placeholder when the server returns `deleted`; truly removed
  messages leave the cache when the server returns `removed`.
- The emoji picker is local, categorized, searchable, FlashList-backed, and dependency-free.
- Image attachments open in an Expo Image lightbox with pinch zoom, swipe close, Android back, and
  reduced-motion behavior.
- Mentions use semantic accent roles. DM typing reuses the bounded typing state and server socket
  contract.
- `mobile-product-app.tsx` remains below 400 lines and touched presentation files do not use the
  compatibility theme layer or raw mobile colors.

## Verification

- `pnpm --filter @wizards/mobile typecheck`: PASS.
- `pnpm --filter @wizards/mobile test`: PASS, 334/334.
- `pnpm --filter @wizards/mobile test:components`: PASS, 86/86 across 17 suites.
- `pnpm --filter @wizards/mobile quality:check`: PASS, zero blockers and 10 automated gates.
- `pnpm --filter @wizards/mobile exec expo install --check`: PASS, dependencies are up to date.
- `pnpm audit --prod`: PASS, no known vulnerabilities.
- Phase 2 Maestro/testID contract: PASS. The flow is `.maestro/phase2-messaging.yml` and writes only
  to `artifacts/mobile/phase2/closure/`.

## Device evidence status

- The Phase 3 M1 native build was produced and installed with
  `corepack pnpm --filter @wizards/mobile android:uat:local`; package `team.whispr.mobile` includes
  both Expo Navigation Bar and Expo Clipboard.
- `.maestro/phase2-messaging.yml`: PASS on the Android `Pixel_10_Pro` emulator. The flow verified
  authenticated UAT handoff, channel deep-link routing, send, reaction, reply, edit, thread reply,
  destructive delete, and light/dark rendering.
- Maestro 2.6.1 requires `.env.maestro` values to be supplied with explicit `-e KEY=value`
  arguments; invoking the flow without them resolves channel identifiers as `undefined`.
- Light evidence: `artifacts/mobile/phase2/closure/light-messaging.png`.
- Dark evidence: `artifacts/mobile/phase2/closure/dark-messaging.png`.
- Evidence is ignored by git and contains no credentials, tokens, or secret material.

## Phase 3 handoff

- Native clipboard replacement and the single Phase 3 Android build are complete in M1.
- All remaining Phase 3 milestones are JavaScript-only and must add no native dependency or build.
- Extend reply-to-parent loading from a narrow refresh to cursor traversal when the mobile history API
  exposes deterministic parent lookup.
- Keep `.env.maestro` local and keep all Phase 2 evidence under ignored `artifacts/mobile/phase2/`.

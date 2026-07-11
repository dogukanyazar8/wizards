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

- Long press exposes copy/share, reply, owner-only edit/delete, thread, quick reactions, and the
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
- `pnpm --filter @wizards/mobile test:components -- --runInBand`: PASS, 81/81.
- `pnpm --filter @wizards/mobile quality:check`: PASS, zero blockers and 10 automated gates.
- `pnpm audit --audit-level high`: PASS, no known vulnerabilities.
- Phase 2 Maestro/testID contract: PASS. The flow is `.maestro/phase2-messaging.yml` and writes only
  to `artifacts/mobile/phase2/`.

## Device evidence status

The single Android Maestro attempt reached the installed dev client but stopped before login because
that APK does not contain the already-declared `ExpoNavigationBar` native module required by the
current bundle. Evidence is retained outside git under `artifacts/mobile/phase2/` (`maestro-phase2.xml`,
`maestro-phase2.log`, debug recording, and `failure-screen.png`). This is an installed-APK/native
runtime mismatch, not a Phase 2 flow failure or account lockout.

Per the Phase 2 no-native-build rule, no replacement APK was built in this batch. Run the same flow
once against an APK produced from the current `uat` native configuration to collect the required
light/dark screenshots and final device PASS.

## Phase 3 handoff

- Replace the copy/share compatibility action with a dedicated clipboard API only if Phase 3 permits
  the corresponding Expo native module and a current APK build.
- Extend reply-to-parent loading from a narrow refresh to cursor traversal when the mobile history API
  exposes deterministic parent lookup.
- Keep `.env.maestro` local and keep all Phase 2 evidence under ignored `artifacts/mobile/phase2/`.

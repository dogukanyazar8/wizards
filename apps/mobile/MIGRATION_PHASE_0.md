# Whispr Mobile Phase 0 Migration Note

## Outcome

Phase 0 replaces the manual mobile navigation and server-request state machines with typed React Navigation, an in-memory TanStack Query cache, focused non-persisted Zustand state, and one realtime-to-query bridge. The five public tab IDs and existing auth, locale, deep-link, voice, and Maestro contracts remain stable.

## Runtime architecture

Provider order:

1. `GestureHandlerRootView`
2. `SafeAreaProvider`
3. `MobileErrorBoundary`
4. `MobileAuthProvider`
5. `MobileQueryProvider`
6. Locale, notification, media, voice, realtime, and deep-link providers
7. Focused navigation/messages/notifications/overview/settings/voice screen providers
8. `NavigationContainer`, native root stack, and five-tab navigator

`whispr-mobile-root.tsx` is 10 physical lines and composes only the app providers, product runtime, and typed navigator. Server views are derived from Query results in `mobile-query-view-state.ts`; there are no request-ID refs, direct `fetchQuery`/`fetchInfiniteQuery` chains, or duplicate server-data reducers in the product runtime.

### Navigation routes

| Level | Route | Parameters / behavior |
| --- | --- | --- |
| Root stack | `MainTabs` | Five stable tabs: `overview`, `messages`, `notifications`, `voice`, `settings` |
| Root stack | `ChannelChat` | Opaque `serverId` and `channelId`; Android back pops to overview |
| Root stack | `DirectMessage` | Opaque `conversationId`; Android back pops to the DM inbox |
| Root stack | `SettingsDetail` | Bounded settings section |

The existing route validator runs before React Navigation. Auth handoff and invite values remain command intents; unsafe origins, sensitive query values, and unsupported routes fail closed.

## Screen ownership

| Surface | Focused data / state |
| --- | --- |
| Overview and channel | Bootstrap/workspace/channel Query hooks, active-target store, composer draft store, media and voice providers |
| Messages and DM | Bootstrap DM selector, infinite DM messages Query hook, optimistic DM mutation, active conversation store |
| Notifications | Bootstrap Query plus notification provider |
| Voice | Bootstrap Query plus unchanged voice runtime provider |
| Settings | Auth, locale, media, notification, and voice providers |
| Global overlay | Voice invite state sourced from the single realtime provider subscription |

Presentational screen state types remain as fail-closed render contracts. Query activity is adapted directly into these types; it is not copied into a second request state machine.

## Query keys and realtime behavior

| Domain | Query key | Realtime behavior |
| --- | --- | --- |
| Bootstrap / DM summaries | `mobile/bootstrap` | Bootstrap, presence, and notification sources invalidate after the 350 ms grouped debounce |
| Workspace | `mobile/workspace/{serverId}` | Only the active matching server invalidates |
| Channel messages | `mobile/channel-messages/{channelId}` | Validated active-channel payloads update infinite pages; unsafe or unhandled payloads invalidate |
| DM messages | `mobile/dm-messages/{conversationId}` | Only the active matching conversation invalidates |
| DM conversations | `mobile/dm-conversations` | Selector/facade over bootstrap; no endpoint was invented |
| Search | `mobile/message-search/{scope}/{conversationId}/{search-N}` | Raw query/filter text stays in a private memory registry and never enters the key |

Channel and DM sends use Query mutations: cancel, exact cache snapshot, memory-only optimistic insert, server replacement/deduplication, exact rollback on failure, and narrow invalidation on settle. The realtime provider owns socket connection, foreground backfill, typing timers, bridge cleanup, and active-target synchronization.

## Sign-out and storage boundary

Sign-out disconnects realtime, cancels pending bridge timers, removes all `mobile` queries, clears the private search-key registry, and resets the active-target, composer-draft, and overlay stores. Voice state is also left through the existing voice runtime.

Query persistence and offline cache are **not enabled**. There is no TanStack persister, dehydration/hydration, AsyncStorage or SecureStore query cache, persisted Zustand middleware, offline mutation queue, or offline message cache. Auth/session storage remains the pre-existing secure-session responsibility and is not used as a Query cache.

## Native decisions

- `MainActivity.kt` already calls `super.onCreate(null)`.
- No `RNScreensFragmentFactory`, FragmentFactory config plugin, or MainActivity patch was added.
- `android.predictiveBackGestureEnabled` is `false` in the checked-in Expo config. The ignored/generated local Android manifest was also verified as `android:enableOnBackInvokedCallback="false"` before the final bare Gradle build.
- Reanimated/Worklets uses Expo SDK 56 defaults; no manual Babel plugin was added.

> Faz 0 sonrası predictive back'i yeniden aç ve Android cihazlarda stack pop, root back ve deep-link dönüşlerini doğrula.

## Maestro testID compatibility

`scripts/mobile-maestro-testid-contract.test.ts` extracts every `id` used by `.maestro/phase0-navigation.yml`, compares the exact set with this production-source contract, and fails when an ID or quality-gate requirement drifts.

| Maestro ID | Production source |
| --- | --- |
| `mobile-bottom-tab-overview` | `src/navigation/mobile-bottom-tab-bar.tsx` |
| `mobile-bottom-tab-messages` | `src/navigation/mobile-bottom-tab-bar.tsx` |
| `mobile-workspace-channel-text` | `src/app/screens/home-screen.tsx` |
| `mobile-channel-chat-screen` | `src/app/screens/channel-screen.tsx` |
| `mobile-dm-conversation-row` | `src/app/screens/dm-screen.tsx` |
| `mobile-dm-chat-screen` | `src/app/screens/dm-screen.tsx` |
| `mobile-dm-inbox-screen` | `src/app/screens/dm-screen.tsx` |
| `mobile-settings-screen` | `src/app/screens/settings-screen.tsx` |

## Android device evidence

- Device: `Pixel_10_Pro` Android emulator, serial `emulator-5554`, API 37.
- Build: x86_64 debug/UAT native APK rebuilt from the verified short-path staging tree, with the final JavaScript tree served by Metro. `aapt2 dump xmltree` confirmed packaged `enableOnBackInvokedCallback=false`; `adb install -r` preserved the authenticated test session.
- APK: `artifacts/mobile/phase0-navigation/final-apk/Whispr-Mobile-Phase0-x86_64-debug.apk`.
- Flow: `.maestro/phase0-navigation.yml`.
- Covered: UI channel push + hardware back, UI DM push + hardware back, channel deep link + back, DM deep link, settings deep link, and invite command deep link.
- Result: **PASS — 1/1 flow, 0 failures, 49 seconds**.
- JUnit report: `artifacts/mobile/phase0-navigation/maestro-final-4/report.xml`.
- Command output: `artifacts/mobile/phase0-navigation/maestro-final-4/maestro-output.txt`.
- Per-command evidence: `artifacts/mobile/phase0-navigation/maestro-final-4/tests/2026-07-10_013444/commands-(phase0-navigation).json`.

The flow uses environment-supplied opaque IDs and never records credentials in the repository or report.

## Dependency alignment

Run from `apps/mobile`:

```text
> npx expo install --check
env: load .env.local
env: export EXPO_PUBLIC_WHISPR_DEV_LOGIN_EMAIL EXPO_PUBLIC_WHISPR_DEV_LOGIN_PASSWORD
Dependencies are up to date
```

Exit code: `0`. Expo SDK remains 56 and no dependency mismatch was reported.

## Final quality gates

| Gate | Result |
| --- | --- |
| `pnpm --dir apps/mobile typecheck` | PASS |
| `pnpm --dir apps/mobile test` | PASS — 279/279 |
| `pnpm --dir apps/mobile test:components` | PASS — 6 suites, 19/19 |
| `pnpm --dir apps/mobile quality:check` | PASS — 0 blockers |
| Persistence/offline-cache negative scan | PASS — no matches |
| `npx expo install --check` | PASS — dependencies up to date |

Command logs are retained under `artifacts/mobile/phase0-navigation/final-verification/`.

## Next-phase handoff

- Design-system work can replace presentation tokens/components behind the current screen and navigation boundaries without changing query keys or route types.
- P0 messaging parity can extend the existing cursor queries and optimistic cache helpers for replies, reactions, threads, and attachment upload once their approved mobile contracts exist.
- Invite acceptance remains a validated command path until its native server mutation contract is enabled; Phase 0 does not invent that endpoint.
- Re-enable and verify predictive back only through the explicit follow-up above, including root back and deep-link return behavior on Android devices.

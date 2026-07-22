# Android CallStyle Incoming-Call Notifications — Implementation Plan

**Goal:** Replace the plain action-button call push with a native Android `CallStyle` notification: Answer/Decline always visible (no expanding), `CATEGORY_CALL`, ongoing, auto-expiring at ring TTL, and a full-screen intent that rings over the lock screen — the Discord/WhatsApp/Zoom behavior.

**Why native:** `expo-notifications` 56 exposes no `CallStyle`, `setFullScreenIntent`, or `CATEGORY_CALL` (verified: zero hits in its Android source). Its notification-category actions render as ordinary buttons that Android may hide in the collapsed heads-up view.

**Key extension point:** `expo-notifications` registers `ExpoFirebaseMessagingService` with `android:priority="-1"`, so a service registered at default priority receives FCM messages first. `ExpoFirebaseMessagingService` is an `open class`, so our service subclasses it, intercepts `kind == "dm-call"`, and calls `super.onMessageReceived` for everything else — feed notifications keep flowing through Expo untouched.

**FCM payload map (Expo push → Android):** `data["title"]`, `data["message"]` (body text), `data["body"]` (JSON string holding our `data` object), `data["categoryId"]`, `data["channelId"]`.

---

## Task 1: Server — ring TTL in the call push payload

**Files:** `apps/web/src/lib/socket/handlers/dm.ts`, `apps/web/src/lib/socket/handlers/dm-call-push.test.ts`

The native notification uses `setTimeoutAfter` so a stale ring disappears on its own — this also fixes the v1 "notification stays forever when the caller cancels while the app is dead" limitation. The handler already computes `DM_CALL_RING_TTL_MS`; pass it through.

- [ ] Add `ringTtlMs` to `sendDMCallPush` args and to the push `data` map (string, Expo data values must be strings).
- [ ] Handler passes `DM_CALL_RING_TTL_MS`.
- [ ] Extend the existing test to assert `data.ringTtlMs === "45000"`.

## Task 2: Server + mobile — drop the hyphen from the category id

**Files:** `apps/web/src/lib/mobile/push-sender.ts`, `apps/mobile/src/notifications/mobile-push-display-contract.ts`, both test files

`setNotificationCategoryAsync` docs: *"Don't use the characters `:` or `-` in your category identifier."* Our id is `incoming-call`. The category still matters for iOS and as the Android fallback when full-screen intent is unavailable.

- [ ] `MOBILE_PUSH_CATEGORY_INCOMING_CALL` / `MOBILE_PUSH_INCOMING_CALL_CATEGORY` → `"incomingcall"` on both sides.
- [ ] Update the assertions in `push-sender.test.ts`, `dm-call-push.test.ts`, `mobile-push-display-contract.test.ts`.

## Task 3: Mobile JS — `dm-call-action` deep-link intent

**Files:** `apps/mobile/src/deep-link/mobile-deep-links.ts`, `apps/mobile/scripts/mobile-deep-links.test.ts` (extend existing)

URL shape emitted by the native Answer button: `whispr://channels/@me/<conversationId>?call=answer&from=<fromUserId>`. Path stays inside the existing `/channels` safe prefix; `parseMobileDeepLink` already hands `searchParams` to intent parsers.

- [ ] Add to the `MobileDeepLinkIntent` union:
```ts
  | {
      readonly action: "answer" | "decline";
      readonly conversationId: string;
      readonly fromUserId: string;
      readonly type: "dm-call-action";
    }
```
- [ ] Add `parseDMCallActionIntent(path, searchParams)`, called in `parseMobileDeepLink` right after the invite parser (before the route fallback). Returns null unless the path is `/channels/@me/<id>` and `call` is `answer` or `decline`.
- [ ] Tests: answer URL → intent; decline URL → intent; missing `from` → falls back to plain route intent; unknown `call` value → plain route intent.

## Task 4: Mobile JS — handle the command intent

**Files:** `apps/mobile/src/app/providers/mobile-deep-link-provider.tsx` (read it first — follow how `invite`/`auth-handoff` commands are dispatched)

- [ ] On a `dm-call-action` intent: navigate to the DM (`resolveMobileRoutePathIntent("/channels/@me/<id>")` + `navigateMobileRouteIntent`), then trigger accept/decline through the existing DM call feature (`emitDMCallAccept` / `emitDMCallDecline` from `useMobileRealtimeRuntime`, mirroring `use-mobile-dm-call-feature.ts`).
- [ ] Command intents bypass React Navigation's linking (`createMobileLinkingOptions` returns null for them), so this handler owns both navigation and the call action.

## Task 5: Native — config plugin

**Files:** `apps/mobile/plugins/withWhisprCallNotifications.js`, `apps/mobile/app.config.js`, `apps/mobile/scripts/with-whispr-call-notifications.test.ts`

Follow `plugins/withScreenShare.js` conventions: CommonJS, `withAndroidManifest`, defensive idempotent helpers.

- [ ] `withAndroidManifest`:
  - add `android.permission.USE_FULL_SCREEN_INTENT`
  - register `team.whispr.mobile.calls.WhisprMessagingService` with `<intent-filter>` for `com.google.firebase.MESSAGING_EVENT` at **default priority** (no `android:priority`, which beats Expo's `-1`), `android:exported="false"`
  - register `team.whispr.mobile.calls.WhisprCallActionReceiver`, `android:exported="false"`
  - add `android:showWhenLocked="true"` and `android:turnScreenOn="true"` to `.MainActivity` so the full-screen intent rings over the lock screen
- [ ] `withDangerousMod("android", ...)`: write the three Kotlin files into `android/app/src/main/java/team/whispr/mobile/calls/`, deriving the package from `config.android.package` rather than hardcoding.
- [ ] Register the plugin in `app.config.js` next to `./plugins/withScreenShare`.
- [ ] Test the manifest transform with node:test (pure JS): permission added once on repeat runs, service/receiver present, MainActivity flags set.

## Task 6: Native — Kotlin sources

Written by the plugin into `.../calls/`.

**`WhisprMessagingService.kt`** — subclasses `ExpoFirebaseMessagingService`; parses `data["body"]`; if `kind == "dm-call"` calls the notifier and returns; otherwise `super.onMessageReceived(remoteMessage)`. Any parse failure falls through to `super` so a malformed payload never swallows a notification.

**`WhisprCallNotifier.kt`** — builds the notification:
- `NotificationCompat.CallStyle.forIncomingCall(person, declinePendingIntent, answerPendingIntent)`
- `Person.Builder().setName(callerName).setImportant(true)`
- `setCategory(NotificationCompat.CATEGORY_CALL)`, `setOngoing(true)`, `setPriority(PRIORITY_MAX)`, `setTimeoutAfter(ringTtlMs)`
- channel `whispr-calls` (already created from JS; create defensively here too, because a killed app may receive the push before JS ever ran)
- `setFullScreenIntent(pendingIntent, true)` **only when** `NotificationManager.canUseFullScreenIntent()` is true (Android 14+ revokes this for non-calling apps). Otherwise the CallStyle heads-up alone still shows both buttons — that is the fallback, not a failure.
- Answer PendingIntent → `Intent(ACTION_VIEW, whispr://channels/@me/<id>?call=answer&from=<uid>)`, `FLAG_IMMUTABLE`
- Decline PendingIntent → broadcast to `WhisprCallActionReceiver`

**`WhisprCallActionReceiver.kt`** — cancels the call notification.

**Verify before writing:** confirm `androidx.core` on the classpath is ≥ 1.9.0 (`NotificationCompat.CallStyle` was added there) by checking the resolved dependency in `android/`. If it is older, add an explicit `androidx.core:core-ktx` constraint via the plugin.

**Small icon:** reuse the drawable expo-notifications already uses so the status-bar icon stays consistent — inspect the generated `android/app/src/main/res` for `notification_icon`, fall back to `@mipmap/ic_launcher`.

## Task 7: Known v1 limitation — decline while the app process is dead

Decline cancels the notification locally. Relaying the decline to the caller from a dead process would need a native module bridging back to the socket/JS; not in this pass. The caller's existing 45 s ring TTL ends the call. When the app is alive the in-app incoming-call UI (and the answer deep link) behave as before. Document in `docs/operations/mobile-fcm-setup.md`.

## Task 8: Verification

- [ ] `apps/web`: `pnpm test`, `pnpm --filter @wizards/web typecheck`
- [ ] `apps/mobile`: `pnpm test`, `npx jest`, `pnpm --filter @wizards/mobile typecheck`
- [ ] `node -e` smoke of `app.config.js` — plugin list loads, android block intact
- [ ] Native code cannot be unit tested here; it is verified on device: rebuild (`expo prebuild --platform android --clean` then the UAT build), reinstall, and run the call scenarios from the earlier test plan.

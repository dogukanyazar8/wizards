# Mobile FCM Setup (Android Push)

Android push delivery requires Firebase Cloud Messaging credentials. The code
ships without them and degrades silently (tokens fail to mint, pushes no-op).
One-time setup, owned by whoever holds the Firebase/EAS accounts:

1. **Firebase project:** [console.firebase.google.com](https://console.firebase.google.com)
   → create (or reuse) a project.
2. **Android app:** add an Android app using the package name from
   `apps/mobile/src/release/mobile-store-contract-data.json`
   (`appIdentity.androidPackage`). Repeat per environment if UAT/canary ship
   with distinct application ids.
3. **google-services.json:** download from Firebase project settings → place at
   `apps/mobile/google-services.json`. The file is git-ignored; every
   developer/CI machine that builds Android needs its own copy. `app.config.js`
   picks it up automatically when present.
4. **FCM V1 server credential for Expo push:** Firebase console → Project
   settings → Service accounts → Generate new private key (JSON). Then:
   `cd apps/mobile && eas credentials` → Android → chosen build profile →
   Google Service Account → "Set up FCM V1" → upload the JSON.
5. **Rebuild** the dev client / UAT build
   (`pnpm --filter @wizards/mobile android:uat:local`). The config change is
   native — a JS-only update is not enough.
6. **Reinstall note:** the Android "Whispr" channel importance changed
   (DEFAULT → HIGH) and a separate "Whispr Calls" channel was added. Android
   freezes channel settings at first creation — uninstall and reinstall the app
   on existing test devices to pick up the new behavior. Native call
   notifications additionally require a full
   `corepack pnpm exec expo prebuild --platform android --clean` before
   building: the call config plugin emits Kotlin sources and manifest entries
   into the generated Android project.
7. **Smoke test:** sign in on a device, grant notification permission
   (Settings → Notifications in-app card), background the app, then from
   another account: send a DM → device shows a push; mention the user in a
   channel → push; start a DM call → device rings on the calls channel with
   Answer/Decline actions.

## Behavior reference

- Feed pushes (DM, mention, thread reply, friend request/accept, server
  invite) reuse the localized title/body persisted on the Notification row and
  arrive on the `whispr-default` channel. Mute and notification-preference
  filtering happens server-side before any push is sent.
- Incoming DM calls are **not** rendered by expo-notifications. A native
  service (`WhisprMessagingService`, emitted by
  `apps/mobile/plugins/withWhisprCallNotifications.js`) intercepts them and
  builds an Android `CallStyle` notification: Answer/Decline always visible,
  `CATEGORY_CALL`, system ringtone, and a full-screen intent that rings over
  the lock screen. Everything else falls through to expo-notifications
  untouched.
- The `whispr-calls` channel is created by the native notifier, not by JS, so
  it can use the system ringtone. It therefore appears in Android's per-app
  notification settings only after the first call notification.
- Android 14+ revokes `USE_FULL_SCREEN_INTENT` for apps it does not classify
  as calling apps. The code checks `canUseFullScreenIntent()` and, when denied,
  falls back to the CallStyle heads-up notification — both buttons still show,
  only the lock-screen takeover is lost. If that happens, grant it under
  Settings → Apps → Whispr → "Display over other apps"/full-screen intents.
- Answer opens `whispr://channels/@me/<id>?call=answer&from=<uid>&type=<voice|video>`,
  which the app parses into a `dm-call-answer` intent: it navigates to the
  conversation and accepts if the ring is still live. After a cold start the
  socket ring signal is gone, so the tap only opens the conversation.
- **Known limitation:** Decline dismisses the notification locally. The caller
  learns the call ended through the 45 s server-side ring timeout, not
  immediately — relaying a decline from a dead app process would need a
  socket/HTTP bridge in native code that does not exist yet.
- Ring notifications self-expire via `setTimeoutAfter(ringTtlMs)`, so a
  cancelled call no longer leaves a stale notification on the lock screen.
- Dead device tokens (`DeviceNotRegistered` tickets) are pruned automatically
  on the next send.

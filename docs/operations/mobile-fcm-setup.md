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
   (DEFAULT → HIGH) and a new "Whispr Calls" channel (importance MAX) was
   added. Android freezes channel settings at first creation — uninstall and
   reinstall the app on existing test devices to pick up the new behavior.
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
- Incoming DM calls push on `whispr-calls` with category `incoming-call`
  (Answer opens the conversation; Decline relays `dm:call:decline` over the
  socket and dismisses the notification).
- Known v1 limitation: if the app process is dead and the caller cancels, the
  call notification stays until tapped (Expo push cannot remotely dismiss).
- Dead device tokens (`DeviceNotRegistered` tickets) are pruned automatically
  on the next send.

# Whispr Mobile

Expo React Native application for the iOS and Android Whispr mobile product.

## Current phase

The current mobile phase turns the Expo foundation into a native Whispr product shell:

- Expo app shell under the existing monorepo.
- UAT and production EAS build profiles.
- Build-time public endpoint validation.
- Shared type package access through `@wizards/types`.
- SecureStore-backed mobile session repository.
- Fail-closed session normalization and token expiry helpers.
- Token-safe mobile API client with relative-path validation and timeouts.
- Typed mobile navigation contract for the native bottom tabs: Home, DMs, Notifications, Calls, and Profile.
- Auth-gated mobile screens that avoid fake messages, fake voice participants, or client-only privacy claims.
- Native deep-link parsing for sign-in handoff, invites, and safe in-app routes.
- Fail-closed rejection for deep links that include OAuth/session secrets in query strings.
- Permission readiness contracts for notifications, microphone, camera, and photo library access.
- Native capability registry for push notifications, voice channels, video calls, media attachments, and screen share readiness.
- Native notification runtime using Expo Notifications, gated behind a user action and never requested on launch.
- Native microphone permission runtime using Expo Audio, gated behind the Calls setup action and never requested on launch.
- Native camera and photo library permission runtime using Expo ImagePicker, gated behind Profile media setup actions and never requested on launch.
- Native document picker runtime using Expo DocumentPicker, gated behind Profile media setup action and storing only sanitized selected-file metadata.
- Automated validation that runtime permission intents, store disclosures, Android permissions, and iOS usage descriptions cannot drift apart.
- Authenticated web bootstrap endpoint contract at `/api/v1/mobile/bootstrap`.
- Mobile bootstrap client validation that refuses malformed server payloads.
- EAS release readiness contract with HTTPS endpoint, profile, version, and performance budget checks.
- Mobile quality gate with automated checks, Android/iOS device matrix, and manual smoke checklist validation.
- Production readiness contract for UAT, store-candidate, and production promotion evidence.
- Real mobile DM conversation preview backed by authenticated, bounded mobile API responses.
- Real mobile workspace preview backed by permission-filtered server channels and bounded text-channel message reads.
- Foreground freshness contract that refreshes visible real data after a cooldown and displays last sync state without claiming fake realtime.
- Store readiness contract for stable native identifiers, permission disclosures, privacy checklist, and broad-permission prevention.

## Product boundaries

- The primary native bottom tabs are Home, DMs, Notifications, Calls, and Profile.
- Messages and Servers use real authenticated Whispr API data; empty states must not fabricate people, messages, servers, media, or notifications.
- Notifications can request the native device permission from the Notifications screen action. Push token registration and native delivery remain disabled until the server lifecycle contract is complete.
- Calls can request native microphone permission from the Calls screen action. Real voice join, mute, device switching, and participant state remain disabled until LiveKit mobile integration and server token lifecycle are complete.
- Profile can request native camera and photo library permissions from explicit media setup actions and can open the native document picker from an explicit user action. Camera launch, upload, and video track publishing remain disabled until the related chat/call contracts are connected.
- Screen share remains research-gated until Android MediaProjection and iOS Broadcast Upload Extension contracts are designed and tested.
- Foreground refresh keeps visible data reasonably fresh, but mobile realtime sockets are not connected yet.

## Local development

```powershell
corepack pnpm install
corepack pnpm --filter @wizards/web dev
corepack pnpm --filter @wizards/mobile start
```

For fast Android UAT validation without waiting for the remote EAS queue, start an emulator
from Android Studio and run:

```powershell
cd C:\Users\doguk\Desktop\Wizards\apps\mobile
corepack pnpm run android:uat:local
```

This command is for the initial native install and for native changes only. It compiles Android
from the short managed build path, then starts Metro from the editable source workspace. Keep the
Metro window open while developing: TypeScript, TSX, style, and JavaScript changes should appear
through Fast Refresh without rebuilding the APK.

Run the Android build again only after changing native dependencies, `app.config.js`, Android
configuration, permissions, Expo plugins, or generated native code. If the development build is
already installed and Metro has stopped, restart Metro without rebuilding:

```powershell
cd C:\Users\doguk\Desktop\Wizards\apps\mobile
$env:WHISPR_MOBILE_ENV = "uat"
corepack pnpm exec expo start --dev-client --port 8081
```

The local UAT script exposes all mutable build state at this managed path:

```text
C:\whispr_dev\whispr_uat\whispr_mobile\
  workspace\          staged source
  pnpm-store\         package-content cache
  pnpm-virtual-store\ pnpm links and native dependency state
  gradle\             Gradle cache and daemon state
  artifacts\          archived and latest APKs
```

That path is a validated NTFS junction to the script-owned short physical root `C:\wm`. React Native's Android CMake build canonicalizes junctions and cannot build reliably from the longer physical path; this arrangement keeps all state accessible at the managed path while preserving a native-safe physical path. Do not replace either the junction or the ownership marker manually. The Android SDK and JDK remain validated machine prerequisites; the script does not copy them. Every UAT pnpm install explicitly pins its content and virtual stores to this managed root, then verifies the pnpm metadata and the `tsx` link before continuing. If that layout is corrupt or stale, it clears only this managed build state and retries once. It never automatically deletes the legacy `C:\Wizards` or `C:\wp` directories.

Use the clean variant only when native caches or generated Android outputs look stale:

```powershell
corepack pnpm run android:uat:local:clean
```

## Validation

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile validate:env
corepack pnpm --filter @wizards/mobile release:check
corepack pnpm --filter @wizards/mobile release:evidence
corepack pnpm --filter @wizards/mobile quality:check
```

Recommended monorepo gate before promotion:

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/desktop test
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile quality:check
```

## EAS profiles

- `development`: local development client, local endpoints allowed.
- `uat`: internal smoke builds against Railway UAT.
- `production`: store distribution only.

Non-development profiles must use HTTPS, non-local Whispr endpoints. Secret-like values must not be embedded into EAS public env.

## OTA and internal APK publication

`.github/workflows/mobile-release.yml` is a manual, environment-gated publisher. UAT OTA
publishes an Expo export signed outside the repository, uploads immutable bytes to R2, registers
only the signed metadata, then verifies the served manifest. UAT APK publication uses the
existing EAS-managed Android application-signing credential, verifies the resulting APK with
`apksigner`, and registers its certificate fingerprint, SHA-256, size, and immutable URL.
Production remains store-only and never receives `REQUEST_INSTALL_PACKAGES` or an internal APK URL.

The first internal APK must be installed manually from the trusted immutable release URL. Later
UAT native updates can use the in-app downloader after Android's per-app unknown-source
permission is explicitly granted. JavaScript-only compatible updates use signed OTA delivery.

Configure these GitHub environment secrets for `mobile-uat`. Production OTA remains disabled
until it has a separate trust root and approved publishing support:

- `WHISPR_MOBILE_OTA_PRIVATE_KEY`: environment-specific RSA private key; OTA job only.
- `WHISPR_RELEASE_PUBLISH_TOKEN`: narrowly scoped server publisher credential.
- `EXPO_TOKEN`: EAS build credential; APK job only.
- `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

The server also requires `WHISPR_RELEASE_PUBLISH_TOKEN` and
`WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID`; the latter must identify a dedicated service user so audit
records retain a valid actor. Never place an OTA private key in app configuration, PostgreSQL, R2,
build artifacts, logs, or the workspace.

Keep the Android application-signing key managed by EAS and maintain a separately access-controlled
disaster-recovery backup. Keep each OTA private key in a secret manager with least-privilege CI
access; store only its public certificate under `certs/ota/<environment>/`. Use a distinct key per
environment, document owner and expiry, rotate before certificate expiry by shipping the new public
certificate in a native build first, then switching the publisher secret. A leaked OTA key requires
immediate publication disablement and a new native build with a new trust root.

## Mobile performance budgets

- Cold authenticated launch: `<= 2500ms`.
- Warm foreground resume: `<= 700ms`.
- Chat input latency: `p95 <= 50ms`.
- Idle memory: `<= 180MB` after 5 minutes.

Record these values during UAT QA before store promotion.

## Manual UAT smoke checklist

- Launch: app opens with the Whispr splash/icon and reaches the tab shell.
- Navigation: Home, DMs, Notifications, Calls, and Profile bottom tabs switch without overlap or jank.
- Auth: signed-out protected screens show the auth gate and never impersonate a user.
- Handoff: web sign-in returns to the mobile app with the one-time handoff flow.
- Deep links: credential-like query values are rejected.
- Permissions: no camera, microphone, notification, or photo prompt appears before a user action.
- Notifications: tap the Notifications screen setup action, confirm the OS prompt appears only then, and verify the app reports device permission separately from server registration.
- Voice: tap the Calls screen microphone setup action, confirm the OS prompt appears only then, and verify the app reports microphone permission separately from LiveKit/server readiness.
- Media: tap the Profile media setup actions, confirm camera/photo prompts appear only then, open the document picker from the explicit file action, and verify no camera, upload, or video call starts automatically.
- DM: real DM list opens a real bounded conversation preview without fake messages.
- Workspace: a real recent server opens permission-filtered channels and a text-channel message preview.
- Sync: background the app, reopen it after the cooldown, and confirm visible real data refreshes without duplicate rows or request storms.
- Voice: Calls stays visible as a primary tab, but readiness surfaces stay honest until native permission and LiveKit contracts are connected.
- Store: App Store and Play Store listing text, screenshots, and privacy answers match the permission disclosure contract.
- Performance: five minutes idle shows no obvious heating, memory growth, or scroll stutter.
- Release: the build displays the intended UAT/production environment endpoints.
- Local Android: `android:uat:local` builds, installs, launches, and reaches the tab shell on the emulator.
- Production readiness: Profile diagnostics show UAT, store-candidate, and production gates without exposing PII or secrets.

## Security notes

- Only `EXPO_PUBLIC_*` values may be embedded into the mobile app.
- Production-like builds reject HTTP, localhost, and placeholder hosts.
- Mobile session storage uses Expo SecureStore and clears corrupted snapshots instead of trusting them.
- Diagnostics intentionally avoid raw tokens, user IDs, emails, and message content.
- Protected mobile areas render an auth gate until a real Whispr mobile session exists.
- Mobile deep links accept one-time handoff identifiers and invite codes only after strict validation.
- Access tokens, refresh tokens, OAuth codes, emails, passwords, and session values are rejected if they appear in deep-link query strings.
- Mobile permissions are never requested automatically on launch; prompts must follow a user action.
- Native notification permission is requested only from the Notifications screen setup action; raw push tokens are not displayed or logged.
- Native microphone permission is requested only from the Calls screen setup action; no audio recording, sampling, or voice connection starts during permission setup.
- Native camera and photo library permissions are requested only from Profile media setup actions; no camera session, media picker, or upload begins during permission setup.
- Native document picker opens only after the Profile file action and stores only sanitized file metadata; raw file paths are not shown in diagnostics.
- Runtime permission intents, native app config permissions, and store disclosure text are validated from the same contract.
- Native push token persistence and LiveKit mobile integration remain disabled until their server-side lifecycle, revocation, storage, and permission contracts are complete.

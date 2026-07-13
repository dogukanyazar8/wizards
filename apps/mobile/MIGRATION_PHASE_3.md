# Whispr Mobile - Phase 3 Migration Notes

## Scope

Phase 3 completes mobile social and account parity for friends, presence, profile editing,
two-factor authentication, GIF messages, server-derived link previews, DM details, and the settings
information architecture. M2-M4 are JavaScript-only and add no native dependency or rebuild
requirement; M1's already-verified native clipboard build remains the Phase 3 binary baseline.

## API contract map

- Friends, blocks, presence, profile, 2FA, Giphy search, Giphy attachment creation, DM creation, and
  DM details use authenticated `/api/v1/mobile/**` routes with named rate limits and strict shared
  zod schemas.
- `POST /api/v1/mobile/link-preview` delegates only to the existing SSRF-safe server fetcher. The
  device never fetches arbitrary message URLs, and the raw URL is never placed in a query key.
- `POST /api/v1/mobile/giphy/attachment` creates and owns the attachment on the server before the
  existing channel/DM send contract receives its bounded attachment input.

## Mobile screen and hook map

- `friends-hub.tsx` and `social-account-screens.tsx`: friends, requests, blocks, presence, profile.
- `mobile-two-factor-screen.tsx`: setup, confirmation, recovery-code presentation, and reauthenticated
  disable. QR, manual key, password, codes, and recovery codes are component-memory-only and are
  never logged, copied automatically, persisted, or included in device evidence.
- `mobile-gif-picker.tsx`: in-house BottomSheet plus FlashList search; selection feeds the existing
  message mutation through a server-created attachment.
- `mobile-link-preview-card.tsx`: message-id-keyed server previews and system-browser opening.
- `mobile-dm-details-screen.tsx`: participant, mutual servers, and shared attachments in FlashList.
- `settings-screen.tsx`: Account, Security, Appearance, Notifications, Language, About, and Developer
  destinations. Diagnostics/readiness are isolated under Developer.
- `use-mobile-messaging-feature.ts`: owns GIF attachment creation and channel/DM send orchestration.

All React Query data remains memory-only. Phase 3 adds no query persistence, offline cache, offline
queue, or local social/profile/message storage.

## Verification and device evidence

- Closure gates completed on 2026-07-13: web production build, typecheck, lint, and 575/575 tests
  across 148 suites; mobile typecheck, 351/351 contract tests across 60 suites, and 86/86 component
  tests across 17 suites; shared types typecheck and 42/42 tests across 7 suites.
- Mobile quality reported zero blockers, Expo dependencies were aligned, and the production audit
  reported no known vulnerabilities. Graphify was refreshed after the implementation changes.
- Railway deployed `f54f3109` successfully to `wizardsweb-uat.up.railway.app`; `/api/health`
  returned 200 and the anonymous Giphy mobile route returned the expected authenticated-boundary
  401 instead of the previous 404.
- `.maestro/phase3-social.yml` uses the single-attempt UAT login helper and writes ignored evidence
  only to `artifacts/mobile/phase3/closure/`. The `Pixel_10_Pro` post-deploy run passed and captured
  populated light/dark DM details, rendered GIF images, and the light security screen.
- GIF evidence waits for the `expo-image` load callback rather than only waiting for response data;
  this guards against blank Android WebP/GIF tiles.
- The flow intentionally does not start 2FA setup; security evidence therefore contains no QR,
  manual key, confirmation code, password, or recovery code.
- Post-run Android logcat contained no maximum-update-depth, render-boundary, fatal-exception,
  missing-native-module, or ExpoClipboard errors.

## Phase 4 handoff

- Avatar upload remains intentionally unavailable until the existing mobile upload readiness
  contract moves from `requires-server-contract` to a server-authorized upload/claim flow. Do not
  bypass it with base64, arbitrary URL, or device-only persistence.
- Server administration and moderation parity move to Phase 4; Phase 3 does not widen membership,
  role, permission, invite, or destructive server-management authority.

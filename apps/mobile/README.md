# Whispr Mobile

Expo React Native application for the iOS and Android Whispr mobile product.

## Current phase

Phase 5 turns the mobile foundation into a measurable product contract:

- Expo app shell under the existing monorepo.
- UAT, canary, and production EAS build profiles.
- Build-time public endpoint validation.
- Shared type package access through `@wizards/types`.
- SecureStore-backed mobile session repository.
- Fail-closed session normalization and token expiry helpers.
- Token-safe mobile API client with relative-path validation and timeouts.
- Typed mobile navigation contract for overview, chat, voice, and settings tabs.
- Auth-gated mobile screens that avoid fake messages, fake voice participants, or client-only privacy claims.
- Native deep-link parsing for sign-in handoff, invites, and safe in-app routes.
- Fail-closed rejection for deep links that include OAuth/session secrets in query strings.
- Permission readiness contracts for notifications, microphone, camera, and photo library access.
- Authenticated web bootstrap endpoint contract at `/api/v1/mobile/bootstrap`.
- Mobile bootstrap client validation that refuses malformed server payloads.
- EAS release readiness contract with HTTPS endpoint, profile, version, and performance budget checks.
- Mobile quality gate with automated checks, Android/iOS device matrix, and manual smoke checklist validation.
- Real mobile DM conversation preview backed by authenticated, bounded mobile API responses.

## Local development

```powershell
corepack pnpm install
corepack pnpm --filter @wizards/web dev
corepack pnpm --filter @wizards/mobile start
```

## Validation

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile validate:env
corepack pnpm --filter @wizards/mobile release:check
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
- `canary`: internal production-origin builds for dogfood/canary users.
- `production`: store distribution only.

Non-development profiles must use HTTPS, non-local Whispr endpoints. Secret-like values must not be embedded into EAS public env.

## Mobile performance budgets

- Cold authenticated launch: `<= 2500ms`.
- Warm foreground resume: `<= 700ms`.
- Chat input latency: `p95 <= 50ms`.
- Idle memory: `<= 180MB` after 5 minutes.

Record these values during UAT/canary QA before store promotion.

## Manual UAT smoke checklist

- Launch: app opens with the Whispr splash/icon and reaches the tab shell.
- Navigation: Overview, Chat, Voice, and Settings tabs switch without overlap or jank.
- Auth: signed-out protected screens show the auth gate and never impersonate a user.
- Handoff: web sign-in returns to the mobile app with the one-time handoff flow.
- Deep links: credential-like query values are rejected.
- Permissions: no camera, microphone, notification, or photo prompt appears before a user action.
- DM: real DM list opens a real bounded conversation preview without fake messages.
- Voice: voice surfaces stay honest until native permission and LiveKit contracts are connected.
- Performance: five minutes idle shows no obvious heating, memory growth, or scroll stutter.
- Release: the build displays the intended UAT/canary/production environment endpoints.

## Security notes

- Only `EXPO_PUBLIC_*` values may be embedded into the mobile app.
- Production-like builds reject HTTP, localhost, and placeholder hosts.
- Mobile session storage uses Expo SecureStore and clears corrupted snapshots instead of trusting them.
- Diagnostics intentionally avoid raw tokens, user IDs, emails, and message content.
- Protected mobile areas render an auth gate until a real Whispr mobile session exists.
- Mobile deep links accept one-time handoff identifiers and invite codes only after strict validation.
- Access tokens, refresh tokens, OAuth codes, emails, passwords, and session values are rejected if they appear in deep-link query strings.
- Mobile permissions are never requested automatically on launch; prompts must follow a user action.
- Native OAuth token exchange, push token persistence, and LiveKit mobile integration remain disabled until their server-side lifecycle, revocation, storage, and permission contracts are complete.

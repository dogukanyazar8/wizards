# Whispr Playwright E2E

This folder contains the browser E2E automation suite for Whispr.

The suite is designed to be deterministic, disposable, and safe by default:

- It never uses production data.
- It never uses production secrets.
- It resets only explicitly test-like databases.
- It mocks or test-gates external integrations where real third-party calls would be slow, flaky, or unsafe.
- It runs a fast smoke suite in CI and allows the full suite to be triggered manually.

## Current Status

Last verified test discovery:

- `48` Playwright tests
- `11` spec files
- `10` smoke tests used by default CI
- Browser project: Chromium

This is E2E scenario coverage, not line/branch coverage. The repo still needs a separate code coverage strategy for unit/integration tests if we want percentage-based coverage thresholds.

## What Is Automated

### Smoke

Spec folder: `apps/web/e2e/specs/smoke`

Covered:

- Login through the UI.
- Wrong password failure.
- Login/logout presence update.
- Authenticated app shell load.
- Settings open/close from the user bar.
- Server creation and opening.
- Default text/voice channel rendering through server open flow.
- Server text message send.
- Links opening in a new browser tab.
- DM open and DM message send.
- DM unread badge update.

### Realtime Multi-User

Spec file: `apps/web/e2e/specs/realtime/realtime.spec.ts`

Covered:

- Server message appears for another member without reload.
- DM message appears for another participant without reload.
- Friend request is visible without reload.
- Friend acceptance updates the sender without reload.
- Server member add creates realtime notification and rail update.
- Removed user no longer sees the server.
- Mentions notify the target user.
- Mentions render as highlighted message content.

### Message Interactions

Spec file: `apps/web/e2e/specs/message-interactions/message-interactions.spec.ts`

Covered:

- React to server messages.
- React to DM messages.
- Edit message.
- Delete message with custom modal, not browser confirm.
- Reply to message.
- User profile popup opens and closes.
- Emoji picker opens near composer.
- Reaction picker remains clickable and does not close too early.

### Uploads, GIFs, And Attachments

Spec file: `apps/web/e2e/specs/attachments/attachments.spec.ts`

Covered:

- Paste image into server composer.
- Open image lightbox.
- Upload file in DM.
- Send GIF when server GIFs are enabled.
- Disable GIF and file upload from server settings without manual reload.
- Confirm disabled server media controls behave correctly.

Implementation notes:

- UploadThing is mocked in E2E mode.
- GIPHY is mocked in E2E mode.
- These tests validate Whispr UI/client/server behavior without calling real third-party services.

### Voice And Screen Share

Spec file: `apps/web/e2e/specs/voice/voice.spec.ts`

Covered:

- Join voice channel.
- Mute and unmute.
- Deafen and undeafen.
- Leave voice channel.
- Another user sees voice join/leave without reload.
- Closing a browser tab cleans voice state.
- Opening settings does not disconnect voice.
- Screen share can be started in E2E mode.
- Screen share quality selector renders.
- Screen share state appears in the sidebar for other members.
- Permission denied states are graceful where mockable.

Implementation notes:

- Chromium fake media flags are enabled in Playwright config.
- LiveKit-heavy behavior is test-gated where needed.
- These tests validate Whispr media state, UI, and cleanup flows. They do not validate real microphone audio quality, real screen pixels, or real LiveKit infrastructure quality.

### Settings And Preferences

Spec file: `apps/web/e2e/specs/settings/settings.spec.ts`

Covered:

- Change language.
- Change theme.
- Notification settings update and persist.
- Advanced appearance controls update layout state.
- App icon preference updates favicon links.
- Voice input/output device selector UI renders.
- Device refresh keeps menus stable.
- About contributors render.

### Mobile Responsive

Spec file: `apps/web/e2e/specs/mobile/mobile-responsive.spec.ts`

Covered viewports:

- `360x800`
- `390x844`
- `430x932`
- `768x1024`

Covered:

- Login page does not horizontally overflow.
- Register page does not horizontally overflow.
- Mobile workspace drawer opens and closes.
- Mobile channel drawer/back flow works.
- Mobile chat composer sends a message.
- Mobile message actions use compact menu and reaction sheet.
- Mobile settings navigation stays inside viewport.
- Mobile notification popup fits viewport.

## What Is Intentionally Not Automated Yet

These are not blockers for the current E2E foundation, but they are good next steps:

- Real Google OAuth callback flow. Keep mocked/test-session auth for CI and test real OAuth manually or in a dedicated staging smoke job.
- Real Resend email delivery. CI should not send real emails by default.
- Real Cloudflare Turnstile challenge. CI should not depend on third-party challenge availability.
- Real UploadThing uploads. Current E2E validates Whispr behavior through a safe mock.
- Real GIPHY API. Current E2E validates Whispr GIF UI through a deterministic mock.
- Real LiveKit media infrastructure and audio/video quality. Current E2E validates app state and fake media flows.
- Cross-browser matrix beyond Chromium.
- Visual regression snapshots.
- Accessibility scan automation.
- Percentage-based unit/integration coverage thresholds.

## Environment

E2E runs must use an isolated database.

Required local environment:

```bash
E2E_TEST_MODE=true
E2E_DATABASE_URL=postgresql://wizards:wizards@localhost:5432/whispr_e2e
E2E_BASE_URL=http://127.0.0.1:3000
E2E_TEST_PASSWORD=<generate-a-local-e2e-password>
REDIS_URL=redis://localhost:6379
AUTH_SECRET=whispr-e2e-auth-secret-change-me-local-only
NEXTAUTH_SECRET=whispr-e2e-auth-secret-change-me-local-only
NEXTAUTH_URL=http://127.0.0.1:3000
APP_URL=http://127.0.0.1:3000
```

Optional test-mode values are provided by `playwright.config.ts` when not set:

```bash
E2E_MOCK_GIPHY=true
NEXT_PUBLIC_E2E_TEST_MODE=true
UPLOADTHING_TOKEN=e2e-uploadthing-token
LIVEKIT_API_KEY=e2e-livekit-api-key
LIVEKIT_API_SECRET=e2e-livekit-api-secret
LIVEKIT_URL=ws://127.0.0.1:7880
NEXT_PUBLIC_LIVEKIT_URL=ws://127.0.0.1:7880
```

Do not point `E2E_DATABASE_URL` at staging or production.
Generate a local E2E password with a password manager or a random-value command,
then keep it in your local environment only.

## Database Safety Guard

The reset helper refuses to run unless all of these are true:

- `E2E_TEST_MODE=true`
- `NODE_ENV` is not `production`
- database protocol is `postgres:` or `postgresql:`
- database host is local/test-safe, or database name is clearly test-like
- database name includes a test marker such as `e2e`, `test`, or `whispr_e2e`
- forbidden managed production host markers such as `railway`, `neon`, `supabase`, `render`, `amazonaws`, `azure`, `google`, and `vercel` are rejected

This guard is intentionally strict. If it blocks a run, fix the test database URL instead of weakening the guard.

## Seeded Data

The seed helper creates disposable, deterministic fixtures:

- `alice@whispr.test`
- `bob@whispr.test`
- `charlie@whispr.test`
- password from required `E2E_TEST_PASSWORD`
- `Whispr E2E Server`
- `e2e-text`
- `e2e-voice`
- Alice/Bob DM conversation

## Commands

Run all E2E tests:

```bash
pnpm --filter @wizards/web e2e
```

Run smoke tests:

```bash
pnpm --filter @wizards/web e2e:smoke
```

Run headed:

```bash
pnpm --filter @wizards/web e2e:headed
```

Open Playwright UI:

```bash
pnpm --filter @wizards/web e2e:ui
```

Reset and seed E2E data manually:

```bash
pnpm --filter @wizards/web e2e:seed
```

Show the last HTML report:

```bash
pnpm --filter @wizards/web e2e:report
```

List tests without running them:

```bash
pnpm --filter @wizards/web e2e -- --list
pnpm --filter @wizards/web e2e:smoke -- --list
```

Use an already-running app server:

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm --filter @wizards/web e2e:smoke
```

## Local Run Checklist

1. Start a local PostgreSQL database named `whispr_e2e`.
2. Start Redis on `localhost:6379`.
3. Export the E2E environment variables above.
4. Apply migrations to the E2E database:

```bash
pnpm --filter @wizards/db exec prisma db push --schema prisma/schema.prisma --skip-generate
```

5. Install Playwright browsers once:

```bash
pnpm --filter @wizards/web exec playwright install chromium
```

6. Run smoke or full E2E:

```bash
pnpm --filter @wizards/web e2e:smoke
pnpm --filter @wizards/web e2e
```

## Auth Helpers

Use `loginViaUi(page, "alice")` for the dedicated login smoke test.

Use `loginAs(page, "alice")` for most specs. It calls the test-only
`/api/e2e/auth/session` route, which is unavailable unless:

- `E2E_TEST_MODE=true`
- `NODE_ENV` is not `production`
- the request host is local loopback (`localhost`, `127.0.0.0/8`, or `::1`)
- configured app URLs such as `APP_URL`, `AUTH_URL`, `NEXTAUTH_URL`, and
  `E2E_BASE_URL` are also local loopback URLs when present

The helper creates the same Auth.js JWT cookie shape expected by middleware and marks the seeded E2E user online. `logout(page)` clears that session and marks the user offline.

Production and remote staging auth are not weakened for tests. Do not point
`E2E_BASE_URL` at a remote deployment when using the session helper.

## CI Integration

Workflow: `.github/workflows/ci.yml`

Default push/PR flow:

1. `verify`
2. `Playwright E2E`

`verify` runs:

- dependency install
- Prisma Client generation
- lint
- typecheck
- unit/integration tests
- build
- dependency audit

`Playwright E2E` runs after `verify` and creates isolated services:

- PostgreSQL `16-alpine` with database `whispr_e2e`
- Redis `7-alpine`

Then it runs:

- install dependencies
- generate Prisma Client
- apply migrations to the E2E database only
- install Playwright Chromium with dependencies
- run smoke E2E tests
- upload Playwright report and test results on failure

Manual GitHub Actions run:

- `e2e_scope=smoke` runs smoke tests.
- `e2e_scope=full` runs the full 48-test suite.

The default CI intentionally runs smoke tests only to keep push/PR feedback fast and reliable.

## Debugging

Run headed:

```bash
pnpm --filter @wizards/web e2e:headed
```

Run UI mode:

```bash
pnpm --filter @wizards/web e2e:ui
```

Run a single spec:

```bash
pnpm --filter @wizards/web e2e -- e2e/specs/mobile/mobile-responsive.spec.ts
```

Run one test by title:

```bash
pnpm --filter @wizards/web e2e -- -g "mobile notification popup fits the viewport"
```

Open report:

```bash
pnpm --filter @wizards/web e2e:report
```

Trace, screenshots, and video are configured in `playwright.config.ts`:

- trace on first retry
- screenshot only on failure
- video retained on failure

## Maintenance Rules

- Prefer stable `data-testid` selectors for product-critical flows.
- Keep E2E helpers test-only and gated.
- Do not add sleeps unless testing timing stability explicitly.
- Prefer `expect.poll` for realtime state that arrives asynchronously.
- Keep smoke tests fast.
- Put expensive multi-user/media tests outside smoke unless they protect a critical regression.
- Never add production secrets to tests, CI, or docs.

## Recommended Next Steps

Short term:

- Add a small accessibility smoke layer for auth, chat, settings, and mobile drawer.
- Add a visual regression baseline for auth pages and main shell.
- Add a browser matrix for WebKit and Firefox after Chromium is stable.

Medium term:

- Add staging-only checks for real Resend, Google OAuth, Turnstile, UploadThing, GIPHY, and LiveKit.
- Add coverage thresholds for unit/integration tests.
- Add quarantine tagging for known flaky external-service tests if staging checks are introduced.

Long term:

- Add desktop/Tauri-specific E2E once the Tauri shell exists.
- Reuse these browser E2E flows as the web foundation for desktop acceptance tests.

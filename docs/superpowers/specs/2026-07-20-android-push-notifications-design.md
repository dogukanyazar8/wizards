# Android Push Notifications — Design

**Date:** 2026-07-20
**Status:** Approved (user, 2026-07-20)
**Scope:** Deliver Android (and iOS-ready) push notifications for every user-visible notification type — DM messages, channel mentions, thread replies, friend requests/accepts, server invites, system/moderation — plus DM voice/video call ringing, in the style of Discord/Slack/Teams.

## Context

- Mobile client already integrates `expo-notifications`: permission flow, Expo push token fetch, and token registration against `POST /api/v1/mobile/notifications` (`apps/mobile/src/notifications/mobile-notification-runtime.ts`).
- Backend stores the token in Redis keyed by hashed session id (`apps/web/src/lib/mobile/push-notifications.ts`) — but **nothing ever sends a push**.
- In-app notification rows are created by dedicated services (`apps/web/src/lib/dm/notification-service.ts`, `apps/web/src/lib/workspace/message-notification-service.ts`, friends service), all invoked from outbox worker jobs with retry semantics. Mute/notification-preference filtering already happens there.
- DM calls are pure socket signaling (`dm:call:start` → `dm:call:incoming` in `apps/web/src/lib/socket/handlers/dm.ts`); no notification row, no push.
- FCM is not configured: no `google-services.json`, no `googleServicesFile` in `app.config.js`, no FCM V1 server credential in EAS. Without this, Android push cannot be delivered regardless of code.

## Decisions (user-approved)

1. **Call notification depth:** high-priority actionable notification — dedicated `whispr-calls` Android channel (importance MAX, ring-like vibration), `incoming-call` notification category with Answer/Decline actions. No native ConnectionService / full-screen intent in v1.
2. **Scope:** all visible notification types push, not just DM/mention/call.
3. **Token storage:** move from Redis to a Prisma `MobilePushToken` table (userId-indexed, multi-device, durable, easy dead-token pruning).
4. **Delivery architecture:** push sending embedded in the existing notification services (which already run inside outbox jobs → retries for free). Calls send inline from the socket handler for minimal latency.

## Architecture

### 1. Data: `MobilePushToken` (Prisma, packages/db)

| column | notes |
|---|---|
| `id` | cuid PK |
| `userId` | indexed; FK → User, cascade delete |
| `sessionKey` | sha256(sessionId) base64url, **unique** — one token per session |
| `token` | Expo push token, **unique** (a device token moves between sessions on re-login) |
| `tokenFingerprint` | sha256(token) base64url, returned to client |
| `platform` | `android` \| `ios` |
| `provider` | `expo` |
| `registeredAt` / `lastSeenAt` | registration + refresh timestamps |

- `registerMobilePushToken` upserts by `sessionKey` (and deletes any other row holding the same `token`).
- `revokeMobilePushToken` deletes by `sessionKey` (logout path unchanged).
- Expo `DeviceNotRegistered` ticket → delete row.
- Redis storage in `apps/web/src/lib/mobile/push-notifications.ts` is replaced; API request/response contracts (`@wizards/types`) unchanged.

### 2. Sender: `apps/web/src/lib/mobile/push-sender.ts`

- Plain `fetch` to `https://exp.host/--/api/v2/push/send`, batches of ≤100 messages. No new dependency.
- Input: `{ userIds, title, body, data, androidChannelId, categoryId?, priority? }`.
- Looks up tokens by `userId`; no tokens → silent no-op.
- Data payload always includes `{ kind, actionUrl?, ...ids }` so the client can deep-link.
- Ticket handling: `DeviceNotRegistered` → prune token row; other errors → log via `logError`, never throw into the caller (push failure must not fail the outbox job's primary work).
- Fire-and-forget from callers (`void ...catch`), same pattern as `emitServerUnreadUpdateToUser`.

### 3. Hook points (feed notifications)

After `prisma.notification.createManyAndReturn` in:

- `createDMMessageNotifications` — title/body already localized per recipient.
- `createChannelMentionNotifications`
- `createChannelThreadReplyNotification`
- friends service (request / accept)
- server invite / member events where Notification rows are created

Push reuses the exact `title`/`body` persisted on the Notification row (already locale-aware) and sends on Android channel `whispr-default`. Because these services already apply mute/preference filtering, push inherits it automatically.

### 4. Calls (inline, low latency)

In `dm:call:start` handler, after socket emit: push to all callee participants —

- channel `whispr-calls`, category `incoming-call`, `priority: "high"`.
- title: caller display name; body: localized "Incoming voice/video call".
- data: `{ kind: "dm-call", conversationId, fromUserId, callType }`.

**v1 limitation (accepted):** Expo push cannot remotely dismiss a delivered notification. If the app process is dead and the caller cancels, the notification stays until tapped. When the app is alive, the existing `dm:call:cancelled`/`ended` socket events trigger client-side dismiss.

### 5. Mobile client

- `ensureAndroidNotificationChannel` grows into channel setup for both `whispr-default` and new `whispr-calls` (importance MAX, vibration pattern, bypass DND off).
- `setNotificationCategoryAsync("incoming-call", [Answer, Decline])` at runtime init.
- `setNotificationHandler`: foreground — suppress banners for feed notifications (in-app UI already covers them), show + sound for `kind: "dm-call"`.
- Notification response listener: tap → navigate using `actionUrl`/data through existing navigation/linking; Answer → open DM call UI in accept mode; Decline → emit `dm:call:decline` over socket + dismiss.
- Token registration flow unchanged.

### 6. FCM setup (user-owned, documented step)

1. Create Firebase project, add Android app with package from `mobile-store-contract-data.json`.
2. Download `google-services.json` → `apps/mobile/google-services.json`; add `android.googleServicesFile` to `app.config.js`.
3. Upload FCM V1 service-account key to EAS (`eas credentials` → Android → Google Service Account Key → FCM V1).
4. Rebuild the app (dev client + UAT builds).

Documented in `apps/mobile/README.md` (or dedicated doc) as a checklist; code merges before credentials exist and degrades silently (tokens just fail to mint / pushes no-op).

### 7. Error handling

- Sender never throws to callers; logs with context (`type: "mobile_push"`).
- Expo API 429/5xx: single retry with small backoff inside sender; beyond that rely on outbox job retry (feed) or accept loss (call ring — stale retry is worse than none).
- Malformed tickets tolerated (zod-parse with safe fallback).

### 8. Testing

- `push-sender.test.ts`: batching, fetch payload shape, DeviceNotRegistered pruning, error swallowing, retry.
- Token store tests: register upsert, token-steal across sessions, revoke, prune.
- Service hook tests: push called with persisted title/body, muted recipients excluded (existing test files extended).
- Socket call handler test: push payload for callee, none for caller.
- Mobile: contract tests for channel/category constants, foreground handler policy, response-listener routing (jest component tests + `node --test` contract tests, per repo convention).

## Out of scope (v1)

- iOS credential setup (code is platform-neutral; APNs config later).
- Remote dismiss of call notifications (needs data-only FCM + headless JS or notifee).
- Full-screen incoming-call UI / ConnectionService.
- Expo push receipt polling (tickets handled; receipts later if delivery issues surface).
- Web/desktop push.

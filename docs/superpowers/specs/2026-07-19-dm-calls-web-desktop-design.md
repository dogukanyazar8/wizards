# DM voice and video calls on web, desktop and mobile

Date: 2026-07-19
Status: approved (design), implementation pending

## Problem

Mobile ships DM voice (5e) and video (5f) call screens. Web and desktop have neither: the
DM toolbar renders a permanently disabled phone button (`dm.header.voiceComingSoon`) and a
standalone screen-share button that starts a shareonly LiveKit session.

Goal: DM voice and video calls on web and desktop, styled after the existing voice-channel
room, with screen sharing available inside a call instead of as a separate DM feature, and
call signalling shared with mobile so a call rings across platforms.

## Existing building blocks

- `apps/web/src/lib/livekit/server.ts:223` — `createLiveKitToken` already accepts
  `conversationId` and resolves a DM room name. No server token work needed.
- `apps/web/src/lib/voice/client.ts:68` — `fetchLiveKitToken` already carries `conversationId`.
- `apps/web/src/hooks/use-dm-screen-share.ts` — an existing DM LiveKit flow with
  offer/accept/decline signalling over `dm:screenshare:*`. The call flow copies its shape and
  replaces it.
- `apps/web/src/lib/socket/handlers/dm.ts` — DM socket handlers with
  `requireUnblockedDMParticipants` and `parseSocketPayload` guards.
- `apps/mobile/src/voice/use-mobile-voice-room.ts:1142` — `joinDirectCall` already joins a
  conversation room; only the ring handshake is missing.
- `apps/desktop` — Tauri shell over the web app. No desktop-specific UI; web changes cover it.

## Scope

In scope: 1:1 DM voice calls, 1:1 DM video calls, in-call screen share, cross-platform ring
(web, desktop, mobile), removal of the standalone DM screen-share feature.

Out of scope, deliberately: group DM calls, missed-call system messages, push notifications
for calls when the app is closed (ring requires a live socket connection).

## Architecture

### 1. Signalling

New socket events in `apps/web/src/lib/socket/events.ts`, handled in `handlers/dm.ts` next to
the existing DM handlers and guarded the same way.

Client to server:

| Event | Payload |
| --- | --- |
| `dm:call:start` | `{ conversationId, video }` |
| `dm:call:accept` | `{ conversationId, fromUserId, video }` |
| `dm:call:decline` | `{ conversationId, fromUserId }` |
| `dm:call:cancel` | `{ conversationId }` |
| `dm:call:end` | `{ conversationId }` |

Server to client:

| Event | Payload |
| --- | --- |
| `dm:call:incoming` | `{ conversationId, fromUser: { id, username, displayName, avatarUrl }, video, expiresAt }` |
| `dm:call:accepted` | `{ conversationId, userId, video }` |
| `dm:call:declined` | `{ conversationId, userId }` |
| `dm:call:cancelled` | `{ conversationId, userId }` |
| `dm:call:ended` | `{ conversationId, userId }` |

Ring lifetime is 45 seconds, carried as `expiresAt`. The caller's client cancels on timeout;
the callee's ring UI dismisses itself at the same instant. Server keeps no ring state (same as
`dm:screenshare:*`), but emits `dm:call:cancelled` to the callee when the caller's socket
disconnects mid-ring. There is no busy state: a second incoming call replaces the ring UI.

Payload schemas live in `packages/types` so mobile validates the same shapes.

### 2. Web and desktop client

- `live-voice-provider.tsx` gains a session target rather than a channel target: store keeps
  `sessionMode: "channel" | "direct"` and `activeConversationId`, and exposes
  `joinDirectCall({ conversationId, video })`. Voice presence, heartbeat and voice-state emits
  are channel-scoped, so they are skipped when `sessionMode === "direct"`; channel voice
  behaviour is unchanged.
- New `apps/web/src/hooks/use-dm-call.ts` owns the ring state machine
  (`idle | ringing-out | ringing-in | connecting | connected | ended`) and the socket wiring.
- New `apps/web/src/components/dm/dm-call-view.tsx` renders the call inside the DM conversation
  area; the DM sidebar and conversation list stay in place. A minimize control collapses the
  call into a persistent bar (the `active-voice-reminder` pattern) so the user can keep typing.
- `voice-channel-view.tsx` is 2037 lines and holds the room presentation the DM call needs.
  The stage (screen-share and camera focus), the participant tile and the control dock move to
  `apps/web/src/components/voice/room/*` and both views consume them. No other refactoring.
- `DmConversationToolbar` (`components/dm/dm-conversation.tsx`): the disabled phone button
  becomes a working voice-call button, a video-call button is added, the `MonitorUp`
  screen-share button is removed.
- Incoming-call dialog mounts at `authenticated-app-providers` level so a call rings from any
  screen, with the ringtone played through `sound-effects-provider`.

### 3. Mobile

- `dm:call:*` added to the mobile realtime allow-list (`mobile-realtime-contract.ts`) with the
  shared schemas.
- Incoming-call UI reuses the 5e chrome (caller avatar, accept and decline). Accept calls
  `joinDirectCall({ video })`; decline emits `dm:call:decline`.
- Outgoing calls keep joining the room right away but no longer land straight in the connected
  screen: emit `dm:call:start`, show a ringing state over the 5e screen, switch to connected on
  `dm:call:accepted`, emit `dm:call:cancel` and leave the room when the user backs out or the
  ring expires.
- The existing `dmCallsAlwaysRing` notification preference gates the ringtone. Ringing works
  only while the app has a live socket; no push wake-up.

### 4. Screen-share migration

`use-dm-screen-share.ts`, its `chat-area.tsx` mount points (incoming-share prompt, active-share
viewer, error banner), the `dm:screenshare:*` events, their handlers and their tests are
deleted. Sharing inside a call uses the provider's existing `toggleScreenShare`, so desktop
keeps the current `getDisplayMedia` path.

## Data flow

1. Caller presses voice or video in the DM toolbar.
2. Client emits `dm:call:start`, enters `ringing-out`, and joins the LiveKit conversation room
   immediately (so audio is live the moment the callee accepts).
3. Server validates DM participation and relays `dm:call:incoming` to the other participant's
   user room.
4. Callee's client shows the ring dialog. Accept emits `dm:call:accept` and joins the same room;
   decline emits `dm:call:decline`.
5. Caller receives `dm:call:accepted` and switches to `connected`, or receives
   `dm:call:declined` / hits `expiresAt` and tears the room down.
6. Either side leaving emits `dm:call:end`; the peer tears down on `dm:call:ended`.

## Error handling

- Microphone or camera permission denial surfaces inline in the call view and leaves the room
  (existing provider error strings).
- LiveKit connect failure ends the ring and emits `dm:call:cancel`.
- Socket disconnect during a call: LiveKit keeps the media session; the peer sees the call end
  only when the room connection drops.
- Blocked users and non-participants are rejected by the existing `requireUnblockedDMParticipants`
  guard, matching the screen-share handlers.

## Testing

- Socket handler tests for each new event, following `handlers/dm.test.ts`.
- Ring state machine tests for `use-dm-call.ts` (accept, decline, timeout, cancel, peer end).
- Component test for the DM toolbar (voice and video present, screen-share gone) and the call
  view.
- Mobile: node tests for the realtime contract additions, jest tests for the incoming-call UI.
- Types tests for the new schemas.
- Gates: web, mobile and types typecheck; web test suite; mobile 559 node tests plus the jest
  component suite.

## Risks

- `live-voice-provider.tsx` is 2849 lines and channel-coupled. Every change sits behind a
  `sessionMode` guard so channel voice keeps its current behaviour, verified by the existing
  voice tests.
- Extracting room presentation from `voice-channel-view.tsx` touches a large, well-tested file.
  The extraction is mechanical (move, no behaviour change) and the channel view keeps its tests.

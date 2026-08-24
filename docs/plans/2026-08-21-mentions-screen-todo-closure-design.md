# Bahsedilmeler TODO Closure Design

**Date:** 2026-08-21

## Goal

Close every known Bahsedilmeler source TODO and the related parity gaps without changing unrelated product behavior. Web and desktop become complete; mobile receives the bounded compatibility work required by K8.

## Data and authorization

- Add nullable `Message.threadClosedAt` and `Message.threadClosedById` fields. Only a root message represents thread state.
- The root author or a member with `MANAGE_MESSAGES` may close/reopen a thread after `VIEW_CHANNEL` is proven.
- Closed threads reject new replies in every channel send path, including Socket.IO and mobile HTTP. Existing messages remain readable.
- Add a close/reopen route and expose state through existing thread and mention contracts.

## Mention read model

- Add `messageId` to `Mention`; reply targeting must never parse navigation URLs.
- `MentionListResponse` carries exact filtered `total` and a selected source title. The list service resolves both from the same visibility scope as the page.
- Mention counts carry the viewer's real mentionable role names.
- Resolve unnamed group-DM titles in one batched read and reuse the existing group-presentation helper.
- Derive thread openness from `threadClosedAt`, not deletion.
- Keep everyone semantics language-neutral on the server; clients render `kind=everyone` through locale copy.

## Reply composer and acknowledgement

- Extend existing channel/DM socket send events with an optional acknowledgement. Existing callers remain compatible.
- A mention reply clears and closes only after a positive acknowledgement. Timeout/error preserves content and attachments.
- Reuse the current emoji picker, UploadThing uploader, attachment limits and validation. No second upload abstraction.
- Expose authenticated user/avatar and upload availability through a narrow existing provider context for summary and reply UI.

## UI parity

- Use exact list total for the header in every filter/search/source combination.
- Preserve selected source name in empty results.
- Use the authenticated user's real avatar in the summary.
- Add one backwards-compatible custom-header option to shared `Modal`; default consumers remain unchanged. Mention settings uses the approved bell header.

## Desktop and mobile

- Desktop notification delivery respects `all`, `mentions`, `off`, streamer mode, foreground state and quiet hours. Quiet hours suppress only the native/web toast; counters still update.
- Mobile thread follow reads real state and writes through authenticated mobile GET/PUT/DELETE endpoints with rollback on failure.
- Mobile server-level mention badges use the same `Notification + MentionState` count source as Bahsedilmeler. Channel and DM row badges retain their existing local read-state sources per K4.

## Verification

- Test-first focused unit/route/component coverage for every behavior.
- Run package typechecks, focused lint/tests, relevant builds, TODO scan and `graphify update .`.
- No commit, push, deployment or live mutation in this session.

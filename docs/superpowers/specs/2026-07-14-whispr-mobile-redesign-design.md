# Whispr Mobile Redesign Design

**Status:** Review requested. The architectural direction was approved on 2026-07-14; implementation starts only after this written specification is reviewed.

## Objective

Rebuild the Whispr mobile product around the canonical `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` reference while preserving the existing Expo/React Native provider architecture, production data sources, authentication boundaries, permission policy, realtime behavior, LiveKit ownership, localization, and accessibility contracts.

The delivered product must provide four primary tabs, a persistent in-tab mini voice bar, a guarded full-screen voice room, a server switcher sheet, light and dark themes, and the seven unique product surfaces represented by references 1a-1g. Runtime UI must never use fabricated content. Missing server capabilities are implemented before their dependent UI instead of being silently omitted.

## Source of Truth and Conflict Rules

The source priority is explicit:

1. The HTML is authoritative for visual geometry, typography, colors, icon paths, and component placement.
2. The README is authoritative for behavior, data ownership, navigation, permissions, states, accessibility, and acceptance criteria.
3. The PNG files are low-resolution visual previews only. They are not pixel-diff baselines.
4. Existing product behavior remains authoritative where the handoff does not define a replacement.

Conflicts are resolved as follows:

- References 1a-1g are seven unique product surfaces. Reference 1h is explicitly excluded. References 1i and 1j are dark-theme validation states, not additional routes.
- The light 1b structure is authoritative for chat functionality. The dark 1j frame supplies dark-theme values only; it does not remove the member-list or emoji actions.
- A connected mini voice bar appears on every tab in both themes. Its absence from 1i is treated as a reference-state omission, not a dark-theme behavior change.
- The HTML page background, outer frame shadow, outer device border/radius, and drawn status-bar glyphs are design-document chrome. They are not rendered by the application.
- Screen-specific HTML values override general README ranges. For example, the 44-point server avatar uses the HTML radius for that component even when the general avatar table rounds differently.
- Visual controls smaller than 44 points keep their visible HTML geometry and receive a minimum 44-point press target through their container or `hitSlop`.
- Standard identity avatars are squircles. The 24-point stacked voice-presence avatars retain the canonical shape defined by the corresponding HTML row.
- WCAG 2.2 AA takes precedence when a raw reference text/color pair fails the required contrast. Only the exact normalized substitutions documented below are allowed; raw 1i/1j remain evidence and runtime captures compare to the accessible normalized golden.

## Scope Matrix

### Full layout redesign

- 1a Servers/home, including real channel previews and all-channel voice occupancy.
- 1b Channel chat, including header, virtualized message stream, reply/reaction/typing behavior, and composer.
- 1c Messages, including Conversations, Friends, and Requests segments.
- 1d Notifications, including permission card, paginated feed, read state, and deep links.
- 1e Active voice room, dark in every theme.
- 1f Profile root and settings entry cards, using real identity, presence, secure-session status, theme/language preferences, build metadata, and confirmed logout.
- 1g Server switcher bottom sheet.
- Shared floating four-tab navigation and connected mini voice bar.

### Theme migration without information-architecture redesign

Auth screens, profile editing, blocked users, security, settings details, DM details, server management, member management, channel management, media sheets, and destructive confirmation flows keep their current routes and behavior. They consume the new semantic theme and font but do not adopt unreferenced layouts. Focused regression tests protect their actions, test IDs, accessibility, and compact-screen fit.

Within 1c, the segment bar and Conversations body receive the canonical redesign. Friends and Requests keep their existing social row/actions and state behavior inside the new segment shell, consuming shared avatar, spacing, and theme primitives without inventing an unsupported conversation layout. Channel search, member list, new-message picker, server join/create, profile edit, appearance selection, and logout confirmation are likewise named theme-migration surfaces rather than new full-layout designs.

### Explicitly out of scope

- Reference 1h and any rail experiment or feature flag.
- Query persistence, offline message persistence, mutation replay, or an offline mutation queue.
- Authentication, Expo SDK, React Native, React, database engine, or navigation-library upgrades.
- Unrelated web or desktop visual redesign.
- Replacing LiveKit, the existing mobile API authentication model, or the provider/container architecture.
- Removing existing camera, screen-share, push-to-talk, audio-device, privacy-shield, or app-lock capabilities. Controls not shown in 1e remain reachable through the voice settings sheet.

## Approaches Considered

### A. UI-first with conditional omissions

Restyle current screens and hide any element whose API is missing. This is fast but cannot satisfy the README: notifications, previews, unread counters, and voice occupancy would be incomplete. This approach is rejected.

### B. Expand bootstrap into one large redesign payload

Add every notification, DM, server, channel-preview, and voice field to bootstrap. This reduces the number of initial requests but creates an unbounded home payload, couples unrelated refresh lifecycles, and makes realtime invalidation coarse. This approach is rejected.

### C. Contract-first bounded domain queries

Keep bootstrap as a bounded startup summary and add typed, paginated mobile domain endpoints and narrow React Query caches for complete lists. Realtime events patch or invalidate only the owning cache. This is the selected approach because it preserves existing architecture, supports large accounts, and makes every UI state independently testable.

For visual verification, manual comparison and client-side mock fixtures are rejected. The selected approach renders canonical HTML references deterministically and compares them with a real API-backed UAT account whose data is prepared server-side for test use. No fixture data is compiled into the app.

## Architecture

The existing dependency direction remains:

```text
mobile API routes and shared schemas
  -> bounded mobile clients
  -> TanStack Query options and mutations
  -> provider-owned feature hooks
  -> screen-provider props
  -> navigation containers and presentation components
```

`mobile-product-app.tsx` remains composition-only. It must not absorb new domain state machines. Remote state remains in TanStack Query, transient navigation/composer state remains in the existing focused stores, LiveKit room ownership remains in `useMobileVoiceRoom`, and persisted presentation preferences remain bounded AsyncStorage values.

All external responses are parsed by shared Zod schemas before reaching UI code. IDs are encoded into URL paths, pagination limits are bounded, mutations are rate-limited, and server authorization is verified before reading or mutating data.

## Capability and Data Contract Gate

No redesign screen task starts until the following contracts are implemented and green.

### Notification feed

Create a shared mobile notification module under `packages/types` containing:

- a bounded notification actor containing the validated public actor ID already exposed by the access-aware mapper; that public ID is the shared deterministic avatar seed, while recipient IDs and internal-only identifiers remain forbidden;
- notification kind, a bounded typed presentation payload, a discriminated allowlisted target union, read state, created time, and an optional bounded legacy fallback body;
- cursor-based list request/response schemas;
- single-read and read-all responses.

Add bearer-auth mobile routes:

- `GET /api/v1/mobile/notification-feed?cursor=&limit=`;
- `PATCH /api/v1/mobile/notification-feed/[notificationId]/read`;
- `PATCH /api/v1/mobile/notification-feed/read-all`.

The routes use a dedicated keyset page ordered by `(createdAt, id) DESC`, defaulting to 30 and capped at 50 rows, and return an aggregate unread count. They reuse the existing access-aware notification mapper, enforce ownership and rate limits, and return no raw internal metadata, raw URL, route name, recipient ID, or internal-only identifier. The bounded actor's validated public ID is explicitly allowed because it already identifies that visible actor and is the cross-surface avatar seed; it must never be substituted with a recipient, tenant, credential, or database-internal identifier. Persisted legacy `actionUrl` values are treated as untrusted server input and converted server-side to a typed target; unsupported or malformed values become `none`, and the mobile UI never receives or interprets the raw URL.

The persisted-kind migration matrix is explicit:

| Notification kind       | Mobile target                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `MENTION`               | `channel-message` with accessible server/channel/message IDs                                          |
| `DM`                    | `dm-conversation` with an accessible conversation ID                                                  |
| `FRIEND_REQUEST`        | `messages-segment` with `requests`                                                                    |
| `FRIEND_ACCEPTED`       | `messages-segment` with `friends`                                                                     |
| `SERVER_INVITE`         | accessible `channel` or `server`; this kind represents completed membership, not a pending capability |
| `VOICE_ROOM_STARTED`    | `voice-channel` with accessible server/channel IDs                                                    |
| `MODERATION` / `SYSTEM` | allowlisted `server`, settings destination, or `none` according to the existing record                |

A `voice-channel` target always opens explicit join confirmation and never aliases to `ChannelChat`. External pending invite capabilities use the separate SecureStore/explicit-confirmation flow and are never inferred from a `SERVER_INVITE` notification. Target resolution rechecks access at tap time; a now-inaccessible target remains readable and shows a localized non-navigating result.

Known kinds render localized Turkish/English templates on the client from typed actor/server/channel fields and bounded user-authored excerpts. Existing system/moderation records may use the sanitized fallback body, but raw metadata is never exposed and the client never parses prose to recover navigation or identity.

`mobile-notification-feed-client.ts`, query options, mutations, and cache helpers own the mobile feed. Single-read addresses one owned notification. Every list response includes a short-lived, user-bound, tamper-evident server read-all watermark for the complete feed snapshot; read-all validates and submits that token so a notification committed after the snapshot remains unread even when it is not in a loaded page. Both mutations update cache optimistically. Failure uses compare-and-swap rollback: it restores captured fields only while their mutation revision is still current; if a realtime event changed the cache, it removes only the failed optimistic patch and performs a bounded authoritative refetch.

Replace the legacy `notification:new` payload atomically for web and mobile with a shared `notification:feed:invalidated` DTO containing a user-scoped feed revision, reason (`new`, `read`, or `read-all`), and optional bounded notification IDs. Creation, single-read, and read-all commits emit it to every device for that user. Both clients apply only newer feed revisions and refetch their access-aware feed/unread count; raw `metadata`, `actionUrl`, type-specific secrets, and user ID are no longer emitted to any client room. Server serializer plus web/mobile listener and two-device read tests prevent one client from retaining the legacy payload or a stale badge.

The product notification kind set includes all currently persisted kinds plus a database-backed voice-room-start kind and outbox job. Pending `VoiceState` is not evidence that a room started. A signature-verified LiveKit participant event confirms transport authenticity only and acts as a reconciliation trigger; event payload state alone can never open a lifecycle or fanout. Before any lifecycle transition, the handler reads the current RoomService participant set under the existing channel-scoped Redis lock, maps the signed room name/metadata to one canonical server/channel record, and verifies every participant identity against active-user, current-membership, and voice-permission state. Unauthorized participants are excluded from the confirmed projection and lifecycle calculation and are removed from the LiveKit room when the provider operation is available; removal failure is retried and metered without treating the participant as authorized. Only the first currently present authorized participant opens an immutable lifecycle and enqueues a durable outbox job in the same database transaction. A one-row-per-channel lifecycle pointer and serializable compare-and-swap revision enforce at most one active lifecycle in the database even if the Redis lock expires or two distinct events race; webhook and reconciler use the same primitive. Event IDs are deduplicated, while a distinct stale `join` arriving after `leave` observes the current empty RoomService set and creates neither lifecycle nor outbox. A 30-second reconnect grace prevents rapid reconnect spam, and the lifecycle closes only after authorized confirmed occupancy remains zero through that grace period.

Fanout is paged and rate-limited. The actor is excluded; every recipient must still have channel access, account mobile notifications enabled, applicable server/channel mute rules satisfied, and the relevant in-app or push preference enabled. `(kind, channelId, lifecycleId, recipientId)` is unique, so concurrent workers cannot duplicate a row, and a 15-minute per-recipient/channel cooldown bounds deliberate rapid lifecycle churn. The bounded `voice-channel` target enters the normal user-confirmed join and microphone-permission flow; the row is never synthesized in the client.

Lifecycle state, webhook event IDs, close-grace deadline, channel revision, fanout cursor, and outbox progress are durable. A bounded reconciler treats LiveKit RoomService as the transport source, then applies the same canonical room mapping, active-user, membership, and voice-permission authorization as the webhook before projecting occupancy. It repairs missed/out-of-order webhooks, evicts unauthorized participants when possible, rechecks authorized occupancy before compare-and-swap close, and resumes overdue close/fanout work after process restart. Each fanout page atomically creates unique notification rows, creates per-delivery push/socket outbox records with idempotency keys, and advances its cursor in one database transaction. Separate delivery workers send those durable records, so a crash cannot skip a page between cursor advance and external delivery.

Retention is explicit and never applies to an active lifecycle pointer, open lifecycle, live close-grace deadline, or pending delivery. Signature-verified webhook dedupe rows and completed delivery-outbox rows expire after 7 days; closed lifecycle records and permanently failed delivery rows expire after 30 days. An hourly idempotent cleanup job deletes at most 500 eligible rows per transaction, repeats bounded batches through the normal worker budget, and reports eligible, deleted, pending, permanently failed, and oldest-record-age metrics. Replay/dedupe tests cover events inside and outside the 7-day horizon, and cleanup tests prove that active or retryable work is never collected.

### Complete DM conversations

Add paginated `GET /api/v1/mobile/dm?cursor=&limit=` alongside the existing create/open mutation. It uses the existing stable `(lastMessageAt, id) DESC` keyset, defaults to 30 rows, caps the page at 50, and batches participant presence for the entire page instead of performing one Redis lookup per conversation. Its shared summary includes:

- conversation identity and participants;
- unread count and muted state;
- last activity timestamp;
- a sanitized last-message preview containing bounded text, author identity, ownership (`isOwn`), and message kind.

Deleted, inaccessible, hidden, attachment-only, or blocked content uses the existing semantic fallbacks and never leaks raw text. The query is cursor-based and the Messages screen is not limited to bootstrap's five recent conversations.

Add bearer-auth mobile mark-read mutations for DM conversations. The request carries the last visible `throughMessageId`; the server verifies that message belongs to the accessible conversation and marks only through that high-watermark. Its response returns authoritative conversation and aggregate DM counts plus an applied monotonic revision. Opening an unread conversation updates bootstrap summary and paginated DM caches optimistically. The same compare-and-swap rollback rule prevents a failed mutation from overwriting a newer message or unread realtime event.

The mutation response and every DM message/conversation-unread realtime event carry both a durable `(userId, conversationId)` row revision and a separate user-scoped `dmAggregateRevision`. Mobile applies row and aggregate values only within their own comparable revision domain across bootstrap, paginated conversations, and the tab unread cache; a missing or incomparable revision triggers a bounded authoritative refetch instead of a speculative overwrite.

### Complete server and channel summaries

Add paginated `GET /api/v1/mobile/servers?cursor=&limit=` alongside the existing create route. It performs a dedicated database keyset query over accepted memberships ordered by `(joinedAt DESC, membershipId DESC)`, defaults to 30 rows, caps the page at 50, and batches counts/unread data only for that page; slicing the existing load-all service is prohibited. Its opaque cursor response is `{ items, nextCursor, snapshotRevision }`, where `nextCursor` is null at completion and duplicates are reconciled by stable server ID. Each summary includes member count, channel count, unread count, mention count, and icon metadata. Bootstrap may retain its bounded recent set, but the server sheet uses the complete paginated query.

Replace the current truncated workspace channel payload with paginated `GET /api/v1/mobile/servers/[serverId]/channels?cursor=&limit=`, ordered by category position, channel position, and channel ID with a maximum page of 80. The response carries `{ items, nextCursor, snapshotRevision }`; category metadata is stable and the client groups pages without duplicating a channel. Channel summaries gain a sanitized last-message preview for text channels, computed in a bounded page batch rather than one query per channel. Server detail gains an aggregate online-member count so the channel header does not infer a global value from a paginated member page.

Every keyset cursor is opaque, user-bound, tamper-evident, and carries its ordering keys plus snapshot revision. If access or ordering changes invalidate a later page, the route returns a typed stale-cursor result and the client restarts that bounded list instead of accepting skips or duplicates.

Add bearer-auth mobile channel mark-read mutations. The request uses the same validated `throughMessageId` high-watermark and the response returns authoritative channel/server counts plus a monotonic revision. `server:unread:update` receives a strict shared event schema with that revision and patches both server-list and active-workspace caches only when newer. Opening a channel updates channel/server unread state optimistically; failure restores unchanged optimistic fields or refetches when an intervening realtime event makes snapshot restoration unsafe.

DM and channel read watermarks store the ordered `(messageCreatedAt, messageId)` boundary and advance with an atomic database compare-and-swap `max(current, requested)`. A delayed older request from another device is an authoritative no-op and returns the current revision/counts; it can never move read state backward or recreate unread messages.

### All-channel voice occupancy

The occupancy source is the server's LiveKit-confirmed participant projection; pending/pre-connect `VoiceState` rows never appear in list summaries or socket updates. Replace the current unbounded server voice response with read-only `POST /api/v1/mobile/voice/states/query`, accepting one `serverId` and at most 80 channel IDs from the active validated workspace detail. The client queries the virtualized render window plus one prefetch window, capped at 80 IDs, cancels an obsolete window on scroll/server switch, and keeps at most three windows in an LRU cache. Each response omits inaccessible IDs and returns an authoritative summary containing `serverId`, `channelId`, `totalCount`, the complete current preview list capped at three, and a channel-scoped monotonic revision. `useMobileVoiceStatesQuery(serverId)` normalizes by `(serverId, channelId)` and drops entries when its workspace snapshot removes a channel. Membership/permission loss purges inaccessible entries, server switch unsubscribes the previous server, and reconnect refetches the current window.

Introduce shared strict `MobileVoiceStatesWatchSchema` and `MobileVoiceStateUpdateEventSchema` contracts. Each watch/unwatch diff carries `{ serverId, channelIds }` with 1-80 unique IDs; the server rate-limits subscription changes, authorizes every channel, and caps each socket at 80 active voice-channel subscriptions. Every update carries one authoritative replacement summary with the same channel-scoped revision. Mobile and server emitters/parsers migrate atomically with a real socket integration test; raw-string/server-only watch payloads and updates without `serverId` are rejected. A newer `voice:state:update` replaces that channel summary rather than applying lossy participant deltas, while LiveKit participant/audio state continues to own the active room's speaking and mute detail.

Membership, role, and channel-permission changes evict affected viewer sockets immediately and purge their caches. In the same database transaction, every revoke path also enqueues an idempotent, revisioned voice-authorization job whose bounded worker pages affected active participants, removes them from LiveKit, clears their `VoiceState` and confirmed occupancy projection, and emits typed client invalidation. Provider removal failures remain pending with bounded exponential retry, metrics, and dead-letter visibility; they are never swallowed. The periodic reconciler is a safety net for missed work, while emit-time authorization remains defense in depth so neither media access nor private participant summaries survive a revoke. Tests cover active-user kick, member removal, role deny, channel override deny, provider failure/retry, server switch, scroll-window diff, and reconnect resubscription.

No channel row reads other-channel occupancy from `voiceRoomState`.

### Realtime cache ownership

One typed registry owns event-to-cache behavior:

| Event family                     | Cache effect                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| message/reaction/typing          | Patch the owning thread; update or invalidate DM/channel preview and unread families               |
| server unread/membership/channel | Revision-patch unread values; invalidate affected server/workspace counts and purge revoked access |
| notification                     | Invalidate the bounded feed and aggregate unread count from a safe mobile event                    |
| presence/friend/request          | Patch the social/profile family and affected conversation actors                                   |
| voice watch/state                | Revision-patch the selected server voice family and purge unauthorized channels                    |

On socket loss the registry marks every realtime-owned family stale. Reconnect refetches active queries immediately and leaves inactive families stale so their next mount refetches; it does not reset unrelated cache or retain an unbounded event history.

### Presence

Reuse the existing `updatePresence` mutation and selector contract. The redesigned profile row does not introduce a read-only fallback. Failure leaves the previous presence selected, shows a bounded localized error, and does not log user or transport details.

## Navigation and Floating Chrome

Primary tabs are exactly Servers, Messages, Notifications, and Profile. Voice is removed from `MobileTabId`, bottom-tab params, navigation descriptors, sync-health tab assumptions, Maestro contracts, and component contracts in one atomic change.

The Messages tab shows the canonical 8-point danger dot when the aggregate DM unread count is greater than zero. It does not derive state from the bootstrap five-row slice and updates from the typed DM/unread cache and realtime registry.

`VoiceRoom` is a protected root-stack route. The typed route-intent union, navigation ref, linking resolver, deep-link provider, focus lifecycle, Android back behavior, and tests are updated together. The route is created only by an in-app join attempt with validated server/channel context and remains valid through `connecting`, `connected`, `reconnecting`, recoverable `error`, and `leaving` cleanup states. A cold start or arbitrary direct route without that context returns to Servers; a voice-channel link enters the normal permission-and-join flow instead of opening an empty room. Permission denial does not create the route.

Server-invite links resolve to the server sheet and always require explicit confirmation; legacy `autoAccept` input is ignored. The parser stores at most one format-validated pending invite in the existing encrypted SecureStore adapter with a ten-minute TTL, a fresh auth-attempt identifier, schema version, and one-shot opaque handle. Only that handle enters navigation state. Success, decline, timeout, failed/different auth attempt, logout, app-lock reset, or server rejection deletes the record before rendering a result. The raw code never enters AsyncStorage, route params, analytics, breadcrumbs, errors, or logs. Malformed, expired, or unauthorized invites render the existing localized failure state without changing server selection. Notification targets, invite targets, and legacy voice links all pass through the same allowlisted parser and never become arbitrary navigation route names.

Back minimizes only while `isVoiceSessionActive` is true. In a recoverable error it cancels the failed attempt, clears room context, and returns to Servers; during `leaving` it remains on the bounded cleanup state until cleanup completes or times out, then returns to Servers. Leave closes the LiveKit session and removes both full and mini surfaces. Voice sync health becomes an independent domain key rather than being reassigned to another tab.

`FloatingNavigationChrome` is the single bottom-inset owner for the four tab-root surfaces. It contains the mini voice bar when active and the visual pill tab bar. React Navigation measures its complete height and reserves that space for tab content. Tab screens do not add copied `100` or `+60` bottom paddings. Root-stack detail screens such as ChannelChat and VoiceRoom own their composer/footer inset because floating tab chrome is absent; modal sheets own their modal inset. No surface applies both owners.

The mini bar appears only for `connecting`, `connected`, or `reconnecting` sessions. Permission-denied, failed, leaving, and idle states do not render it.

One pure `isVoiceSessionActive` predicate implements exactly those three statuses and owns mini-bar/minimize visibility. A separate `hasVoiceRoomContext` guard permits the full route to retain a validated recoverable error or leaving state long enough to retry/finish cleanup; it never treats a bare route name or stale channel ID as a session.

Messages and Notifications expose pull-to-refresh through their owning paginated queries. Channel-message long press preserves the existing reply, reaction, copy, and permission-gated delete actions. Light haptics run for a completed tab selection, microphone toggle, and leave action only; rejected, disabled, failed, or no-op actions do not produce success feedback.

## Voice Session State

Extend the room contract with:

- `reconnecting` connection status;
- immutable-per-session `connectedAt`;
- a monotonically changing in-memory session generation;
- a pure active-session visibility predicate;
- explicit LiveKit reconnecting/reconnected event handling.

`connectedAt` is set when the room first reaches connected and survives reconnects. It resets on leave or terminal failure. `updatedAt` remains a last-change diagnostic and is never used as the duration origin. Every async join, permission, token, participant, heartbeat, reconnect, and disconnect callback captures the generation and is ignored after a newer join/leave generation starts, preventing a late callback from resurrecting an obsolete room.

Push-to-talk, mute, camera, screen share, input/output selection, and cleanup behavior remain available. The compact 1e control row exposes the canonical actions; secondary camera, screen-share, input-mode, noise, and device controls live in the existing voice settings sheet with unchanged permission and privacy boundaries.

The mini microphone control delegates to the existing input-mode controller: it toggles mute in voice-activation mode and uses press-in/press-out talk semantics in push-to-talk mode. Its icon, accessibility label, pressed state, and haptic feedback follow the active mode; it never calls the current push-to-talk no-op mute path.

The participant area remains a two-column grid at 390 points. One participant and the final odd participant are centered without stretching the canonical card width; additional rows scroll vertically above the fixed control region, and the full-width invite row is the list footer. Speaking, mute, join, leave, and reconnect updates preserve participant identity and scroll position.

## Design System

### Typography

Vendor one licensed Plus Jakarta Sans release as `PlusJakartaSans-{Regular,Medium,SemiBold,Bold,ExtraBold}.ttf` for weights 400, 500, 600, 700, and 800. The Expo loader and Playwright `@font-face` rules consume those same TTF binaries through distinct `WhisprJakarta-{weight}` family names. A checked-in font manifest records source/version, license, file-to-weight mapping, and SHA-256. Reference capture blocks network font requests, disables the original Google Fonts import, and fails unless every hash matches, `document.fonts.check()` succeeds for every weight, Resource Timing reports no remote font, and every mapped text node resolves to the vendored family. All acceptance captures require the fonts to be loaded. A bounded system-font fallback keeps the product usable if loading fails, records only a redacted diagnostic, and is not accepted for pixel evidence.

The reference extractor records computed line heights after the vendored font loads, and `tokens.ts` stores an explicit numeric family, size, weight file, line height, and letter spacing for every role; `normal` line height is forbidden in product code. Android reference-critical text uses `includeFontPadding: false`. Every non-decorative text role, including screen/sheet/header titles, tab labels, metadata, captions, controls, status copy, message bodies, and settings rows, supports at least a 2.0 system font scale. At scale 2.0, titles, actions, metadata, and user content wrap and grow vertically; tab labels may use two lines and the measured floating chrome grows with them; layouts may reflow or stack without hiding text, clipping, overlap, horizontal scrolling, or loss of functionality. Ellipsis is allowed only for repeated identity/content rows whose full value is available through the accessibility label or an existing detail destination, never for a unique control or essential status. Canonical pixel capture remains fixed at font scale 1.0.

At the 390-point reference viewport, one canonical CSS pixel maps to one React Native logical point. Layout code uses logical dimensions and native safe-area insets rather than device-pixel scaling; screenshot tooling alone maps those points to physical pixels.

### Tokens and themes

Raw runtime React Native presentation colors remain confined to `src/design/palette.ts`. `themes.ts` exposes semantic light/dark roles with identical recursively tested keys. Native/store metadata, canonical handoff files, visual baselines/transforms, and test fixtures use a file-based allowlist so this rule does not rewrite platform configuration. HTML-only values such as reply surface, offline presence, chevron, sheet handle, selected dark text, and specialized dividers become named semantic roles instead of screen literals.

The light accessibility mapping is normative and role/context specific. Canonical secondary text `#6B7194` becomes `#62688B` on `#F6F7FB` or `#FFFFFF`; lighter normal-size text `#8A90B0` and `#9AA0BC` becomes `#676D90` on those surfaces; danger normal-size text `#E05252` becomes `#C94343` on white/card surfaces; and success normal-size text `#22A366` or `#1B8A55` becomes `#187A4C` on white, `#F6F7FB`, or `#E8F8EE`. Raw colors remain available only for audited large text, non-text controls, icons, borders, or decorative content. A light role/context pair that is not listed and does not independently pass its required contrast fails the transform instead of receiving an inferred substitution.

The dark mapping for states absent from 1i/1j is a normative design decision: permission/selected surfaces use `#2A2D55`; unread rows use `#1C1F3A` with `#3B3F73` emphasis border; primary/profile-banner actions use canonical `#6D66F0`, normalized to `#6B63EC` wherever white normal-size text is present; danger uses canonical `#E05252` with `rgba(224,82,82,.14)` surface, normalized to `#E45A5A` for normal-size danger text on plain dark surfaces and to `#C94343` for a danger button carrying white normal-size text; success uses `#34D399` with `rgba(52,211,153,.12)` surface; warning/offline uses `#F59E0B` with `rgba(245,158,11,.14)` surface; sheet overlay uses `rgba(0,0,0,.55)`. Canonical muted `#6E7398` becomes `#8288AD` for normal-size text on `#131529` or `#1C1F3A`, while non-text/decorative uses retain the original value. Semantic status surfaces define an explicit `onStatus` foreground: light danger/error surfaces use light primary `#1E2235`, and dark danger/error surfaces use dark primary `#ECEEFA`; the danger hue is limited there to audited icon, border, or decorative accents. The same primary-foreground rule applies to warning and success status bands unless a separately named pair passes the contrast test. These substitutions are part of the normalized golden, and the transform fails if any inline color lacks exactly one audited semantic-role mapping or if any resulting role/context pair misses its required contrast.

Theme preference remains `system | light | dark`, follows the OS, and persists through the existing AsyncStorage contract. The voice room and mini voice surfaces use inverse semantic roles and remain dark in both themes.

### Icons and components

Reference-critical icons use fixed `react-native-svg` paths copied from the HTML, including the intentional filled glyphs. The app does not approximate those icons with unrelated library glyphs. Non-reference detail screens may retain the typed existing Icon wrapper.

Shared primitives include avatar variants, presence, unread badge, segment chips, settings row, section header, channel row, conversation row, message row/bubble, floating navigation chrome, mini voice bar, and the existing in-house BottomSheet/Skeleton foundations. The generic BottomSheet keeps its current behavior; redesign chrome is introduced through a semantic variant so destructive and management sheets do not regress unexpectedly.

Avatar fallback initials and accent pairs are derived from a stable user or server ID with one shared deterministic hash function. Display names and list order never influence the color, so the same identity renders consistently across every surface and session.

All animated primitives use Reanimated and become static when reduced motion is enabled. Sheet duration is fixed at 280ms ease-out when motion is allowed.

## Screen State Contract

Every applicable surface has an explicit state table in implementation tests:

| Surface          | Loading                             | Empty                                  | Error                                   | Offline                                 | Reconnecting                                   |
| ---------------- | ----------------------------------- | -------------------------------------- | --------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| 1a Servers       | Server/channel geometry skeleton    | No-server CTA                          | Retry banner                            | Shared offline banner                   | Realtime banner                                |
| 1b Channel chat  | Message geometry skeleton           | First-message CTA                      | Retry without discarding stale messages | Shared offline banner                   | Realtime banner                                |
| 1c Messages      | Conversation geometry skeleton      | New-message CTA                        | Retry without discarding stale list     | Shared offline banner                   | Realtime banner                                |
| 1d Notifications | Notification-row skeleton           | Empty feed                             | Feed retry                              | Shared offline banner                   | Realtime banner                                |
| 1e Voice room    | Connecting participant geometry     | No active session redirects to Servers | Bounded room failure and retry/leave    | Connection-state message                | Reconnecting chip, session retained            |
| 1f Profile       | Identity/settings geometry skeleton | Not applicable for authenticated user  | Retry for remote account state          | Shared offline banner                   | Realtime banner; cached presence retained      |
| 1g Server sheet  | Server-row skeleton                 | New-server action                      | Inline retry                            | Existing cached list plus offline state | Realtime banner; cached unread counts retained |

Every paginated DM, server, channel, and notification list additionally implements the same tested page-state machine. `initialLoading` owns the full geometry skeleton; `refreshing` retains stale rows and shows bounded refresh feedback; `fetchingNextPage` retains rows and shows only a footer skeleton; `nextPageError` retains rows and exposes a footer retry; `endReached` removes the footer spinner and suppresses duplicate page requests. A typed stale-cursor response starts a replacement first-page request while preserving the old list; the client swaps the list atomically only after that first replacement page succeeds, and a failure keeps the old rows with a retryable stale-data banner. `hasNextPage`, in-flight cursor identity, stable-ID deduplication, and page merge order are asserted independently for all four list domains.

Permission states are separate from loading and error. Mount invokes no native prompt. An explicit action starts at most one in-flight native request only when status is `requestable`; `granted` performs the intended action without another prompt, and `blocked`/permanently denied opens the localized settings guidance without calling the native request API.

The shared connectivity banner reports network and socket state but does not own domain retries. Its retry action calls the visible screen provider's bounded refresh function; socket reconnect follows the typed realtime registry's stale/refetch policy. Stale data remains visible with an explicit stale/reconnecting label. Side-effecting React Query mutations use an explicit fail-fast wrapper, `networkMode: "always"`, and `retry: false`; both the trigger and `onMutate` reject offline state before any optimistic patch. No paused mutation is resumed, queued, silently replayed, or reported as successful.

### Visual rules for unmocked states

- Loading retains the final row/card bounds and replaces only content with `surface.soft` skeleton blocks overlaid by `surface.overlay` at opacity 0.24-0.58. The existing 1,100ms reversible shimmer is retained; capture and reduced-motion modes render its static base frame.
- Empty states use the canonical localized copy and existing primary action primitive within the final content region; they do not change shared header or floating-chrome geometry.
- Offline, error, and realtime bands sit immediately below the owning safe-area/header, use a 44-point minimum height with 20-point horizontal padding and an 8-point gap, and use warning, danger, and selected semantic roles respectively. At font scales through 1.3, short localized copy may remain one line; at larger scales it wraps to two or more measured lines as needed and the retry action stacks below when required. Band height grows with content, no essential status copy is ellipsized, and the retry action retains a non-overlapping 44-point press target.
- Reconnecting voice uses the canonical header chip and preserves the participant grid. Microphone denial stays in the existing permission guidance/confirmation surface and never fabricates an empty room.
- Because the HTML has no loading/error/offline frames, these states are not falsely compared to a canonical HTML image. Their component/style manifests and separately reviewed native goldens are normative and follow the same baseline update policy as the main captures.

## Localization and Dynamic Content

All new copy is added to Turkish and English catalogs with exact key parity. Date, relative-time, avatar-initial, status, count, and accessibility formatters receive the active product locale; no formatter hardcodes Turkish.

Real names and messages use `minWidth: 0`, bounded `numberOfLines`, and appropriate ellipsis behavior. Tests cover long server, channel, display, username, localized control labels, and every offline/error/realtime status string at font scales 1.0, 1.3, and 2.0 without clipping, overlap, hidden functionality, or horizontal overflow.

Accessibility acceptance uses WCAG 2.2 AA: normal text requires 4.5:1, large text and reference-critical non-text controls require 3:1, excluding only disabled or purely decorative content. Opening a modal sheet moves focus to its heading or first action, contains focus while open, announces state changes through bounded live regions, and restores focus to the invoking control on dismiss. Screen-reader order follows visual order, and every icon-only action exposes localized role, label, state, and hint where needed.

## Deterministic Visual Verification

### Reference renderer

A Playwright script opens the canonical HTML with `deviceScaleFactor: 3` and the vendored fonts. For each anchor it selects the direct 390x844 frame (`#<anchor> > div[style*="width:390px"][style*="height:844px"]`), then removes only the document border, outer radius, and outer shadow without changing its 390x844 content box. Element capture therefore produces exactly `1170x2532`; the label and `.dv-opt` wrapper never enter the crop, and no resampling occurs. Capture waits for every font check and fails on a missing frame, unexpected 392x846 border box, or selector count other than one.

The same pass exports a computed-style manifest for every mapped reference node: logical bounds, spacing, radius, fill, border, shadow, icon path, font hash, font size, computed line height, weight, and letter spacing. It emits versioned golden PNGs and a manifest containing source hash, transform hash, selector-to-testID mapping, anchor, logical/physical viewport, device scale factor, theme, and deterministic `SOURCE_DATE_EPOCH`. Wall-clock capture time appears only in ignored run evidence and is excluded from reference drift comparison.

Raw 1i and 1j captures remain immutable evidence for dark tokens. Because the handoff explicitly resolves 1j's missing controls through the authoritative 1b structure, the renderer also produces a normative dark-1b golden by applying the 1j token values to the complete 1b DOM geometry. Reference 1i is captured in its disconnected voice state; a separate connected dark-1a capture verifies the required mini bar. For 1c-1g, the renderer derives dark goldens from unchanged light DOM geometry through the normative semantic mapping above, the README tokens, and values verified against 1i/1j. Every inline color must map exactly once; unknown colors, missing selectors, duplicate mappings, or a transform that changes non-theme geometry fail the build. Role substitutions and source selectors are checked in and hashed in the manifest rather than applied manually.

### Device capture

The canonical pixel gate runs separately on Android compact (`1170x2532` at `480dpi`) and iOS compact (`390x844` at 3x), producing platform-specific `1170x2532` captures without downsampling. The internal UAT acceptance build uses a fail-closed reference metrics provider with logical insets `{ top: 42, bottom: 0, left: 0, right: 0 }`, matching the canonical status region. Release/store builds cannot enable that provider. Both profiles use edge-to-edge content, transparent system bars, gesture navigation rather than Android three-button navigation, font scale 1.0, an explicit locale/theme, and static reduced-motion capture; only native time/signal/battery and home/gesture-indicator glyph pixels are masked.

A checked-in `capture-environment.json` pins every rasterization input before baselines are generated: Android API level, full system-image package and revision/hash, emulator version, AVD device/hardware profile, density, graphics mode and GPU renderer; iOS simulator runtime build, exact device type, Xcode build, macOS version, and immutable CI runner image; plus Playwright/Chromium, image decode/diff libraries, locale, timezone, font scale, reduced-motion setting, and sRGB color space. Local and CI capture scripts probe those values and fail closed on any mismatch. Each evidence manifest records the resolved values and the hash of this file, so a capture-environment upgrade requires an explicit baseline change and overlay review rather than silently changing pixel output.

The acceptance build also exports a local-only native measurement manifest for the allowlisted reference testIDs using resolved `onLayout`/`onTextLayout` data and typed style/icon metadata. It contains geometry and style values but no rendered copy or identifiers, and it is absent from release/store builds. A missing, duplicate, or extra required selector-to-testID mapping fails before screenshot comparison.

Production safe-area behavior is formulaic: top content begins after `inset.top`; tab clearance is `max(inset.bottom, 18)`; chat composer clearance is `max(inset.bottom, 20)`; voice footer and bottom-sheet clearance are `max(inset.bottom, 28)`. `FloatingNavigationChrome` measures tab plus mini-bar height and remains the only tab-screen bottom-inset owner. Android regular and iOS tablet run the full real-inset layout/interaction smoke matrix without being compared to a nonexistent 390x844 golden.

The capture account belongs to an allowlisted dedicated UAT tenant populated through a server-side CLI that calls production service boundaries. The command fails closed outside local test/UAT, refuses non-allowlisted tenant IDs and generic seed overrides, requires a least-privilege CI secret from the environment, is idempotent, and has a matching cleanup path. No public production seed route or client fixture is added. Its durable server/channel/DM/notification relationships are persisted through real application paths and exercise unread, presence, reply, reaction, and participant identities.

An internal visual-test clock fixes app and setup-service time to one manifest epoch; the production default remains the system clock, and release builds reject the override. Seed timestamps, locale, and timezone are derived from that epoch so date headers, message times, relative time, and voice duration are stable. Capture waits on a test-only readiness signal proving fonts, avatar assets, active queries, socket subscriptions, and the required UI state are settled. Reanimated capture uses reduced motion, and typing/reconnect states are held behind explicit orchestration barriers rather than sampled by delay.

Voice occupancy, heartbeat, speaking, mute, and reconnect evidence is not seeded. The acceptance harness signs two dedicated test clients in through normal mobile authentication and joins them sequentially through the production join/LiveKit path in the manifest's expected stable participant order. It supplies deterministic test audio to the first client, mutes the second through the production mute control, and blocks capture until the real LiveKit speaking and track-muted projections reach the UI and the expected public identity-to-grid-slot mapping is measured. A swapped, missing, unmuted, or unsettled participant fails readiness instead of producing a screenshot. Reconnect uses controlled transport interruption and waits for the real reconnect state. Cleanup disconnects both clients and never records their audio.

### Diff policy

Each platform capture is compared to its matching normalized HTML evidence in two layers. The pinned implementation decodes both images to opaque 8-bit sRGB RGBA at DPR 3, performs no resize or color-profile conversion, and uses versioned DPR-3 mask polygons. Flat-region pixel comparison uses a direct pinned diff dependency with threshold `0.1`, antialias exclusion enabled, and 8-neighbor connected components; text and shadow regions are validated separately rather than counted as flat pixels.

- exact 390x844 logical and 1170x2532 physical dimensions;
- explicit masks only for system time, signal, battery, and the native home/gesture indicator; the controlled UAT copy matches the canonical text where typography is compared;
- exact semantic colors, icon paths, font files, weights, and declared typography metrics in the style manifests;
- mapped layout bounds within 0.5 logical point, with no accumulated list or safe-area drift;
- text baselines within 1 logical point and per-text-region structural similarity of at least 0.985, allowing only platform glyph antialiasing differences;
- shadow regions with exact declared parameters and structural similarity of at least 0.98;
- at most 0.5% mismatched unmasked pixels in non-text, non-shadow flat-color regions;
- no unexplained flat-region connected component wider or taller than 6 physical pixels (2 logical points);
- human overlay review for typography baseline, spacing, radius, and alignment.

A threshold exception requires a checked-in explanation tied to one platform rasterization difference; it cannot be used to accept layout drift. Evidence includes light/dark captures for 1a-1g, raw 1i/1j token references, the normative dark-1b composite, connected/disconnected mini-bar states, permission states, and critical empty/error/reconnecting states.

### Baseline and evidence lifecycle

Reference PNGs, style manifests, transforms, masks, reviewed native state goldens, and their source hashes are checked into `apps/mobile/visual-baselines/whispr-redesign/`. Normal verification regenerates reference output in a temporary directory and fails on drift; it never updates a baseline. Baseline changes require the dedicated update command, an explicit expected source hash, visual overlay artifacts, and human review in the scoped change.

Actual device captures, diff images, readiness logs, and a redacted run manifest live under ignored `artifacts/redesign/<commit>/<platform>/` and are uploaded by CI for 30 days. The manifest records commit, build profile, platform/device, source/baseline/transform/font hashes, locale, theme, UAT scenario ID, clock epoch, masks, and exact tool versions without storing tenant IDs, user IDs, invite codes, tokens, or message content.

## Security, Privacy, and Performance

- Every mobile endpoint uses bearer authentication, active-user checks, ownership/permission enforcement, bounded pagination, rate limiting, and shared response validation.
- LiveKit lifecycle input accepts only signature-verified events, keeps webhook secrets in the environment, deduplicates event identifiers before state changes, and applies canonical room plus active-user/membership/voice-permission authorization to webhook and reconciler observations.
- No access token, invite code/handle, action URL, message content, device label, LiveKit URL, local path, tenant/user identifier, or raw server error is logged.
- Notification navigation accepts only parsed allowlisted destinations.
- Preview queries reuse access-aware service mappers so hidden, blocked, deleted, or inaccessible content cannot leak.
- Server/channel preview data is fetched in bounded batches; no N+1 query is introduced.
- Large DM, server, channel, notification, participant, and message collections remain virtualized with stable row props and callbacks.
- Realtime updates are bounded and keyed; no broad query-cache reset or unbounded in-memory event history is introduced.
- Existing app-lock, privacy-shield, permission, and offline fail-fast policies remain intact.
- Release/store contract tests prove visual clock, reference insets, measurement bridge, and UAT setup capabilities cannot be enabled in production profiles.

## Testing Strategy

Every behavioral change follows red-green TDD:

1. Add a focused failing shared-schema, route, cache, component, or contract test.
2. Run it and record the expected failure.
3. Implement the minimum production behavior.
4. Run the focused test green.
5. Run the owning package's typecheck and relevant full suite before commit.

Required automated coverage includes:

- route auth, ownership, rate limit, cursor bounds, malformed input, and response parsing;
- DB-level keyset DM/server/notification queries, aggregate counts, forward-only cross-device high-watermarks under reverse completion, realtime-safe compare-and-swap rollback, and the complete initial/refresh/next-page/error/end/stale-cursor list state machine for DM, server, channel, and notification domains;
- safe notification invalidation, server-unread revision ordering, full realtime registry disconnect/reconnect behavior, and no raw socket metadata ingestion;
- chunk-bounded all-workspace voice-state query, strict watch/update wire schemas on both socket ends, permission purge, server switch, and authoritative reconnect refetch;
- authorized confirmed LiveKit lifecycle creation, invalid room/participant rejection and eviction, distinct-event/expired-lock races, duplicate/out-of-order handling, reconnect grace, durable outbox fanout, uniqueness, preferences, bounded large-server delivery, and retention cleanup that preserves active/retryable work;
- VoiceRoom cold start, session-generation stale callbacks, minimize, reconnect, leave, permission denial, failed join, and cleanup;
- four-tab/testID/linking/deep-link contracts in one atomic migration, including SecureStore one-shot invite resume, explicit confirmation, and invalid invite/notification/legacy voice targets;
- floating chrome safe-area ownership and content visibility with the mini bar opening/closing;
- every screen-state matrix row;
- theme key parity, every normalized light/dark role-context contrast pair, font loading/fallback, reduced motion, touch targets, focus order, modal behavior, haptic success/failure behavior, deterministic avatar colors, and 2.0 font scaling without lost content or functionality;
- fail-closed native capture-environment pinning and manifest/hash agreement on local Android and immutable macOS/iOS CI runners;
- permission-state tests proving zero mount requests, one in-flight request only while requestable, no prompt while granted/blocked, and settings guidance while blocked;
- pull-to-refresh, visible-screen retry, fail-fast offline mutation options, and no paused-mutation resume/replay;
- Maestro phase 0-5 flows updated without weakening unrelated contracts;
- two-client realtime acceptance for message, unread, presence, notification, voice occupancy, stable participant order, speaking, mute, and reconnect.

## Delivery Sequence

Voice-room-start infrastructure follows an expand/enable order: additive Prisma enum/lifecycle/event/delivery-outbox migration; worker code that understands every new job while producers remain disabled; worker health and retry verification; disabled webhook/reconciler producer deployment; UAT LiveKit signing-secret configuration and webhook registration; UAT-only feature enablement; then mobile feed enablement after observation. A contract test fails deployment when a producer can emit a job unsupported by the worker. Rollback first disables the producer and unregisters the webhook, then drains durable jobs with the compatible worker; additive schema remains until a later reviewed cleanup. Production enablement is a separate explicit rollout decision, not implied by implementation completion.

1. Capability/data contracts and backend/mobile query layers.
2. Realtime cache completion and mark-read behavior.
3. Voice session model and atomic navigation migration.
4. Typography, semantic tokens, exact icons, and shared redesign primitives.
5. Floating navigation chrome and mini voice bar.
6. Surfaces 1g then 1a, followed by 1b, 1c, 1d, 1e, and 1f.
7. State matrix, localization, accessibility, haptic, and performance closure.
8. Deterministic visual acceptance, complete automated gates, `graphify update .`, and scoped final review.

Each commit is cohesive and green. Data contracts land before presentation consumers; navigation contracts change atomically; server sheet precedes the home header that opens it. Temporary worktree/branch cleanup occurs only after explicit integration approval.

## Verification Commands

All repository commands are PowerShell-safe and use the pinned package manager:

```powershell
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/web e2e:realtime
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm --filter @wizards/mobile visual:reference:verify
corepack pnpm --filter @wizards/mobile visual:capture:android
corepack pnpm --filter @wizards/mobile acceptance:dispatch:ios
corepack pnpm --filter @wizards/mobile visual:diff
corepack pnpm --filter @wizards/mobile visual:verify
corepack pnpm --filter @wizards/mobile maestro:phase:all
corepack pnpm --filter @wizards/mobile realtime:acceptance:two-client
corepack pnpm --filter @wizards/mobile device:matrix:smoke
corepack pnpm --filter @wizards/mobile acceptance:run
corepack pnpm audit --audit-level moderate
graphify update .
git diff --check
```

The implementation plan adds the visual, aggregate Maestro, two-client realtime, device-matrix, and acceptance orchestrator scripts named above before they become gates. `acceptance:run` performs fail-closed UAT setup, reference verification, Android jobs, two-client orchestration, evidence collection, and cleanup in `finally`. Canonical pixel evidence runs on Android compact and iOS compact; Android regular and iOS tablet run layout, theme, interaction, performance, and safe-area smoke coverage.

`visual:capture:ios` is macOS-only and exits nonzero with an actionable dispatch instruction on Windows; it never silently skips. A checked-in GitHub Actions workflow owns the macOS compact/tablet jobs, can be dispatched by a least-privilege Actions token, uploads the signed manifest/artifacts, and must complete before `acceptance:run` can report success. Secrets, active camera frames, tokens, invite codes, and private message content are never captured.

## Definition of Done

- The runtime exposes exactly four primary tabs and no Calls tab.
- Connected voice sessions minimize to a persistent in-tab mini bar and restore to a guarded full-screen room.
- Seven unique surfaces match the normalized canonical HTML in light and dark themes; 1h is absent.
- All displayed servers, channels, previews, conversations, notifications, unread counts, presence, occupancy, and speaking states come from validated production paths and update in realtime.
- Notifications support real list, single-read, read-all, safe deep-link, and voice-room-start behavior.
- Invite links open the server sheet, safely survive authentication, and reject invalid or unauthorized targets without changing selection.
- DM, server, channel, and notification lists implement the complete pagination state machine and are not capped by bootstrap summaries.
- Channel, DM, and notification read state use server high-watermarks/revisions and realtime-safe optimistic rollback.
- Theme preference persists and system mode follows the OS; every surface uses semantic tokens.
- Microphone and notification permissions follow the state-aware explicit-action contract with no duplicate in-flight request.
- Touch targets, focus order, labels, live regions, contrast, reduced motion, ellipsis, and dynamic type pass their automated and device checks.
- Loading, empty, error, offline, and reconnecting states satisfy the documented matrix.
- Typecheck, shared/web/mobile tests, component tests, quality gate, dependency alignment, audit, every Maestro phase, the four-target device matrix, and visual diff gates pass with recorded evidence.
- The graph is refreshed, the scoped diff is reviewed, no unrelated main-worktree change is included, and integration is performed only with explicit user approval.

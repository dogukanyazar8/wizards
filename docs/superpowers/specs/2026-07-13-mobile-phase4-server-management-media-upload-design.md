# Mobile Phase 4 Server Management and Media Upload Design

## Status and decision record

This design is approved for implementation on `uat`. Phase 4 delivers server
creation and joining, invitations, profile/server image upload, server and
channel administration, member management, and the related mobile quality
closure without changing the existing web UX or authorization model.
It adds no native module and uses the already-built Phase 3 development client;
discovering a required native dependency is a stop condition, not permission to
rebuild implicitly.

Mobile role management is intentionally narrower than the web product. Mobile
may assign and remove existing roles and may kick eligible members, but it does
not create, update, delete, reorder, or edit the permission matrix of roles.
Consequently this milestone is not full role-management parity. Full mobile role
CRUD and permission-hierarchy editing are deferred to Phase 5 and must be named
explicitly in `MIGRATION_PHASE_4.md` and the Phase 5 handoff notes.

## Chosen architecture

Phase 4 uses thin `/api/v1/mobile` route adapters over the existing workspace
services. The adapters own bearer authentication, action-specific rate limits,
bounded JSON parsing, Zod request/response validation, and stable mobile error
responses; shared services remain the single authority for business rules,
permission checks, role hierarchy, owner protection, socket side effects, and
database mutation.

This approach is preferred over adding bearer authentication to cookie-oriented
web routes, which would couple two public contracts and risk web regressions. It
is also preferred over duplicating mobile workspace services, which would allow
authorization and hierarchy behavior to drift from the web product.

## M1: mobile API contracts and authorization

`packages/types` will define bounded mobile schemas for:

- server creation, joining, detail, update, and deletion;
- invite listing and creation, with a server-produced share URL;
- category and channel creation, update, and deletion;
- cursor-bounded members with presence;
- assignable existing roles and member role assignment/removal;
- member kick and channel history clearing;
- media upload purpose, completion, and one-time claim responses; and
- explicit viewer capability flags for every administrative surface.

Capabilities are computed from the server-side access context. They control
which mobile actions are presented but never replace service authorization.
Mobile must not derive permissions from `isAdmin`, role names, membership shape,
or cached UI state.

All role-assignment and removal mutations delegate to the same shared service
path used by web behavior. Existing rules for who may manage which target,
owner/self protection, managed-role hierarchy, and permission boundaries are
preserved exactly. Phase 4 must not introduce a mobile-only override or broaden
the set of assignable roles.

Every mutating mobile route authenticates and rate-limits before parsing the
body, parses a bounded payload, validates it with Zod, delegates to a shared
service, validates its response contract, and returns bounded errors without
internal exception text. Route-logic modules receive injectable dependencies so
authentication order, throttling, validation, delegation, authorization
failures, and error mapping can be unit tested without starting Next.js.

Channel history clearing must preserve the current unread cleanup, socket
emission, and downstream side effects around the service call. Server,
category, channel, invite, and member mutations similarly retain existing
service-level socket behavior rather than reimplementing emitters in mobile
routes.

## Secure image upload and one-time claim

The existing web avatar and server-icon routes remain unchanged. A dedicated
mobile UploadThing FileRoute authenticates the bearer token in middleware,
applies a separate upload rate limit, validates the declared purpose, and, for a
server icon, verifies access to the target server before issuing an upload.
Accepted content is restricted to JPEG, PNG, or WebP and a maximum of 4 MB.
The existing message-attachment upload and claim contract is not replaced or
widened; Phase 4 reuses the same UploadThing storage provider with a separate,
purpose-bound mobile image claim.

The mobile client keeps the picker URI only in volatile memory and sends the
file through the official UploadThing Expo client. It never persists or logs the
local URI, bearer token, upload key, raw invite code, or presigned request data.

After UploadThing confirms the actual object, its trusted callback records a
`MobileMediaUpload` claim containing an opaque id, owner id, purpose,
optional target server id, UploadThing storage key and URL, actual MIME type and
size, creation and expiry timestamps, nullable `claimedAt`, cleanup scheduling,
and nullable storage-deletion completion. `storageKey` is unique, and callback
persistence uses an idempotent upsert so a provider retry cannot mint two
claims. The database record is the authority; the client cannot submit an
arbitrary remote URL.

The callback does not trust only a filename or client-declared content type. It
accepts only UploadThing-owned keys/hosts, performs a timeout- and byte-bounded
read of the trusted object, verifies its image signature with a server decoder,
and rejects images outside the permitted format, byte size, dimensions, or
pixel-count ceiling. Width and height are each limited to 4096 pixels and total
decoded area to 16 megapixels. Failed verification deletes the object
best-effort and does not create a claim.

`POST /api/v1/mobile/uploads` consumes the opaque claim id. A transaction
rechecks owner, purpose, target, expiry, unused state, and current target
authorization. It first performs a conditional compare-and-set update whose
predicate includes `claimedAt IS NULL` and `expiresAt > now`; a result other than
exactly one aborts the transaction. The same transaction then applies the
avatar or icon mutation, so a failed target mutation also rolls back the claim.
Concurrent replay permits at most one success.

Expired or invalid claims return stable bounded errors. A bounded opportunistic
cleanup runs from the authenticated upload boundary, and the existing worker
calls the same cleanup service when that worker is enabled. It removes expired
unclaimed records in batches and deletes their UploadThing objects best-effort
through the existing server-side UploadThing API boundary. Replacing an avatar
or icon and deleting a server schedule the previous owned storage key for the
same retryable cleanup path. Cleanup state remains until deletion succeeds;
failures are redacted and retried rather than exposing storage details to the
client.

The additive Prisma migration defines the upload-purpose enum, the
`MobileMediaUpload` model, a unique storage-key constraint, owner/purpose/target
lookup indexes, and an expiry/cleanup index. M1 applies it to UAT with
`corepack pnpm --filter @wizards/db db:migrate:deploy` before the new web code
receives traffic, then verifies the generated client and claim smoke path.
Rollback deploys the preceding application revision while retaining the unused
additive table; storage cleanup runs before any later destructive schema
rollback. This avoids an application rollback depending on a down migration.

The create-server icon flow creates the server first and then uploads and claims
an icon bound to that server id. If the image step fails, the valid server
remains without an icon and the UI offers a retry; it is not silently deleted.

## M2: mobile creation, joining, sharing, and avatar behavior

The disabled server-rail add action becomes an accessible create/join
BottomSheet using the existing reduced-motion-aware component kit. Successful
creation or joining selects the resulting server. A bootstrap reconciliation
effect moves selection to the first accessible server, or to the empty state,
when deletion, leaving, or a kick removes the active server.

Invite creation returns a canonical HTTPS share URL from the server. Native
React Native `Share` receives that URL directly; invite codes are not placed in
query keys, persisted storage, analytics, or diagnostic output.

Avatar selection shows a volatile local optimistic preview. The flow uploads,
claims, and refreshes the profile in sequence; any failure restores the previous
avatar and displays a bounded action message. Success refreshes or narrowly
patches the authenticated session, bootstrap, friends/profile, and visible
member caches so stale identity images do not remain onscreen.

Realtime handling uses only verified event names and validated payloads:
`server:settings:updated`, `server:membership:added`,
`server:membership:removed`, `message:history_cleared`, `presence:update`, and
`user:profile:updated`. Events invalidate or patch only the affected bootstrap,
server, members, messages, or profile scope. Phase 4 does not invent granular
channel or role events that the server does not emit.

## M3: administration UI and information architecture

Typed protected navigation routes provide server settings, server members, and
channel settings surfaces. Server management stays contextual to the active
server rather than becoming a global account setting.

Server settings support name/icon edits and typed-name deletion confirmation.
Channel and category surfaces support the approved CRUD subset. The member
surface uses cursor pagination and FlashList, groups the loaded page by presence
without changing cursor semantics, exposes only server-authorized assignable
roles, and requires explicit confirmation for kick. Channel history clearing is
also destructive-confirmed.

A reusable confirmation boundary handles accessibility, cancellation, busy
state, and duplicate-submit prevention. Every automation target receives a
stable, resource-specific `mobile-...` test id; dynamic ids use stable database
ids rather than translated labels or list positions.

`MIGRATION_PHASE_4.md` and Phase 5 handoff notes must include both of these
non-negotiable statements:

1. Mobile role management is a deliberate narrowing from web's complete role
   CRUD and permission matrix and therefore is not full role parity; mobile role
   CRUD plus permission-hierarchy editing is deferred to Phase 5.
2. Mobile only assigns or removes existing roles and does not widen server role
   hierarchy or authorization boundaries; the web-equivalent service-layer
   checks for who may assign which role to which member remain authoritative.

The handoff artifact is `apps/mobile/PHASE_5_HANDOFF.md`. Together with
`apps/mobile/MIGRATION_PHASE_4.md`, it records the final API inventory,
screen/hook/query-cache map, database migration and rollback procedure, UAT and
Maestro evidence status, avatar-debt closure, intentional exclusions, and the
approved role CRUD plus permission-hierarchy deferral.

## Error, security, and privacy behavior

- External input is bounded and Zod-validated; no route accepts a client-owned
  storage URL, permission bitset, role hierarchy, user id override, or database
  filter.
- Authentication precedes body parsing, and authorization is rechecked at the
  time of mutation rather than trusting a prior capability response.
- Rate limits are action-specific for uploads, joins, invites, destructive
  mutations, and administrative reads.
- Known `ApiError` conditions map to stable status/code pairs. Unexpected errors
  are redacted server-side and return a generic response.
- Tokens, upload keys, local media URIs, invite codes, recovery data, and raw
  upstream error bodies are excluded from logs, analytics, query keys, Maestro
  evidence, and persisted mobile state.
- Lockout, login, token issuance, and the core authentication state machine are
  outside Phase 4 and remain unchanged.
- Lists and request bodies have explicit size limits, member reads are cursor
  bounded, and no Phase 4 path performs an unbounded server/member fetch.

## Test and verification strategy

Behavior changes start with focused failing tests. M1 route-logic coverage
includes auth-before-parse, per-action throttling, invalid and oversized input,
service delegation, authorization denial, bounded error mapping, and response
schema parsing. Upload coverage includes wrong owner, purpose, target, MIME and
size, expired claims, concurrent replay, callback tampering, and revoked server
authorization.

M2 and M3 component/contract coverage includes optimistic avatar rollback,
selection fallback, invite sharing without code persistence, capability-based UI
gating, role assignment/removal with explicit confirmation for removal,
destructive confirmations, cursor behavior, realtime cache scope,
accessibility, reduced motion, and stable test ids.

Before every milestone commit, the complete non-device gate runs: workspace web
and mobile typechecks, the full shared-types and web test suites, the full mobile
contract and component suites, mobile quality blockers, Expo dependency
alignment, focused Phase 4 tests, and `corepack pnpm --filter @wizards/web
build`. M3 additionally runs `corepack pnpm audit --audit-level moderate`, the
migration audit, the Phase 4 Maestro flow once against UAT, redacted light/dark
evidence capture, and `graphify update .`. Generated graph output, TypeScript
build info, artifacts, and `.env.maestro` are never staged.

The device run is `.maestro/phase4-server-management.yml` and reuses
`.maestro/helpers/login-uat.yml`. If the Android emulator cannot reach the local
relay, the documented `127.0.0.1` plus `adb reverse` fallback is used without
committing local relay configuration or `.env.maestro`.
The successful path is login, create server, create and share an invite, create
a channel, open the member panel, and upload an avatar; the same run leaves the
created UAT data in a deterministic cleanup state and produces both theme
captures without revealing invite or upload secrets.

## Delivery and commit contract

Work proceeds directly on `uat` after preserving unrelated local state in a
scoped stash and confirming `HEAD == origin/uat`. The remote branch is checked
again before every milestone commit and push; an advanced origin is a hard stop
for reconciliation rather than an implicit merge.

The final UAT history contains exactly these three milestone commits:

1. `feat(mobile-api): add server management and upload endpoints`
2. `feat(mobile): add server creation, invites and avatar upload`
3. `feat(mobile): complete phase 4 server management parity`

This design document is folded into the first milestone commit, so it does not
create a fourth final commit. The final commit wording refers to the overall
Phase 4 feature set; the migration document remains the authoritative record
that complete mobile role CRUD and permission-matrix parity are deferred.

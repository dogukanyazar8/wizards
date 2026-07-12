# Mobile Phase 3 M2 API Design

## Scope

M2 exposes the existing friends, account, two-factor, Giphy, and DM-detail capabilities through
mobile bearer-authenticated API routes. It adds no mobile UI, native dependency, upload path,
client-side URL fetch, session persistence, or web behavior change.

## Architecture

Each domain uses three boundaries: shared zod request/response schemas in `@wizards/types`, a pure
dependency-injected route-logic module, and a thin Next.js route file. Route logic authenticates
with `requireMobileApiUserId`, applies a named `enforceApiRateLimit` action, parses all external
input, delegates authorization and business rules to existing services, validates the response,
and maps failures only through `jsonError`.

The friends and Giphy routes call their existing services directly. Presence and 2FA call existing
low-level services; profile persistence/broadcast behavior is extracted from the web server action
into a shared account service so the web action and mobile route share one implementation. DM
details composes the existing participant guard, conversation DTO, mutual-server service, bounded
message listing, attachment visibility mapping, and shared-attachment summarizer.

## Contracts

- `GET /api/v1/mobile/friends` returns `{ friends, pending, blocked }`.
- `POST /api/v1/mobile/friends/requests` accepts `{ username }`.
- request accept/reject routes use the request id path parameter and no body.
- friend removal and block routes use bounded `userId` path parameters.
- `PUT /api/v1/mobile/account/presence` accepts only `ONLINE | IDLE | DND | OFFLINE`.
- `PATCH /api/v1/mobile/account/profile` accepts `displayName` and `username`; email, status,
  password, avatar URL, and authorization fields are rejected by strict schemas.
- 2FA setup returns the existing QR/manual-entry contract, confirmation returns recovery codes,
  and disable requires both password and TOTP/recovery code. These response bodies are never logged.
- `GET /api/v1/mobile/giphy/search` accepts bounded `q`, `limit`, and `offset` values and delegates
  all upstream fetches and API-key use to the existing server service.
- `GET /api/v1/mobile/dm/[conversationId]/details` returns the bounded participant summary, mutual
  servers, and cursor-paged shared attachments after `requireDMParticipant` authorization.

## Security and errors

All request schemas are strict and all identifiers are bounded. Mobile bearer auth runs before
domain work; authorization remains inside existing services. Giphy secrets stay server-only. 2FA
secrets and recovery codes exist only in successful response bodies and test fixtures, never in
logs, telemetry, persisted caches, or evidence. Errors use existing bounded `ApiError` codes and
`jsonError`; upstream bodies, credentials, and user-provided content are not echoed.

## Testing

Every schema and route-logic module is developed red-green. Tests cover happy paths, auth failure,
invalid input, rate-limit short circuiting, service failure mapping, output validation, and the
absence of secret logging. Existing web action/service tests remain green to prove behavior parity.
M2 closes only after types, web tests, mobile contract tests, component tests, quality checks, and
production audit pass; there is no Maestro or Android build in this milestone.

## Approved constraints

The user-provided Phase 3 specification is the approved design authority. Work stays directly on
`uat`, uses one milestone commit, preserves the unrelated observability plan, and keeps all
remaining Phase 3 work JavaScript-only.

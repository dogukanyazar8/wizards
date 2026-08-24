# Bahsedilmeler TODO Closure Implementation Plan

> Execute in this session, inline, with test-first changes. Preserve unrelated dirty WIP.

**Goal:** Close nine source TODOs plus verified desktop/mobile/reply/modal parity gaps.

**Architecture:** Extend existing contracts and services only where a real product invariant is missing. Keep mention visibility in the existing SQL scope, message delivery in existing send services, and client state in current TanStack Query/provider patterns.

**Stack:** TypeScript, React 19, Next.js, Prisma/PostgreSQL, Socket.IO, React Native, TanStack Query, node:test.

---

### Task 1: Thread lifecycle

**Files:** `packages/db/prisma/schema.prisma`, rebaseline migration, mention/thread schemas, channel thread service/routes, web thread panel, mobile channel thread route/screen, focused tests.

1. Add failing schema/service/route tests for real close state, authorization and reply rejection.
2. Add nullable close metadata and migration.
3. Implement close/reopen service and authenticated routes.
4. Surface state and controls; reject closed-thread sends.
5. Run focused thread tests and typecheck affected packages.

### Task 2: Mention contracts and read model

**Files:** `packages/types/src/mentions-screen.ts`, `apps/web/src/lib/mentions/mentions-query.ts`, `mentions-service.ts`, routes/client/tests.

1. Add failing tests for `messageId`, exact total, source title, role names, unnamed group DM and real thread state.
2. Extend schemas and SQL/service metadata without N+1 reads.
3. Reuse group presentation logic; remove URL parsing and server-localized everyone tag.
4. Run contract/query/service tests.

### Task 3: Mention page parity

**Files:** mention page/card/rail/settings components, provider/layout, shared modal, locale files and tests.

1. Add failing render/behavior tests for exact counts, empty source title, real avatar, localized everyone tag and bell header.
2. Add narrow authenticated-app context and backwards-compatible modal header slot.
3. Wire metadata and remove all related TODO markers.
4. Run focused component tests.

### Task 4: Reliable rich replies

**Files:** socket contracts/handlers, mention reply target/box, existing attachment helpers, focused server/client tests.

1. Add failing ACK success/error/dedupe/timeout tests.
2. Add optional compatible ACK to channel and DM send handlers.
3. Keep draft until success; add existing emoji/upload behavior and validations.
4. Run socket and reply component tests.

### Task 5: Desktop and mobile parity

**Files:** desktop experience/policy tests, quiet-hours helper, mobile bootstrap, mobile thread-follow client/query/screen and route tests.

1. Add failing pure policy tests for desktop modes and quiet hours.
2. Wire mention settings into desktop delivery.
3. Add authenticated mobile follow read/write and optimistic rollback.
4. Replace mobile server badge source with mention counts `bySource`.
5. Run focused desktop/mobile tests.

### Task 6: Closure gates

1. Scan scoped files for remaining TODOs and obsolete URL parsing/local-state fallbacks.
2. Run types tests, web/mobile focused tests, lint/typecheck/build commands from package scripts.
3. Run `graphify update .`.
4. Update Bahsedilmeler parity report with exact PASS/FAIL/NOT RUN/ENV BLOCKED evidence.
5. Recheck scoped diff/status; do not commit or push.

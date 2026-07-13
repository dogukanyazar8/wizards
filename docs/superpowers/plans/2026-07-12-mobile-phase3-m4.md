# Mobile Phase 3 M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 3 mobile account, media, DM details, settings IA, and device evidence.

**Architecture:** Feature-specific schema-validating clients feed focused screens and reusable components. Server routes remain thin wrappers around existing 2FA, Giphy, link-preview, and DM services; sensitive values stay ephemeral.

**Tech Stack:** React Native, Expo SDK 56, React Navigation, TanStack Query, FlashList, Next.js App Router, zod, Maestro.

## Global Constraints

- Work directly on `uat`; no branch, worktree, native dependency, or second Android build.
- Never persist or log 2FA secrets, recovery codes, Giphy keys, bearer tokens, or raw preview URLs.
- No client-side arbitrary URL fetch and no query persistence/offline cache.
- Keep generated graph, tsbuildinfo, artifacts, `.env.maestro`, and the unrelated observability plan out of the commit.

---

### Task 1: Secure M4 server contracts

- [x] RED tests for mobile Giphy attachment creation and link preview proxy.
- [x] Add strict shared schemas and thin authenticated/rate-limited routes wrapping existing services.
- [x] Run focused types/web tests and typecheck GREEN.

### Task 2: Mobile clients

- [x] RED client tests for 2FA, Giphy search/attachment, link preview, and DM details.
- [x] Implement schema-validating clients with safe paths and non-sensitive query keys.
- [x] Run focused mobile client tests and typecheck GREEN.

### Task 3: Account and media UI

- [x] Add Security/2FA screen with ephemeral setup, confirmation, recovery, and reauth disable state.
- [x] Add GIF BottomSheet/FlashList and wire server-created attachments into channel and DM sends.
- [x] Add server-backed link-preview cards to message bubbles.

### Task 4: DM details and settings IA

- [x] Add DM details stack screen and header navigation.
- [x] Add settings hub and dedicated Account, Security, Appearance, Notifications, Language, About, and Developer routes.
- [x] Update navigation and component/contract coverage.

### Task 5: Phase closure

- [x] Add `.maestro/phase3-social.yml` with testID contract and redacted screenshot paths.
- [x] Add `MIGRATION_PHASE_3.md` with API/screen/hook map and Phase 4 handoff.
- [x] Run full gates, audit, graph update, Maestro once, stage only M4, commit, and push `uat`.

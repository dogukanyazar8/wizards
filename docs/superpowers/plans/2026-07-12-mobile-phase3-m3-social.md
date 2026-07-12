# Mobile Phase 3 M3 Social Implementation Plan

**Goal:** Deliver native friends, presence, and profile editing on top of the M2 mobile APIs without widening auth, upload, or persistence boundaries.

**Architecture:** A schema-validating social API client and React Query hooks own remote state. The messages tab owns the Conversations/Friends segment; dedicated stack screens own profile and blocked-user management. Realtime friend, presence, and profile events invalidate only social/profile query keys.

**Security boundary:** Avatar UI may use the existing picker/readiness contract, but it must not upload or persist a local URI while the existing upload contract reports unavailable. No new upload endpoint or arbitrary URL field is introduced.

## Tasks

- [x] Add tested mobile social client, query keys, and mutation hooks.
- [x] Add Friends hub with presence rows, requests, search/request, block/remove, and one-tap DM.
- [x] Add presence BottomSheet and profile-edit stack screen.
- [x] Add blocked-user settings stack screen.
- [x] Map verified friends/presence/profile socket events to narrow query invalidation.
- [x] Update localized copy and component/contract tests.
- [x] Run milestone gates, audit, graph update, commit, and push `uat`.

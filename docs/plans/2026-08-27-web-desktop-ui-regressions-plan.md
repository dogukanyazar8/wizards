# Web/Desktop UI Regressions Implementation Plan

**Goal:** Normalize create-flow safety, messaging surfaces, startup routing, and the settings profile hero without replacing existing architecture.

**Design:** Keep `MessageInput`, `MessageItem`, `ServerModalShell`, `GroupCreateDialog`, and the existing discard overlay as the single implementation paths. Add only pure dirty-state predicates and narrowly scoped responsive/style contracts. Normal launches resolve to `/home`; explicit safe deep links remain authoritative.

## Tasks

1. Add failing focused tests for channel modal fixed geometry/icon sizing and create-only dirty-state detection.
2. Reuse `BugReportDiscardDialog` for channel and group creation; guard close button, cancel, backdrop, and Escape through one callback.
3. Pass the poll composer contract to server text channels; make composer tools and voice recording borderless; normalize all send buttons to the server reference geometry.
4. Make double-click reply ignore browser-created text selection while retaining interactive/invalid-message guards.
5. Remove duplicate thread spacing and render date separators in normal virtual-row flow.
6. Restyle `MessageEditor` as a compact inline editor using existing tokens and keyboard behavior.
7. Change the default authenticated redirect to `/home`, add `/home` to the safe allowlist, and preserve explicit safe callbacks.
8. Make `ProfileHeroCard` a clipped card with responsive identity/actions layout so narrow settings widths cannot overlap.
9. Run focused tests, scoped type/lint checks, `git diff --check`, and `graphify update .`; report browser/Tauri checks separately.

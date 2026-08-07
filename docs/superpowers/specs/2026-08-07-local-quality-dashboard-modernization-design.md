# Local Quality Dashboard Modernization Design

**Status:** User-approved delta design (`uygula`, 2026-08-07)

## Goal

Modernize the standalone loopback dashboard, use the canonical Whispr logo, and make failed or blocked checks diagnosable without reading the full log.

## Chosen approach

Persist bounded, structured diagnostics beside each profile result. Client-only log parsing was rejected because it cannot support reliable history. Tool-specific parsers were rejected because their maintenance cost is disproportionate. The common diagnostic model remains tool-neutral and uses existing runner lifecycle events plus a bounded redacted log tail.

## Diagnostic contract

Each profile may expose an `issues` array. An issue contains:

- `status`: `FAIL` or `BLOCKED`;
- `stepId`, `exitCode`, `command`, and `nextAction` when available;
- a concise `reason` selected from structured event detail or the latest error-like log line;
- up to eight existing repository-relative source references with optional line and column;
- a bounded redacted evidence excerpt.

The coordinator builds issues while a profile runs. It records blocked precondition detail, tracks a bounded log tail, captures failed or blocked step events, and creates a fallback issue if a terminal failure lacks a structured step. Secrets remain subject to the existing redaction layer. Absolute paths outside the repository are rejected. Raw source content is never served.

Completed results persist diagnostics in `result.json` and `summary.md`. The store exposes a validated result reader so history can load full details. Recent-run bootstrap data stays compact and excludes diagnostic excerpts.

## Server changes

- Serve the canonical `apps/web/public/app-icons/whispr.png` through a fixed read-only `/assets/whispr-logo.png` route. Do not duplicate the image.
- `GET /api/runs/:id` first returns an in-memory run, then falls back to a validated persisted result.
- The response states whether the run is replayable in the current process. Failed-only rerun stays disabled for non-replayable historical runs.
- Existing loopback Host, Origin, token, CSP, allowlist, body-size, capability, and redaction controls remain unchanged.

## Interface

Use a modern Whispr command-center layout:

- glass top bar with canonical logo, wordmark, localhost/readiness badges, and theme control;
- compact hero with active-run state and primary run actions;
- summary cards with stronger hierarchy and status color;
- responsive profile-card workspace;
- visible `Sorunlar` inbox beside profiles;
- separate `FAIL` and `BLOCKED` tabs, with `FAIL` selected by default;
- issue cards showing reason, command, exit code, next action, source chips, and expandable evidence;
- lower observability area containing live log and clickable recent history.

All content uses safe DOM APIs. Source paths and commands are copyable but never executed. Keyboard navigation, visible focus, reduced motion, dark/light themes, and responsive behavior remain required.

## Error handling

- Missing structured detail falls back to a deterministic exit-code reason.
- Missing source references do not hide the issue.
- Corrupt or absent historical results return the existing safe HTTP error shape.
- Evidence persistence warnings remain separate from test verdicts.
- Diagnostic extraction failure cannot change a profile result.

## Verification

- Unit tests for source extraction, outside-root rejection, bounded evidence, issue construction, persistence, and historical reads.
- Coordinator regression tests for failed, blocked, and thrown-runner diagnostics.
- HTTP tests for canonical logo delivery and persisted-run fallback.
- Static contract tests for semantic issue UI and safe DOM rendering.
- Playwright checks for canonical logo, default FAIL filtering, BLOCKED switching, reason/command/source/evidence visibility, history selection, keyboard behavior, responsive layout, theme persistence, reduced motion, and axe WCAG checks.

## Boundaries

No remote CI, deployment, APK installation, device acceptance, source-file editing, arbitrary file browsing, or command construction is added. The dashboard stays local, allowlisted, sequential, and single-run.

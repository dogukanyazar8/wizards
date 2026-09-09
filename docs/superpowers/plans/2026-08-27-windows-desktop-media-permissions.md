# Windows Desktop Media Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WebView2 camera/microphone permission chrome with a secure Whispr-owned local prompt for the Windows desktop app.

**Architecture:** An initialization bridge wraps desktop `getUserMedia()` calls and asks the shell for a trusted local prompt. A Rust broker issues short-lived one-use grants; a Windows WebView2 handler suppresses default permission UI and accepts only grants resolved by the local Desktop Control window.

**Tech Stack:** Tauri 2.11, Rust 2021, WebView2 COM 0.38, static HTML/CSS/JavaScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-windows-desktop-media-permissions.md`

## Global Constraints

- Windows NSIS first; preserve existing non-Windows WebView behavior.
- Exact configured Whispr origin only; fail closed.
- Remote main WebView can request a prompt but cannot grant permission.
- Local Desktop Control owns allow/deny.
- No new runtime service, database change, broad dependency upgrade, commit, push, or unrelated refactor.
- Preserve all existing dirty WIP and use exact-file patches only.

---

### Task 1: Native permission broker

**Files:**

- Create: `apps/desktop/src-tauri/src/media_permissions.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

**Interfaces:**

- Produces: `DesktopMediaPermissionBroker`, `DesktopMediaPermissionKind`, `install_webview2_media_permission_handler`.
- The broker accepts one pending prompt, resolves only the matching request id, and consumes an exact kind/origin grant once.

- [x] Write Rust unit tests for matching/mismatched request id, pending expiry, grant expiry, one-use consumption, wrong origin, and saved WebView2 state.
- [x] Run the focused Rust tests and observe failure because the broker does not exist.
- [x] Implement the minimal broker and pure permission-decision function.
- [x] Run the focused tests and observe PASS.
- [x] Add the Windows-only WebView2 event handler using the tested decision function.
- [x] Run `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked`.

### Task 2: Trusted Whispr prompt and IPC boundary

**Files:**

- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/build.rs`
- Modify: `apps/desktop/src-tauri/capabilities/main.json`
- Modify: `apps/desktop/src-tauri/capabilities/desktop-control.json`
- Modify: `apps/desktop/src-tauri/assets/desktop-control/index.html`
- Modify: `apps/desktop/src-tauri/assets/desktop-control/app.css`
- Modify: `apps/desktop/src-tauri/assets/desktop-control/app.js`
- Test: `apps/desktop/scripts/desktop-trust-boundary.test.mjs`

**Interfaces:**

- Produces: `request_desktop_media_permission(kind) -> { requestId }` for main.
- Produces: `resolve_desktop_media_permission(requestId, allowed)` for Desktop Control only.
- Produces: `window.whisprDesktopControlRefreshState()` inside the local surface.

- [x] Extend trust-boundary tests so main can request but cannot resolve, while Desktop Control can resolve but no remote URL can load it.
- [x] Run the desktop trust-boundary test and observe the expected capability failure.
- [x] Add commands, generated ACL inputs, capabilities, and exact label/origin guards.
- [x] Add the accessible Whispr-styled local dialog with Allow and Not now actions.
- [x] Run the trust-boundary test and observe PASS.

### Task 3: All-call-site desktop media bridge

**Files:**

- Create: `apps/desktop/src-tauri/assets/desktop-media-permission-bridge.js`
- Create: `apps/desktop/scripts/desktop-media-permission-bridge.test.mjs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**

- Wraps `navigator.mediaDevices.getUserMedia(constraints)` only in Whispr Desktop.
- Calls `request_desktop_media_permission` per required media kind.
- Exposes `__WHISPR_DESKTOP_MEDIA_PERMISSION_RESOLVE__(requestId, allowed)` solely to resume/deny the pending JavaScript call; native state remains authoritative.

- [x] Write VM tests for non-desktop passthrough, prompt-before-capture, same-kind deduplication, combined audio/video ordering, and denial without capture.
- [x] Run the focused Node test and observe failure because the bridge asset does not exist.
- [x] Implement the smallest bridge satisfying the tests.
- [x] Inject it before remote application scripts through the existing desktop initialization script.
- [x] Run the focused test and the full desktop Node suite; observe PASS.

### Task 4: Real permission settings actions and regression coverage

**Files:**

- Modify: `apps/web/src/lib/desktop/permissions.test.ts`
- Modify: `apps/web/src/lib/desktop/permissions.ts`
- Modify: `apps/web/src/components/settings/blocks/permissions-block.tsx`

**Interfaces:**

- Camera/microphone actions continue through `getUserMedia`; the desktop bridge owns presentation and WebView2 authorization.
- Notifications send a visible test, screen sharing opens the real picker, and global shortcuts open the trusted shortcut manager.

- [x] Add regression tests for permission-specific actions and screen-share track cleanup.
- [x] Run focused Web tests and observe the old generic/no-op behavior fail.
- [x] Add only the minimal key-aware behavior and Windows settings bridge.
- [x] Run focused permission/block tests and observe PASS.

### Task 5: Verification and graph refresh

**Files:**

- Refresh: `graphify-out/`

- [x] Run desktop Node tests.
- [x] Run Rust tests and Clippy with warnings denied.
- [x] Run focused Web permission/block tests and Web typecheck.
- [x] Run `graphify update .`.
- [x] Inspect exact target-file diff and report `PASS / FAIL / NOT RUN / ENV BLOCKED` without committing.

# Whispr Desktop Native Evolution

Living P00 baseline. This document is source-grounded as of 2026-07-27 and is the single phase record for the desktop-native evolution work.

## Scope lock

- Branch: `codex/desktop-native-evolution`
- Worktree: `C:\Users\doguk\Desktop\Wizards\.worktrees\desktop-native-evolution`
- Base and `origin/uat`: `c3983a0ac733e4b9f33260aef93d87e73d400961` (divergence `0 0` at baseline)
- P00 change scope: this document only. No desktop, web, mobile, database, CI, workflow, release, secret, signing, infrastructure, or production change is authorized in P00.
- Main checkout was preserved: it was dirty on `uat` and never switched, reset, stashed, cleaned, copied, or modified.
- P00 phase commit is document-only. Its immutable SHA is recorded by Git history after the commit; the base SHA above is the source baseline.

## Current state

Whispr Desktop is a Tauri 2 shell around external web content, not a bundled local renderer.

- Versions: Node `24.18.0`, pnpm `11.17.0`, Rust/Cargo `1.95.0`, Tauri CLI `2.11.4`; desktop package, Cargo package, and Tauri config are `0.8.15`. The lockfile resolves Tauri `2.11.5` and updater `2.10.1`.
- Main, voice-mini, and game-overlay WebViews use `WebviewUrl::External(...)`. Production origin is HTTPS `https://whispr.team`; development allows localhost. Sources: `apps/desktop/src-tauri/src/lib.rs:660-683,3097-3126,3227-3255`, `apps/desktop/scripts/run-tauri.mjs:13-47`.
- The main WebView is a remote-capable surface with 21 custom native command permissions plus notification/window permissions. Voice mini has only `core:window:allow-start-dragging`; game overlay has no WebView command permissions. Sources: `apps/desktop/src-tauri/capabilities/main.json`, `voice-mini.json`, `game-overlay.json`.
- Existing native capabilities: tray; single-instance; deep links; OAuth navigation restriction; global shortcuts; autostart; close-to-tray; notifications; updater contract; diagnostics export; voice mini; game overlay; Windows foreground-process and focus checks. Sources: `apps/desktop/src-tauri/src/lib.rs:569-632,2297-2394,3420-3708`.
- Native screen capture, system audio, native LiveKit publishing, and hardware encoder selection have no production command. They are explicitly research-gated; browser `getDisplayMedia`/LiveKit remains the fallback. Sources: `apps/desktop/src-tauri/src/lib.rs:961-1019,3775-3802`, `apps/desktop/NATIVE_MEDIA_RESEARCH.md`, `apps/web/src/lib/voice/screen-share.ts:79-100`.

## Target architecture

The future architecture retains Tauri and replaces the current remote-privilege concentration incrementally:

1. A bundled local, trusted desktop control plane owns native settings, updater, diagnostics, shortcut/autostart mutation, recovery, and consent surfaces.
2. Remote content receives zero or the smallest measurable native capability set. It can emit bounded state/request signals only.
3. Rust IPC is narrow, typed, versioned, bounded, window-authorized, cancellable where needed, and returns safe user errors with PII-free audit metadata.
4. Platform services are extracted only when consumed by a real phase feature. Browser/WebRTC remains the fallback.
5. Windows native media and UX are evidence-gated on real devices; macOS/Linux parity follows Windows proof.
6. Shared client/realtime/RTC logic remains pure typed core code so Web and Mobile contracts stay intact.

## Trust boundaries

### Surface inventory

| Surface        | Current renderer              | Current permission boundary                                                                                  | Required evolution                                                                                             |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `main`         | External remote web origin    | 21 custom commands, notification, window controls; all custom commands Rust-check `window.label() == "main"` | Move sensitive controls behind bundled local UI; reduce remote permission surface one command group at a time. |
| `voice-mini`   | External remote web origin    | Drag only; receives Rust-pushed sanitized voice snapshot                                                     | Preserve minimum permission; replace raw JSON native boundary with typed/versioned snapshot.                   |
| `game-overlay` | External remote web origin    | No WebView command permissions; receives Rust-pushed sanitized voice snapshot                                | Preserve no-invoke model and voice-only/read-only scope.                                                       |
| Browser/Mobile | Web and native mobile clients | No Tauri access                                                                                              | Preserve public auth, realtime, media, and visual contracts.                                                   |

Navigation is constrained to same-origin; OAuth navigation is restricted to active Google/GitHub HTTPS flows, popups are denied, and other external URLs open in the system browser. `whispr://` deep links only map to allowlisted internal paths; OAuth claims are internal routes. Sources: `apps/desktop/src-tauri/src/lib.rs:667-710,3420-3511,3645-3708`.

All custom commands have a main-window label guard at `apps/desktop/src-tauri/src/lib.rs:751-760`. That prevents voice-mini and overlay invokes, but it does not distinguish a trusted local main renderer from remote main content, does not independently verify origin, and does not enforce native user gesture.

### Current command inventory

Legend: `M` is the remote main WebView and is the only permitted command caller. `Effect` identifies native side effects; `Gesture` means a native-layer gate, not merely an apparent UI click. `No` therefore means a compromised remote main renderer can call it if its capability remains granted.

| Command                                 | Caller / input boundary                                                         | Effect                                                           | Gesture                        | Test evidence                                               |
| --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| `complete_desktop_before_close`         | M; `requestId: u64` must match pending close request                            | Exit or close-to-tray handshake; window-state write              | No                             | `apps/web/src/lib/desktop/runtime.test.ts`                  |
| `promote_desktop_main_window`           | M; no payload                                                                   | Restore, show, resize main window                                | No                             | Indirect desktop runtime coverage                           |
| `configure_desktop_voice_shortcuts`     | M; max four bounded shortcut strings; reserved/duplicate/newline forms rejected | Register and persist OS global shortcuts                         | No                             | Rust shortcut test in `lib.rs`                              |
| `get_desktop_voice_shortcut_status`     | M; no payload                                                                   | Reads shortcut registry state                                    | No                             | Indirect controls coverage                                  |
| `export_desktop_diagnostics_bundle`     | M; sanitized web diagnostic payload                                             | Build redacted native diagnostics bundle for browser download    | UI click only; no native proof | Rust diagnostic-redaction test; diagnostics-panel tests     |
| `record_desktop_update_failure`         | M; sanitized bounded failure fields                                             | Append redacted native updater log                               | No                             | `apps/web/src/lib/desktop/updater.test.ts`                  |
| `get_desktop_autostart_enabled`         | M; no payload                                                                   | Reads OS autostart state                                         | No                             | Indirect controls coverage                                  |
| `set_desktop_autostart_enabled`         | M; boolean                                                                      | Changes and verifies OS autostart                                | UI click only; no native proof | Indirect controls coverage                                  |
| `get_desktop_quit_on_close_enabled`     | M; no payload                                                                   | Reads close behavior preference                                  | No                             | Indirect controls coverage                                  |
| `set_desktop_quit_on_close_enabled`     | M; boolean                                                                      | Changes close behavior preference                                | No                             | Indirect controls coverage                                  |
| `get_desktop_platform_capabilities`     | M; no payload                                                                   | Reports research-gated native media/platform state               | No                             | Rust native-media gate test                                 |
| `get_desktop_foreground_process_name`   | M; no payload; Windows result is basename-only and filtered                     | Reads foreground process basename when opt-in preferences permit | No                             | Rust pathless-process test                                  |
| `get_desktop_main_window_focused`       | M; no payload                                                                   | Reads foreground HWND/focus state                                | No                             | Indirect desktop runtime coverage                           |
| `get_desktop_companion_surfaces_status` | M; no payload                                                                   | Reads mini/overlay geometry and visibility                       | No                             | `apps/web/src/lib/desktop/companion-surface-health.test.ts` |
| `refresh_desktop_companion_surfaces`    | M; bounded layout/default                                                       | Creates, positions, repairs, and styles companion windows        | No                             | Companion-surface health tests                              |
| `set_desktop_activity_status`           | M; allowlisted status                                                           | Changes title and tray tooltip                                   | No                             | Indirect desktop experience coverage                        |
| `set_desktop_game_overlay_visible`      | M; boolean plus bounded layout                                                  | Creates, shows, hides, or destroys overlay                       | No                             | Overlay state-machine tests                                 |
| `publish_desktop_game_overlay_snapshot` | M; `serde_json::Value`, 16 KiB cap                                              | Pushes voice-state snapshot to overlay                           | No                             | Overlay schema/state-machine tests; recipient Zod parse     |
| `set_desktop_voice_mini_visible`        | M; boolean                                                                      | Creates, shows, or hides voice-mini window                       | No                             | Companion-surface health tests                              |
| `publish_desktop_voice_mini_snapshot`   | M; `serde_json::Value`, 16 KiB cap                                              | Pushes voice-state snapshot to voice mini                        | No                             | Voice-mini snapshot tests; recipient Zod parse              |
| `get_desktop_app_info`                  | M; no payload                                                                   | Reads runtime/version/ring/WebView metadata                      | No                             | Rust app-info test                                          |

The highest-risk boundary is therefore current remote `main` ownership of privileged native operations. Rust validation is present for individual inputs (for example, shortcut shape, close request ID, deep-link route, process-name filtering, diagnostics redaction), but the entry capability remains remote-wide.

## P00 feature parity inventory

| Feature                     | Source state                                                          | P00 evidence status                                      |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Main window / custom chrome | Implemented; external remote main with promotion and close handshake  | Source verified; native smoke NOT RUN                    |
| Tray / close-to-tray        | Implemented; tray menu, restore, mute/deafen, quit                    | Source verified; native smoke NOT RUN                    |
| Notifications               | Implemented; permission request waits for pointer/key interaction     | Source verified; device/OS permission smoke NOT RUN      |
| Shortcuts                   | Implemented; bounded shortcut validation and OS registration          | Rust test PASS; real global-shortcut smoke NOT RUN       |
| Autostart                   | Implemented; read/write/verify command                                | Source verified; OS smoke NOT RUN                        |
| Updater                     | Signed HTTPS manifest contract exists; enablement build-conditional   | Script tests PASS; signed install/relaunch smoke NOT RUN |
| OAuth / deep links          | Implemented with allowlists and one-use Redis handoff                 | Rust and web contract tests PASS; device smoke NOT RUN   |
| Diagnostics                 | Implemented with redaction/bounds and browser download                | Rust/web tests PASS                                      |
| Voice mini / overlay        | Implemented; remote child renderer with minimum/no invoke permissions | Contract tests PASS; real Windows smoke NOT RUN          |
| Screen / system audio       | Browser path only; native path research-gated                         | Browser regression path covered; native proof NOT RUN    |

## Performance and QoE baseline

Declared release budgets, not measured P00 results:

| Metric                         | Budget                                                  | Existing evidence                                         | Status                     |
| ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| Warm start                     | `<= 2000 ms`                                            | Browser-side `performance.now()` metric only              | NOT RUN for process launch |
| Warm idle memory               | `<= 220 MB`                                             | No process-family RSS harness                             | NOT RUN                    |
| Overlay CPU                    | `<= 3%` average                                         | No 60-second native CPU harness                           | NOT RUN                    |
| Shortcut latency               | `<= 50 ms p95`                                          | Event timestamp metric only; no p95 artifact              | NOT RUN                    |
| RTC/QoE                        | Packet/RTT stats exist for selected LiveKit/Krisp paths | No native frame-drop, jitter, CPU, GPU, A/V-sync artifact | PARTIAL                    |
| Updater check/install/relaunch | Release checklist/contract only                         | No signed local-feed smoke                                | NOT RUN                    |

Sources: `apps/desktop/scripts/release-ops.mjs`, `apps/web/src/lib/desktop/performance.ts`, `apps/web/src/lib/voice/audio-health.ts`, `apps/web/src/components/providers/live-voice-provider.tsx`.

## CI, release, and audit baseline

- Semgrep CE is the current equivalent SAST and runs `--strict --error`; CodeQL is not currently present. Required-check/branch-protection configuration was not inspected. Source: `.github/workflows/ci.yml:76,115`.
- `desktop-ops` installs version-pinned `cargo-audit 0.22.1` with `--locked`, then runs the desktop release script tests and config generation. Source: `.github/workflows/ci.yml:670,706`.
- Automatic Rust `cargo fmt --check`, `cargo clippy`, and `cargo test --locked` gates are missing. Windows native compatibility/Tauri binary evidence runs only for `workflow_dispatch` with `desktop_hosted=true`; normal pushes do not prove a Windows binary. Source: `.github/workflows/ci.yml:219,267,706,741,879`.
- Release workflow guards ring/version/HTTPS/stable-main and updater signing/manifest contracts. It does not prove secret availability, signed build, R2 publication, remote validation, or updater install/relaunch in P00. Source: `.github/workflows/desktop-release.yml`, `apps/desktop/scripts/desktop-release-workflow.mjs`.
- Release publication uses unpinned `python -m pip install --user awscli`; this is a P01 supply-chain/reproducibility observation, not changed in P00. Source: `.github/workflows/desktop-release.yml:718`.
- `pnpm audit --audit-level moderate` found no known vulnerabilities. `cargo audit` found zero vulnerabilities and 17 informational warnings: 16 unmaintained Linux/GTK-family or transitive crates and one `glib 0.18.5` unsoundness advisory. They are visible in the baseline; no repository audit-ignore file was found.

### Live CI

Latest `uat` run at P00 baseline: [30252958542](https://github.com/dogukanyazar8/wizards/actions/runs/30252958542), `c3983a0`, **FAIL**.

- `Verify` and TypeScript compatibility succeeded.
- `Desktop Ops (wizards-ci)` failed before audit because its runner lacks `pwsh`: `pwsh: command not found`. This is runner configuration, not desktop source behavior.
- Playwright, accessibility, Firefox/WebKit, and visual jobs failed in E2E migration `20260727150000_telemetry_platform_dims`: PostgreSQL `42704`, missing `UserDailyMetric_date_userId_key`. This is database migration baseline work outside desktop scope.
- `Semgrep CE SAST` failed before steps and exposed no downloadable job log. Status is **ENV BLOCKED / external CI investigation needed**.
- `Node 22 Native Compatibility` and `Tauri Desktop Build` were skipped. Skipped is not PASS.

The older "missing admin sections" snapshot is not the current failure evidence: the current `Verify` job succeeded. Full integration remains **BLOCKED** until the remote runner and E2E migration baseline are repaired outside this phase.

## P00 test evidence

| Command                                                                                         | Result                                                                        |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                       | PASS; lockfile unchanged                                                      |
| `corepack pnpm --filter @wizards/desktop test`                                                  | PASS; 81 tests                                                                |
| `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`                         | PASS; 9 Rust tests, no failures                                               |
| `corepack pnpm --filter @wizards/web exec node --import tsx --test "src/lib/desktop/*.test.ts"` | PASS; 39 tests                                                                |
| `corepack pnpm --filter @wizards/desktop release:ops`                                           | PASS; contract output lists release rings, safety rules, and declared budgets |
| `corepack pnpm audit --audit-level moderate`                                                    | PASS; no known vulnerabilities                                                |
| `cargo audit` in `apps/desktop/src-tauri`                                                       | PASS for vulnerabilities; 17 informational warnings visible                   |
| Real Windows Tauri build / native smoke / device media / signed updater                         | NOT RUN                                                                       |
| Full UAT integration CI                                                                         | BLOCKED by current non-desktop runner and migration failures                  |

## P01 CI, security, release, and measurement record

**Status: ENV BLOCKED.** The source gates and local unsigned Windows binary build are verified, but a remote CI run, protected release evidence, complete native smoke, and complete performance evidence cannot be claimed without a push/dispatch and release environment access.

### Delivered source gates

- Existing Semgrep CE SAST remains unchanged: immutable image digest, read-only mount, `--strict`, and `--error`. CodeQL was not added or deleted.
- `desktop-ops` now uses portable `bash` for its version-pinned `cargo-audit 0.22.1` install/check, verifies `Cargo.lock` through `cargo metadata --locked`, and audits that exact lockfile with `cargo audit --file Cargo.lock`. The pinned `cargo-audit` CLI does not implement a `--locked` flag; this is the equivalent fail-closed lockfile boundary, not a relaxed audit.
- Automatic Linux `desktop-ops` now runs `cargo fmt -- --check`, `cargo clippy --locked --all-targets -- -D warnings`, `cargo test --locked`, and an unsigned `tauri build --no-bundle` signal. Manual `desktop_hosted=true` retains the same Windows/macOS quality matrix.
- New path-filtered `.github/workflows/desktop-native-build.yml` runs unsigned Windows and macOS `tauri build --no-bundle` signals when desktop, lockfile, runtime, or workflow inputs change. It has `contents: read`, SHA-pinned actions, no environment, no secrets, updater disabled, Windows signing disabled, and no artifact publishing. The Windows lane checks for `whispr-desktop.exe`.
- The old non-protected CI `desktop-build` job, including Tauri private-key and Windows certificate inputs, was removed. `desktop-release.yml` remains the only signing surface and retains its `desktop-<ring>` protected environment, Ed25519 updater, HTTPS feed, ring, and release evidence contracts.
- Protected R2 publication now verifies a preinstalled AWS CLI v2 and fails closed when it is absent or unexpected; the credential-bearing job no longer installs an unpinned `awscli` package through `pip`.

### Local P01 evidence

| Command / evidence                                                                                     | Result                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm --filter @wizards/desktop test`                                                         | PASS; 93 tests, including CI, signing-surface, no-bundle forwarding, and measurement-artifact contracts                                                             |
| `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`                               | PASS                                                                                                                                                                |
| `cargo clippy --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings` | PASS                                                                                                                                                                |
| `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`                                | PASS; 9 Rust tests                                                                                                                                                  |
| `corepack pnpm --filter @wizards/desktop build:desktop -- --no-bundle`                                 | PASS; local Windows `whispr-desktop.exe`, 10,608,128 bytes                                                                                                          |
| `cargo metadata --locked` then `cargo audit --file Cargo.lock`                                         | PASS for vulnerabilities; 17 visible informational warnings, no suppression added                                                                                   |
| `artifacts/desktop-performance/p01-preflight-atomic-final.json`                                        | Actual `measure:windows` `-NoLaunch` artifact: temp-written, flushed, contract-validated, then no-clobber renamed; no application launched and no metric was scored |

The new local `measure:windows` harness accepts an explicit `.exe` and writes only a new direct `.json` file under `artifacts/desktop-performance`; it refuses an existing output and `-WhatIf` writes nothing. It writes to a unique temporary file, flushes it, invokes the Node contract validator, and only then uses a same-volume no-clobber rename. Any scored process-family memory result requires at least one 60-second idle sample per iteration, records every sample, and uses the worst sample. It fail-closes before launch when any WebView2 process already exists, because shared renderer memory cannot otherwise be attributed. For a launched process family, it preserves each CIM creation-time snapshot and verifies live PID plus start time before attribution or process cleanup. It never injects input, toggles overlay state, performs updater network/install/relaunch actions, or records command lines, paths, URLs, user names, tokens, or secrets. Without a trusted interactive-ready/shortcut acknowledgement bridge, cold/warm startup, overlay CPU, shortcut latency, and updater check/install/relaunch are intentionally `NOT_RUN`, never synthetic `PASS`.

### P01 blockers and rollback

- **Remote CI / macOS signal:** NOT RUN. No push, PR, or workflow dispatch was authorized. Local source contracts do not prove GitHub-hosted Windows/macOS execution.
- **Native smoke:** NOT RUN. Only a `-NoLaunch` harness preflight was authorized; no main-window, tray, deep-link, single-instance, shortcut, companion-window, or updater smoke result is claimed.
- **SBOM/provenance:** NOT RUN. The release flow has hashes, audit summaries, and redacted evidence, but no verified attestation/SBOM integration was added. Adding permissions, a hosted attestation path, or a new SBOM tool needs a separately authorized release-side decision and live CI validation.
- **AWS CLI patch reproducibility:** ENV BLOCKED. The protected job removes the unpinned network install and logs the preinstalled AWS CLI v2 it actually used, but the hosted runner supplies the patch version. A checksum-pinned installer or dedicated release image would be a separate release-side decision.
- **Full UAT integration:** remains BLOCKED by the P00 remote runner/E2E baseline and the current `origin/uat` divergence; no merge or rebase was performed in this worktree.

Rollback is one focused P01 commit: remove the path-filtered workflow and revert the added Linux quality steps while keeping `desktop-release.yml` as the sole signing path. Do not restore non-protected signing secrets as a rollback shortcut.

## Phase checklist

| Phase | Scope                                                              | Status                                                          |
| ----- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| P00   | Baseline, source inventory, trust boundary, scope lock             | PASS after this document-only commit                            |
| P01   | CI/security/release gates and executable measurement evidence      | ENV BLOCKED: source/local gates delivered; live evidence absent |
| P02   | Trusted local control plane and incremental IPC boundary reduction | Blocked on P01 acceptance                                       |
| P03   | Windows native media spike and measured selection                  | Blocked on P02 acceptance and research decision                 |
| P04   | Windows native UX                                                  | Blocked on prior phases                                         |
| P05   | Bundled local renderer and shared core strangler migration         | Blocked on prior phases                                         |
| P06   | macOS/Linux parity                                                 | Blocked on Windows evidence                                     |
| P07   | Collaboration parity                                               | Blocked on foundation gates                                     |
| P08   | Scale, observability, accessibility                                | Blocked on foundation gates                                     |
| P09   | UAT acceptance                                                     | Blocked on all preceding gates and external CI baseline         |

## Risks

1. **High — remote native authority.** Remote main content has the full custom-command surface. A remote compromise can reach autostart, global shortcuts, companion-window lifecycle, diagnostics writes, and—when updater builds are enabled—check/install/restart privileges. P02 must reduce this without deleting a feature before its trusted local replacement exists.
2. **Medium — gesture enforcement.** Some UI paths are user clicks, but Rust does not independently attest an explicit native gesture for privileged mutations.
3. **Medium — IPC typing.** Companion snapshots cross Rust as `serde_json::Value` with a 16 KiB cap; child renderer Zod parsing is fail-closed, but the native boundary is not typed/versioned.
4. **Medium — privacy/reliability.** Foreground process basename can reach remote main content; companion visibility commands queue asynchronous work yet return success before the work completes.
5. **Medium — audit/platform debt.** Cargo audit has 17 informational warnings, including a `glib` unsoundness advisory on Linux dependency paths. No vulnerability was reported; no suppression was added.
6. **Medium — UAT evidence gap.** Source now schedules Rust quality gates and path-filtered unsigned Windows/macOS native builds, but no live hosted execution, native smoke, complete performance sample, signed updater, SBOM/provenance, or device-media evidence exists.

## Rollback

P00 is documentation-only. Revert its single document commit to remove the phase record; no runtime, data, database, release, or infrastructure state changes exist to roll back.

## Next phase gate

Do not begin P02. P01 needs an authorized remote run of the new path-filtered workflow, a clean safe local process-family measurement run, protected release/SBOM-provenance evidence, and the independent UAT CI baseline repaired before its full acceptance gate can be re-evaluated. The P02 remote-renderer trust-boundary change remains blocked behind that evidence.

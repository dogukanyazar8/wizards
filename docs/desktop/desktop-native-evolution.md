# Whispr Desktop Native Evolution

Living desktop-native phase record. P00/P01 sections preserve their historical evidence; the P02 record below is source-grounded against the uncommitted `uat` working tree on 2026-08-07.

## P00 scope lock (historical)

- Branch: `codex/desktop-native-evolution`
- Worktree: `C:\Users\doguk\Desktop\Wizards\.worktrees\desktop-native-evolution`
- Base and `origin/uat`: `c3983a0ac733e4b9f33260aef93d87e73d400961` (divergence `0 0` at baseline)
- P00 change scope: this document only. No desktop, web, mobile, database, CI, workflow, release, secret, signing, infrastructure, or production change is authorized in P00.
- Main checkout was preserved: it was dirty on `uat` and never switched, reset, stashed, cleaned, copied, or modified.
- P00 phase commit is document-only. Its immutable SHA is recorded by Git history after the commit; the base SHA above is the source baseline.

## P00 baseline state (historical)

Whispr Desktop is a Tauri 2 shell around external web content, not a bundled local renderer.

- Versions: Node `24.18.0`, pnpm `11.20.0`, Rust/Cargo `1.95.0`, Tauri CLI `2.11.4`; desktop package, Cargo package, and Tauri config are `0.8.15`. The lockfile resolves Tauri `2.11.5` and updater `2.10.1`.
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
| `record_desktop_update_failure`         | M; sanitized bounded failure fields                                             | Append redacted native updater log; return timestamp only        | No                             | `apps/web/src/lib/desktop/updater.test.ts`                  |
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

**2026-08-08 local-only update:** GitHub-hosted desktop workflows were removed because no local Windows/macOS runner is registered. Remaining CI runs on local Linux runners; Windows/macOS native artifact, signature, updater, R2, and GitHub Release evidence are **NOT RUN** until those runners and workflows are restored.

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

**Status: ENV BLOCKED.** Source/local gates pass. Latest `origin/uat` is merged by `787b2af3`; P02 is in progress. Candidate-specific measurement and complete candidate smoke remain blocked by existing user-managed processes, not a synthetic pass.

### Source and local gates — PASS

- `origin/uat` through `40b8df2f` is integrated without rebase, reset, stash, or clean. Only `.github/workflows/ci.yml` conflicted.
- Linux self-hosted `desktop-ops` uses Bash and requires `cargo-audit 0.22.1`, validates `Cargo.lock` with `cargo metadata --locked`, then audits exact `Cargo.lock` with `cargo audit --file Cargo.lock`. `cargo-audit 0.22.1` has no `--locked`; this remains fail-closed lockfile validation.
- `cargo-audit-ci-contract.test.mjs` and `desktop-ops-workflow-contract.test.mjs` verify the local Linux exact-lock behavior.
- Semgrep CE, protected signing, updater protection, and no-bundle contracts remain unchanged. No signing secret moved into non-protected CI.

### Local P01 evidence

| Command / evidence                                                     | Result                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `corepack pnpm --filter @wizards/desktop test`                         | PASS; 94 tests                                                                               |
| `corepack pnpm test:toolchain`                                         | PASS; 47 tests                                                                               |
| `cargo fmt --all -- --check`                                           | PASS                                                                                         |
| `cargo clippy --workspace --all-targets -- -D warnings`                | PASS                                                                                         |
| `cargo test --workspace`                                               | PASS; 9 Rust tests                                                                           |
| `corepack pnpm --filter @wizards/desktop build:desktop -- --no-bundle` | PASS; fresh unsigned Windows candidate                                                       |
| `corepack pnpm --filter @wizards/desktop release:ops`                  | PASS; observational contract only                                                            |
| `corepack pnpm audit --audit-level moderate`                           | PASS; no known vulnerabilities                                                               |
| `cargo metadata --locked` then `cargo audit --file Cargo.lock`         | PASS for vulnerabilities; 17 informational warnings, no suppression                          |
| `artifacts/desktop-performance/p01-rerun-20260727.json`                | Real `measure:windows` run, no `-NoLaunch`; artifact validation PASS; metrics not fabricated |

### Real Windows measurement — ENV BLOCKED

`measure:windows` ran without `-NoLaunch` against fresh candidate and wrote ignored local evidence at `artifacts/desktop-performance/p01-rerun-20260727.json`. Artifact contract validation passed. It correctly refused memory scoring: Whispr stayed alive in tray. Windows Search also continually owns WebView2 processes. Neither process family was killed.

`process-family-memory` is `ENV_BLOCKED`. Cold/warm startup, overlay CPU, shortcut latency, updater install/relaunch are `NOT_RUN`. No metric gained `PASS` without complete attributable candidate family.

### Native smoke — partial, candidate blocked

- Installed Whispr: **MANUAL PASS** launch, main window, close-to-tray. Closing window retained process in tray; earlier window-list-only observation was corrected.
- Candidate: **ENV BLOCKED.** Starting candidate while tray instance exists invokes single-instance handling; no attributable candidate process begins. Running Whispr was not terminated.
- Restore, candidate single-instance, safe deep link, shortcut register/unregister, voice-mini, game-overlay show/hide: **NOT RUN** on candidate.
- Updater disabled: **PASS** build-config level. Unsigned build reported `updater: disabled`. No update check, install, restart, signed release, protected dispatch ran.

Candidate manual checklist after user exits Whispr from tray: launch candidate; confirm main window; close then restore tray; launch candidate again and confirm one family; invoke only safe internal deep link; register/trigger/unregister voice shortcut; show/hide voice-mini and game overlay; confirm updater disabled. Record `MANUAL PASS`, `FAIL`, or `ENV BLOCKED`.

### Remote gates — NOT RUN on feature ref

- `origin/uat` Verify, Semgrep, E2E, accessibility, visual, cross-browser were reported passing before merge.
- Feature-ref Desktop Ops, hosted Windows, hosted macOS: **NOT RUN**. No push, PR, deploy, workflow dispatch authorized.

### Release-only gates — NOT RUN

- Local SBOM: no safe existing generator installed. No dependency/tool added. Adding one needs approval for impact, maintenance, license, pinning.
- Protected signed-release attestation/provenance remains P09 release-only. Signed release, AWS CLI patch pin, UAT deploy, production, protected dispatch did not run; none blocks P02.

### P01 blockers and rollback

- Candidate measurement/native smoke: **ENV BLOCKED** until user exits tray Whispr. Windows Search WebView2 remains separate attribution boundary; not killed.
- Remote Windows/macOS: **NOT RUN**. Separately acceptable for P02 until explicitly authorized.
- SBOM/provenance: **NOT RUN**. Not P02 prerequisite.

Rollback: revert focused P01 source commits. Do not restore non-protected signing secrets or bypass exact-lock audit checks.

## P02 trust-boundary record

**Status: FAIL (required dependency-audit gate) / SOURCE PASS / RUNTIME PARTIAL / CURRENT-CHANGE REMOTE CI NOT RUN.** The synchronized `uat`/`origin/uat` base is `4b1fad7c257e9aa46413f7f019cd87d9389155f4`; this P02 slice is an uncommitted working-tree change and has no current-change hosted CI evidence.

### Trusted local control plane

- `desktop-control` is a lazy singleton local WebView. Rust serves three allowlisted embedded assets through `desktop-control://`; unknown/traversal paths return `404`. The response sets explicit content types, `no-store`, `nosniff`, a no-referrer policy, and a network-denying CSP. There is no remote URL, CDN, font, router, framework, or new dependency.
- Capability `desktop-control` has no `remote.urls`. Runtime authorization independently requires exact label `desktop-control` and local scheme `desktop-control`; main, companion, spoofed-label, and remote windows fail closed.
- Shortcut registration, native-only diagnostics export, signed-updater check/install/restart, notification permission onboarding, and bounded recovery commands are owned by this local capability. Install requires both UI confirmation and Rust-side `confirmed: true` plus exact expected-version validation. Remote main can read granted status and send bounded notifications, but cannot request permission.
- Diagnostics are size-bounded, redacted, atomically written without clobbering an existing file, and return the safe output path. Recovery only reopens/focuses voice-mini, refreshes/hides overlay, or restores the main window; no process kill, data deletion, shell execution, arbitrary URL, or retry service exists.
- Permissions report platform instructions and `OS status unverified` when the OS cannot be measured. No synthetic PASS is produced.
- Tray Settings, Diagnostics, and Updates actions open/focus the same local window. Remote web settings retain only a harmless `show_desktop_control` bridge.
- Existing web shortcut preferences are intentionally not auto-imported across the new boundary. Native shortcuts default disabled; both the remote handoff copy and local panel require an explicit local Save before re-enabling them.

### Capability result

- Remote `main` custom permissions: **16**, counted from checked-in `main.json` entries beginning with `allow-` (previous P02 slice: 17; P00 baseline: 21).
- Remote `main` no longer owns `allow-configure-desktop-voice-shortcuts` or `allow-export-desktop-diagnostics-bundle`. No frontend capability owns raw updater check/download or process restart permissions; Desktop Control reaches those operations only through exact-window Rust wrappers with explicit confirmation and expected-version validation.
- `desktop-control` exposes exactly seven guarded Rust command permissions and no raw plugin permission.
- `voice-mini` remains exactly drag-only. `game-overlay` remains `permissions: []`.
- Existing native tray ownership of autostart/close behavior and typed/versioned companion snapshot bounds remain intact.

### Current gates

- PASS: 100 desktop script tests; 11 focused desktop-web tests; Rust fmt; clippy with `-D warnings`; 26 Rust workspace tests; unsigned Windows no-bundle build; release-ops contract; diff whitespace check; and final code review with no remaining findings.
- FAIL (unrelated concurrent WIP): final broad web typecheck reports four `TS2740` errors in `apps/web/src/app/api/v1/admin/servers/route-logic.test.ts` because new admin-server fixtures omit required fields. Those files are outside P02 and were not changed by this slice; focused desktop-web tests remain green.
- FAIL: `corepack pnpm audit --audit-level moderate` reports two high `js-yaml` findings for `GHSA-5p4m-2wfm-xmqj` / `CVE-2026-59870`. The shown paths are mobile Expo/Jest transitive chains, outside this P02 slice; no broad dependency change was made.
- MANUAL PASS: candidate launch; main render; second-launch singleton; tray restore; local control open; one-window reuse with the same WebView processes; close-to-hide and reopen; keyboard Tab focus through nine controls; disabled-updater check; native diagnostics file creation, JSON parse, 2,441-byte bound, and negative scans for full home path, bearer token, authorization, cookie, email, and queried remote URL. The generated test bundle was sent to Recycle Bin and the candidate exited through tray Quit.
- NOT RUN: live shortcut registration/unregistration and companion recovery, to avoid changing persisted user settings or creating companion state after the required audit gate failed; signed updater install/relaunch; release publication; deployment; and current-change remote CI.

### Hosted native-build evidence

GitHub Actions run [31021827583](https://github.com/dogukanyazar8/wizards/actions/runs/31021827583) passed both `Unsigned native build (Windows)` and `Unsigned native build (macOS)` for ancestor commit `8b1daabf` on 2026-08-05. This corrects the older feature-ref `NOT RUN` snapshot, but it does **not** cover current base `4b1fad7c` or the uncommitted P02 working-tree changes. Current-change hosted Windows/macOS remain `NOT RUN` until push/PR or workflow-dispatch authority is granted.

## Phase checklist

| Phase | Scope                                                              | Status                                                    |
| ----- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| P00   | Baseline, source inventory, trust boundary, scope lock             | PASS after this document-only commit                      |
| P01   | CI/security/release gates and executable measurement evidence      | ENV BLOCKED: source/local PASS; candidate runtime blocked |
| P02   | Trusted local control plane and incremental IPC boundary reduction | Source implemented; local/runtime/remote evidence split   |
| P03   | Windows native media spike and measured selection                  | Blocked on P02 acceptance and research decision           |
| P04   | Windows native UX                                                  | Blocked on prior phases                                   |
| P05   | Bundled local renderer and shared core strangler migration         | Blocked on prior phases                                   |
| P06   | macOS/Linux parity                                                 | Blocked on Windows evidence                               |
| P07   | Collaboration parity                                               | Blocked on foundation gates                               |
| P08   | Scale, observability, accessibility                                | Blocked on foundation gates                               |
| P09   | UAT acceptance                                                     | Blocked on all preceding gates and external CI baseline   |

## Risks

1. **Medium — residual remote native authority.** Remote main remains an external renderer with bounded companion/window commands. High-risk shortcut mutation, diagnostics write, and updater install/restart moved local, but P05 local-renderer migration is still future work.
2. **Medium — runtime acceptance gap.** Singleton focus/hide, keyboard navigation, disabled-updater state, and diagnostics export passed a local Windows smoke. Live shortcut register/unregister, invalid-shortcut runtime rollback, companion recovery, notification onboarding, and signed updater install/relaunch remain unverified.
3. **Medium — current-change CI gap.** The latest hosted Windows/macOS success covers base `8b1daabf`, not this uncommitted P02 working tree.
4. **Medium — privacy/reliability.** Foreground process basename can reach remote main content; companion visibility commands queue asynchronous work yet return success before the work completes.
5. **Medium — audit/platform debt.** Cargo audit has 17 informational warnings, including a `glib` unsoundness advisory on Linux dependency paths. No vulnerability was reported; no suppression was added.
6. **Medium — UAT evidence gap.** Candidate measurement, manual smoke, signed updater, SBOM/provenance, and device-media remain distinct states.

## Rollback

Rollback only the focused P02 files: remove the `desktop-control` capability/assets and Rust commands, then restore the previous main capability and web direct-control paths together. Do not reset, clean, stash, or touch unrelated UAT WIP. No database, API, auth, mobile, signing, release, deployment, or automatic persisted-data migration was introduced.

## Next phase gate

Do not begin P03 until P02 has current-candidate manual Windows acceptance and the source/local gates above are complete. Current-change hosted Windows/macOS CI needs separate push/PR or dispatch authority. Signed release, protected provenance, AWS CLI patch pin, P03 media work, and P05 local-renderer migration are not part of this slice.

# Mobile Performance Device Automation Design

Date: 2026-07-31
Status: approved concept; implementation pending

## Goal

Automate device checks 6-14 against an already signed-in Android UAT build. Each scenario resets performance evidence, runs a bounded workload, exports the same sanitized diagnostics report to a host TXT file, and exits non-zero when evidence is incomplete.

Default fixtures:

- DM: `/channels/@me/a2190c2f-bc49-4cf0-862f-bbd0f8724e26`
- Channel: `/channels/6883598c-b338-4859-bbb7-10c22ea6074e/521474f4-111a-4654-bffb-41e41450dd29`
- Repetitions: 30
- Package: `team.whispr.mobile`
- Output: `artifacts/mobile/performance/<run-id>/`

## Constraints

- UAT only. Production rejects every automation command.
- Existing session remains intact. Scripts never clear app data, sign out, or reinstall.
- Existing UI export remains unchanged.
- Reports contain no message body, user ID, conversation ID, channel ID, token, email, or raw URL.
- Test 12 creates real UAT messages named `perf-auto-<run-id>-<ordinal>`; it does not delete them.
- Official evidence still requires one committed client SHA, one backend build, one device, one network class, and at least 30 samples per claimed cohort.

## Approaches Considered

### 1. UAT-only command bridge — selected

PowerShell drives ADB. Maestro drives UI gestures. A small UAT-only app adapter exposes reset, target-cache purge, prefetch, and sanitized report emission. Report chunks travel through filtered logcat and are reconstructed as TXT on the host.

Advantages: release-representative app, deterministic export, current session preserved, true network/prefetch cohorts.

Trade-off: requires a new UAT APK containing the adapter.

### 2. Maestro-only UI automation

Maestro can press Reset and Export, but Android's share sheet cannot reliably return a TXT payload to PowerShell. It also cannot deterministically purge both TanStack Query memory and SQLCipher pages.

### 3. Debug build plus `run-as`

Internal files are easy to pull, but debug/Metro timing is not valid release evidence. Rejected.

## Architecture

### UAT bridge

One focused module accepts fixed commands:

- `reset(runId)` — drains in-memory samples, cancels pending persistence, purges retained performance samples, resets list/span diagnostics, starts the bounded run event-loop monitor.
- `purge(scope, targetId, runId)` — removes only the selected message query and its SQLCipher newest-page entry.
- `prefetch(scope, targetId, runId)` — calls the existing production query option/prefetch path and waits for settlement.
- `export(runId)` — collects the same summaries used by the diagnostics screen, stops the run monitor, builds the existing bounded report, emits verified chunks.

Commands enter through an allowlisted Whispr deep-link command. Runtime checks require `environment === "uat"`, a valid run ID, a signed-in session where target state is needed, a fixed scope enum, and UUID-shaped target IDs. Unknown commands fail closed. Raw command URLs and target IDs are never written by application logs or telemetry.

Production config does not register or execute these commands.

### Report transport

The bridge emits logcat records prefixed with `WHISPR_PERF`:

1. `BEGIN <runId> <chunkCount> <sha256>`
2. ordered base64 chunks, each carrying index and total
3. `END <runId>`

PowerShell records the run start time, reads logcat without clearing the device-wide buffer, filters the matching run markers, reconstructs UTF-8 text, verifies SHA-256, then writes the TXT file. Missing, duplicate, corrupt, or foreign-run chunks fail the script.

### Host scripts

Shared PowerShell module owns device/package checks, ADB calls, deep links, Maestro invocation, retry-free waits, reset, export, checksum validation, and output naming. Thin scenario scripts remain independently runnable:

- `06-cold-start.ps1`
- `07-warm-resume.ps1`
- `08-cached-dm.ps1`
- `09-cached-channel.ps1`
- `10-sqlcipher.ps1`
- `11-prefetch-network.ps1`
- `12-send.ps1`
- `13-content-scroll.ps1`
- `14-event-loop.ps1`

Parameters: `-DeviceSerial`, `-Repetitions` (default 30), `-DmConversationId`, `-ServerId`, `-ChannelId`, `-OutputRoot`.

Exactly one authorized ADB device is required when `-DeviceSerial` is omitted.

### Maestro flows

Small flows reuse existing test IDs:

- DM screen/composer/send
- channel screen/composer/send
- transcript scrolling
- Android back behavior

Flows use `launchApp: { clearState: false }`. They never invoke the login helper or type credentials.

## Scenario Semantics

1. Cold start: force-stop, launcher start, authenticated-content wait, 30 repetitions.
2. Warm resume: Home, bounded background wait, launcher resume, 30 repetitions.
3. Cached DM: seed once, reopen same DM 30 times.
4. Cached channel: seed once, reopen same channel 30 times.
5. SQLCipher: seed page, force-stop, reopen route 30 times.
6. Prefetch/network: for each repetition purge target; prefetch cohort waits for production prefetch then opens; network cohort opens without prefetch.
7. Send: open fixture, send 30 uniquely numbered messages, wait for visible settlement after each.
8. Content/scroll: open both fixtures, perform bounded up/down scroll cycles, collect content-class and blank-area evidence.
9. Event loop: start run monitor, exercise foreground/background lifecycle, verify no background accumulation, export p50/p95/max.

Every script begins with bridge reset. Every script ends with bridge export, including failed workloads when the app remains reachable. Failure reports use a `.partial.txt` suffix and the script still exits non-zero.

## Safety and Privacy

- Bridge unavailable outside UAT.
- No server endpoint, credential handling, authorization bypass, or production flag.
- Cache purge is target-scoped; it cannot clear session/auth state.
- Report builder remains the existing 32 KB bounded, privacy-tested implementation.
- `runId` is random, opaque, and bounded.
- Target IDs exist only in host arguments and in-app cache commands; never in report dimensions.
- Test messages are explicit UAT mutations. Cleanup is excluded to avoid destructive behavior and contaminating measured request samples.

## Failure Handling

Scripts stop on:

- zero, unauthorized, or ambiguous devices;
- missing package or wrong environment/build identity;
- bridge rejection;
- Maestro timeout;
- missing export markers or checksum mismatch;
- fewer samples than required for the scenario;
- non-zero lost navigation spans where the scenario requires closed routes.

No automatic retry of measured interactions. Retrying would bias percentiles. Operator reruns the full scenario with a new run ID.

## Verification

- Pure tests: command parsing, UAT/production gating, UUID/run-ID validation, chunking/reassembly, checksum, size and privacy rejection.
- Component tests: diagnostics screen still resets/exports normally; bridge and screen use the same collector/reset service.
- Script tests: mocked ADB/Maestro output, one-device selection, timeout, partial export, checksum mismatch, exact 30-loop behavior.
- Device smoke: one repetition per script before the 30-sample wave.
- Final gates: mobile typecheck, focused Node/Jest tests, PowerShell parser checks, Prettier, `git diff --check`, `graphify update .`.

## Non-goals

- Production automation.
- Login automation.
- Notification generation.
- Backend fixture creation.
- Message cleanup.
- CI/device-farm integration.

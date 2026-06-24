# Whispr Desktop Release Guide

## Scope

Whispr Desktop is a Tauri shell around the existing Whispr web app. The desktop app loads the configured Whispr web origin and continues to use the existing authenticated web, API, Socket.IO, UploadThing, GIF, Auth.js, and LiveKit flows.

## Versioning

Keep these versions aligned for each release:

- Root package version: `package.json`
- Desktop package version: `apps/desktop/package.json`
- Tauri package version: `apps/desktop/src-tauri/Cargo.toml`
- Tauri app version: `apps/desktop/src-tauri/tauri.conf.json`

The current desktop version is `0.8.14`.

## Build Commands

Run the web validation first:

```powershell
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web build
npx turbo run typecheck
```

Build the Windows desktop installer:

```powershell
pnpm --filter @wizards/desktop build:desktop
```

Desktop production builds default to `https://whispr.team`. `TAURI_WEB_URL` is public build configuration for explicit HTTPS overrides only.

## Windows Target

The initial release target is Windows NSIS (`.exe`) with current-user install mode. This avoids requiring administrator elevation for a normal install.

Generated artifacts are expected under:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

The generated target and bundle directories are ignored by git.

## Signing And Updates

Windows release builds are code-signed in CI when the release certificate secrets are present. Do not add signing secrets, certificates, private updater keys, generated installers, or temporary manifest drafts to the repository.

Auto-update support is installed as a flag-gated signed release path:

- `WHISPR_DESKTOP_UPDATER_ENABLED=true` is required before updater permissions, updater artifacts, or updater runtime UI are enabled.
- `WHISPR_DESKTOP_UPDATER_PUBLIC_KEY` is embedded into the generated Tauri config.
- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` must be provided by CI secrets or a hardware-backed release vault.
- `WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED=true`, `WINDOWS_CERTIFICATE_PFX_BASE64`, and `WINDOWS_CERTIFICATE_PASSWORD` are required when updater artifacts are produced so Windows installers are signed before updater signatures are generated.
- `WHISPR_DESKTOP_UPDATER_ENDPOINTS` must contain one or more HTTPS `latest.json` manifest URLs.
- Updater endpoints must never point to localhost, `whispr.invalid`, or an insecure transport.
- Windows updater install mode is `passive`; Whispr shows its own title-bar update indicator with a "Download and restart" action and never silently installs updates.
- The app must never install an update without a valid Ed25519 signature.
- Update metrics remain PII-free and cover check, download, signature verification, install, and relaunch outcomes.

Generate the updater manifest from the signed installer and its `.sig` file instead of hand-writing `latest.json`:

```powershell
pnpm --filter @wizards/desktop release:manifest -- `
  --artifact .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe `
  --signature .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe.sig `
  --base-url https://updates.whispr.team/desktop/uat/releases/v0.8.14-uat.1/ `
  --version 0.8.14 `
  --notes "Whispr Desktop UAT updater smoke test." `
  --out .\src-tauri\target\release\bundle\nsis\latest.json
```

The manifest generator enforces:

- HTTPS artifact URLs only.
- No localhost, `127.0.0.1`, or `whispr.invalid` update origins.
- A directory-style `--base-url`; do not pass the `latest.json` endpoint as the base URL.
- R2/CDN artifact URLs must be immutable release paths such as `desktop/<ring>/releases/<release-tag>/<installer>`, never overwritten ring-root installer paths.
- `windows-x86_64` updater artifacts must be NSIS `.exe` installers.
- Manifest versions are semver-like and do not include a leading `v`.
- The updater signature is read from the `.sig` file verbatim and is not base64-encoded a second time.

Upload the generated `latest.json` to `desktop/<ring>/latest.json`, and upload the matching installer plus `.sig` to `desktop/<ring>/releases/<release-tag>/`. The app reads only the public signature embedded in `latest.json`; the `.sig` object is retained for audit/debugging. Never upload private updater keys, signing passwords, PFX files, or temporary key material.

Validate the generated manifest before uploading it:

```powershell
pnpm --filter @wizards/desktop release:validate-manifest -- `
  --manifest .\src-tauri\target\release\bundle\nsis\latest.json `
  --artifact .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe `
  --signature .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe.sig `
  --ring uat `
  --release-tag v0.8.14-uat.1 `
  --expected-version 0.8.14
```

Validate the remote update feed after uploading to R2 or the release CDN:

```powershell
pnpm --filter @wizards/desktop release:validate-manifest -- `
  --manifest https://updates.whispr.team/desktop/uat/latest.json `
  --expected-version 0.8.14 `
  --ring uat `
  --release-tag v0.8.14-uat.1 `
  --check-artifact-url
```

The remote validation checks the manifest over HTTPS, verifies the selected platform entry, and optionally sends a bounded `HEAD` request to the installer URL. It does not download the installer and does not print updater signatures or secrets.

Before promoting a desktop build beyond local testing, generate a release audit report. This report ties together the release ring, expected version, local artifact hash, updater manifest preflight, version contract, and release operations contract without writing local paths, updater signatures, or secret material:

```powershell
pnpm --filter @wizards/desktop release:audit -- `
  --ring uat `
  --web-url https://wizardsweb-uat.up.railway.app/ `
  --manifest .\src-tauri\target\release\bundle\nsis\latest.json `
  --artifact .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe `
  --signature .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe.sig `
  --expected-version 0.8.14 `
  --require-manifest `
  --out .\src-tauri\target\release\bundle\nsis\release-audit-0.8.14-uat.json
```

After upload, run the same audit against the remote feed:

```powershell
pnpm --filter @wizards/desktop release:audit -- `
  --ring uat `
  --web-url https://wizardsweb-uat.up.railway.app/ `
  --manifest https://updates.whispr.team/desktop/uat/latest.json `
  --expected-version 0.8.14 `
  --require-manifest `
  --check-artifact-url `
  --out .\src-tauri\target\release\bundle\nsis\release-audit-0.8.14-uat-remote.json
```

Treat the audit report as an operational artifact, not an app asset. It can be attached to internal release notes or CI artifacts, but should not be uploaded as an updater file.

After the local audit passes, generate a release promotion bundle. This produces a redacted JSON evidence file and a Markdown operator checklist for the release ring. It requires a local artifact, matching `.sig`, signed manifest, release ring, and HTTPS web URL:

```powershell
pnpm --filter @wizards/desktop release:promotion -- `
  --ring uat `
  --web-url https://wizardsweb-uat.up.railway.app/ `
  --manifest .\src-tauri\target\release\bundle\nsis\latest.json `
  --artifact .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe `
  --signature .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe.sig `
  --expected-version 0.8.14 `
  --out-dir .\src-tauri\target\release\bundle\nsis\release-evidence
```

The promotion bundle is the handoff artifact for UAT, canary, and stable movement. It includes the release ring, version, web URL, artifact filename, artifact size, artifact SHA-256, updater artifact URL, automated check results, mandatory smoke gates, performance budgets, operator checklist, rollback plan, and desktop safety rules.

It intentionally does not include updater signatures, local absolute paths, private keys, signing passwords, PFX files, session tokens, or app secrets.

Recommended rollout rings:

1. `WHISPR_DESKTOP_RELEASE_RING=dev` for local/internal release validation. Do not use this ring for broad distribution.
2. `WHISPR_DESKTOP_RELEASE_RING=uat` for signed UAT smoke, voice, overlay, and updater QA.
3. `WHISPR_DESKTOP_RELEASE_RING=canary` for a small monitored production rollout with the same signed artifact.
4. `WHISPR_DESKTOP_RELEASE_RING=stable` only after update check, download, install, relaunch, crash, and support metrics look healthy.

Each ring should point to a distinct HTTPS manifest endpoint so rollback is controlled by the manifest, not by changing already-installed clients.

Promotion rules:

- `uat`: rollout is manual QA users only. It requires release contract, Windows build, local manifest validation, R2 upload, and remote manifest validation to pass before manual testing starts. It exits only after the manual QA checklist, updater smoke from the previous installed version, and blocker review are clean.
- `canary`: rollout is a small monitored production cohort. It requires UAT evidence, a ready rollback manifest, and an assigned support owner. It exits only when canary update health, install failures, crashes, and support feedback are within budget.
- `stable`: rollout is a broad production release. It requires clean canary health, `main` branch dispatch, explicit stable confirmation, and real OV/EV Windows signing. It remains reversible until the rollback window is complete.

## macOS And Linux Readiness

macOS and Linux bundle targets are not enabled in Phase 5. Before enabling them, add platform-specific QA for:

- macOS signing and notarization
- macOS microphone and screen recording permissions
- Linux AppImage, deb, or rpm selection
- Linux portal/screen-share behavior across common desktop environments
- Tray, notification, and badge behavior on each platform

## CI Plan

The GitHub Actions workflow has three desktop layers:

- `desktop-ops` runs on Windows, macOS, and Linux. Windows is mandatory; macOS and Linux are staged `continue-on-error` targets until platform signing and packaging mature.
- `desktop-ops` runs `pnpm --filter @wizards/desktop release:ops`, `pnpm --filter @wizards/desktop test`, and `pnpm --filter @wizards/desktop build:desktop:config`.
- `desktop-build` runs on `windows-latest`, installs Rust stable, audits Rust dependencies, generates the production config, builds the Tauri app, signs tagged release artifacts when certificate secrets exist, and uploads Windows bundles for release tags.
- `desktop-release.yml` is the release-operator workflow. It validates the requested ring/version/web URL contract, builds a Windows NSIS installer from that contract, optionally publishes the updater feed to R2, and optionally creates a GitHub Release with the installer plus redacted evidence.

## Desktop Release Contract Workflow

Desktop release automation starts with a separate GitHub Actions workflow:

```text
.github/workflows/desktop-release.yml
```

This workflow validates the release ring, version, web origin, tag strategy, stable-release guard, version contract, and desktop release operations contract before building the Windows desktop artifact. When publishing is requested, it uploads updater artifacts to Cloudflare R2, validates the remote manifest, and can create a GitHub Release after the R2 feed is proven reachable.

Manual dispatch inputs:

- `ring`: `uat`, `canary`, or `stable`.
- `version`: desktop native version without a leading `v`.
- `web_url`: HTTPS Whispr web origin embedded into the desktop build.
- `publish_github_release`: create a GitHub Release after the R2 updater feed is published and validated.
- `publish_r2`: publish updater-compatible artifacts for the selected release ring. This enables updater signing checks and requires a matching `.sig` artifact.
- `updater_base_url`: optional HTTPS updater artifact directory. When omitted and `publish_r2=true`, the workflow defaults to `https://updates.whispr.team/desktop/<ring>/`.
- `confirm_stable_release`: required extra guard for stable dispatches from `main`.

Release tag strategy:

- UAT: `v<version>-uat.<run-number>`
- Canary: `v<version>-canary.<run-number>`
- Stable: `v<version>`

Stable dispatches are rejected unless all of these are true:

- The workflow is dispatched from `main`.
- `confirm_stable_release=true`.
- `web_url=https://whispr.team/`.
- `version` is a clean semver value without prerelease or build metadata.
- `WINDOWS_CERTIFICATE_PFX_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` are present.
- `WHISPR_DESKTOP_WINDOWS_SIGNING_CERT_KIND` is set to `OV` or `EV`.

When `publish_r2=true`, the workflow rejects the build before Tauri runs unless all updater prerequisites are present:

- `WHISPR_DESKTOP_UPDATER_ENDPOINTS` points to one or more HTTPS `latest.json` manifests.
- `WHISPR_DESKTOP_UPDATER_PUBLIC_KEY` is configured as a repository/environment variable.
- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are configured as secrets.
- Windows signing is enabled with `WINDOWS_CERTIFICATE_PFX_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD`. A self-signed PFX is acceptable for UAT smoke tests; stable must use the real OV/EV certificate configuration above.

`publish_github_release=true` requires `publish_r2=true`. This prevents a GitHub Release from being created without a reachable updater manifest and rollback evidence.

The contract also validates the updater artifact base URL before build:

- It must use HTTPS.
- It must not point to localhost, `127.0.0.1`, `::1`, or `whispr.invalid`.
- It must be an artifact directory, not a `latest.json` file.
- Its path must include the selected release ring segment, which prevents a UAT build from accidentally targeting the stable updater prefix.

The workflow uploads three evidence groups:

- `desktop-release-contract-<ring>-<version>` with the redacted dispatch contract.
- `desktop-build-<ring>-<version>-windows` with the Windows NSIS installer, generated updater signature/JSON artifacts, `desktop-build-metadata.json`, and redacted release evidence.
- `desktop-publish-evidence-<ring>-<version>` with the redacted R2/GitHub publishing plan.

`desktop-build-metadata.json` contains only filenames, sizes, SHA-256 hashes, release ring, platform, version, and updater-enabled state. It intentionally excludes local absolute paths, updater signatures, private keys, signing passwords, PFX material, session tokens, and app secrets.

When `publish_r2=true`, CI automatically runs these commands after the Windows build:

1. `release:manifest` to create `latest.json` from the signed installer and `.sig` file. The updater signature is read verbatim from `.sig`; do not hand-edit or re-encode it.
2. `release:validate-manifest` to verify platform, version, artifact URL, installer filename, and signature match.
3. `release:audit` to generate redacted release audit JSON with artifact SHA-256, artifact size, ring, web URL, manifest URL, safety gates, and platform contract.
4. `release:promotion` to generate redacted JSON and Markdown promotion evidence with the operator checklist and rollback plan.

These evidence files are CI artifacts only. Do not upload audit/promotion evidence as updater assets, and do not publish private key material, tokens, PFX files, passwords, local absolute paths, or raw updater secret values.

The publish plan can be validated locally with:

```powershell
pnpm --filter @wizards/desktop release:publish-plan -- `
  --ring uat `
  --version 0.8.14 `
  --release-tag v0.8.14-uat.123 `
  --web-url https://wizardsweb-uat.up.railway.app/ `
  --updater-base-url https://updates.whispr.team/desktop/uat/releases/v0.8.14-uat.123/ `
  --publish-r2 true `
  --publish-github-release true `
  --artifact .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe `
  --manifest .\src-tauri\target\release\bundle\nsis\latest.json `
  --signature .\src-tauri\target\release\bundle\nsis\Whispr_0.8.14_x64-setup.exe.sig `
  --metadata .\src-tauri\target\release\bundle\nsis\desktop-build-metadata.json `
  --audit .\src-tauri\target\release\bundle\nsis\release-evidence\desktop-release-audit-0.8.14-uat.json `
  --promotion-json .\src-tauri\target\release\bundle\nsis\release-evidence\desktop-release-promotion-0.8.14-uat.json `
  --promotion-md .\src-tauri\target\release\bundle\nsis\release-evidence\desktop-release-promotion-0.8.14-uat.md
```

R2 publishing uses these keys:

- `desktop/<ring>/releases/<release-tag>/Whispr_<version>_x64-setup.exe`
- `desktop/<ring>/releases/<release-tag>/Whispr_<version>_x64-setup.exe.sig`
- `desktop/<ring>/latest.json`

The installer and `.sig` are uploaded with immutable cache headers and never overwritten by later releases. `latest.json` is uploaded with no-cache headers because rollback is manifest-based. To roll back a bad release, publish the previously validated signed `latest.json` back to the same `desktop/<ring>/latest.json` key. Do not mutate or delete already-distributed installer objects during rollback.

R2 is the canonical public download and updater source. GitHub Release publishing is optional and attaches the installer, manifest, `.sig`, build metadata, release audit, promotion evidence, and publish plan. UAT and canary releases are created as GitHub pre-releases; stable releases are normal releases. Because the repository is private, GitHub Release assets are not a public distribution channel.

Required R2 secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

The metadata guard can be run locally after a Windows build:

```powershell
pnpm --filter @wizards/desktop release:artifacts -- `
  --version 0.8.14 `
  --ring uat `
  --updater-enabled true `
  --artifact-dir .\src-tauri\target\release\bundle\nsis `
  --out .\src-tauri\target\release\bundle\nsis\desktop-build-metadata.json
```

If updater artifacts are requested, this command fails unless `Whispr_<version>_x64-setup.exe.sig` exists next to the matching installer and is non-empty.

The required desktop smoke gates are:

- `launch`
- `auth-restore`
- `close-to-tray`
- `updater-check-mock`
- `updater-feed-preflight`
- `release-audit-report`
- `release-promotion-bundle`
- `shortcut-registration`
- `overlay-show-hide`

The release performance budgets are:

- Warm start <= 2000 ms.
- Memory <= 220 MB warm idle.
- Overlay CPU <= 3% average while visible.
- Shortcut latency <= 50 ms p95.

Required performance evidence:

- `warm-start`: process launch to interactive main shell.
- `idle-memory`: warm idle desktop process-family memory after at least 60 seconds.
- `updater-check-install`: update check, download, install, relaunch, and runtime version reporting.
- `overlay-cpu`: overlay CPU while visible for a 60 second game/windowed-app session.
- `shortcut-latency`: global shortcut key press to visible/audio state change.

The workflow summary must include version, ring, artifact URL, manifest URL, artifact SHA-256, manual QA steps, performance evidence, and rollback guidance. Treat missing evidence as a release blocker beyond `uat`.

The release safety rules are:

- `no-broad-native-permissions`: never grant broad filesystem, shell, or process Tauri permissions.
- `signed-updater-only`: never enable updater distribution without Ed25519 signatures and HTTPS manifests.
- `no-native-game-hooks`: never add native game hooks without dedicated anti-cheat research and review.
- `no-hardware-encode-claims`: never present hardware encode as guaranteed; WebRTC/WebView owns encoder choice.
- `no-desktop-secrets`: never store tokens, session secrets, private keys, or server credentials in desktop code.
- `no-fake-security-ui`: never show privacy or security controls as active unless backend enforcement exists.
- `overlay-voice-only`: never send messages, DMs, emails, invite links, or private content to overlay windows.

## Release Checklist

- Confirm the generated Tauri config points to `https://whispr.team` unless an explicit HTTPS `TAURI_WEB_URL` override is intended.
- Confirm no database, Auth.js, LiveKit, UploadThing, email, Turnstile, Redis, or Prisma secrets are present in desktop source/config.
- Confirm Tauri capabilities are file-based, least-privilege, and limited to the windows that need them.
- Confirm Tauri window permissions remain limited to notification, persisted window state, startup promotion, and custom desktop titlebar controls.
- Confirm global voice shortcuts remain opt-in, register only exact user-configured combinations, and reject duplicate or modifierless bindings.
- Confirm launch-at-startup is opt-in and can be disabled from Settings -> About -> Desktop Diagnostics.
- Confirm production CSP includes the configured HTTPS web origin and matching WebSocket origin.
- Confirm external navigation still opens in the system browser.
- Confirm OAuth provider navigation remains limited to active Auth.js sign-in/callback flow.
- Confirm `whispr://` deep links are restricted to allowed internal routes and do not open arbitrary origins.
- Confirm the single-instance plugin focuses the existing app window instead of creating duplicate voice/socket sessions.
- Confirm desktop notification previews are disabled by default unless the user enables them locally.
- Confirm `NEXT_PUBLIC_DESKTOP_METRICS=true` is used only when PII-free desktop diagnostics are intentionally being collected.
- Confirm `NEXT_PUBLIC_DESKTOP_METRICS=true` desktop shortcut metrics include only operation/result/runtime/duration metadata.
- Confirm Settings -> About -> Desktop Diagnostics reports expected origin, network, socket, notification, and voice state.
- Confirm generated installer is not committed.
- Confirm generated updater artifacts and signatures are not committed.
- Confirm updater endpoints are HTTPS `latest.json` manifests for the intended release ring.
- Confirm the title-bar updater UI asks the user to download and restart; silent install remains disabled.
- Complete the desktop QA checklist in `QA.md`.

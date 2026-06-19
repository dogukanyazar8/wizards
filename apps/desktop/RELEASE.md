# Whispr Desktop Release Guide

## Scope

Whispr Desktop is a Tauri shell around the existing Whispr web app. The desktop app loads the configured Whispr web origin and continues to use the existing authenticated web, API, Socket.IO, UploadThing, GIF, Auth.js, and LiveKit flows.

## Versioning

Keep these versions aligned for each release:

- Root package version: `package.json`
- Desktop package version: `apps/desktop/package.json`
- Tauri package version: `apps/desktop/src-tauri/Cargo.toml`
- Tauri app version: `apps/desktop/src-tauri/tauri.conf.json`

The current desktop version is `0.8.12`.

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
- Windows updater install mode is `basicUi`; Whispr shows its own "Download and restart" prompt and never silently installs updates.
- The app must never install an update without a valid Ed25519 signature.
- Update metrics remain PII-free and cover check, download, signature verification, install, and relaunch outcomes.

Recommended rollout rings:

1. `WHISPR_DESKTOP_RELEASE_RING=dev` for local/internal release validation. Do not use this ring for broad distribution.
2. `WHISPR_DESKTOP_RELEASE_RING=uat` for signed UAT smoke, voice, overlay, and updater QA.
3. `WHISPR_DESKTOP_RELEASE_RING=canary` for a small monitored production rollout with the same signed artifact.
4. `WHISPR_DESKTOP_RELEASE_RING=stable` only after update check, download, install, relaunch, crash, and support metrics look healthy.

Each ring should point to a distinct HTTPS manifest endpoint so rollback is controlled by the manifest, not by changing already-installed clients.

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

The required desktop smoke gates are:

- `launch`
- `auth-restore`
- `close-to-tray`
- `updater-check-mock`
- `shortcut-registration`
- `overlay-show-hide`

The release performance budgets are:

- Warm start <= 2000 ms.
- Memory <= 220 MB warm idle.
- Overlay CPU <= 3% average while visible.
- Shortcut latency <= 50 ms p95.

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
- Confirm updater UI asks the user to download and restart; silent install remains disabled.
- Complete the desktop QA checklist in `QA.md`.

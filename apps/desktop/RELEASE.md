# Whispr Desktop Release Guide

## Scope

Whispr Desktop is a Tauri shell around the existing Whispr web app. The desktop app loads the configured Whispr web origin and continues to use the existing authenticated web, API, Socket.IO, UploadThing, GIF, Auth.js, and LiveKit flows.

## Versioning

Keep these versions aligned for each release:

- Root package version: `package.json`
- Desktop package version: `apps/desktop/package.json`
- Tauri package version: `apps/desktop/src-tauri/Cargo.toml`
- Tauri app version: `apps/desktop/src-tauri/tauri.conf.json`

The current desktop version is `0.8.8`.

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

Code signing is not configured yet because no Windows signing certificate was provided. Do not add signing secrets or certificates to the repository.

Auto-update runtime installation is not enabled until release signing is ready. When updater support is switched on, require all of the following before shipping:

- Ed25519 update signatures are mandatory.
- The public updater key is embedded in Tauri config.
- The private updater key is stored only in CI secrets or a hardware-backed release vault.
- The update manifest is served over HTTPS.
- The app must never install an update without a valid signature.
- Update checks may be instrumented with PII-free `desktop_update_check` metrics only.

Do not commit updater private keys, signing certificates, generated installers, or manifest drafts containing temporary local paths.

## macOS And Linux Readiness

macOS and Linux bundle targets are not enabled in Phase 5. Before enabling them, add platform-specific QA for:

- macOS signing and notarization
- macOS microphone and screen recording permissions
- Linux AppImage, deb, or rpm selection
- Linux portal/screen-share behavior across common desktop environments
- Tray, notification, and badge behavior on each platform

## CI Plan

No existing GitHub Actions workflow was found in this repository. When CI is introduced, use separate jobs for web validation and desktop packaging.

Recommended desktop job shape:

- Run on `windows-latest`.
- Install Node using `.nvmrc`.
- Enable pnpm through Corepack.
- Install Rust stable with the MSVC target.
- Run `pnpm install --frozen-lockfile`.
- Run the web validation commands.
- Run `pnpm --filter @wizards/desktop build:desktop`; set non-secret `TAURI_WEB_URL` only for explicit HTTPS override builds.
- Upload NSIS artifacts from `apps/desktop/src-tauri/target/release/bundle/nsis/`.
- Add code signing only after certificate storage and access controls are approved.
- Validate `apps/desktop/src-tauri/capabilities/*.json`.
- Run `pnpm --filter @wizards/desktop test`.
- Build generated Tauri config with `pnpm --filter @wizards/desktop build:desktop:config`.
- Confirm generated config permissions match `src-tauri/capabilities/main.json`.

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
- Complete the desktop QA checklist in `QA.md`.

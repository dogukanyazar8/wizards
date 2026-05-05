# Whispr Desktop Release Guide

## Scope

Whispr Desktop is a Tauri shell around the existing Whispr web app. The desktop app loads the configured Whispr web origin and continues to use the existing authenticated web, API, Socket.IO, UploadThing, GIF, Auth.js, and LiveKit flows.

## Versioning

Keep these versions aligned for each release:

- Root package version: `package.json`
- Desktop package version: `apps/desktop/package.json`
- Tauri package version: `apps/desktop/src-tauri/Cargo.toml`
- Tauri app version: `apps/desktop/src-tauri/tauri.conf.json`

The current desktop version is `0.5.0`.

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
$env:TAURI_WEB_URL="https://app.your-whispr-domain.com"
pnpm --filter @wizards/desktop build:desktop
```

`TAURI_WEB_URL` is public build configuration. It must be HTTPS for production builds.

## Windows Target

The initial release target is Windows NSIS (`.exe`) with current-user install mode. This avoids requiring administrator elevation for a normal install.

Generated artifacts are expected under:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

The generated target and bundle directories are ignored by git.

## Signing And Updates

Code signing is not configured yet because no Windows signing certificate was provided. Do not add signing secrets or certificates to the repository.

Auto-update is not enabled yet. If updater support is added later, require Tauri signature verification and keep updater private keys outside the repository and CI logs.

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
- Run `pnpm --filter @wizards/desktop build:desktop` with a non-secret production `TAURI_WEB_URL`.
- Upload NSIS artifacts from `apps/desktop/src-tauri/target/release/bundle/nsis/`.
- Add code signing only after certificate storage and access controls are approved.

## Release Checklist

- Confirm `TAURI_WEB_URL` points to the intended HTTPS Whispr production origin.
- Confirm no database, Auth.js, LiveKit, UploadThing, email, Turnstile, Redis, or Prisma secrets are present in desktop source/config.
- Confirm Tauri capabilities remain limited to notification permissions.
- Confirm external navigation still opens in the system browser.
- Confirm OAuth provider navigation remains limited to active Auth.js sign-in/callback flow.
- Confirm generated installer is not committed.
- Complete the desktop QA checklist in `QA.md`.

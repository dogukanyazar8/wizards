# Whispr Desktop

Minimal Tauri shell for the existing Whispr web app.

## Architecture

- The desktop app loads the existing Whispr web app instead of duplicating UI or backend logic.
- Development loads `TAURI_DEV_WEB_URL`, defaulting to `http://localhost:3000`.
- Production builds load `https://whispr.team` by default. Set `TAURI_WEB_URL` only when an explicit HTTPS override is needed.
- The desktop shell does not include Prisma, database URLs, auth secrets, LiveKit secrets, upload secrets, or server-side credentials.
- Tauri IPC is limited to native notification permission/dispatch and minimal window controls required for the custom desktop titlebar.
- Off-origin navigation opens in the system browser by default. During an active Auth.js OAuth redirect only, the WebView allows the known provider origins needed to return the session cookie to Whispr.
- The tray menu exposes Show, Settings, Desktop Diagnostics, mute/deafen commands, and Quit.
- Signed auto-update support is flag-gated. When enabled for a release build, it requires an HTTPS manifest, an embedded Ed25519 public key, CI-held signing private key material, and an explicit user click on the title-bar "Download and restart" update action.
- Desktop notifications are driven by the existing authenticated socket and settings flows. Message previews are disabled by default and can be enabled locally from notification settings.
- Desktop deep links use the `whispr://` scheme and are restricted to safe internal routes such as `/channels`, `/settings`, and `/invite`.
- A single-instance guard focuses the existing window instead of launching duplicate desktop sessions.
- Voice, screen sharing, uploads, GIFs, and downloads continue through the authenticated web/API/socket flows; the desktop shell does not add filesystem, shell, or database access.
- Desktop close emits a best-effort web cleanup signal before the window closes so active LiveKit voice and screen-share tracks can stop through the existing web cleanup path.

## Desktop Shortcuts

- `Ctrl+,` opens settings.
- `Ctrl+Shift+M` toggles mute while connected to voice.
- `Ctrl+Shift+D` toggles deafen while connected to voice.
- `Alt+Left` navigates back.

The tray exposes the same mute/deafen actions so desktop users can recover quickly when the main window is behind other apps.

Shortcuts are app-scoped, desktop-only, and ignored while typing in editable fields.

## Local Development

From the repo root:

```powershell
pnpm install
pnpm --filter @wizards/web dev
```

In a second terminal:

```powershell
pnpm --filter @wizards/desktop dev
```

To use a different local web URL:

```powershell
$env:TAURI_DEV_WEB_URL="http://localhost:3001"
pnpm --filter @wizards/desktop dev
```

## Production Build

Production builds target the canonical Whispr origin by default:

```powershell
pnpm --filter @wizards/desktop build:desktop
```

To target a different deployed HTTPS origin, set `TAURI_WEB_URL` before building:

```powershell
$env:TAURI_WEB_URL="https://uat.whispr.team"
pnpm --filter @wizards/desktop build:desktop
```

`TAURI_WEB_URL` is public configuration, not a secret. Do not add server secrets to this app.

The initial production bundle target is a Windows NSIS installer. macOS and Linux bundle targets are intentionally documented but not enabled until they have dedicated QA and signing/notarization plans.

## Release Operations

Desktop release operations are guarded by a small machine-readable contract in `scripts/release-ops.mjs`. Run it locally with:

```powershell
pnpm --filter @wizards/desktop release:ops
pnpm --filter @wizards/desktop test
```

Release rings are ordered from safest to broadest:

- `dev` for local/internal validation.
- `uat` for signed UAT builds and manual QA.
- `canary` for a small monitored production rollout.
- `stable` for the broad production release.

Windows is the mandatory desktop CI target. macOS and Linux are staged signal targets until signing, notarization, installer, portal, and tray behavior are release-ready.

Mandatory desktop smoke gates:

- `launch`
- `auth-restore`
- `close-to-tray`
- `updater-check-mock`
- `shortcut-registration`
- `overlay-show-hide`

Performance budgets:

- Warm start: <= 2000 ms.
- Memory: <= 220 MB warm idle.
- Overlay CPU: <= 3% average while visible.
- Shortcut latency: <= 50 ms p95.

Safety rules:

- `no-broad-native-permissions`
- `signed-updater-only`
- `no-native-game-hooks`
- `no-hardware-encode-claims`
- `no-desktop-secrets`
- `no-fake-security-ui`
- `overlay-voice-only`

## Signed Updater Builds

Updater support is disabled unless the release build is configured with:

```powershell
$env:WHISPR_DESKTOP_UPDATER_ENABLED="true"
$env:WHISPR_DESKTOP_RELEASE_RING="uat"
$env:WHISPR_DESKTOP_UPDATER_ENDPOINTS="https://updates.whispr.team/desktop/uat/latest.json"
$env:WHISPR_DESKTOP_UPDATER_PUBLIC_KEY="<ed25519-public-key>"
$env:WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED="true"
$env:TAURI_SIGNING_PRIVATE_KEY="<ci-secret>"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<ci-secret>"
$env:WINDOWS_CERTIFICATE_PFX_BASE64="<ci-secret>"
$env:WINDOWS_CERTIFICATE_PASSWORD="<ci-secret>"
pnpm --filter @wizards/desktop build:desktop
```

Do not use local or HTTP endpoints for updater manifests. Do not commit Ed25519 updater private keys, Windows certificate material, generated updater artifacts, or manifest drafts.

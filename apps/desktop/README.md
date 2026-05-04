# Whispr Desktop

Minimal Tauri shell for the existing Whispr web app.

## Architecture

- The desktop app loads the existing Whispr web app instead of duplicating UI or backend logic.
- Development loads `TAURI_DEV_WEB_URL`, defaulting to `http://localhost:3000`.
- Production builds require `TAURI_WEB_URL` and load that configured HTTPS origin.
- The desktop shell does not include Prisma, database URLs, auth secrets, LiveKit secrets, upload secrets, or server-side credentials.
- Tauri IPC is limited to the native notification permission checks and notification dispatch required for desktop UX.
- Off-origin navigation opens in the system browser by default. During an active Auth.js OAuth redirect only, the WebView allows the known provider origins needed to return the session cookie to Whispr.
- The tray menu exposes only Show, a disabled update placeholder, and Quit. Minimize-to-tray is intentionally not enabled.
- Desktop notifications are driven by the existing authenticated socket and settings flows, and use generic notification copy to avoid leaking message content.
- Voice, screen sharing, uploads, GIFs, and downloads continue through the authenticated web/API/socket flows; the desktop shell does not add filesystem, shell, or database access.
- Desktop close emits a best-effort web cleanup signal before the window closes so active LiveKit voice and screen-share tracks can stop through the existing web cleanup path.

## Desktop Shortcuts

- `Ctrl+,` opens settings.
- `Ctrl+Shift+M` toggles mute while connected to voice.
- `Ctrl+Shift+D` toggles deafen while connected to voice.
- `Alt+Left` navigates back.

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

Set a deployed Whispr HTTPS origin before building:

```powershell
$env:TAURI_WEB_URL="https://your-whispr-origin.example"
pnpm --filter @wizards/desktop build:desktop
```

`TAURI_WEB_URL` is public configuration, not a secret. Do not add server secrets to this app.

The initial production bundle target is a Windows NSIS installer. macOS and Linux bundle targets are intentionally documented but not enabled until they have dedicated QA and signing/notarization plans.

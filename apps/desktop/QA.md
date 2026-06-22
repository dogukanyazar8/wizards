# Whispr Desktop QA Checklist

Run this checklist against a fresh Windows install after a production desktop build.

## Release Rings

- `dev`: local/internal validation only.
- `uat`: signed UAT validation with full smoke, voice, overlay, close-to-tray, and updater mock checks.
- `canary`: small monitored production rollout after UAT passes.
- `stable`: broad production rollout after canary health is acceptable.

## Mandatory Desktop Smoke Gates

These smoke gates are release blockers on Windows and staged signal checks on macOS/Linux:

- `launch`: app starts, compact splash appears, the configured web origin renders, and the main shell becomes interactive.
- `auth-restore`: remember-me/session restore works after quitting and reopening.
- `close-to-tray`: close button keeps the app alive in tray when configured, tray Show restores the window, and Quit exits.
- `updater-check-mock`: a mocked signed HTTPS `latest.json` check succeeds; invalid signatures fail closed.
- `shortcut-registration`: desktop voice shortcuts register, trigger, unregister, and reject unsafe duplicates.
- `overlay-show-hide`: mini window and game overlay show, hide, repair, and panic-disable without locking the main window.

## Performance Budgets

Capture these budgets on a warm Windows profile after the app has been idle for at least 60 seconds:

- Warm start <= 2000 ms from process launch to interactive main shell.
- Memory <= 220 MB warm idle for the desktop process family.
- Overlay CPU <= 3% average while visible over a 60 second window.
- Shortcut latency <= 50 ms p95 from key press to visible/audio state change.

If a budget regresses, attach the diagnostics export and the exact build ring before promotion beyond `uat`.

## Desktop Safety Rules

- `no-broad-native-permissions`: do not add broad filesystem, shell, or process permissions.
- `signed-updater-only`: do not ship updater support without HTTPS manifests and Ed25519 signatures.
- `no-native-game-hooks`: do not add native game hooks without anti-cheat research.
- `no-hardware-encode-claims`: do not claim guaranteed hardware encode; WebRTC/WebView chooses the encoder.
- `no-desktop-secrets`: do not store tokens, secrets, private keys, or backend credentials in desktop code.
- `no-fake-security-ui`: do not present privacy/security toggles as active unless backend enforcement exists.
- `overlay-voice-only`: do not send messages, DMs, email, invite links, or private content to overlay windows.

## Overlay And Game Matrix

| Platform | Windowed game | Borderless game | Exclusive fullscreen | Notes |
| --- | --- | --- | --- | --- |
| Windows | Supported | Supported | Research only | Compositor overlay only; no native game hook. |
| macOS | Staged | Best effort | Research only | Requires platform QA around Spaces, focus, and capture permissions. |
| Linux X11 | Staged | Best effort | Research only | Window manager behavior varies. |
| Linux Wayland | Staged | Best effort | Research only | Compositor protocol support varies. |

Overlay must remain click-through, show only sanitized voice participant data, and never expose chat, DM, invite, email, or file content.

## Install And Launch

- Install the generated NSIS installer on a clean Windows user profile.
- Launch Whispr from the installer completion screen if available.
- Launch Whispr from the Start Menu shortcut.
- Confirm the Whispr icon and app name appear correctly in the window, taskbar, tray, and Start Menu.
- Confirm the app loads the configured production `TAURI_WEB_URL`.
- Quit and reopen the app.
- Move and resize the main window, quit, reopen, and confirm the window restores to the saved size and monitor.
- Confirm the first startup splash remains the compact splash size and is not restored to the previous main window size.

## Auth And Session

- Log in with email/password credentials.
- Log in with Google OAuth.
- Register a new account if appropriate for the environment.
- Complete email verification from the verification email.
- Confirm `/channels` loads after auth.
- Confirm `/api/auth/session` returns the expected authenticated session.
- Reload the desktop window and confirm the session state is preserved.
- Log out and confirm the app returns to auth UI without visual breakage.
- Reopen the app after logout and confirm it stays logged out.

## Navigation

- Navigate between servers.
- Navigate between text channels.
- Navigate to DMs.
- Navigate to settings.
- Use desktop back navigation.
- Open an external link and confirm it opens in the system browser.
- Confirm an unsupported or arbitrary external origin is not loaded inside the WebView.
- Open `whispr://channels`, `whispr://settings`, and an invite deep link and confirm they focus the existing window.
- Open an unsupported `whispr://` route and confirm it is ignored.

## Realtime Messaging

- Send a server channel message.
- Receive a server channel message from another account/device.
- Send a DM.
- Receive a DM from another account/device.
- React to a message.
- Confirm friend request updates appear without refresh.
- Confirm presence changes update without refresh.
- Confirm there are no duplicate messages or duplicate realtime events after reload.

## Uploads, GIFs, And Downloads

- Upload an image in a channel.
- Upload a non-image file in a channel.
- Upload an image or file in a DM if the environment supports it.
- Send a GIF.
- Open an image attachment lightbox.
- Open or save a file attachment.
- Confirm unsupported file types are rejected by the existing server-side validation.
- Confirm file access only occurs through explicit user-selected files.

## Voice And Screen Share

- Join a voice channel.
- Mute and unmute.
- Deafen and undeafen.
- Leave the voice channel.
- Deny microphone permission and confirm the desktop-specific error message is safe and understandable.
- Share screen.
- Change the screen-share quality selector.
- Stop sharing screen.
- Deny screen-share permission and confirm it fails safely.
- Close the desktop app while in voice and confirm voice state/track cleanup occurs.
- Close the desktop app while screen sharing and confirm screen share stops.
- Reopen the app after voice/screen-share close and confirm no stale voice session remains.

## Notifications And Native UX

- Enable desktop notifications in settings.
- Receive a DM notification while the app is backgrounded.
- Receive a mention notification while the app is backgrounded.
- Receive a friend request notification while the app is backgrounded.
- Confirm notification content does not leak message previews.
- Enable message previews and confirm native notifications show only expected title/body text.
- Disable desktop notifications and confirm native notifications stop.
- Confirm unread badge behavior if supported by the OS/runtime.
- In Desktop Diagnostics, enable launch at startup, confirm the OS login item/registry entry is created, then disable it and confirm it is removed.
- Click tray Show and confirm the window focuses.
- Click tray Settings and Desktop Diagnostics and confirm they route safely inside Whispr.
- Click tray mute/deafen actions during a voice session and confirm they match the in-app state.
- Click tray Quit and confirm the app exits cleanly.

## Signed Updates

- Build once with `WHISPR_DESKTOP_UPDATER_ENABLED=false` and confirm no title-bar update indicator appears.
- Build a UAT ring artifact with `WHISPR_DESKTOP_UPDATER_ENABLED=true`, a HTTPS `latest.json` endpoint, the matching Ed25519 public key, and Windows code signing enabled.
- Host a signed newer UAT manifest and confirm the desktop title bar shows the compact update indicator beside the window controls.
- Open the update indicator and confirm the signed-update popover shows current version, latest version, release ring, and the security note.
- Click "Later" and confirm the app keeps running without downloading or installing anything.
- Click "Download and restart" and confirm download progress advances, the signature is accepted, the installer runs with basic UI, and Whispr relaunches.
- Serve a manifest with a bad signature and confirm the update is rejected and the currently installed version remains unchanged.
- Confirm update metrics, when `NEXT_PUBLIC_DESKTOP_METRICS=true`, include only operation/result/runtime/duration and no user, token, server, message, endpoint, or file path data.

## Desktop Diagnostics

- Open Settings -> About -> Desktop Diagnostics.
- Confirm runtime shows desktop inside Tauri and web inside a normal browser.
- Confirm network and Socket.IO indicators change correctly when the network is disconnected and restored.
- Confirm notification permission status matches the OS/browser permission.
- Confirm voice lifecycle shows connected while in a voice channel and idle after leaving.
- Toggle launch at startup from the diagnostics panel and confirm failures are shown without changing session state.
- If `NEXT_PUBLIC_DESKTOP_METRICS=true` is enabled, confirm desktop metric logs contain operation/result/runtime/duration only and do not include user, server, route, message, or token data.

## Settings And Shortcuts

- Open settings with `Ctrl+,`.
- Toggle mute with `Ctrl+Shift+M`.
- Toggle deafen with `Ctrl+Shift+D`.
- Navigate back with `Alt+Left`.
- Confirm shortcuts do not trigger while typing in inputs, textareas, selects, or contenteditable fields.
- In Voice Settings, enable global voice shortcuts and confirm the configured mute/deafen shortcuts work while another application is focused.
- Switch microphone input mode to push-to-talk, hold the configured shortcut, and confirm the microphone opens only while the key is held plus the configured release cushion.
- Confirm push-to-talk does not transmit while deafened and shows the desktop-safe voice warning instead.
- Enter a duplicate or modifierless shortcut, confirm the native registration fails closed, then restore a valid unique shortcut.
- Change appearance/settings and confirm web app behavior is unaffected.

## Regression Pass

- Confirm the web app still runs normally in the browser.
- Confirm mobile responsive layout still works in browser dev tools or a real mobile browser.
- Confirm server/channel navigation still works in the web app.
- Confirm auth, uploads, GIFs, notifications, settings, LiveKit, and Socket.IO behavior are not desktop-only regressions.

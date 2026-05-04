# Whispr Desktop QA Checklist

Run this checklist against a fresh Windows install after a production desktop build.

## Install And Launch

- Install the generated NSIS installer on a clean Windows user profile.
- Launch Whispr from the installer completion screen if available.
- Launch Whispr from the Start Menu shortcut.
- Confirm the Whispr icon and app name appear correctly in the window, taskbar, tray, and Start Menu.
- Confirm the app loads the configured production `TAURI_WEB_URL`.
- Quit and reopen the app.

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
- Disable desktop notifications and confirm native notifications stop.
- Confirm unread badge behavior if supported by the OS/runtime.
- Click tray Show and confirm the window focuses.
- Click tray Quit and confirm the app exits cleanly.

## Settings And Shortcuts

- Open settings with `Ctrl+,`.
- Toggle mute with `Ctrl+Shift+M`.
- Toggle deafen with `Ctrl+Shift+D`.
- Navigate back with `Alt+Left`.
- Confirm shortcuts do not trigger while typing in inputs, textareas, selects, or contenteditable fields.
- Change appearance/settings and confirm web app behavior is unaffected.

## Regression Pass

- Confirm the web app still runs normally in the browser.
- Confirm mobile responsive layout still works in browser dev tools or a real mobile browser.
- Confirm server/channel navigation still works in the web app.
- Confirm auth, uploads, GIFs, notifications, settings, LiveKit, and Socket.IO behavior are not desktop-only regressions.

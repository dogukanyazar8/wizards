# Native permissions and client identity — 2026-09-14

## Delivered

- Windows notification status: reproduced `ToastNotifier.Setting()` returning `HRESULT 0x80070490` while the Whispr notifier and per-user identity exist. A read-only temporary Rust diagnostic confirmed this; no toast was sent. The missing delivery record now maps to `prompt`, not granted/denied. Explicit first activation may submit the first toast; status is read again afterward. Other errors remain errors. Unknown rechecks now show failure feedback.
- Confirmed permission indicators retain their green disabled styling with an inline default cursor, overriding unlayered global disabled-control CSS.
- Settings screen-share consent test uses `GraphicsCapturePicker`, owned by the main HWND. Concurrent pickers are rejected. Selection is released without capture or publication; no permanent screen permission is claimed. Web continues to use its real browser picker.
- Windows main and remote companion webviews start at `about:blank`. Original compatible user agent is extended with `WhisprDesktop/<version>`; permission handling is installed before first remote navigation. Status bar, default context menus, password/autofill UI and default script dialogs are disabled. Unsupported permission requests are denied without browser prompts; camera/microphone retain trusted local consent in the main window. Companion windows deny device permissions and gain no native capabilities.
- The existing invite paste action uses a main-origin-guarded, text-only native clipboard command on desktop. Reads are limited to 128 KiB, decoded as terminated UTF-16, never logged. Browser clipboard reading remains for web.
- Settings close and two admin delete confirmations use the existing Whispr Modal with explicit asynchronous approval. Concurrent requests fail closed; host removal cancels outstanding approval. Destructive actions remain red.
- Desktop session metadata and new security events identify Whispr Desktop, app version and OS instead of Edge. Compatibility tokens remain in the real user agent. These metadata are not authorization evidence. Historical unidentified security records are not relabelled by guessing.
- Desktop-specific operational copy is selected during server rendering using the native user-agent marker. Ordinary web instructions and other devices' web-session labels remain accurate.

## Remaining scope decision

The user selected the Windows native picker. This is implemented for the **settings permission test only**. Actual screen broadcast still uses the existing WebView/LiveKit capture route. A native video/system-audio-to-LiveKit connection does not yet exist. The follow-up scope question is pending: implement that larger media pipeline now, or preserve the existing live share for this iteration. Do not claim that all desktop browser UI is eliminated while live sharing retains its existing picker.

## Validation

- PASS: 55 Rust unit tests; `cargo clippy --locked --all-targets -- -D warnings`; web source TypeScript check; scoped ESLint.
- Final focused web group: 115 passed. Final desktop trust/media group: 17 passed. Final Rust suite: 55 passed; final Clippy, source TypeScript and scoped ESLint passed.
- Expanded web group: 146 passed, 3 failed. Failures are existing source assertions for router-based history and inline highlight query construction in `settings-window-contract.test.ts`, and the old eight-profile-key expectation (actual seven) in `settings-window-state.test.ts`. This turn changed neither those history/highlight implementations nor the key list.
- Expanded desktop script group: 28 passed, 1 failed. `run-tauri.test.mjs` finds `allow-get-desktop-detected-game` in static main capabilities but absent from the generated allowlist. This other work-in-progress permission was not added by this task.
- Updated stale native consent harness to implement DOM `toggleAttribute`; aligned earlier settings-migration assertions with guarded main commands. Config-generation tests now use an isolated temporary directory so subsequent runs do not overwrite the development config.
- NOT RUN: real Windows picker interaction, notification submission/delivery/branding after activation, clipboard reading, browser or desktop visual acceptance. No UI automation, live DB mutation, commit or push.
- Graphify: final absolute-path update passed (39,069 nodes, 92,902 edges); earlier relative-path attempt failed. Large-graph HTML was skipped by the tool limit.
- Native changes require a desktop rebuild/restart. Source-only TS check excludes generated Next route declarations; this is not a full Next production build.

## Additional observations

- **medium** — `apps/desktop/scripts/run-tauri.mjs`: existing game detection WIP grants `allow-get-desktop-detected-game` in static capabilities but omits it from generated config. Game detection may fail in generated desktop runs; left outside this task.
- **minor** — `settings-window-contract.test.ts` and `settings-window-state.test.ts`: existing history/highlight/profile-key expectations disagree with current WIP. The broader group is not green; focused permission/session checks pass.

## Source references

- Windows picker and capture lifecycle: https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture
- WebView2 ScreenCaptureStarting controls allow/cancel; it does not replace the source picker: https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2screencapturestartingeventargs

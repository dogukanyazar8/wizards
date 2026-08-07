# Desktop Capabilities

Whispr Desktop uses file-based Tauri capabilities so each desktop window can keep a narrow permission surface.

The current app has one primary remote WebView label, `main`. The startup splash and the main shell share that label because the startup flow intentionally promotes a single WebView from the compact splash size to the main app window. Creating a separate `desktop-start` capability before introducing a separate `desktop-start` window would not provide real isolation.

Desktop companion windows use their own capability files:

- `desktop-control.json` for the trusted local control surface. It has no `remote.urls`.
- `voice-mini.json` for the voice companion window.
- `game-overlay.json` for the read-only overlay window.

Future windows must receive their own capability files before they are wired into Rust.

Do not add new permissions to `main.json` for future windows. Add a new capability scoped to the new window label instead.

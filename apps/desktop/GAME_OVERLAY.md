# Whispr Game Overlay MVP

Whispr's production MVP game overlay is a compositor overlay. It does not hook DirectX,
Vulkan, game memory, or anti-cheat protected processes. The overlay receives only sanitized
voice participant snapshots from the main window.

## Platform Matrix

| Platform | Windowed | Borderless fullscreen | Exclusive fullscreen | Notes |
| --- | --- | --- | --- | --- |
| Windows | Supported | Supported | Research gated | Uses topmost transparent WebView, native no-activate styles, and click-through window styles. |
| macOS | Best effort | Best effort | Research gated | Uses Tauri click-through APIs where the compositor allows it. |
| Linux X11 | Best effort | Best effort | Research gated | Compositor behavior varies by window manager. |
| Linux Wayland | Best effort | Best effort | Research gated | Layer-shell support is compositor-specific. |

## Privacy Contract

- Process detection is opt-in.
- Only the foreground executable file name may be read.
- Full process paths, command lines, window titles, messages, DMs, server names, and channel names
  must not be sent to the overlay.
- Game process detection does not emit telemetry.
- The game overlay capability remains read-only and receives no Tauri command permissions.

## Failure Recovery

- `Ctrl/Cmd+Shift+O` is the panic-disable shortcut and must hide/destroy the overlay window.
- The tray menu keeps explicit hide and repair actions.
- If health checks report a missing, minimized, or invalid-size overlay, the main window may repair
  the overlay while the user is in voice and Whispr is not focused.

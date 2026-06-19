# Whispr Desktop Native Media Research

This document is the production gate for native screen capture, system audio capture, LiveKit custom track integration, and hardware encode claims.

## Current Production Path

- Screen sharing uses the existing browser/WebRTC `getDisplayMedia` path.
- System audio is not captured natively.
- Hardware encoder selection is not directly controlled by Whispr JavaScript.
- The OS WebView/WebRTC stack decides the real encoder. Whispr may provide codec, bitrate, frame-rate, or quality hints only.

## Platform Matrix

| Platform | Native Screen Capture | System Audio | Permission Model | Status |
| --- | --- | --- | --- | --- |
| Windows | Windows Graphics Capture | WASAPI loopback | User picker and explicit opt-in | Research gated |
| macOS | ScreenCaptureKit | ScreenCaptureKit/CoreAudio research | Screen Recording permission | Research gated |
| Linux | PipeWire portal | PipeWire/PulseAudio monitor research | XDG desktop portal permission | Research gated |

## Spike Acceptance Gates

Native capture must not replace the WebRTC fallback until all gates are satisfied:

1. User explicitly starts capture from Whispr UI.
2. OS permission onboarding is clear and cancellable.
3. Capture cancellation returns safely to WebRTC fallback state.
4. Captured frames/audio never include private Whispr message content outside the selected user surface.
5. LiveKit custom track publishing is tested for start, stop, reconnect, quality changes, and page exit cleanup.
6. CPU, memory, and latency are measured with PII-free metrics.
7. No feature copy claims explicit NVENC, AMF, QuickSync, or VideoToolbox selection unless that selection is technically controlled and tested.

## LiveKit Custom Track Spike

The spike may explore a native capture pipeline that yields WebRTC-compatible tracks for LiveKit publishing. Until validated, Whispr keeps `getDisplayMedia` as the production path and treats native capture as research gated.

Required validation:

- Track lifecycle: create, publish, unpublish, stop, and cleanup.
- Reconnect behavior: LiveKit reconnect must not orphan native capture resources.
- Quality control: bitrate and frame-rate hints must map to existing screen-share presets.
- Failure behavior: if native capture fails, the user can retry WebRTC sharing without reloading the app.

## Hardware Encode Reality

Whispr cannot promise direct hardware encoder selection from browser JavaScript. The current supported promise is:

- Whispr can provide WebRTC quality and codec hints.
- Whispr can measure coarse outcomes with opt-in, PII-free telemetry.
- The OS/WebView chooses the actual encoder.

Do not write product or diagnostic copy that says "Whispr uses NVENC/AMF/QuickSync" until a native encoder path is implemented and verified.

## Privacy Rules

- Do not collect window titles, file paths, screen names, message content, DM content, server IDs, channel IDs, or user identifiers in native media telemetry.
- Process or device information used for diagnostics must be coarse and local-only unless the user exports a diagnostics bundle.
- Diagnostics bundle entries must be redacted and bounded.

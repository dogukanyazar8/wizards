# Channel Advanced Settings Design

**Date:** 2026-08-13

## Scope

- Web create/edit UX for channel advanced settings.
- Shared web/mobile contracts and runtime media-policy parity.
- No mobile channel-management UI in this delivery.
- Category creation remains name-only.
- Remove NSFW from current Prisma schema, runtime DTOs, APIs, and UI. Applied migration history remains immutable; the forward migration necessarily names dropped columns.

## Contract

- Text channels accept `slowModeDelay` only.
- Voice channels accept `bitrate`, `userLimit`, `rtcRegion`, and `videoQualityMode` only.
- Invalid cross-type settings are rejected at the API boundary.
- Slow mode presets: `0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600` seconds.
- Bitrate presets: `32000, 64000, 96000, 128000` bits/second.
- User limit: integer `0..10`; `0` means current system maximum `10`.
- Video quality: `AUTO | FULL`.
- RTC region: `AUTO`/`null`, or an allowlisted server-controlled key. User-provided URLs are never accepted.
- Defaults preserve current behavior: text slow mode off; voice 64 kbps, system capacity, automatic RTC, automatic video quality.

## Runtime

- Socket server enforces slow mode with a Redis key scoped by channel and user. Existing global spam limiting remains active. Moderators with explicit moderation permission bypass only slow mode. Retry errors expose `retryAfterSeconds`.
- Voice join capacity uses the existing lock and count path with the channel-specific effective limit. Lowering a limit never ejects connected users; it blocks only new joins.
- LiveKit room creation applies the same participant ceiling as a secondary boundary.
- Voice token responses carry channel media policy. Web and mobile clients apply the channel audio bitrate and video mode when creating the next connection.
- `AUTO` retains adaptive stream and dynacast. `FULL` requests high quality only for visible camera surfaces; hidden/small surfaces do not force full quality.
- RTC keys resolve through a server-side endpoint allowlist. Unknown or unconfigured keys fail safely. If pinning is unavailable, UI offers only automatic selection.
- Slow mode and capacity changes apply immediately. Bitrate, video, and RTC changes apply on the next connection. No forced disconnect.

## Web UX

- Create and edit share one channel-form model.
- Collapsed “Advanced settings” section:
  - Text: slow mode.
  - Voice: bitrate, user limit, RTC region, video quality.
- TR/EN labels, keyboard access, accessible labels, inline validation.
- React Query cache patches include all new fields.
- Existing large modal module is not broadly refactored; only the channel form model and advanced controls may be extracted.

## Release Gates

- Contract and migration tests precede implementation.
- Focused service, Socket/Redis, voice concurrency, LiveKit contract, web component, and E2E tests.
- Package tests/typechecks for `@wizards/types`, `@wizards/db`, `@wizards/web`, and `@wizards/mobile`.
- Prisma generation, migration deploy dry-run, real LiveKit UAT, two-user capacity UAT, and network telemetry acceptance.
- Migration/backend deploy first, web UI second, real LiveKit UAT last. Each step remains independently reversible at the application layer.

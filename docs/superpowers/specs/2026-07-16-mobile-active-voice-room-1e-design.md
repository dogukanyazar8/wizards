# Mobile active voice room (1e) design

## Scope

Implement only the full-screen active voice-room experience (`1e`) on the
`uat` branch. The canonical visual reference is the `id="1e"` section in
`design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html`; its PNG is a
secondary comparison aid. This work must not alter unrelated in-progress
redesign changes.

## Architecture

`VoiceScreen` remains the sole screen for an active voice session and consumes
the existing LiveKit/voice-store screen props. It will derive room name,
server, duration, connection state, participants, speaking activity, mute
state, and avatars from those production props only. It must not add mock,
sample, fallback participant, or synthetic connection data.

The current voice actions retain ownership of side effects:

- Back minimizes the full-screen route and preserves the active session, so the
  existing mini voice bar remains available above each of the four main tabs.
- Leave disconnects through the existing LiveKit action and removes the mini
  bar.
- Mute calls the existing mute action and follows the app's existing haptic
  convention.
- Chat and invite reuse their current navigation and invite flows.
- Microphone permission is never requested during render, mount, background
  synchronization, minimize, or reconnect. The existing explicit user join
  action is the only allowed permission entry point.

## UI and theming

The full-screen root exposes `mobile-voice-room-screen`. The header shows a
22px back control, green speaker, real room name, real server plus elapsed
duration, and a connection chip for connecting, connected, and reconnecting.

Participants render as a centered two-column grid with a full-width invite
card. Every card uses a real participant record and an existing deterministic
avatar fallback. Speaking is derived only from the live speaking event and
adds the green border/ring/status. Muted state shows the red mute badge and
status. Controls are four 60px rounded buttons for mute, audio output,
chat, and leave.

The shared theme infrastructure supplies both appearances immediately and
persistently. Dark uses `#1E2235`, white text, `#9BA1C7` secondary text,
`#34D399` success, and `#E05252` leave. Light uses `#F6F7FB`, white bordered
cards, `#1E2235` primary and `#6B7194` secondary text while retaining green
speaking and red muted/leave affordances. Layout, control sizes, radii,
spacing, and visual hierarchy follow the 390x844 canonical 1e mock.

## State and failure handling

Connection state remains observable as connecting, connected, reconnecting,
and error/loading states rather than being masked by hard-coded status text.
No active room means no invented room UI; the existing state boundary decides
whether the voice screen is shown. A genuine UAT room and signed-in session are
required for interactive LiveKit validation; credentials will not be entered
and authentication will not be bypassed.

## Test and verification plan

Focused component and contract tests will first demonstrate the required
production-state rendering and interactions, including:

- connection, speaking, mute, loading, reconnecting, error, and light/dark
  theme rendering;
- minimize, join, leave, mute, audio-output, chat, and invite routing;
- microphone permission only after an explicit join action;
- no dummy/hard-coded participant, room, server, duration, or connection data;
- the `mobile-voice-room-screen` test identifier and critical 1e visual tokens.

After implementation, run the mobile test suites, typecheck, quality check,
`graphify update .`, the local Android UAT build, device capture for `1e`, and
the `1e-light` visual gate. Inspect and correct any produced visual diff rather
than accepting a capture as proof that the UI matches. If a real signed-in UAT
room is unavailable, report that interactive validation as blocked while still
reporting all completed automated evidence.

# Mobile Phase 3 M4 Design

## Scope

M4 completes mobile account and media parity with five isolated feature boundaries: two-factor management, Giphy selection and attachment creation, server-fetched link previews, DM details, and settings information architecture. It adds no native dependency and preserves the existing in-memory-only query policy.

## Data and security boundaries

- Two-factor setup and recovery codes live only in component state. They are never placed in React Query, logs, telemetry, persisted storage, or Maestro screenshots.
- Giphy search and attachment creation call authenticated mobile proxy routes. The Giphy key remains server-only; the composer sends only the server-created attachment id.
- Link previews are fetched only by the existing SSRF-hardened server fetcher through a bearer-authenticated POST route. Raw URLs never become query keys or diagnostics.
- DM details reuse the M2 participant-authorized, cursor-bounded endpoint.
- Settings routes expose product-facing Account, Security, Appearance, Notifications, Language, and About sections; quality/readiness surfaces live under Developer.

## UI and failure behavior

Each feature uses semantic theme tokens, bounded lists, accessible test IDs, and existing BottomSheet/FlashList primitives. Expected API failures render bounded user-facing messages; sensitive response bodies are not echoed. Reduced-motion behavior is inherited from the in-house BottomSheet and theme runtime.

## Verification

Every client/contract begins with a focused failing test. M4 closes with types/web/mobile typecheck and tests, component tests, quality check, production audit, Maestro phase3-social, redacted evidence, migration documentation, graph update, and one milestone commit on `uat`.

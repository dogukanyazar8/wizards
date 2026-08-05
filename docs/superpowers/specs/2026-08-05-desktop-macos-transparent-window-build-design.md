# Desktop macOS Transparent Window Build Design

## Problem

The desktop shell creates the `voice-mini` and `game-overlay` windows with
`WebviewWindowBuilder::transparent(true)`. Tauri exposes that builder method on
macOS only when the `macos-private-api` feature is enabled. The supported
`run-tauri.mjs` build path does not currently request that feature, so the
unsigned macOS native build fails with Rust error `E0599`.

## Decision

Set `app.macOSPrivateApi` to `true` in both Tauri configuration sources:

- `src-tauri/tauri.conf.json` keeps the checked-in fallback configuration honest.
- `scripts/run-tauri.mjs` emits the same value in the generated configuration used by CI.

Enable the matching `macos-private-api` feature on the `tauri` dependency in
`Cargo.toml`. Tauri CLI builds derive this feature from generated configuration,
while direct `cargo check` and Clippy gates require the manifest declaration to
match the checked-in static configuration.

Tauri converts this config flag to its `macos-private-api` Cargo feature. This
preserves the intended transparent companion-window behavior instead of making
macOS windows opaque.

## Test Contract

Extend the real config-generation test to run `run-tauri.mjs` in config-only
mode and verify that both generated and checked-in configs enable
`app.macOSPrivateApi`. Add a Cargo metadata contract test that verifies the
resolved Tauri feature set includes `macos-private-api`. Both tests must fail
before their corresponding production changes and pass afterward.

## Distribution Constraint

Tauri documents that this private macOS API prevents Apple App Store acceptance.
The current repository publishes Windows NSIS releases; the macOS workflow is an
unsigned native build gate. A future Mac App Store release must adopt a separate
opaque-window build policy instead of silently removing this flag.

## Non-goals

- No dependency version or lockfile change.
- No overlay or voice-mini behavior change.
- No CI workflow, signing, updater, mobile, or web change.
- No commit or push.

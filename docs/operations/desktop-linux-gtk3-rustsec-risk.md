# Desktop Linux GTK3 RustSec risk record

## Scope and status

This is a tracked Linux-only transitive dependency risk, not a `cargo audit` exception. No advisory is ignored or suppressed.

| Item | Verified state |
| --- | --- |
| RustSec CVEs | `0` |
| Yanked crates | `0` |
| Unsound advisory | `RUSTSEC-2024-0429` for `glib 0.18.5` |
| GTK3 unmaintained advisories | Present through the same Linux-only Tauri/Wry chain |
| Upstream tracker | [tauri-apps/wry#1769](https://github.com/tauri-apps/wry/issues/1769), open |
| Desktop owner | Desktop release maintainer |

RustSec marks `glib::VariantStrIter` unsound below `glib 0.20.0`. The fix is available upstream in the GLib binding, but it cannot be selected independently while current Tauri/Wry Linux support resolves GTK3 bindings on the `glib 0.18` line. See [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) and the [open Wry tracker](https://github.com/tauri-apps/wry/issues/1769).

The current supported Tauri Linux WebView backend is WebKitGTK and requires GTK. Wry documents that dependency explicitly; removing the GTK3 chain, the Tauri tray feature, or Linux support is therefore not a mitigation. [Wry platform requirements](https://github.com/tauri-apps/wry#linux) and [Tauri v2.11.5](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.11.5) are the vendor sources used for this decision.

## Proven dependency paths

`cargo tree --target x86_64-unknown-linux-gnu -i glib` currently proves both required paths:

```text
whispr-desktop
  -> tauri 2.11.5
  -> tauri-runtime-wry 2.11.4
  -> wry 0.55.1
  -> webkit2gtk 2.0.2
  -> gtk 0.18.2
  -> glib 0.18.5

whispr-desktop
  -> tauri 2.11.5 (tray-icon feature)
  -> tray-icon 0.24.1
  -> libappindicator 0.9.0
  -> gtk 0.18.2
  -> glib 0.18.5
```

`cargo tree --target x86_64-pc-windows-msvc -i glib` prints no dependency. Windows uses WebView2, not this GTK3 chain.

Whispr has no direct `glib`, `glib-sys`, or `gtk` dependency and has no `VariantStrIter` reference. `apps/desktop/scripts/cargo-security-baseline.test.mjs` enforces both facts, so the affected API is not callable from Whispr application code. This does not claim that an upstream Linux WebKitGTK implementation can never exercise the transitive code; that remains the upstream risk.

## Mitigation and release condition

- Keep Tauri's supported Linux WebKitGTK/tray configuration unchanged; do not use a local `Cargo.patch`, audit ignore, runtime-permission relaxation, or platform disablement.
- Update only when a Tauri/Wry vendor release resolves the Linux graph to `glib >=0.20.0` (or removes the GTK3 path) and `cargo audit --json` reports no `unsound` warning and no GTK3-chain unmaintained warning.
- At that release, run the verification commands below plus a native Linux desktop launch and tray smoke before closing this record. The open Wry issue is tracking evidence, not a commitment: it currently has no assignee or milestone. Recheck it at every Tauri/Wry release and no later than 2026-10-23.
- A newly introduced vulnerability, yanked crate, or additional unsound advisory is a release blocker; do not treat this record as blanket approval.

## Verification commands

```powershell
Set-Location apps/desktop/src-tauri
cargo audit --json
cargo tree --target all -i glib
cargo tree --target x86_64-pc-windows-msvc -i glib
cargo tree --target x86_64-unknown-linux-gnu -i glib
cargo metadata --no-deps --format-version 1

Set-Location ../..
pnpm.cmd --filter @wizards/desktop exec node --test scripts/cargo-security-baseline.test.mjs
pnpm.cmd --filter @wizards/desktop test
```

## This checkpoint's compatible update and rollback

`open` is updated from `5.3.4` to `5.4.0`. Its official release fixes launcher option and shell-injection handling; Whispr already passes only parsed, allow-listed external URL schemes to `open::that`. The existing Rust test keeps that URL policy covered. [open v5.4.0 release notes](https://github.com/Byron/open-rs/releases/tag/v5.4.0)

If this patch causes a desktop regression, restore only the dependency resolution with:

```powershell
Set-Location apps/desktop/src-tauri
cargo update -p open --precise 5.3.4
```

Keep this risk record and the callability test after that rollback; the GTK3/GLib condition predates the `open` update.

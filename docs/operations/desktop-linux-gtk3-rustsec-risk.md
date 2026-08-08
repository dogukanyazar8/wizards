# Desktop Linux GTK3 / GLib RustSec risk record

## Scope and status

This record tracks the transitive GTK3 / GLib risk in the Linux Tauri graph. It is not a `cargo audit` exception: no advisory is ignored, suppressed, or allow-listed.

Evidence was refreshed on 2026-07-26 with `cargo-audit 0.22.1`, Cargo 1.95.0, and advisory-db commit `29638ff054fdbb83d2844240f7ef7e576cb52629` (updated 2026-07-25).

| Finding class           | Current result                          | Scope and decision                                                                                                                 |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| RustSec vulnerabilities | `0`                                     | No CVE/vulnerability finding in `cargo audit --json`. A new finding is a release blocker.                                          |
| Yanked crates           | `0`                                     | `warnings.yanked` is absent from current audit JSON. A newly yanked package is a release blocker until assessed.                   |
| Unsound                 | `1`: `RUSTSEC-2024-0429`, `glib 0.18.5` | Linux-only GTK3 / WebKitGTK chain; tracked below.                                                                                  |
| Unmaintained            | `16` informational warnings             | Ten GTK3 bindings, one GTK3 macro dependency, and five separate Tauri `urlpattern` Unicode dependencies; all remain visible below. |

RustSec classifies `glib::VariantStrIter` as unsound for `glib >=0.15.0, <0.20.0`; `glib 0.18.5` is therefore affected and `>=0.20.0` is patched. Its affected APIs are `last`, `next`, `next_back`, `nth`, and `nth_back`. The failure mode can be undefined behavior and a null-pointer crash when the iterator is exercised; it is not evidence of a remotely exploitable Whispr vulnerability. [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)

## Proven dependency and platform boundaries

`Cargo.toml` has no direct `glib`, `glib-sys`, or `gtk` dependency. The locked, current stable Tauri line is `tauri 2.11.5`, `tauri-runtime-wry 2.11.4`, `wry 0.55.1`, `webkit2gtk 2.0.2`, `gtk 0.18.2`, and `glib 0.18.5`.

`cargo tree --target x86_64-unknown-linux-gnu -i glib` proves both Linux paths:

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

`cargo tree --target x86_64-pc-windows-msvc -i glib` has no result. Tauri renders with WebKitGTK on Linux and WebView2 on Windows, so this `glib` finding is not in the current Windows target graph. [Tauri process model](https://v2.tauri.app/concept/process-model/)

Whispr does not call `VariantStrIter`: the source has no reference and `apps/desktop/scripts/cargo-security-baseline.test.mjs` enforces both that fact and the absence of direct GLib/GTK dependencies. This narrows direct application callability only. It does not prove that the Linux WebKitGTK/Tauri stack cannot exercise the affected transitive API.

## Complete informational-warning classification

The ten GTK3 binding advisories are `RUSTSEC-2024-0411` through `RUSTSEC-2024-0420`: `atk`, `atk-sys`, `gdk`, `gdk-sys`, `gdkwayland-sys`, `gdkx11`, `gdkx11-sys`, `gtk`, `gtk-sys`, and `gtk3-macros`. They are on the Linux path above. `RUSTSEC-2024-0370` for `proc-macro-error 1.0.4` is its GTK3 macro build-dependency path, not a separate direct Whispr API.

The remaining five warnings are not GTK3/GLib findings and must not be hidden by this record: `RUSTSEC-2025-0075`, `-0080`, `-0081`, `-0098`, and `-0100` cover the `unic-* 0.9.0` family. `cargo tree` traces them through `urlpattern 0.3.0` and `tauri-utils 2.9.3` in Tauri build and runtime dependencies for both Windows and Linux target trees. They are informational maintenance signals, not vulnerability findings; they need separate upstream assessment if an advisory changes or a Tauri release resolves them.

Unmaintained and unsound are distinct RustSec categories. Neither status is a blanket release approval, exploit claim, or suppression. The release workflow preserves raw audit output plus a redacted summary; vulnerability findings fail the workflow, while informational warnings remain release evidence.

## Current upstream decision

`Cargo.toml` intentionally permits Tauri major version 2, but its lockfile already resolves the current stable vendor releases: `cargo info tauri` reports `2.11.5` and `cargo info wry` reports `0.55.1`. The official Tauri release index reports the same Tauri and Wry releases. [Tauri ecosystem releases](https://v2.tauri.app/release/)

`cargo info glib@0.18.5` reports newer GLib bindings, but they cannot be selected independently without changing the Tauri/Wry GTK3 graph. Wry tracker [#1769](https://github.com/tauri-apps/wry/issues/1769) remains open, unassigned, and without a milestone as of 2026-07-26. Therefore no safe upstream Cargo update exists for this risk, and this checkpoint deliberately changes neither `Cargo.toml` nor `Cargo.lock`.

Do not add a direct GLib override, `[patch]`, audit ignore, feature removal, runtime-permission relaxation, or platform disablement. Do not begin a Tauri 3 or GTK4 migration from this finding alone. Current Tauri Linux development requires WebKitGTK and GTK-related system dependencies; a backend migration needs a measured Linux product requirement and a separately approved compatibility plan. [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/)

## CI, monitoring, and re-evaluation

Dependabot checks Cargo in `/apps/desktop/src-tauri` weekly against `uat`. Automatic `desktop-ops` runs locked `cargo audit` and `cargo clippy --locked --all-targets -- -D warnings` on the self-hosted Linux runner, then release-operation/script/config checks. This compiles Rust code and test targets but does not prove a native Linux Tauri bundle, launch, tray smoke, or this GLib path at runtime. Windows/macOS native checks and signed Tauri package builds are **NOT RUN** until matching local runners are registered and their workflows are restored.

Before accepting any future upstream resolution, require all of the following: lockfile diff review, `cargo audit --json` with no `unsound` warning for this chain, Windows desktop build evidence, and a Linux CI job that compiles the affected target and performs native launch plus tray smoke. The test/build evidence must come from the candidate lockfile, not a prior successful CI run.

Re-evaluate immediately when any of these occur: a Tauri or Wry release, a change to Wry #1769, a new Cargo advisory/yank, a direct GLib/GTK or `VariantStrIter` reference, or a decision to ship/support Linux desktop. Re-evaluate at least by 2026-10-26 even without a trigger. A vulnerability, yanked crate, or new directly callable unsound advisory is a release blocker.

## Verification commands

```powershell
Set-Location apps/desktop/src-tauri
cargo audit --json
cargo clippy --locked --all-targets -- -D warnings
cargo tree --target x86_64-unknown-linux-gnu -i glib
cargo tree --target x86_64-pc-windows-msvc -i glib
cargo test --locked
cargo check --locked --target x86_64-pc-windows-msvc

Set-Location ../..
pnpm.cmd --filter @wizards/desktop lint:rust
pnpm.cmd --filter @wizards/desktop exec node --test scripts/cargo-security-baseline.test.mjs
pnpm.cmd --filter @wizards/desktop test
```

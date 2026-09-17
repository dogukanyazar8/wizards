# Desktop Linux GTK3 / GLib security backport

## Current status — 2026-09-17

RUSTSEC-2024-0429 is fixed in the source used by this checkout, using the official
upstream two-line correction. The GTK3 API and Tauri 2 remain unchanged. This
supersedes the earlier decision to defer a local backport; the user explicitly
requested remediation of the remaining dependency findings.

`apps/desktop/src-tauri/Cargo.toml` redirects every crates.io `glib 0.18.5`
consumer to `vendor/glib` through `[patch.crates-io]`. The directory contains the
complete original crates.io archive, its MIT license, and only the upstream
`VariantStrIter::impl_get` source correction. The C output pointer is now mutable
and passed as `&mut p`, preserving Rust's aliasing rules. No runtime wrapper,
extra allocation, version spoofing, or audit suppression is used.

[Provenance and removal criteria](../../apps/desktop/src-tauri/vendor/glib/WHISPR-PATCH.md)
record the archive checksum and upstream fix. All 121 upstream files were compared
byte-for-byte to that archive: only the two intended lines in
`src/variant_iter.rs` differ. The additional `WHISPR-PATCH.md` is our maintenance
record.

## Scanner results and proof boundaries

- `cargo audit --json`: zero entries in `vulnerabilities`, six `unmaintained`
  warnings, and one `unsound` warning for `glib 0.18.5`.
- The GLib warning remains because the package retains its honest upstream
  version. RustSec cannot recognize this local source correction. It is not
  ignored or hidden; source provenance and optimized tests establish the fix.
- The six maintenance warnings are `proc-macro-error`, `unic-char-property`,
  `unic-char-range`, `unic-common`, `unic-ucd-ident`, and `unic-ucd-version`.
  No new vulnerability is inferred from their maintenance status. They remain
  visible for separate upstream lifecycle review.
- Default-branch GitHub alerts are independent of this checkout. A local fix
  neither merges `uat` into `main` nor changes a deployed artifact.

## Regression evidence

The unmodified crates.io source crashed with SIGSEGV when its string iterator
unit tests ran in a Linux container with `--release`. The same command with the
backport passed all 11 variant iterator tests. Two additional regression tests
passed for forward/reverse iteration, `nth`, `nth_back`, `last`, UTF-8, empty
strings, empty arrays, and exhausted iterators.

The desktop integration tests are in `tests/glib_variant_security.rs`. Their
Linux-only dev dependency resolves the same patched library used transitively
by GTK3; it adds no production GLib dependency or application API. The Cargo
baseline test verifies that there is exactly one GLib source and that it is the
reviewed local path. The full desktop crate also built successfully with Rust
1.98.1 on Linux and passed both integration tests in release mode. Linux CI now
runs the same optimized regression command:

```sh
cargo test --locked --release --test glib_variant_security
```

Native Linux launch/tray acceptance and CI execution are separate from local
regression evidence. Windows dependencies do not include GLib; the Windows
build remains on WebView2.

## Maintenance

Keep the package version, licenses, original source files, and audit warning
visible. Do not suppress the advisory merely to make a version-only scanner
green. Remove the backport when the supported stable Tauri/GTK stack resolves
a fixed upstream GLib. Do not jump to Tauri 3 alpha or force a GLib 0.20 ABI into
the GTK3 graph to clear an alert. Recheck any new advisory against the vendored
source as well as registry versions.

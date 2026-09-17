# GLib 0.18.5 security backport

This is the complete crates.io `glib 0.18.5` source archive, with the two-line
upstream fix for RUSTSEC-2024-0429. The package version is intentionally unchanged:
this is a backport, not an upstream 0.20 release. MIT license and copyright remain
in `LICENSE` and `COPYRIGHT`.

- Archive: <https://static.crates.io/crates/glib/glib-0.18.5.crate>
- Archive SHA-256: `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`
- Fix: <https://github.com/gtk-rs/gtk-rs-core/pull/1343>
- Advisory: <https://rustsec.org/advisories/RUSTSEC-2024-0429.html>

Only `src/variant_iter.rs` differs from that archive: the C output pointer is
declared `mut` and passed as `&mut p`. This preserves the GTK3/glib 0.18 API and
ABI while fixing the shared implementation used by `next`, `next_back`, `nth`,
`nth_back`, and `last`. No runtime wrapper, extra allocation, or audit exception
is added. Cargo applies this source to every crates.io GLib 0.18.5 consumer via
the desktop manifest's `[patch.crates-io]` section.

`tests/glib_variant_security.rs` in the desktop crate exercises those iterator
operations, UTF-8 values, empty strings, and empty arrays. Run it on Linux with
optimizations, since a debug-only test can miss the original undefined behavior:

```sh
cargo test --locked --release --test glib_variant_security
```

Version-only scanners may still report 0.18.5; a scanner skipping path dependencies
also does not prove this fix. The source delta and optimized regression tests are
the closure evidence. Do not bump this crate to a fictitious safe version or
suppress the advisory. Remove this directory, Cargo patch, and test-only direct
dependency when the supported Tauri/GTK stack resolves a patched upstream GLib.

# Dependency security fixes — 17 September 2026

## Changes

- Updated the existing Metro dependency graph within its compatible 0.84 patch
  line: Expo resolves 0.84.5, React Native CLI resolves 0.84.6. These versions no
  longer depend on `image-size`. Removed its obsolete local patch and both
  `audit.ignore` exceptions. No major framework upgrade or override was needed.
- Backported the official GLib iterator fix into the complete, checksum-verified
  `glib 0.18.5` source. Cargo resolves that local source for the GTK3 dependency
  graph. No ABI change, runtime allocation, or advisory suppression.
- Added regressions through both real Metro consumers, Linux optimized GLib
  integration tests, and a Linux CI step. Fixed two existing Clippy blockers in
  `game_activity.rs` with a type alias and a borrowed slice; behavior unchanged.

## Verification

| Check                                                        | Result                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Frozen pnpm install                                          | PASS                                                                |
| Unfiltered `pnpm audit --json`                               | PASS: zero findings at every severity                               |
| Toolchain tests, including both Metro consumers              | PASS: 91                                                            |
| Mobile typecheck                                             | PASS                                                                |
| Expo Android production export                               | PASS                                                                |
| Desktop script tests                                         | PASS: 121                                                           |
| Windows `cargo test --locked`                                | PASS: 61                                                            |
| Windows Clippy, all targets, warnings denied                 | PASS                                                                |
| Rustfmt, changed-file Prettier, actionlint, whitespace       | PASS                                                                |
| Unpatched GLib optimized Linux reproduction                  | SIGSEGV, expected failure                                           |
| Patched upstream variant iterator tests, optimized Linux     | PASS: 11                                                            |
| Desktop GLib integration tests, optimized Linux, Rust 1.98.1 | PASS: 2                                                             |
| GLib archive comparison                                      | PASS: 121 upstream files; only the two intended source lines differ |

Cargo audit reports zero `vulnerabilities`, six `unmaintained` warnings and the
version-based `glib 0.18.5` `unsound` warning. The GLib warning is intentionally
visible; it cannot identify a local source backport. The source comparison and
before/after crash reproduction prove remediation. See the
[GLib maintenance record](desktop-linux-gtk3-rustsec-risk.md).

`expo install --check` separately recommends newer patches for `expo`,
`expo-image-manipulator`, `expo-image-picker`, and `expo-notifications`. Those
existing package-update recommendations were not expanded into this security
change; mobile typecheck and production bundling passed.

## Delivery boundary

These are local UAT working-tree changes. GitHub's default `main` branch,
Dependabot alert states and deployed artifacts were not changed. CI execution,
device acceptance, and native Linux window/tray smoke were not performed.

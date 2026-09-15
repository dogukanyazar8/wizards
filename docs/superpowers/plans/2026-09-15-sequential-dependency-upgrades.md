# Sequential dependency upgrades

Source: `.codex/dependency-audit-20260915/rapor.md`; user authorized all updates in sequence without subagents. Preserve all existing changes. Commit/push remain paused. Do not run browser automation or mutate deployed services.

## Delivery order

1. Runtime and tooling: Node 24.21.0, pnpm latest-11 11.26.0, shared test/build/type tooling. Keep Node 24 types and TypeScript 7/6 aliases. Verify runtime contracts, install integrity and toolchain tests.
2. Web/database: same-major Next/Prisma/React ecosystem and application libraries. Keep Prisma on stable 7.10.0. Revalidate local patches, auth and worker contracts; typecheck, tests, production build.
3. Mobile: Expo SDK 57 aligned updates and RN 0.86.3; then independently compatible libraries. Preserve Expo-required React/Jest/Babel/native versions. Verify Expo alignment, mobile unit/component/type checks; mark physical/native device gates separately.
4. Desktop: compatible Rust crate and matching JS plugin updates. Reconcile Windows bindings before any breaking crate update; run Rust formatting, Clippy, tests and desktop contracts.
5. CI/services: pin verified action commits and container digests; update tool versions/checksums; preserve trust boundaries. Actionlint and workflow contracts; no live service upgrade.
6. Major migrations: evaluate pnpm 12, Framer Motion 13, LiveKit RN 3 and other newer major/native tracks against upstream compatibility. Apply compatible transitions; document blocked/conflicting candidates and ask only where a product/architecture choice is required.
7. Final: security audits, focused checks required by changes, complete type/build gates, Graphify update. Record actual PASS/FAIL/NOT RUN outcomes. No commit/push without resumed authorization.

## Constraints

- Latest registry tags are not automatically valid targets; exclude release candidates, incompatible SDK companions and unresolved withdrawn/deprecated releases.
- Each group updates manifests, lockfiles and affected contracts together. Keep patch behavior covered by existing regression tests.
- Avoid rerunning unchanged expensive suites; prefer focused checks and one final broad pass.

## Progress

- Initial baseline: dirty UAT worktree, 596 status entries; other user work preserved.
- Runtime/tooling: Node 24.21.0, pnpm 12.4.2 and Turbo 2.10.13. Native pnpm launchers verified; Node 24 types preserved.
- Web/database: Next 16.3.5, Prisma 7.10.0, React 19.3.0 and Motion 13.3.0; supported dependencies and overrides updated. Next React types resolve per workspace consumer.
- Mobile: Expo 57.0.22 / RN 0.86.3 matrix applied. Keep LiveKit RN 2.12.0 and pin WebRTC 144.1.2: Expo plugin 1.0.2 does not declare SDK 3 support. The upstream notification fix replaces the local patch.
- Desktop: Rust 1.98.1; six direct crate updates and compatible transitive updates. Windows bindings remain on Wry's compatible line. The yanked chacha20 release is gone.
- CI/services: reviewed action SHAs, container digests, cargo-audit, sccache checksum and EAS CLI updated. No deployed service changed.
- Final evidence and compatibility holds: `docs/operations/dependency-upgrade-2026-09-15.md`.

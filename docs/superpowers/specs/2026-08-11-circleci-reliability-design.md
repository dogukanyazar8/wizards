# CircleCI Reliability Design

## Goal

Make the protected-branch CircleCI shadow lane complete reliably on the pinned UAT commit without weakening security scans, hiding leaked async resources, or depending on mutable CI tooling.

## Evidence

Pipeline `#4` for `793bc217` failed in seven jobs:

- `coverage`: `c8 report --all` exceeded the default V8 heap near 2 GiB.
- `build-web`: Next.js exposed 35 host CPUs inside a 4-vCPU `large` container and was terminated while collecting page data.
- `e2e-visual`: the CI web server ran Next in development mode because `NODE_ENV=test`, then failed while compiling Google fonts at request time.
- `e2e-cross-browser`: `playwright install --with-deps` requested a root password inside an unprivileged container and hit CircleCI's ten-minute no-output timeout.
- `security`: the full-history gitleaks scan produced no output for ten minutes and was terminated.
- `unit-mobile`: all 1,237 tests passed, but the shared test QueryClient left successful mutations on TanStack Query's default five-minute GC timer, so Jest never exited.
- `desktop`: the image already contained `cargo-audit 0.22.1`, but `cargo audit --version` prints `cargo-audit-audit 0.22.1`; the false mismatch triggered a reinstall against restored registry files and failed with `Permission denied`.

## Design

1. Bound concurrency and memory explicitly. Configure Next's supported `experimental.cpus` setting to four and give only the coverage job a 4 GiB V8 heap.
2. Run Playwright's CI server as a production build. The server command builds Next and the custom server before startup, and Playwright overrides `NODE_ENV=production`. This removes request-time Turbopack/font compilation while preserving `E2E_TEST_MODE`.
3. Put Chromium, Firefox, and WebKit plus their system libraries in the digest-pinned golden image. CircleCI jobs never elevate privileges or install browsers at runtime.
4. Keep the full-history gitleaks scan. Wrap it with a bounded, periodic heartbeat so CircleCI does not confuse a silent scanner with a hung process.
5. Check the direct `cargo-audit` binary version, avoiding the Cargo subcommand display-name quirk and unnecessary reinstalls.
6. Give test mutations the same zero GC time as test queries. Do not add Jest `--forceExit`; contract tests forbid it.
7. Extend repository contract tests before implementation. They must fail on the current configuration and pass only when the CI invariants above are present.

## Security and Performance

- Images remain immutable and digest-pinned.
- No passwordless privilege escalation is added.
- Secret scanning keeps history coverage, redaction, and a hard 30-minute ceiling.
- Browser downloads happen once per image publication instead of on every pipeline.
- Worker and heap limits match paid CircleCI resources instead of the host topology exposed to containers.

## Verification

- Red/green `scripts/quality/circleci-config-contract.test.mjs`.
- CircleCI config validation and repository toolchain contracts.
- Golden image build, non-root tool/browser smoke tests, and digest inspection.
- Focused mobile Jest reproduction without `--forceExit`.
- Web production build and Playwright server startup smoke.
- Push the narrow commit to `uat`; monitor every CircleCI job to completion and repair any remaining failure from its exact log.

# CI golden image

Every CircleCI job runs on this one image. It exists so no job spends minutes
installing Node, pnpm, Playwright browsers or a Rust toolchain that never
changes between runs.

## Build and publish

Requires Docker and a GitHub personal access token with `write:packages`.

`GITLEAKS_VERSION` and `GITLEAKS_SHA256` are **required** build args — the build
fails without them. Read the checksum from the release's
`gitleaks_<version>_checksums.txt` asset, the line for
`gitleaks_<version>_linux_x64.tar.gz`. Do not copy a checksum from anywhere else.

Verify it yourself before building:

```bash
gh release download v8.30.1 --repo gitleaks/gitleaks --pattern "*checksums*" --output - | grep linux_x64
```

```bash
docker build -f docker/ci/Dockerfile \
  --build-arg GITLEAKS_VERSION=8.30.1 \
  --build-arg GITLEAKS_SHA256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb \
  -t ghcr.io/dogukanyazar8/wizards-ci:$(git rev-parse --short HEAD) .
```

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u dogukanyazar8 --password-stdin
```

```bash
docker push ghcr.io/dogukanyazar8/wizards-ci:$(git rev-parse --short HEAD)
```

Read the published digest:

```bash
docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/dogukanyazar8/wizards-ci:$(git rev-parse --short HEAD)
```

Paste that `name@sha256:...` value into **both**:

- `docker/ci/IMAGE`
- `.circleci/main.yml` (the `golden_image` anchor)

`scripts/quality/circleci-config-contract.test.mjs` fails if the two disagree,
or if any executor uses a mutable tag instead of a digest.

## Verify the image locally

```bash
docker run --rm ghcr.io/dogukanyazar8/wizards-ci@sha256:<digest> bash -lc "node -v && pnpm -v && cargo --version && cargo audit --version && gitleaks version && ls /ms-playwright"
```

Expected: `v24.18.0`, `11.20.0`, a stable Rust, `cargo-audit 0.22.1`, the pinned
gitleaks version, and a `chromium-*` directory.

Also confirm the gitleaks subcommand the `security` job uses actually exists in
the version you pinned — gitleaks renamed `detect` in the 8.19 line, so the flag
surface is version-dependent:

```bash
docker run --rm ghcr.io/dogukanyazar8/wizards-ci@sha256:<digest> gitleaks --help
```

## When to rebuild

- `.nvmrc`, `packageManager`, or the resolved `@playwright/test` version changes
- `CARGO_AUDIT_VERSION` in `.circleci/main.yml` changes
- The pinned gitleaks version changes
- A Tauri system dependency is added

The image is **not** rebuilt automatically in this phase. Automatic rebuild on
`pnpm-lock.yaml` / Dockerfile change lands in Phase 3, and even then the digest
is written into the config by hand — a CI image must never change under a
pipeline without someone deciding it should.

## Package visibility

The package is private. CircleCI authenticates with `GHCR_USERNAME` /
`GHCR_TOKEN` from the `ghcr` context; the token needs `read:packages` only.

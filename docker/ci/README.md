# Local CI runner toolbox

GitHub Actions runs directly on the repository's local Linux VM runners. This
image is optional: it provides a reproducible Node, pnpm, Playwright, Rust,
`cargo-audit`, and gitleaks toolbox for provisioning and diagnosis. No workflow
silently requires the image.

## Build and publish

Requires Docker and an authenticated GHCR session with `write:packages`.
`GITLEAKS_VERSION` and `GITLEAKS_SHA256` are required build arguments. Read the
checksum from the official `gitleaks_<version>_checksums.txt` release asset and
verify the `gitleaks_<version>_linux_x64.tar.gz` entry; never invent a checksum.

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
docker push ghcr.io/dogukanyazar8/wizards-ci:$(git rev-parse --short HEAD)
docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/dogukanyazar8/wizards-ci:$(git rev-parse --short HEAD)
```

Copy the published `name@sha256:...` RepoDigest into `docker/ci/IMAGE`. Do not
copy the local image ID and do not use a floating tag.

## Verify locally

```bash
docker run --rm ghcr.io/dogukanyazar8/wizards-ci@sha256:<published-digest> bash -lc "node -v && pnpm -v && cargo --version && cargo-audit --version && gitleaks version && ls /ms-playwright"
```

Expected core pins are Node `24.18.0`, pnpm `11.22.0`, and `cargo-audit
0.22.1`. The Playwright directory must contain Chromium, Firefox, and WebKit.

Rebuild only when a pinned tool or a required native dependency changes. The
image is not rebuilt automatically and is not a GitHub Actions executor.

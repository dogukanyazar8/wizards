# Wizards local CI runner toolbox image.
#
# Optional reproducible toolbox for provisioning or diagnosing the Linux VM
# runners. GitHub Actions jobs execute natively on those runners; no workflow
# silently depends on this image. Tool versions stay pinned to repository
# contracts (.nvmrc, package.json packageManager, pnpm-lock.yaml).
#
# Deliberately NOT installed:
#   - Android SDK / NDK / JDK. The mobile release lane provisions those through
#     .github/scripts/setup-android-build-tools.sh and moves in a later phase.
#
# Build and publish: see docker/ci/README.md. The published digest belongs in
# docker/ci/IMAGE and is checked by the local VM CI contract.

FROM node:24.21.0-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/usr/local/share/corepack \
    COREPACK_DEFAULT_TO_LATEST=0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

# Base tooling plus the official Tauri Debian prerequisites. The Tauri list is
# the one this repository already verified for its desktop build; do not trim it
# without rebuilding apps/desktop/src-tauri.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    file \
    git \
    gnupg \
    jq \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libxdo-dev \
    openssh-client \
    openssl \
    patchelf \
    pkg-config \
    unzip \
    util-linux \
    wget \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

# pnpm comes from the repository's packageManager pin, not from npm -g.
RUN corepack enable \
  && corepack prepare pnpm@12.4.2 --activate \
  && pnpm --version \
  && chmod -R a+rX "${COREPACK_HOME}"

# Playwright browser binaries are keyed to the Playwright release. This must
# match the version pnpm-lock.yaml resolves for @playwright/test, otherwise
# Playwright refuses to start with "browser not found".
ARG PLAYWRIGHT_VERSION=1.63.0
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium firefox webkit \
  && rm -rf /var/lib/apt/lists/*

# gitleaks is available for runner diagnosis and local scans. The GitHub Actions
# workflow uses a SHA-pinned action. Both build args remain REQUIRED; take the
# checksum from the official release checksum asset, never a mirror.
ARG GITLEAKS_VERSION
ARG GITLEAKS_SHA256
RUN test -n "${GITLEAKS_VERSION}" || { echo "GITLEAKS_VERSION build arg is required"; exit 1; } \
  && test -n "${GITLEAKS_SHA256}" || { echo "GITLEAKS_SHA256 build arg is required"; exit 1; } \
  && curl --fail --location --silent --show-error \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    --output /tmp/gitleaks.tar.gz \
  && printf '%s  %s\n' "${GITLEAKS_SHA256}" /tmp/gitleaks.tar.gz | sha256sum --check --status \
  && tar --extract --file /tmp/gitleaks.tar.gz --directory /usr/local/bin gitleaks \
  && rm -f /tmp/gitleaks.tar.gz \
  && gitleaks version

# Rust for apps/desktop. cargo-audit is pinned to the version ci.yml expects.
ARG RUST_VERSION=1.98.1
ARG CARGO_AUDIT_VERSION=0.22.2
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --no-modify-path --profile minimal --default-toolchain "${RUST_VERSION}" \
      --component rustfmt --component clippy \
  && cargo install cargo-audit --version "${CARGO_AUDIT_VERSION}" --locked \
  && chown -R node:node "${CARGO_HOME}" "${RUSTUP_HOME}" \
  && rustc --version \
  && cargo-audit --version

# Playwright refuses to launch Chromium as root without --no-sandbox, and the
# repository's launchOptions do not pass it. Run as the image's unprivileged
# user instead of weakening the sandbox.
RUN printf '%s\n' \
      'export PATH="/home/node/.local/share/pnpm/bin:/usr/local/cargo/bin:$PATH"' \
      > /etc/profile.d/wizards-ci-path.sh \
  && chmod 0644 /etc/profile.d/wizards-ci-path.sh
RUN chown -R node:node /ms-playwright
USER node
WORKDIR /home/node

# Keep the pnpm store on a stable path for repeatable local-runner diagnostics.
ENV PNPM_HOME=/home/node/.local/share/pnpm \
    PATH=/home/node/.local/share/pnpm/bin:$PATH
RUN pnpm config set store-dir /home/node/.pnpm-store --global

CMD ["bash"]

#!/usr/bin/env bash
set -euo pipefail

# Only disposable GitHub VMs may reclaim these preinstalled, unused toolchains.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == Linux ]] || {
  echo "::error::Android storage preparation requires an ephemeral GitHub-hosted Linux runner."
  exit 1
}
sudo rm -rf -- /usr/share/dotnet /usr/local/lib/android /opt/ghc /opt/hostedtoolcache/CodeQL
available_kb="$(df -Pk "${RUNNER_TEMP:?}" | awk 'NR == 2 { print $4 }')"
[[ "$available_kb" =~ ^[0-9]+$ && "$available_kb" -ge 20971520 ]] || {
  echo "::error::Android build requires at least 20 GiB free before provisioning SDK/NDK."
  exit 1
}

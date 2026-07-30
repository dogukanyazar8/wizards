#!/usr/bin/env bash

set -euo pipefail

command_line_tools_sha256="4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"
build_tools_version="36.0.0"

[[ -n "${RUNNER_TEMP:-}" && "$RUNNER_TEMP" == /* ]] || {
  echo "::error::RUNNER_TEMP must be an absolute path."
  exit 1
}
[[ -n "${GITHUB_ENV:-}" && -n "${GITHUB_PATH:-}" ]] || {
  echo "::error::GitHub Actions environment files are unavailable."
  exit 1
}

download_root="${RUNNER_TEMP%/}/android-sdk-download"
sdk_root="${RUNNER_TEMP%/}/android-sdk"
archive="$download_root/command-line-tools.zip"
archive_url="https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip"

for path in "$download_root" "$sdk_root"; do
  [[ "$path" == "${RUNNER_TEMP%/}/"* ]] || {
    echo "::error::Refusing to modify a path outside RUNNER_TEMP: $path"
    exit 1
  }
done

rm -rf -- "$download_root" "$sdk_root"
mkdir -p "$download_root" "$sdk_root/cmdline-tools/latest"

curl --fail --silent --show-error --location "$archive_url" --output "$archive"
printf '%s  %s\n' "$command_line_tools_sha256" "$archive" | sha256sum --check --status
unzip -q "$archive" -d "$download_root"
cp -a "$download_root/cmdline-tools/." "$sdk_root/cmdline-tools/latest/"

sdkmanager="$sdk_root/cmdline-tools/latest/bin/sdkmanager"
[[ -x "$sdkmanager" ]] || {
  echo "::error::Verified Android command-line tools archive did not contain sdkmanager."
  exit 1
}

set +o pipefail
yes | "$sdkmanager" --sdk_root="$sdk_root" --licenses >/dev/null
license_status="${PIPESTATUS[1]}"
set -o pipefail
(( license_status == 0 )) || {
  echo "::error::Android SDK licenses could not be accepted."
  exit "$license_status"
}

"$sdkmanager" --sdk_root="$sdk_root" "build-tools;36.0.0" >/dev/null

apksigner_path="$sdk_root/build-tools/$build_tools_version/apksigner"
[[ -x "$apksigner_path" ]] || {
  echo "::error::Android Build Tools $build_tools_version did not provide apksigner."
  exit 1
}

{
  echo "ANDROID_HOME=$sdk_root"
  echo "ANDROID_SDK_ROOT=$sdk_root"
} >> "$GITHUB_ENV"
echo "$sdk_root/build-tools/$build_tools_version" >> "$GITHUB_PATH"

echo "Installed verified Android Build Tools $build_tools_version in $sdk_root"

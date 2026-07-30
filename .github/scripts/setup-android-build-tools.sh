#!/usr/bin/env bash

set -euo pipefail

command_line_tools_sha256="4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"
android_platform_version="36"
build_tools_version="36.0.0"
ndk_version="27.1.12297006"
cmake_version="3.30.5"

[[ -n "${RUNNER_TEMP:-}" && "$RUNNER_TEMP" == /* ]] || {
  echo "::error::RUNNER_TEMP must be an absolute path."
  exit 1
}
[[ -n "${RUNNER_TOOL_CACHE:-}" && "$RUNNER_TOOL_CACHE" == /* ]] || {
  echo "::error::RUNNER_TOOL_CACHE must be an absolute path."
  exit 1
}
[[ -n "${GITHUB_ENV:-}" && -n "${GITHUB_PATH:-}" ]] || {
  echo "::error::GitHub Actions environment files are unavailable."
  exit 1
}

download_root="${RUNNER_TEMP%/}/android-sdk-download"
sdk_cache_root="${RUNNER_TOOL_CACHE%/}/whispr-android-sdk"
sdk_root="$sdk_cache_root/rn-0.86.0"
archive="$download_root/command-line-tools.zip"
archive_url="https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip"
lock_file="$sdk_cache_root/install.lock"

[[ "$download_root" == "${RUNNER_TEMP%/}/"* ]] || {
  echo "::error::Refusing to modify a download path outside RUNNER_TEMP: $download_root"
  exit 1
}
[[ "$sdk_root" == "${RUNNER_TOOL_CACHE%/}/whispr-android-sdk/"* ]] || {
  echo "::error::Refusing to modify an SDK path outside RUNNER_TOOL_CACHE: $sdk_root"
  exit 1
}

rm -rf -- "$download_root"
mkdir -p "$download_root" "$sdk_root" "$sdk_cache_root"

exec 9>"$lock_file"
flock 9

sdkmanager="$sdk_root/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "$sdkmanager" ]]; then
  curl --fail --silent --show-error --location "$archive_url" --output "$archive"
  printf '%s  %s\n' "$command_line_tools_sha256" "$archive" | sha256sum --check --status
  unzip -q "$archive" -d "$download_root"
  rm -rf -- "$sdk_root/cmdline-tools/latest"
  mkdir -p "$sdk_root/cmdline-tools/latest"
  cp -a "$download_root/cmdline-tools/." "$sdk_root/cmdline-tools/latest/"
fi

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

"$sdkmanager" --sdk_root="$sdk_root" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "cmake;3.30.5" >/dev/null

apksigner_path="$sdk_root/build-tools/$build_tools_version/apksigner"
aapt_path="$sdk_root/build-tools/$build_tools_version/aapt"
cmake_path="$sdk_root/cmake/$cmake_version/bin/cmake"
ninja_path="$sdk_root/cmake/$cmake_version/bin/ninja"
ndk_root="$sdk_root/ndk/$ndk_version"
platform_jar="$sdk_root/platforms/android-$android_platform_version/android.jar"

for executable in "$apksigner_path" "$aapt_path" "$cmake_path" "$ninja_path"; do
  [[ -x "$executable" ]] || {
    echo "::error::Android local-build tool is missing: $executable"
    exit 1
  }
done
[[ -d "$ndk_root" ]] || {
  echo "::error::Android NDK $ndk_version is missing."
  exit 1
}
[[ -f "$platform_jar" ]] || {
  echo "::error::Android platform $android_platform_version is missing."
  exit 1
}

{
  echo "ANDROID_HOME=$sdk_root"
  echo "ANDROID_SDK_ROOT=$sdk_root"
  echo "ANDROID_NDK_HOME=$ndk_root"
  echo "ANDROID_NDK_ROOT=$ndk_root"
  echo "CMAKE_VERSION=$cmake_version"
} >> "$GITHUB_ENV"
{
  echo "$sdk_root/build-tools/$build_tools_version"
  echo "$sdk_root/platform-tools"
  echo "$sdk_root/cmake/$cmake_version/bin"
  echo "$sdk_root/cmdline-tools/latest/bin"
} >> "$GITHUB_PATH"

rm -rf -- "$download_root"

echo "Provisioned Android $android_platform_version, Build Tools $build_tools_version, NDK $ndk_version, and CMake $cmake_version in $sdk_root"

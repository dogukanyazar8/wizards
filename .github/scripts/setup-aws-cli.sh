#!/usr/bin/env bash
set -euo pipefail

aws_cli_version="2.27.41"
expected_fingerprint="FB5DB77FD5C118B80511ADA8A6310ACC4672475C"
archive_url="https://awscli.amazonaws.com/awscli-exe-linux-x86_64-2.27.41.zip"
signature_url="${archive_url}.sig"
download_root="${RUNNER_TEMP:?RUNNER_TEMP is required}/aws-cli-download"
install_root="$RUNNER_TEMP/aws-cli"
bin_dir="$install_root/bin"
archive_path="$download_root/awscliv2.zip"
signature_path="$download_root/awscliv2.zip.sig"
gnupg_home="$download_root/gnupg"
public_key_path="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/.github/aws-cli-public-key.asc"

for tool in curl gpg unzip awk grep; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "::error::Verified AWS CLI setup requires $tool."
    exit 1
  }
done
[[ -f "$public_key_path" ]] || {
  echo "::error::AWS CLI verification key is missing."
  exit 1
}

rm -rf -- "$download_root" "$install_root"
mkdir -p "$download_root" "$gnupg_home"
chmod 700 "$gnupg_home"

curl --fail --location --silent --show-error "$archive_url" --output "$archive_path"
curl --fail --location --silent --show-error "$signature_url" --output "$signature_path"
gpg --batch --homedir "$gnupg_home" --import "$public_key_path" >/dev/null 2>&1
actual_fingerprint="$(
  gpg --batch --homedir "$gnupg_home" --with-colons --fingerprint |
    awk -F: '$1 == "fpr" { print $10; exit }'
)"
[[ "$actual_fingerprint" == "$expected_fingerprint" ]] || {
  echo "::error::AWS CLI verification key fingerprint does not match the pinned trust root."
  exit 1
}
gpg --batch --homedir "$gnupg_home" --verify "$signature_path" "$archive_path"

unzip -q "$archive_path" -d "$download_root"
"$download_root/aws/install" --install-dir "$install_root" --bin-dir "$bin_dir"
"$bin_dir/aws" --version 2>&1 | grep -q "^aws-cli/${aws_cli_version} "
echo "$bin_dir" >> "$GITHUB_PATH"

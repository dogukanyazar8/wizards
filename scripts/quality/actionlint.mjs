import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const actionlintVersion = "1.7.12";
const releaseBaseUrl = `https://github.com/rhysd/actionlint/releases/download/v${actionlintVersion}`;
const targets = {
  "darwin-arm64": {
    archive: `actionlint_${actionlintVersion}_darwin_arm64.tar.gz`,
    sha256: "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
    executable: "actionlint",
  },
  "darwin-x64": {
    archive: `actionlint_${actionlintVersion}_darwin_amd64.tar.gz`,
    sha256: "5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644",
    executable: "actionlint",
  },
  "linux-arm64": {
    archive: `actionlint_${actionlintVersion}_linux_arm64.tar.gz`,
    sha256: "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
    executable: "actionlint",
  },
  "linux-x64": {
    archive: `actionlint_${actionlintVersion}_linux_amd64.tar.gz`,
    sha256: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    executable: "actionlint",
  },
  "win32-arm64": {
    archive: `actionlint_${actionlintVersion}_windows_arm64.zip`,
    sha256: "cadcf7ea4efe3a68728893813643cebe1185e5b1d4be5b96245f65c9a4d5ea41",
    executable: "actionlint.exe",
  },
  "win32-x64": {
    archive: `actionlint_${actionlintVersion}_windows_amd64.zip`,
    sha256: "6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9",
    executable: "actionlint.exe",
  },
};

function fail(message) {
  process.stderr.write(`actionlint: ${message}\n`);
  process.exit(1);
}

function executableHasExpectedVersion(executablePath) {
  if (!existsSync(executablePath)) {
    return false;
  }

  const result = spawnSync(executablePath, ["-version"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.startsWith(`${actionlintVersion}\n`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    fail(`download failed with HTTP ${response.status}: ${url}`);
  }

  writeFileSync(destination, new Uint8Array(await response.arrayBuffer()));
}

function extract(archivePath, destination) {
  const result = spawnSync("tar", ["-xf", archivePath, "-C", destination], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`archive extraction failed: ${result.stderr || result.stdout}`.trim());
  }
}

async function resolveActionlint() {
  const target = targets[`${process.platform}-${process.arch}`];
  if (!target) {
    fail(`unsupported platform: ${process.platform}-${process.arch}`);
  }

  const cacheDirectory = join(
    root,
    "node_modules",
    ".cache",
    "actionlint",
    actionlintVersion,
    `${process.platform}-${process.arch}`,
  );
  const executablePath = join(cacheDirectory, target.executable);
  if (executableHasExpectedVersion(executablePath)) {
    return executablePath;
  }

  rmSync(cacheDirectory, { force: true, recursive: true });
  mkdirSync(cacheDirectory, { recursive: true });
  const archivePath = join(cacheDirectory, target.archive);
  await download(`${releaseBaseUrl}/${target.archive}`, archivePath);

  if (sha256(archivePath) !== target.sha256) {
    rmSync(cacheDirectory, { force: true, recursive: true });
    fail(`SHA-256 mismatch for ${target.archive}`);
  }

  extract(archivePath, cacheDirectory);
  rmSync(archivePath, { force: true });

  if (!executableHasExpectedVersion(executablePath)) {
    fail(`installed binary is not actionlint ${actionlintVersion}`);
  }

  return executablePath;
}

function workflowPaths() {
  const workflowsDirectory = join(root, ".github", "workflows");
  const paths = readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => join(workflowsDirectory, name));

  if (paths.length === 0) {
    fail("no workflow files found");
  }

  return paths;
}

async function main() {
  const executablePath = await resolveActionlint();
  const configPath = join(root, ".github", "actionlint.yaml");
  if (!existsSync(configPath)) {
    fail("missing .github/actionlint.yaml");
  }

  const workflowArguments = process.argv.slice(2);
  const result = spawnSync(
    executablePath,
    [
      "-config-file",
      configPath,
      "-shellcheck=",
      "-pyflakes=",
      ...(workflowArguments.length > 0 ? workflowArguments : workflowPaths()),
    ],
    { encoding: "utf8" },
  );

  if (result.error) {
    fail(result.error.message);
  }
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

await main();

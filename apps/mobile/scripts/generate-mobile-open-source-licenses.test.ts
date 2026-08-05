import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourcePath = fileURLToPath(
  new URL("./generate-mobile-open-source-licenses.ts", import.meta.url),
);
const tsxImport = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const workspaceRoot = join(dirname(sourcePath), "..", "..", "..");

function writeFakePackageManagerCommands(binDirectory: string, runnerPath: string): void {
  if (process.platform === "win32") {
    writeFileSync(
      join(binDirectory, "pnpm.cmd"),
      `@echo off\r\n"${process.execPath}" "${runnerPath}" ambient\r\n`,
      "utf8",
    );
    writeFileSync(
      join(binDirectory, "corepack.cmd"),
      `@echo off\r\n"${process.execPath}" "${runnerPath}" corepack\r\n`,
      "utf8",
    );
    return;
  }

  for (const [command, label] of [
    ["pnpm", "ambient"],
    ["corepack", "corepack"],
  ] as const) {
    const commandPath = join(binDirectory, command);
    writeFileSync(
      commandPath,
      `#!/bin/sh\nexec "${process.execPath}" "${runnerPath}" ${label}\n`,
      "utf8",
    );
    chmodSync(commandPath, 0o755);
  }
}

test("license generation uses the workspace Corepack pnpm instead of ambient pnpm", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "whispr-mobile-licenses-"));

  try {
    const mobileRoot = join(temporaryRoot, "apps", "mobile");
    const scriptDirectory = join(mobileRoot, "scripts");
    const outputDirectory = join(mobileRoot, "src", "legal");
    const binDirectory = join(temporaryRoot, "bin");
    const markerPath = join(temporaryRoot, "package-manager.txt");
    const runnerPath = join(temporaryRoot, "fake-package-manager.cjs");
    const copiedGeneratorPath = join(scriptDirectory, "generate-mobile-open-source-licenses.ts");

    mkdirSync(scriptDirectory, { recursive: true });
    mkdirSync(outputDirectory, { recursive: true });
    mkdirSync(binDirectory, { recursive: true });
    copyFileSync(sourcePath, copiedGeneratorPath);
    writeFileSync(
      runnerPath,
      `const { writeFileSync } = require("node:fs");\n` +
        `const label = process.argv[2];\n` +
        `writeFileSync(process.env.FAKE_PACKAGE_MANAGER_MARKER, label, "utf8");\n` +
        `process.stdout.write(JSON.stringify({ MIT: [{ name: label, versions: ["1.0.0"] }] }));\n`,
      "utf8",
    );
    writeFakePackageManagerCommands(binDirectory, runnerPath);

    const result = spawnSync(process.execPath, ["--import", tsxImport, copiedGeneratorPath], {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_PACKAGE_MANAGER_MARKER: markerPath,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(markerPath, "utf8"), "corepack");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

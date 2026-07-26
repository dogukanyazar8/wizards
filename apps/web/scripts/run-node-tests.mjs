import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { escapeTestGlobPath } from "./test-glob-path.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");
const srcRoot = join(webRoot, "src");

function toCliPath(path) {
  return escapeTestGlobPath(relative(webRoot, path).split(sep).join("/"));
}

function collectTestFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      const stats = statSync(path);

      if (stats.isDirectory()) {
        return collectTestFiles(path);
      }

      if (stats.isFile() && (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx"))) {
        return [path];
      }

      return [];
    })
    .sort((left, right) => left.localeCompare(right));
}

const testFiles = collectTestFiles(srcRoot).map(toCliPath);
const testEnvironment = {
  ...process.env,
  // PrismaPg validates its direct connection string during module import. pg
  // pools connect lazily, so this only keeps isolated unit tests importable.
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests",
};

if (testFiles.length === 0) {
  console.error("No test files found under apps/web/src.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-force-exit", ...process.argv.slice(2), ...testFiles],
  {
    cwd: webRoot,
    env: testEnvironment,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.signal) {
  console.error(`Test runner exited due to signal ${result.signal}.`);
  process.exit(1);
}

process.exit(result.status ?? 1);

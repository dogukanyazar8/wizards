import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packages = Object.freeze([
  { name: "db", tsconfig: "packages/db/tsconfig.json" },
  { name: "types", tsconfig: "packages/types/tsconfig.json" },
  { name: "ui", tsconfig: "packages/ui/tsconfig.json" },
]);
const reportPath = join(root, "artifacts", "typescript", "declaration-parity.json");

export function normalizeDeclaration(text) {
  return text.replaceAll("\r\n", "\n");
}

export function compareDeclarationMaps(stable, native) {
  const stablePaths = [...stable.keys()].sort();
  const nativePaths = [...native.keys()].sort();
  const missing = stablePaths.filter((path) => !native.has(path));
  const extra = nativePaths.filter((path) => !stable.has(path));
  const changed = stablePaths.filter(
    (path) =>
      native.has(path) &&
      normalizeDeclaration(stable.get(path)) !== normalizeDeclaration(native.get(path)),
  );
  return { changed, extra, missing, success: missing.length + extra.length + changed.length === 0 };
}

function declarationMap(directory) {
  const result = new Map();
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".d.ts"))
        result.set(relative(directory, path).replaceAll("\\", "/"), readFileSync(path, "utf8"));
    }
  };
  visit(directory);
  return result;
}

function runPnpm(args) {
  assert.ok(process.env.npm_execpath, "Declaration parity must run through pnpm");
  return spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    shell: false,
    stdio: "inherit",
  });
}

export function runDeclarationParity() {
  if (runPnpm(["--filter", "@wizards/db", "db:generate"]).status !== 0) return 1;
  const temporaryRoot = mkdtempSync(join(tmpdir(), "whispr-typescript-parity-"));
  const results = [];
  try {
    for (const project of packages) {
      const stableDirectory = join(temporaryRoot, project.name, "stable");
      const nativeDirectory = join(temporaryRoot, project.name, "native");
      mkdirSync(stableDirectory, { recursive: true });
      mkdirSync(nativeDirectory, { recursive: true });

      const common = [
        "-p",
        project.tsconfig,
        "--emitDeclarationOnly",
        "--declaration",
        "--declarationMap",
        "false",
      ];
      const stable = runPnpm([
        "exec",
        "tsc6",
        ...common,
        "--outDir",
        stableDirectory,
        "--stableTypeOrdering",
      ]);
      const native = runPnpm([
        "exec",
        "tsc",
        ...common,
        "--outDir",
        nativeDirectory,
        "--checkers",
        "1",
      ]);
      if (stable.status !== 0 || native.status !== 0) return 1;

      results.push({
        name: project.name,
        ...compareDeclarationMaps(declarationMap(stableDirectory), declarationMap(nativeDirectory)),
      });
    }
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }

  const report = {
    schemaVersion: 1,
    projects: results,
    success: results.every((result) => result.success),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report.success ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = runDeclarationParity();

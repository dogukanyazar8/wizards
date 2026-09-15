import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { pnpmInvocation } from "./pnpm-invocation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageContracts = [
  { path: "apps/web/package.json", scripts: { typecheck: ["web", "check"] } },
  {
    path: "apps/mobile/package.json",
    scripts: { lint: ["mobile", "check"], typecheck: ["mobile", "check"] },
  },
  {
    path: "packages/db/package.json",
    scripts: { build: ["db", "build"], lint: ["db", "check"], typecheck: ["db", "check"] },
  },
  {
    path: "packages/types/package.json",
    scripts: {
      build: ["types", "build"],
      dev: ["types", "watch"],
      lint: ["types", "check"],
      typecheck: ["types", "check"],
    },
  },
  {
    path: "packages/ui/package.json",
    scripts: {
      build: ["ui", "build"],
      dev: ["ui", "watch"],
      lint: ["ui", "check"],
      typecheck: ["ui", "check"],
    },
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function runPnpm(args) {
  assert.ok(process.env.npm_execpath, "Run this contract through pnpm test:toolchain");
  const invocation = pnpmInvocation(process.env.npm_execpath, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

test("the pnpm catalog owns both compiler identities", () => {
  const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  assert.match(workspace, /^catalog:\r?$/m);
  assert.match(workspace, /^  ['"]?typescript['"]?: npm:@typescript\/typescript6@6\.0\.2\r?$/m);
  assert.match(workspace, /^  ['"]?@typescript\/native['"]?: npm:typescript@7\.0\.2\r?$/m);
});

test("every TypeScript workspace consumes the TS6 API catalog and calls the root TS7 runner", () => {
  for (const contract of packageContracts) {
    const manifest = readJson(contract.path);
    assert.equal(manifest.devDependencies.typescript, "catalog:", contract.path);
    for (const [scriptName, [project, mode]] of Object.entries(contract.scripts)) {
      const script = manifest.scripts[scriptName];
      assert.equal(typeof script, "string", `${contract.path}#${scriptName}`);
      assert.match(
        script,
        /\bnode\s+\.\.\/\.\.\/scripts\/quality\/typescript-project-runner\.mjs\b/,
        `${contract.path}#${scriptName}`,
      );
      assert.match(script, new RegExp(`--project=${project}(?:\\s|$)`), contract.path);
      assert.match(script, new RegExp(`--mode=${mode}(?:\\s|$)`), contract.path);
      assert.doesNotMatch(script, /\btsc6\b/, `${contract.path}#${scriptName}`);
      assert.doesNotMatch(script, /(^|\s)tsc(\s|$)/, `${contract.path}#${scriptName}`);
    }
  }
  assert.equal(readJson("package.json").devDependencies["@typescript/native"], "catalog:");
});

test("compiler API stays on TS6 while the root main CLI is TS7", () => {
  assert.equal(ts.version, "6.0.3");
  assert.equal(runPnpm(["exec", "tsc6", "--version"]), "Version 6.0.3");
  assert.equal(runPnpm(["exec", "tsc", "--version"]), "Version 7.0.2");
});

test("root scripts make TS7 authoritative and retain a TS6 compatibility gate", () => {
  const manifest = readJson("package.json");
  assert.equal(
    manifest.scripts["typecheck:main"],
    "node scripts/quality/typescript-typecheck-runner.mjs --compiler=main",
  );
  assert.equal(
    manifest.scripts["typecheck:main:ci"],
    "node scripts/quality/typescript-typecheck-runner.mjs --compiler=main --checkers=1",
  );
  assert.equal(
    manifest.scripts["typecheck:compat"],
    "node scripts/quality/typescript-typecheck-runner.mjs --compiler=compat",
  );
  assert.equal(manifest.scripts["typecheck:native"], undefined);
  assert.equal(manifest.scripts["typecheck:native:ci"], undefined);
  assert.match(manifest.scripts.ci, /pnpm typecheck && pnpm typecheck:main:ci/);
  assert.match(manifest.scripts.ci, /pnpm typecheck:compat && pnpm typecheck:declarations/);
});

test("relative CSS side-effect imports have real assets and exact declarations", () => {
  const sourceRoot = join(root, "apps", "web", "src");
  const sourceFiles = walkFiles(sourceRoot).filter((path) =>
    [".ts", ".tsx"].includes(extname(path)),
  );
  const sideEffectImport = /^\s*import\s+["'](\.[^"']+\.css)["'];/gm;
  const imports = [];

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    for (const match of source.matchAll(sideEffectImport)) {
      const asset = resolve(dirname(sourceFile), match[1]);
      const declaration = asset.replace(/\.([^.]+)$/, ".d.$1.ts");
      imports.push(relative(root, asset).replaceAll("\\", "/"));
      assert.ok(existsSync(asset), `Missing stylesheet: ${relative(root, asset)}`);
      assert.ok(
        existsSync(declaration),
        `Missing exact declaration: ${relative(root, declaration)}`,
      );
    }
    assert.doesNotMatch(source, /declare\s+module\s+["']\*\.css["']/);
  }

  assert.deepEqual(imports, ["apps/web/src/app/globals.css"]);
});

test("CI requires main and compatibility compiler evidence", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /^  typescript-native-shadow:\r?$/m);
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf("  typescript-native-shadow:");
  const end = lines.findIndex((line, index) => index > start && /^  [a-z0-9-]+:$/.test(line));
  const compilerJob = lines.slice(start, end === -1 ? undefined : end).join("\n");
  assert.match(compilerJob, /^    name: TypeScript Compiler Compatibility$/m);
  assert.match(compilerJob, /^        run: pnpm typecheck:main:ci$/m);
  assert.match(compilerJob, /^        run: pnpm typecheck:compat$/m);
  assert.match(compilerJob, /^        run: pnpm typecheck:declarations$/m);
  assert.match(compilerJob, /^        if: always\(\)$/m);
  assert.match(compilerJob, /^          path: artifacts\/typescript\/\*\.json$/m);
  assert.doesNotMatch(compilerJob, /^    continue-on-error: true$/m);
  assert.equal(readJson("package.json").devDependencies.typescript, "catalog:");
  assert.equal(readJson("package.json").devDependencies["@typescript/native"], "catalog:");
});

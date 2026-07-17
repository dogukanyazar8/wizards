import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageContracts = [
  { path: "package.json", scripts: [] },
  { path: "apps/web/package.json", scripts: ["typecheck"] },
  { path: "apps/mobile/package.json", scripts: ["lint", "typecheck"] },
  { path: "packages/db/package.json", scripts: ["build", "lint", "typecheck"] },
  { path: "packages/types/package.json", scripts: ["build", "dev", "lint", "typecheck"] },
  { path: "packages/ui/package.json", scripts: ["build", "dev", "lint", "typecheck"] },
];

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function runPnpm(args) {
  assert.ok(process.env.npm_execpath, "Run this contract through pnpm test:toolchain");
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
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

test("every TypeScript workspace consumes the catalog and calls stable tsc6 explicitly", () => {
  for (const contract of packageContracts) {
    const manifest = readJson(contract.path);
    assert.equal(manifest.devDependencies.typescript, "catalog:", contract.path);
    for (const scriptName of contract.scripts) {
      const script = manifest.scripts[scriptName];
      assert.equal(typeof script, "string", `${contract.path}#${scriptName}`);
      assert.match(script, /\btsc6\b/, `${contract.path}#${scriptName}`);
      assert.doesNotMatch(script, /(^|\s)tsc(\s|$)/, `${contract.path}#${scriptName}`);
    }
  }
  assert.equal(readJson("package.json").devDependencies["@typescript/native"], "catalog:");
});

test("compiler API stays on TS6 while the root native CLI is TS7", () => {
  assert.equal(ts.version, "6.0.3");
  assert.equal(runPnpm(["exec", "tsc6", "--version"]), "Version 6.0.3");
  assert.equal(runPnpm(["exec", "tsc", "--version"]), "Version 7.0.2");
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

test("CI runs the native compiler independently in report-only mode", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /^  typescript-native-shadow:\r?$/m);
  assert.match(workflow, /^    name: TypeScript 7 Native Shadow\r?$/m);
  assert.match(workflow, /^    continue-on-error: true\r?$/m);
  assert.match(workflow, /^      - name: Run TypeScript toolchain contracts\r?$/m);
  assert.match(workflow, /^        run: pnpm test:toolchain\r?$/m);
  assert.match(workflow, /^        run: pnpm typecheck:native:ci\r?$/m);
  assert.match(workflow, /^        run: pnpm typecheck:declarations\r?$/m);
});

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = join(webRoot, "package.json");
const postcssConfigPath = join(webRoot, "postcss.config.mjs");
const tailwindConfigPath = join(webRoot, "tailwind.config.ts");
const globalCssPath = join(webRoot, "src", "app", "globals.css");

async function readWorkspaceFile(path) {
  return readFile(path, "utf8");
}

async function collectSourceFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(entryPath);
      return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
    }),
  );

  return files.flat();
}

async function collectClassTokens(pattern) {
  const roots = [join(webRoot, "src"), join(webRoot, "..", "..", "packages", "ui", "src")];
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  const tokens = new Set();

  for (const file of files) {
    const source = await readWorkspaceFile(file);
    for (const match of source.matchAll(pattern)) tokens.add(match[1]);
  }

  return [...tokens].sort();
}

async function collectLeadingImportantModifiers() {
  const roots = [join(webRoot, "src"), join(webRoot, "..", "..", "packages", "ui", "src")];
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  const tokens = new Set();

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      await readWorkspaceFile(file),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        for (const match of node.text.matchAll(
          /(?:^|\s)(![A-Za-z][A-Za-z0-9_\-:/\[\].]*)(?=$|\s)/g,
        )) {
          tokens.add(match[1]);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return [...tokens].sort();
}

test("Tailwind v4 pipeline keeps declared browser and token contracts", async () => {
  const [packageJsonSource, postcssConfig, tailwindConfig, globalCss] = await Promise.all([
    readWorkspaceFile(packageJsonPath),
    readWorkspaceFile(postcssConfigPath),
    readWorkspaceFile(tailwindConfigPath),
    readWorkspaceFile(globalCssPath),
  ]);
  const packageJson = JSON.parse(packageJsonSource);

  assert.equal(packageJson.devDependencies.tailwindcss, "4.3.3");
  assert.equal(packageJson.devDependencies["@tailwindcss/postcss"], "4.3.3");
  assert.equal("autoprefixer" in packageJson.devDependencies, false);
  assert.deepEqual(packageJson.browserslist, ["Chrome >= 111", "Firefox >= 128", "Safari >= 16.4"]);

  assert.match(postcssConfig, /"@tailwindcss\/postcss": \{\}/);
  assert.doesNotMatch(postcssConfig, /autoprefixer|tailwindcss:\s*\{\}/);
  assert.match(tailwindConfig, /darkMode:\s*\["class",\s*"\.dark"\]/);
  assert.doesNotMatch(tailwindConfig, /content:|extend:|plugins:/);

  assert.doesNotMatch(globalCss, /@tailwind\s+(?:base|components|utilities)/);
  assert.match(globalCss, /@config "\.\.\/\.\.\/tailwind\.config\.ts";/);
  assert.match(globalCss, /@import "tailwindcss" source\(none\);/);
  assert.match(globalCss, /@source "\.";/);
  assert.match(globalCss, /@source "\.\.\/components";/);
  assert.match(globalCss, /@source "\.\.\/\.\.\/\.\.\/\.\.\/packages\/ui\/src";/);
  assert.match(globalCss, /@theme inline \{/);

  for (const token of [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "primary",
    "primary-foreground",
    "border",
    "input",
    "ring",
  ]) {
    assert.match(globalCss, new RegExp(`--color-${token}: hsl\\(var\\(--${token}\\)\\);`));
  }
});

test(
  "Tailwind v4 compiles legacy semantic utilities through the PostCSS pipeline",
  {
    skip:
      JSON.parse(await readWorkspaceFile(packageJsonPath)).devDependencies.tailwindcss !== "4.3.3",
  },
  async () => {
    const [{ default: postcss }, { default: tailwindcss }] = await Promise.all([
      import("postcss"),
      import("@tailwindcss/postcss"),
    ]);
    const result = await postcss([tailwindcss()]).process(await readWorkspaceFile(globalCssPath), {
      from: globalCssPath,
    });

    assert.doesNotMatch(result.css, /--color-background:/);
    assert.match(result.css, /border-color: hsl\(var\(--border\)\)/);
    assert.match(result.css, /\.bg-background\s*\{/);
  },
);

test("class consumers use Tailwind v4 utility names", async () => {
  const renamedUtilities = await collectClassTokens(
    /(?:^|[\s"'`])((?:backdrop-)?blur-sm|bg-gradient-to-[a-z]+|outline-none|rounded-sm|shadow-sm|transition-\[[^\]]*\btransform\b[^\]]*\])(?=$|[\s"'`])/gm,
  );
  const leadingImportantModifiers = await collectLeadingImportantModifiers();

  assert.deepEqual(renamedUtilities, []);
  assert.deepEqual(leadingImportantModifiers, []);
});

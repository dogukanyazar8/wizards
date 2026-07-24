import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultDirectories = ["apps/web/src", "apps/web/e2e"];
const guardRules = [
  {
    name: "E2E_TEST_PASSWORD fallback operator",
    pattern: /\bE2E_TEST_PASSWORD\s*(?:\?\?|\|\|)/u,
  },
  {
    name: "deprecated E2E password literal",
    pattern: /WhisprE2E!2026/u,
  },
];

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(path);
    }
    return entry.isFile() ? [path] : [];
  });
}

export function findHardcodedPasswordFallbacks({ files }) {
  const violations = [];
  for (const path of files) {
    if (statSync(path).size === 0) {
      continue;
    }

    const source = readFileSync(path);
    if (source.includes(0)) {
      continue;
    }

    const text = source.toString("utf8");
    for (const rule of guardRules) {
      if (rule.pattern.test(text)) {
        violations.push({ path, rule: rule.name });
      }
    }
  }
  return violations;
}

function main() {
  const files = defaultDirectories.flatMap((directory) =>
    collectFiles(join(repositoryRoot, directory)),
  );
  const violations = findHardcodedPasswordFallbacks({ files });
  if (violations.length === 0) {
    console.log("E2E password guard passed.");
    return;
  }

  console.error("Hardcoded E2E password fallback found:");
  for (const violation of violations) {
    console.error(`  ${relative(repositoryRoot, violation.path)} (${violation.rule})`);
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main();
}

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const webRelativePath = "apps/web";
const lintableExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const requiredWebInputs = ["eslint.config.mjs", "package.json"];
const gitLocalEnvironmentVariables = execFileSync("git", ["rev-parse", "--local-env-vars"], {
  cwd: repositoryRoot,
  encoding: "utf8",
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function gitEnvironment(root) {
  const environment = { ...process.env };
  for (const variable of gitLocalEnvironmentVariables) {
    delete environment[variable];
  }
  environment.GIT_WORK_TREE = root;
  return environment;
}

function runGit(root, args, { encoding = "utf8" } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding,
      env: gitEnvironment(root),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`, { cause: error });
  }
}

function parseNullDelimited(output) {
  return output ? output.split("\0").filter(Boolean).map(normalizePath) : [];
}

function toWebRelativePath(path) {
  const normalized = normalizePath(path);
  const prefix = `${webRelativePath}/`;
  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const webPath = normalized.slice(prefix.length);
  if (webPath === "" || isAbsolute(webPath) || webPath.startsWith("../")) {
    return null;
  }
  return webPath;
}

function isLintableWebFile(path) {
  return lintableExtensions.has(extname(path).toLowerCase());
}

function copyIndexFile({ destinationPath, root, snapshotRoot, sourcePath }) {
  const source = runGit(root, ["show", `:${sourcePath}`], { encoding: "buffer" });
  const destination = resolve(snapshotRoot, destinationPath);
  const snapshotRelative = relative(snapshotRoot, destination);
  if (
    snapshotRelative === "" ||
    snapshotRelative.startsWith("..") ||
    isAbsolute(snapshotRelative)
  ) {
    throw new Error(`Staged ESLint path escapes the snapshot: ${destinationPath}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, source);
}

function createSnapshot({ files, root }) {
  const webRoot = join(root, ...webRelativePath.split("/"));
  if (!existsSync(webRoot)) {
    throw new Error(`Web workspace is missing: ${webRelativePath}`);
  }

  const snapshotRoot = mkdtempSync(join(webRoot, ".staged-eslint-"));
  try {
    for (const input of new Set([...files, ...requiredWebInputs])) {
      copyIndexFile({
        destinationPath: input,
        root,
        snapshotRoot,
        sourcePath: `${webRelativePath}/${input}`,
      });
    }
    return snapshotRoot;
  } catch (error) {
    rmSync(snapshotRoot, { force: true, recursive: true });
    throw error;
  }
}

async function lintWithEslint({ cwd, files }) {
  const webPackage = join(repositoryRoot, ...webRelativePath.split("/"), "package.json");
  const { ESLint } = createRequire(webPackage)("eslint");
  const eslint = new ESLint({ cwd });
  return eslint.lintFiles(files);
}

function toDiagnostic(path, message) {
  return {
    column: message.column ?? 0,
    line: message.line ?? 0,
    message: message.message,
    path,
    ruleId: message.ruleId,
    severity: message.severity,
  };
}

export function collectStagedWebFiles({ root = repositoryRoot } = {}) {
  return parseNullDelimited(
    runGit(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]),
  )
    .map(toWebRelativePath)
    .filter((path) => path !== null && isLintableWebFile(path))
    .sort();
}

export async function checkStagedWebFiles({
  files,
  lint = lintWithEslint,
  root = repositoryRoot,
} = {}) {
  const stagedFiles = files ?? collectStagedWebFiles({ root });
  if (stagedFiles.length === 0) {
    return { checked: [], diagnostics: [], errorCount: 0, warningCount: 0 };
  }

  const snapshotRoot = createSnapshot({
    files: stagedFiles,
    root,
  });
  try {
    const results = await lint({ cwd: snapshotRoot, files: stagedFiles });
    const diagnostics = results.flatMap((result) => {
      const snapshotRelative = normalizePath(relative(snapshotRoot, result.filePath));
      const path = `${webRelativePath}/${snapshotRelative}`;
      return result.messages.map((message) => toDiagnostic(path, message));
    });
    return {
      checked: stagedFiles.map((path) => `${webRelativePath}/${path}`),
      diagnostics,
      errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === 2).length,
      warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === 1).length,
    };
  } finally {
    rmSync(snapshotRoot, { force: true, recursive: true });
  }
}

async function main() {
  const result = await checkStagedWebFiles();
  if (result.errorCount > 0) {
    console.error(`Staged ESLint failed: ${result.errorCount} error(s) in the Git index:`);
    for (const diagnostic of result.diagnostics.filter((diagnostic) => diagnostic.severity === 2)) {
      console.error(
        `  ${diagnostic.path}:${diagnostic.line}:${diagnostic.column} ${diagnostic.ruleId ?? "error"} ${diagnostic.message}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Staged ESLint passed: ${result.checked.length} web file(s) (Git index).`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as prettier from "prettier";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function runGit(root, args, { allowFailure = false, encoding = "utf8" } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding,
      stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"],
    });
  } catch (error) {
    if (allowFailure) {
      return null;
    }

    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`, { cause: error });
  }
}

function parseNullDelimited(output) {
  return output ? output.split("\0").filter(Boolean).map(normalizePath) : [];
}

function readGitHubEventBase(environment) {
  const eventPath = environment.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) {
    return null;
  }

  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    return event.pull_request?.base?.sha || event.before || null;
  } catch (error) {
    throw new Error(`Unable to read GITHUB_EVENT_PATH: ${eventPath}`, { cause: error });
  }
}

function isUsableRef(ref) {
  return typeof ref === "string" && ref.trim() !== "" && !/^0+$/.test(ref.trim());
}

function resolveCommit(root, ref) {
  if (!isUsableRef(ref)) {
    return null;
  }

  return runGit(root, ["rev-parse", "--verify", `${ref.trim()}^{commit}`], {
    allowFailure: true,
  })?.trim();
}

export function resolveBaseRef({ base, environment = process.env, root = repositoryRoot } = {}) {
  const explicit = base ?? environment.PRETTIER_BASE_REF;
  if (isUsableRef(explicit)) {
    const commit = resolveCommit(root, explicit);
    if (!commit) {
      throw new Error(`Prettier base ref does not resolve to a commit: ${explicit}`);
    }
    return commit;
  }

  const eventBase = readGitHubEventBase(environment);
  const fallbackCandidates =
    environment.GITHUB_ACTIONS === "true" ? ["HEAD^", "origin/uat"] : ["origin/uat", "HEAD^"];
  const candidates = [
    eventBase,
    environment.GITHUB_BASE_REF ? `origin/${environment.GITHUB_BASE_REF}` : null,
    ...fallbackCandidates,
  ];
  const head = resolveCommit(root, "HEAD");

  for (const candidate of candidates) {
    const commit = resolveCommit(root, candidate);
    if (commit && commit !== head) {
      return commit;
    }
  }

  return null;
}

export function collectChangedFiles({ base, root = repositoryRoot } = {}) {
  const paths = new Set();
  const add = (output) => parseNullDelimited(output).forEach((path) => paths.add(path));

  if (base) {
    add(runGit(root, ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`]));
  }
  add(runGit(root, ["diff", "--name-only", "--diff-filter=ACMR", "-z"]));
  add(runGit(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));
  add(runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]));

  return [...paths]
    .filter((path) => {
      const absolutePath = resolve(root, path);
      const repositoryRelative = relative(root, absolutePath);
      return (
        repositoryRelative !== "" &&
        !repositoryRelative.startsWith("..") &&
        !isAbsolute(repositoryRelative) &&
        existsSync(absolutePath) &&
        statSync(absolutePath).isFile()
      );
    })
    .sort();
}

export function collectStagedFiles({ root = repositoryRoot } = {}) {
  return parseNullDelimited(
    runGit(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]),
  );
}

const stagedPrettierConfigNames = new Set([
  ".editorconfig",
  ".prettierignore",
  ".prettierrc",
  ".prettierrc.cjs",
  ".prettierrc.js",
  ".prettierrc.json",
  "package.json",
  "prettier.config.cjs",
  "prettier.config.js",
]);

function collectStagedPrettierConfigFiles(root) {
  return parseNullDelimited(runGit(root, ["ls-files", "--cached", "-z"])).filter((path) =>
    stagedPrettierConfigNames.has(path.split("/").at(-1)),
  );
}

function copyStagedFileToSnapshot({ root, snapshotRoot, path }) {
  const source = runGit(root, ["show", `:${path}`], { allowFailure: true, encoding: "buffer" });
  if (source === null) {
    return;
  }

  const destination = resolve(snapshotRoot, path);
  const snapshotRelative = relative(snapshotRoot, destination);
  if (
    snapshotRelative === "" ||
    snapshotRelative.startsWith("..") ||
    isAbsolute(snapshotRelative)
  ) {
    throw new Error(`Staged path escapes the formatter snapshot: ${path}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, source);
}

function createStagedPrettierSnapshot({ files, root }) {
  const snapshotRoot = mkdtempSync(join(tmpdir(), "whispr-prettier-index-"));
  const snapshotFiles = new Set([...files, ...collectStagedPrettierConfigFiles(root)]);
  for (const path of snapshotFiles) {
    copyStagedFileToSnapshot({ root, snapshotRoot, path });
  }
  return snapshotRoot;
}

export function filterFilesByScope(files, scope) {
  if (!scope) {
    return [...files];
  }

  const normalizedScope = normalizePath(scope).replace(/^\/+|\/+$/g, "");
  return files.filter((path) => path === normalizedScope || path.startsWith(`${normalizedScope}/`));
}

async function checkSources({ files, readSource, root = repositoryRoot } = {}) {
  const ignorePath = join(root, ".prettierignore");
  const checked = [];
  const unformatted = [];
  const skipped = [];

  for (const path of [...new Set(files)].sort()) {
    const absolutePath = resolve(root, path);
    const fileInfo = await prettier.getFileInfo(absolutePath, {
      ignorePath: existsSync(ignorePath) ? ignorePath : undefined,
      withNodeModules: false,
    });
    if (fileInfo.ignored || !fileInfo.inferredParser) {
      skipped.push(normalizePath(relative(root, absolutePath)));
      continue;
    }

    const normalizedPath = normalizePath(relative(root, absolutePath));
    const source = readSource(path, absolutePath);
    const sourceBuffer = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
    if (sourceBuffer.includes(0)) {
      skipped.push(normalizedPath);
      continue;
    }
    const sourceText = sourceBuffer.toString("utf8");
    const config = (await prettier.resolveConfig(absolutePath, { editorconfig: true })) ?? {};
    const formatted = await prettier.format(sourceText, {
      ...config,
      filepath: absolutePath,
    });

    checked.push(normalizedPath);
    if (sourceText !== formatted) {
      unformatted.push(normalizedPath);
    }
  }

  return { checked, skipped, unformatted };
}

export async function checkFiles({ files, root = repositoryRoot } = {}) {
  return checkSources({
    files,
    root,
    readSource: (_path, absolutePath) => readFileSync(absolutePath),
  });
}

export async function checkStagedFiles({ files, root = repositoryRoot } = {}) {
  const snapshotRoot = createStagedPrettierSnapshot({ files, root });
  try {
    return await checkFiles({ files, root: snapshotRoot });
  } finally {
    rmSync(snapshotRoot, { force: true, recursive: true });
  }
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--staged") {
      options.staged = true;
      continue;
    }
    if (argument !== "--base" && argument !== "--scope") {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }
  if (options.staged && (options.base || options.scope)) {
    throw new Error("--staged cannot be combined with --base or --scope");
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const base = options.staged ? null : resolveBaseRef({ base: options.base });
  const changedFiles = options.staged ? collectStagedFiles() : collectChangedFiles({ base });
  const scopedFiles = options.staged
    ? changedFiles
    : filterFilesByScope(changedFiles, options.scope);
  const result = options.staged
    ? await checkStagedFiles({ files: scopedFiles })
    : await checkFiles({ files: scopedFiles });
  const baseLabel = options.staged ? "Git index" : base ? base.slice(0, 12) : "working tree";

  if (result.unformatted.length > 0) {
    console.error(
      `Format check failed: ${result.unformatted.length} changed file(s) need Prettier (${baseLabel} baseline):`,
    );
    for (const path of result.unformatted) {
      console.error(`  ${path}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Format check passed: ${result.checked.length} supported changed file(s) (${baseLabel} baseline).`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

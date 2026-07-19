import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as prettier from "prettier";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function runGit(root, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
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

export function filterFilesByScope(files, scope) {
  if (!scope) {
    return [...files];
  }

  const normalizedScope = normalizePath(scope).replace(/^\/+|\/+$/g, "");
  return files.filter((path) => path === normalizedScope || path.startsWith(`${normalizedScope}/`));
}

export async function checkFiles({ files, root = repositoryRoot } = {}) {
  const ignorePath = join(root, ".prettierignore");
  const checked = [];
  const unformatted = [];

  for (const path of [...new Set(files)].sort()) {
    const absolutePath = resolve(root, path);
    const fileInfo = await prettier.getFileInfo(absolutePath, {
      ignorePath: existsSync(ignorePath) ? ignorePath : undefined,
      withNodeModules: false,
    });
    if (fileInfo.ignored || !fileInfo.inferredParser) {
      continue;
    }

    const normalizedPath = normalizePath(relative(root, absolutePath));
    const source = readFileSync(absolutePath, "utf8");
    const config = (await prettier.resolveConfig(absolutePath, { editorconfig: true })) ?? {};
    const formatted = await prettier.format(source, {
      ...config,
      filepath: absolutePath,
    });

    checked.push(normalizedPath);
    if (source !== formatted) {
      unformatted.push(normalizedPath);
    }
  }

  return { checked, unformatted };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
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
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const base = resolveBaseRef({ base: options.base });
  const changedFiles = collectChangedFiles({ base });
  const scopedFiles = filterFilesByScope(changedFiles, options.scope);
  const result = await checkFiles({ files: scopedFiles });
  const baseLabel = base ? base.slice(0, 12) : "working tree";

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

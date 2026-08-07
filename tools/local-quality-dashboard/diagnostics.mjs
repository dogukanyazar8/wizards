import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const DEFAULT_MAX_LOG_LINES = 80;
const DEFAULT_MAX_EXCERPT_LINES = 12;
const MAX_SOURCES = 8;
const SOURCE_PATTERN =
  /(?<path>(?:[a-z]:[\\/])?(?:(?:\.{1,2}|[\w@-]+)[\\/])+(?:[\w@(). -]+)\.(?:[cm]?[jt]sx?|rs|ps1|psm1|json|md|sql|prisma|css|html|ya?ml))(?::(?<line>\d+)(?::(?<column>\d+))?|\((?<parenLine>\d+),(?<parenColumn>\d+)\))/giu;
const SPECIFIC_ERROR_PATTERN =
  /(?:\b(?:type|syntax|reference|range|assertion)?error\b|\bexception\b|\bfatal\b|\bassert(?:ion)?\b|\bpanic(?:ked)?\b)/iu;
const GENERIC_ERROR_PATTERN = /\b(?:fail(?:ed|ure)?|invalid|missing|blocked)\b/iu;

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function cleanLine(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/gu, " ")
    .trim()
    .slice(0, 2_000);
}

function sourceKey(source) {
  return `${source.path}:${source.line}:${source.column ?? ""}`;
}

export function createSourceReferenceExtractor(repositoryRoot) {
  const root = resolve(repositoryRoot);
  return function extractSourceReferences(lines) {
    const references = [];
    const seen = new Set();
    for (const rawLine of lines ?? []) {
      const line = cleanLine(rawLine);
      SOURCE_PATTERN.lastIndex = 0;
      for (const match of line.matchAll(SOURCE_PATTERN)) {
        const rawPath = match.groups?.path?.trim();
        if (!rawPath) continue;
        const absolutePath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(root, rawPath);
        const relativePath = relative(root, absolutePath);
        if (
          relativePath === "" ||
          relativePath === ".." ||
          relativePath.startsWith(`..${sep}`) ||
          isAbsolute(relativePath) ||
          !existsSync(absolutePath)
        ) {
          continue;
        }
        const source = {
          path: relativePath.replaceAll("\\", "/"),
          line: Number(match.groups.line ?? match.groups.parenLine),
          column: Number(match.groups.column ?? match.groups.parenColumn) || null,
        };
        const key = sourceKey(source);
        if (seen.has(key)) continue;
        seen.add(key);
        references.push(source);
        if (references.length === MAX_SOURCES) return references;
      }
    }
    return references;
  };
}

export function createProfileDiagnosticState({
  maxLogLines = DEFAULT_MAX_LOG_LINES,
  maxExcerptLines = DEFAULT_MAX_EXCERPT_LINES,
} = {}) {
  return {
    blockedReasons: [],
    issues: [],
    logTail: [],
    maxExcerptLines: positiveInteger(maxExcerptLines, DEFAULT_MAX_EXCERPT_LINES),
    maxLogLines: positiveInteger(maxLogLines, DEFAULT_MAX_LOG_LINES),
    sources: [],
  };
}

function addSources(state, sources) {
  const seen = new Set(state.sources.map(sourceKey));
  for (const source of sources) {
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    state.sources.push(source);
    if (state.sources.length === MAX_SOURCES) return;
  }
}

export function recordDiagnosticLog(state, value, extractSources = () => []) {
  const line = cleanLine(value);
  if (!line) return;
  state.logTail.push(line);
  if (state.logTail.length > state.maxLogLines) {
    state.logTail.splice(0, state.logTail.length - state.maxLogLines);
  }
  addSources(state, extractSources([line]));
}

function bestLogReason(lines) {
  let best = null;
  let bestScore = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let score = 0;
    if (SPECIFIC_ERROR_PATTERN.test(line)) score += 4;
    if (GENERIC_ERROR_PATTERN.test(line)) score += 1;
    SOURCE_PATTERN.lastIndex = 0;
    if (SOURCE_PATTERN.test(line)) score += 2;
    if (score >= bestScore && score > 0) {
      best = line;
      bestScore = score;
    }
  }
  return best;
}

function fallbackReason(status, exitCode) {
  if (status === "BLOCKED") return "Required local prerequisite is not satisfied.";
  return Number.isInteger(exitCode)
    ? `Process exited with code ${exitCode}.`
    : "Profile failed without a process exit code.";
}

function createIssue(state, event) {
  const status = event.status;
  const structuredReason = cleanLine(event.detail);
  const blockedReason = status === "BLOCKED" ? state.blockedReasons.at(-1)?.detail : "";
  const reason =
    structuredReason || blockedReason || bestLogReason(state.logTail) || fallbackReason(status);
  return {
    id: `issue-${state.issues.length + 1}`,
    status,
    stepId: cleanLine(event.stepId) || null,
    reason,
    command: cleanLine(event.command) || null,
    exitCode: Number.isInteger(event.exitCode) ? event.exitCode : null,
    nextAction:
      cleanLine(event.nextAction) ||
      (status === "BLOCKED" ? state.blockedReasons.at(-1)?.nextAction : "") ||
      null,
    sources: state.sources.map((source) => ({ ...source })),
    excerpt: state.logTail.slice(-state.maxExcerptLines),
  };
}

export function recordDiagnosticEvent(state, event) {
  if (event?.type === "precondition.completed" && event.status === "BLOCKED") {
    state.blockedReasons.push({
      detail: cleanLine(event.detail),
      nextAction: cleanLine(event.nextAction),
    });
    if (state.blockedReasons.length > 12) state.blockedReasons.shift();
    return;
  }
  if (event?.type === "step.completed" && ["FAIL", "BLOCKED"].includes(event.status)) {
    state.issues.push(createIssue(state, event));
  }
}

export function finalizeProfileIssues(state, outcome) {
  const status = ["FAIL", "BLOCKED"].includes(outcome?.status) ? outcome.status : null;
  if (status && state.issues.length === 0) {
    state.issues.push(
      createIssue(state, {
        status,
        exitCode: outcome.exitCode,
        detail: fallbackReason(status, outcome.exitCode),
      }),
    );
  }
  return state.issues.map((issue) => ({
    ...issue,
    exitCode:
      issue.exitCode === null && issue.status === status && Number.isInteger(outcome?.exitCode)
        ? outcome.exitCode
        : issue.exitCode,
    sources: issue.sources.map((source) => ({ ...source })),
    excerpt: [...issue.excerpt],
  }));
}

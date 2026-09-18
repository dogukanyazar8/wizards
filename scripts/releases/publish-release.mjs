import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function changeFromCommit(title, labels = []) {
  if (
    labels.some((label) =>
      /^(?:security|internal|dependencies|release-note:skip|skip-changelog)$/iu.test(label),
    )
  )
    return null;
  if (/^[a-z]+\((?:admin|ci|build|deps|security|tooling|test)\)!?:/u.test(title)) return null;
  const match = /^(feat|fix|perf|refactor)(?:\([^\n)]+\))?!?:\s+(.+)$/u.exec(title);
  const type = labels.includes("bug")
    ? "FIXED"
    : labels.includes("enhancement")
      ? "NEW"
      : match?.[1] === "feat"
        ? "NEW"
        : match?.[1] === "fix"
          ? "FIXED"
          : match
            ? "IMPROVED"
            : null;
  if (!type) return null;
  return {
    type,
    title: (match?.[2] ?? title).replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 200),
  };
}

export async function verifyRemotePackage(item, fetcher = fetch) {
  const url = new URL(item.url);
  if (
    url.origin !== "https://updates.whispr.team" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/(desktop|mobile)\/(uat|stable|production)\/releases\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(
      url.pathname,
    )
  )
    throw new Error("Invalid package origin/path");
  if (!Number.isSafeInteger(item.sizeBytes) || item.sizeBytes <= 0 || item.sizeBytes > 2147483647)
    throw new Error("Invalid package size");
  const response = await fetcher(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok || !response.body)
    throw new Error(`Package verification HTTP ${response.status}`);
  const digest = createHash("sha256");
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > item.sizeBytes) throw new Error("Remote package size exceeds manifest");
    digest.update(chunk);
  }
  if (size !== item.sizeBytes) throw new Error("Remote package size mismatch");
  if (digest.digest("hex") !== item.sha256) throw new Error("Remote package digest mismatch");
  if (item.signature) {
    const signature = await fetcher(`${item.url}.sig`, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!signature.ok || Number(signature.headers.get("content-length") ?? 0) > 4096)
      throw new Error("Remote signature unavailable");
    const reader = signature.body?.getReader();
    if (!reader) throw new Error("Remote signature missing");
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 4096) throw new Error("Remote signature too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    if (Buffer.concat(chunks).toString("utf8").trim() !== item.signature.trim())
      throw new Error("Remote signature mismatch");
  }
}

async function github(path) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error(`GitHub release notes HTTP ${response.status}`);
  return response.json();
}

export async function generateChanges(input, baselineSha) {
  const paths =
    input.product === "DESKTOP"
      ? [
          "apps/desktop",
          "apps/web",
          "packages/ui",
          "packages/types",
          "packages/voice",
          "packages/settings",
        ]
      : ["apps/mobile", "packages/types", "packages/voice", "packages/settings"];
  const git = (args) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }).trim();
  if (baselineSha) git(["merge-base", "--is-ancestor", baselineSha, input.sourceSha]);
  // The initial release has no trustworthy prior boundary: describe its tip only.
  const range = baselineSha ? `${baselineSha}..${input.sourceSha}` : input.sourceSha;
  const lines = git([
    "log",
    `--max-count=${baselineSha ? 201 : 1}`,
    "--format=%H%x09%s",
    range,
    "--",
    ...paths,
  ])
    .split("\n")
    .filter(Boolean);
  if (lines.length > 200)
    throw new Error(
      "More than 200 relevant commits; publish an intermediate release to preserve complete notes",
    );
  const changes = [],
    seen = new Set();
  for (const line of lines) {
    const [sha, ...subject] = line.split("\t");
    const pulls = await github(`commits/${sha}/pulls?per_page=100`);
    const pr = pulls.find(
      (pull) => pull.merged_at && pull.base?.repo?.full_name === process.env.GITHUB_REPOSITORY,
    );
    const key = pr ? `pr:${pr.number}` : sha;
    if (seen.has(key)) continue;
    seen.add(key);
    const change = changeFromCommit(
      pr?.title ?? subject.join("\t"),
      pr?.labels?.map((label) => label.name) ?? [],
    );
    if (change) changes.push(change);
  }
  return changes;
}

async function oidc(audience) {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set("audience", audience);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`OIDC HTTP ${response.status}`);
  const { value } = await response.json();
  if (typeof value !== "string") throw new Error("OIDC token missing");
  return value;
}

export async function publishManifest(manifestPath) {
  const input = JSON.parse(await readFile(manifestPath, "utf8"));
  const origin =
    input.channel === "UAT" ? "https://wizardsweb-uat.up.railway.app" : "https://whispr.team";
  if (input.sourceSha !== process.env.GITHUB_SHA || input.sourceRunId !== process.env.GITHUB_RUN_ID)
    throw new Error("Manifest provenance differs from workflow");
  const audience = `${origin}/release-publication`;
  for (const item of input.packages) await verifyRemotePackage(item);
  if (input.product === "DESKTOP") {
    const ring = input.channel === "UAT" ? "uat" : "stable";
    const canonical = `${origin}/api/v1/releases/desktop/${ring}/latest.json`;
    // Old installed clients still request the R2 URL. Require its redirect before
    // publication so a withdrawal affects old and new clients through the same DB.
    const legacy = await fetch(`https://updates.whispr.team/desktop/${ring}/latest.json`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (
      ![301, 302, 307, 308].includes(legacy.status) ||
      legacy.headers.get("location") !== canonical
    )
      throw new Error(
        "Legacy updater feed must redirect to the release registry before publication",
      );
    const feed = await fetch(canonical, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (![200, 204].includes(feed.status) || feed.headers.get("x-whispr-release-registry") !== "1")
      throw new Error("Canonical updater feed is not ready");
  }
  const request = async (suffix, body) => {
    const token = await oidc(audience);
    return fetch(`${origin}/api/v1/releases/publish${suffix}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  };
  const baselineResponse = await request(`?product=${input.product}&channel=${input.channel}`);
  if (!baselineResponse.ok) throw new Error(`Publication baseline HTTP ${baselineResponse.status}`);
  const { baseline } = await baselineResponse.json();
  input.baselineSha = baseline?.sourceSha ?? null;
  // Replay still uses the immutable identity; regenerated notes are ignored by the server.
  input.changes =
    baseline?.version === input.version ? [] : await generateChanges(input, input.baselineSha);
  await writeFile(manifestPath, `${JSON.stringify(input, null, 2)}\n`);
  const response = await request("", input);
  if (!response.ok)
    throw new Error(
      `Publication HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const result = await response.json();
  if (!result.active)
    throw new Error(
      "Publication was withdrawn or superseded; refusing to update compatibility feeds",
    );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishManifest(process.argv[2]).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

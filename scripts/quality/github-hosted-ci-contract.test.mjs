import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflowsDirectory = join(root, ".github", "workflows");
const goldenImagePath = join(root, "docker", "ci", "IMAGE");
const goldenDockerfilePath = join(root, "docker", "ci", "Dockerfile");
const mobileJestConfigPath = join(root, "apps", "mobile", "jest.config.js");
const mobilePackagePath = join(root, "apps", "mobile", "package.json");
const mobileRenderHelperPath = join(
  root,
  "apps",
  "mobile",
  "component-tests",
  "render-with-mobile-query-theme.tsx",
);
const nextConfigPath = join(root, "apps", "web", "next.config.ts");
const playwrightConfigPath = join(root, "apps", "web", "playwright.config.ts");
const webPackagePath = join(root, "apps", "web", "package.json");

const approvedRunnerTargets = new Set(["ubuntu-24.04", "windows-2025"]);
const digestedImage = /^(?<name>[^\s:@]+(?::[^\s@]+)?)@sha256:[a-f0-9]{64}$/u;

function readText(path) {
  return readFileSync(path, "utf8");
}

function workflowFiles() {
  return readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .map((name) => join(workflowsDirectory, name));
}

function collectJobBlocks(source) {
  const lines = source.split(/\r?\n/u);
  const jobsLine = lines.findIndex((line) => line === "jobs:");
  assert.notEqual(jobsLine, -1, "workflow must define jobs");

  const blocks = [];
  for (let index = jobsLine + 1; index < lines.length; index += 1) {
    const job = /^  ([a-zA-Z0-9_-]+):\s*$/u.exec(lines[index]);
    if (!job) {
      continue;
    }

    const block = [lines[index]];
    for (const candidate of lines.slice(index + 1)) {
      if (/^  [a-zA-Z0-9_-]+:\s*$/u.test(candidate)) {
        break;
      }
      block.push(candidate);
    }
    blocks.push({ name: job[1], source: block.join("\n") });
  }

  return blocks;
}

test("CircleCI execution is absent", () => {
  for (const relativePath of [
    [".circleci", "config.yml"],
    [".circleci", "main.yml"],
    ["scripts", "quality", "circleci-config-contract.test.mjs"],
  ]) {
    assert.equal(
      existsSync(join(root, ...relativePath)),
      false,
      `${relativePath.join("/")} must be removed after the GitHub Actions cutover`,
    );
  }
});

test("every GitHub Actions job targets a pinned GitHub-hosted runner", () => {
  const files = workflowFiles();
  assert.ok(files.length > 0, "at least one workflow must exist");

  for (const path of files) {
    const source = readText(path);
    const jobs = collectJobBlocks(source);
    assert.ok(jobs.length > 0, `${basename(path)} must define jobs`);

    for (const job of jobs) {
      const targets = [...job.source.matchAll(/^\s+runs-on:\s*([^\s]+)\s*$/gmu)];
      assert.equal(
        targets.length,
        1,
        `${basename(path)}:${job.name} must use one hosted runner label`,
      );
      const [, target] = targets[0];
      const normalized = target
        .split(",")
        .map((label) => label.trim().toLowerCase())
        .join(",");
      assert.ok(
        approvedRunnerTargets.has(normalized),
        `${basename(path)}:${job.name} uses unapproved runner labels: [${target}]`,
      );
    }
  }
});

test("pull requests run unprivileged CI on disposable hosted runners", () => {
  const ci = readText(join(workflowsDirectory, "ci.yml"));
  assert.match(ci, /^  pull_request:/mu);
  assert.doesNotMatch(ci, /pull_request_target|self-hosted/u);
  for (const job of collectJobBlocks(ci)) {
    if (["node22-compatibility"].includes(job.name)) continue;
    assert.doesNotMatch(job.source, /github\.event_name != 'pull_request'/u);
    assert.doesNotMatch(job.source, /contents: write|environment:/u);
  }
});

test("Railway deployment stays outside Actions and keeps existing service configuration", () => {
  for (const path of workflowFiles()) {
    assert.doesNotMatch(readText(path), /RAILWAY_TOKEN|railway up|deploy-railway/u);
  }
  assert.match(readText(join(root, "railway.toml")), /healthcheckPath = "\/ready"/u);
  assert.match(readText(join(root, "railway.toml")), /db:migrate:deploy/u);
});

test("Android storage reclamation rejects persistent runners before any deletion", () => {
  const script = readText(join(root, ".github", "scripts", "prepare-hosted-android.sh"));
  assert.match(script, /RUNNER_ENVIRONMENT:-\}" == github-hosted/u);
  assert.match(script, /GITHUB_ACTIONS:-\}" == true/u);
  assert.match(script, /RUNNER_OS:-\}" == Linux/u);
  assert.ok(script.indexOf("exit 1") < script.indexOf("sudo rm"));
  assert.match(script, /available_kb.*-ge 20971520/u);
});

test("the optional local runner toolbox stays immutable and least-privileged", () => {
  const imageLines = readText(goldenImagePath)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const dockerfile = readText(goldenDockerfilePath);

  assert.equal(imageLines.length, 1, "docker/ci/IMAGE must contain one image reference");
  assert.match(imageLines[0], digestedImage, "the toolbox image must be pinned by digest");
  assert.doesNotMatch(imageLines[0], /:latest(?:@|$)/u);
  assert.match(
    dockerfile,
    /playwright@\$\{PLAYWRIGHT_VERSION\}" install --with-deps chromium firefox webkit/u,
  );
  assert.match(dockerfile, /chown -R node:node "\$\{CARGO_HOME\}" "\$\{RUSTUP_HOME\}"/u);
  assert.doesNotMatch(dockerfile, /chmod -R a\+[a-zA-Z]*w[a-zA-Z]* "\$\{CARGO_HOME\}"/u);
  assert.match(dockerfile, /^USER node$/mu, "the toolbox must not execute repository code as root");
});

test("resource-heavy hosted runner workloads keep their proven bounds", () => {
  const mobileJestConfig = readText(mobileJestConfigPath);
  const mobilePackage = JSON.parse(readText(mobilePackagePath));
  const renderHelper = readText(mobileRenderHelperPath);
  const nextConfig = readText(nextConfigPath);
  const playwrightConfig = readText(playwrightConfigPath);
  const webPackage = JSON.parse(readText(webPackagePath));

  assert.match(nextConfig, /experimental:\s*\{\s*cpus: 4,/u);
  assert.equal(mobilePackage.scripts["test:components"], "jest --maxWorkers=2");
  assert.match(mobileJestConfig, /workerIdleMemoryLimit: "512MB"/u);
  assert.match(renderHelper, /mutations: \{ gcTime: 0, retry: false \}/u);
  assert.equal(webPackage.scripts["e2e:web-server"], "pnpm run build && pnpm start");
  assert.match(
    playwrightConfig,
    /webServerEnv\.NODE_ENV = useDevelopmentWebServer \? "development" : "production";/u,
  );
});

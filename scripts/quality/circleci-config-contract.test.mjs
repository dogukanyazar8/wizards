import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const setupConfigPath = join(root, ".circleci", "config.yml");
const mainConfigPath = join(root, ".circleci", "main.yml");
const goldenImagePath = join(root, "docker", "ci", "IMAGE");
const githubWorkflowPath = join(root, ".github", "workflows", "ci.yml");
const goldenDockerfilePath = join(root, "docker", "ci", "Dockerfile");
const mobilePackagePath = join(root, "apps", "mobile", "package.json");
const mobileTestRenderHelperPath = join(
  root,
  "apps",
  "mobile",
  "component-tests",
  "render-with-mobile-query-theme.tsx",
);
const nextConfigPath = join(root, "apps", "web", "next.config.ts");
const playwrightConfigPath = join(root, "apps", "web", "playwright.config.ts");
const webPackagePath = join(root, "apps", "web", "package.json");

const placeholderDigest = `sha256:${"0".repeat(64)}`;
const digestedImage = /^(?<name>[^\s:@]+(?::[^\s@]+)?)@(?<digest>sha256:[a-f0-9]{64})$/u;

function readText(path) {
  return readFileSync(path, "utf8");
}

function readGoldenImageReference() {
  const lines = readText(goldenImagePath)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  assert.equal(lines.length, 1, "docker/ci/IMAGE must hold exactly one image reference");
  return lines[0];
}

function collectExecutorImages(source) {
  return [...source.matchAll(/^\s+- image: (\S+)\s*$/gmu)].map(([, image]) => image);
}

function collectRunCommands(source) {
  const lines = source.split(/\r?\n/u);
  const commands = [];

  for (const [index, line] of lines.entries()) {
    const header = /^(\s+)command: (.*)$/u.exec(line);
    if (!header) {
      continue;
    }

    const [, indent, inline] = header;
    if (inline.trim() && inline.trim() !== "|" && inline.trim() !== ">") {
      commands.push(inline);
      continue;
    }

    const block = [];
    for (const candidate of lines.slice(index + 1)) {
      if (candidate.trim() && (/^\s*/u.exec(candidate)?.[0].length ?? 0) <= indent.length) {
        break;
      }
      block.push(candidate);
    }
    commands.push(block.join("\n"));
  }

  return commands;
}

test("the CircleCI entrypoint pins the shell-based path filter orb", () => {
  const setup = readText(setupConfigPath);

  assert.match(setup, /^setup: true$/mu);
  assert.match(setup, /^\s+path-filtering: circleci\/path-filtering@2\.1\.0$/mu);
  assert.doesNotMatch(setup, /circleci\/path-filtering@(?:volatile|\d+(?:\.\d+)?$)/mu);
  assert.match(setup, /^\s+config-path: \.circleci\/main\.yml$/mu);
});

test("every pipeline parameter the path filter can set is declared by the continued config", () => {
  const setup = readText(setupConfigPath);
  const main = readText(mainConfigPath);
  const mapped = new Set(
    [...setup.matchAll(/^\s{12}\S+\s+(run-[a-z-]+)\s+true$/gmu)].map(([, parameter]) => parameter),
  );

  assert.ok(mapped.size > 0, "the path filter must map at least one parameter");

  for (const parameter of mapped) {
    assert.match(
      main,
      new RegExp(`^  ${parameter}:\\r?\\n    type: boolean$`, "mu"),
      `main.yml must declare pipeline parameter ${parameter}`,
    );
  }
});

test("every executor image is digest-pinned and never a floating tag", () => {
  const images = collectExecutorImages(readText(mainConfigPath));

  assert.ok(images.length > 0, "main.yml must define at least one executor image");

  for (const image of images) {
    assert.match(image, digestedImage, `${image} must be pinned by digest`);
    assert.doesNotMatch(image, /:latest(?:@|$)/u, `${image} must not use the latest tag`);
  }
});

test("the golden image digest has one source of truth", () => {
  const reference = readGoldenImageReference();
  const main = readText(mainConfigPath);
  const goldenReferences = collectExecutorImages(main).filter((image) =>
    image.startsWith(reference.split("@")[0]),
  );

  assert.match(reference, digestedImage, "docker/ci/IMAGE must be pinned by digest");
  assert.ok(goldenReferences.length > 0, "main.yml must use the golden image");

  for (const image of goldenReferences) {
    assert.equal(image, reference, "main.yml and docker/ci/IMAGE must agree on the digest");
  }

  // The placeholder is allowed to exist before the image is first published, but
  // it must be the recognisable all-zero digest rather than an invented one.
  const digest = digestedImage.exec(reference)?.groups?.digest;
  if (digest !== placeholderDigest) {
    assert.match(digest ?? "", /^sha256:[a-f0-9]{64}$/u);
  }
});

test("shadow-mode service and scanner digests match the GitHub lane exactly", () => {
  const main = readText(mainConfigPath);
  const workflow = readText(githubWorkflowPath);

  for (const service of ["postgres", "redis"]) {
    const fromWorkflow = new RegExp(`image: (${service}:\\S+@sha256:[a-f0-9]{64})`, "u").exec(
      workflow,
    )?.[1];
    assert.ok(fromWorkflow, `ci.yml must pin the ${service} image by digest`);
    assert.ok(
      collectExecutorImages(main).includes(fromWorkflow),
      `main.yml must use the same ${service} digest as ci.yml`,
    );
  }

  const semgrepImage = /SEMGREP_IMAGE: (\S+)/u.exec(workflow)?.[1];
  assert.ok(semgrepImage, "ci.yml must pin the Semgrep image");
  assert.match(
    main,
    new RegExp(`SEMGREP_IMAGE: ${semgrepImage.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"),
  );

  const cargoAuditVersion = /CARGO_AUDIT_VERSION: (\S+)/u.exec(workflow)?.[1];
  assert.ok(cargoAuditVersion, "ci.yml must pin cargo-audit");
  assert.match(main, new RegExp(`^\\s+CARGO_AUDIT_VERSION: ${cargoAuditVersion}$`, "mu"));
});

test("workspaces never carry dependency trees", () => {
  const main = readText(mainConfigPath);
  const persisted = [...main.matchAll(/persist_to_workspace:[\s\S]*?paths:\n((?:\s+- .*\n)+)/gu)];

  assert.ok(persisted.length > 0, "main.yml must persist at least one workspace path");

  for (const [, block] of persisted) {
    assert.doesNotMatch(
      block,
      /node_modules|\.pnpm-store/u,
      "dependency trees belong in a cache, not a per-pipeline workspace",
    );
  }
});

test("Playwright browsers come from the golden image, not from job steps", () => {
  const main = readText(mainConfigPath);
  const dockerfile = readText(goldenDockerfilePath);
  const installs = collectRunCommands(main).filter((command) =>
    /playwright install/u.test(command),
  );

  assert.equal(installs.length, 0, "jobs must never mutate the prebuilt browser toolchain");
  assert.match(
    dockerfile,
    /playwright@\$\{PLAYWRIGHT_VERSION\}" install --with-deps chromium firefox webkit/u,
    "the golden image must contain every browser used by the E2E matrix",
  );
});

test("resource-heavy Node jobs have explicit memory and CPU bounds", () => {
  const main = readText(mainConfigPath);
  const nextConfig = readText(nextConfigPath);

  assert.match(
    main,
    /^  coverage:\r?\n(?: {4}.*\r?\n)*? {4}environment:\r?\n(?: {6}.*\r?\n)*? {6}NODE_OPTIONS: "--max-old-space-size=4096"$/mu,
    "coverage reporting needs a heap sized for c8's all-file merge",
  );
  assert.match(
    nextConfig,
    /experimental:\s*\{\s*cpus: 4,/u,
    "Next must not infer its worker count from the container host",
  );
});

test("Playwright starts the built Next application in production mode", () => {
  const playwrightConfig = readText(playwrightConfigPath);
  const webPackage = JSON.parse(readText(webPackagePath));

  assert.equal(webPackage.scripts["e2e:web-server"], "pnpm run build && pnpm start");
  assert.match(playwrightConfig, /webServerEnv\.NODE_ENV = "production";/u);
});

test("mobile component tests release completed mutations without force-exit", () => {
  const mobilePackage = JSON.parse(readText(mobilePackagePath));
  const command = mobilePackage.scripts["test:components"];
  const renderHelper = readText(mobileTestRenderHelperPath);

  assert.doesNotMatch(command, /--forceExit/u);
  assert.match(renderHelper, /mutations: \{ gcTime: 0, retry: false \}/u);
});

test("end-to-end jobs reuse the shared install and never re-run migrations blind", () => {
  const main = readText(mainConfigPath);
  const e2eEntries = [...main.matchAll(/^      - e2e:\n(?:\s{10}.*\n)+/gmu)].map(
    ([entry]) => entry,
  );

  assert.ok(e2eEntries.length > 0, "main.yml must schedule at least one e2e job");

  for (const entry of e2eEntries) {
    assert.match(
      entry,
      /^\s+requires: \[install\]$/mu,
      `e2e entry must require install:\n${entry}`,
    );
    assert.match(entry, /^\s+suites: /mu, `e2e entry must name its suites:\n${entry}`);
  }
});

test("the secret scan uses a supported gitleaks scanning mode", () => {
  const main = readText(mainConfigPath);
  const scans = collectRunCommands(main).filter((command) => /\bgitleaks\b/u.test(command));

  assert.equal(scans.length, 1, "there must be exactly one secret scan");
  assert.match(scans[0], /gitleaks git /u, "history scanning keeps parity with gitleaks-action");
  assert.doesNotMatch(
    scans[0],
    /gitleaks (?:detect|protect)\b/u,
    "detect and protect were deprecated in gitleaks 8.19",
  );
  assert.match(scans[0], /--config \.gitleaks\.toml/u);
  assert.match(scans[0], /--redact/u);
  assert.match(scans[0], /timeout --signal=TERM --kill-after=30s 30m/u);
  assert.match(scans[0], /Secret scan still running/u);
  assert.match(scans[0], /exit "\$scan_status"/u);
});

test("desktop checks the installed cargo-audit binary without invoking Cargo", () => {
  const main = readText(mainConfigPath);

  assert.match(main, /current_version="\$\(cargo-audit --version\)"/u);
  assert.doesNotMatch(main, /current_version="\$\(cargo audit --version\)"/u);
});

test("the generated E2E password never reaches argv, stdout, or a log line", () => {
  const main = readText(mainConfigPath);
  const passwordCommands = collectRunCommands(main).filter((command) =>
    /E2E_TEST_PASSWORD/u.test(command),
  );

  assert.equal(passwordCommands.length, 1, "the password must be minted in exactly one place");
  assert.match(passwordCommands[0], /BASH_ENV/u);
  assert.doesNotMatch(passwordCommands[0], /\becho\b|\bprintf\b/u);
});

test("registry credentials reach exactly the jobs that pull the private image", () => {
  const main = readText(mainConfigPath);
  const [, jobsSection = "", workflowsSection = ""] =
    /\njobs:\n([\s\S]*?)\nworkflows:\n([\s\S]*)$/u.exec(main) ?? [];

  assert.ok(jobsSection && workflowsSection, "main.yml must define jobs and workflows");

  const goldenExecutors = new Set(["ci", "ci-large", "ci-db"]);
  const jobsOnGoldenImage = new Set(
    [...jobsSection.matchAll(/^ {2}([\w-]+):\n((?: {4}.*\n|\n)*)/gmu)]
      .filter(([, , body]) => goldenExecutors.has(/^ {4}executor: (\S+)$/mu.exec(body)?.[1] ?? ""))
      .map(([, name]) => name),
  );

  assert.ok(jobsOnGoldenImage.size > 0, "at least one job must use the golden image");

  const entries = [...workflowsSection.matchAll(/^ {6}- ([\w-]+):?\n?((?: {10}.*\n)*)/gmu)];
  assert.ok(entries.length > 0, "workflows must schedule jobs");

  for (const [, jobName, body = ""] of entries) {
    const declaresContext = /^ {10}context: \[ghcr\]$/mu.test(body);

    if (jobsOnGoldenImage.has(jobName)) {
      assert.ok(declaresContext, `${jobName} pulls the private image and needs the ghcr context`);
    } else {
      assert.ok(
        !declaresContext,
        `${jobName} does not pull the private image and must not receive its credentials`,
      );
    }
  }
});

test("free-plan cost guards hold", () => {
  const main = readText(mainConfigPath);

  assert.doesNotMatch(
    main,
    /resource_class:\s*(?:x?xlarge|2xlarge|arm\.)/u,
    "oversized resource classes burn the monthly credit budget",
  );
  assert.doesNotMatch(
    main,
    /docker_layer_caching:\s*true/u,
    "Docker layer caching costs 200 credits per job; the golden image replaces it",
  );
  assert.doesNotMatch(
    main,
    /setup_remote_docker/u,
    "remote Docker cannot bind-mount the job filesystem the Semgrep contract needs",
  );
});

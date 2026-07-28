import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { build } from "esbuild";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

async function getOutboxWorkerExternalImports() {
  const result = await build({
    bundle: true,
    entryPoints: [resolve(repoRoot, "apps/web/scripts/run-outbox-worker.ts")],
    format: "esm",
    logLevel: "silent",
    metafile: true,
    packages: "external",
    platform: "node",
    target: "node22",
    tsconfig: resolve(repoRoot, "apps/web/tsconfig.json"),
    write: false,
  });

  return Object.values(result.metafile.inputs).flatMap((input) =>
    input.imports.filter((dependency) => dependency.external).map((dependency) => dependency.path),
  );
}

async function getServerBundleDependencyGraph() {
  const result = await build({
    bundle: true,
    entryPoints: [resolve(repoRoot, "apps/web/server.ts")],
    format: "esm",
    logLevel: "silent",
    metafile: true,
    packages: "external",
    platform: "node",
    target: "node22",
    tsconfig: resolve(repoRoot, "apps/web/tsconfig.json"),
    write: false,
  });

  return {
    externalImports: Object.values(result.metafile.inputs).flatMap((input) =>
      input.imports
        .filter((dependency) => dependency.external)
        .map((dependency) => dependency.path),
    ),
    inputs: Object.keys(result.metafile.inputs),
  };
}

describe("outbox worker railway contract", () => {
  it("disables the in-process worker on the web service", () => {
    const webConfig = readRepoFile("railway.toml");

    assert.match(
      webConfig,
      /startCommand = "WHISPR_OUTBOX_WORKER=false pnpm --filter @wizards\/web start"/,
    );
  });

  it("runs the outbox worker as a separate non-migrating service", () => {
    const workerConfig = readRepoFile("railway.outbox-worker.toml");

    assert.match(
      workerConfig,
      /startCommand = "WHISPR_OUTBOX_WORKER=true pnpm --filter @wizards\/web start:outbox-worker"/,
    );
    assert.match(workerConfig, /restartPolicyType = "ON_FAILURE"/);
    assert.doesNotMatch(workerConfig, /preDeployCommand/);
    assert.doesNotMatch(workerConfig, /healthcheckPath/);
  });

  it("keeps campaign delivery out of the web-session dependency graph", () => {
    const campaignService = readRepoFile("apps/web/src/lib/admin/notification-campaigns.ts");
    const auditLog = readRepoFile("apps/web/src/lib/admin/audit-log.ts");

    assert.match(campaignService, /from "@\/lib\/admin\/audit-log"/);
    assert.doesNotMatch(campaignService, /from "@\/lib\/admin\/access"/);
    assert.doesNotMatch(auditLog, /from "@\/auth"/);
    assert.doesNotMatch(auditLog, /from "next-auth"/);
  });

  it("keeps the worker bundle out of the NextAuth dependency graph", async () => {
    const externalImports = await getOutboxWorkerExternalImports();

    assert.ok(
      !externalImports.some(
        (dependency) => dependency === "next-auth" || dependency.startsWith("next-auth/"),
      ),
      `outbox worker imports NextAuth: ${externalImports.filter((dependency) => dependency.startsWith("next-auth")).join(", ")}`,
    );
  });
});

describe("raw Node server bundle contract", () => {
  it("keeps request-context auth out of the bootstrap dependency graph", async () => {
    const dependencyGraph = await getServerBundleDependencyGraph();

    assert.ok(
      !dependencyGraph.inputs.some((input) => input === "src/auth.ts"),
      "server bundle imports src/auth.ts before Next initializes request context",
    );
    assert.ok(
      !dependencyGraph.externalImports.some((dependency) =>
        /^next\/headers(?:\.js)?$/.test(dependency),
      ),
      "server bundle imports next/headers before Next initializes AsyncLocalStorage",
    );
  });
});

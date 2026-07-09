import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
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
});

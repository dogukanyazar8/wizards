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

  it("keeps campaign delivery out of the web-session dependency graph", () => {
    const campaignService = readRepoFile("apps/web/src/lib/admin/notification-campaigns.ts");
    const auditLog = readRepoFile("apps/web/src/lib/admin/audit-log.ts");

    assert.match(campaignService, /from "@\/lib\/admin\/audit-log"/);
    assert.doesNotMatch(campaignService, /from "@\/lib\/admin\/access"/);
    assert.doesNotMatch(auditLog, /from "@\/auth"/);
    assert.doesNotMatch(auditLog, /from "next-auth"/);
  });
});

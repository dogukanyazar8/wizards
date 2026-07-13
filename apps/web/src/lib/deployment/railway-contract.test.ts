import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RAILWAY_CONFIG_PATH = fileURLToPath(new URL("../../../../../railway.toml", import.meta.url));

function parseStringTable(source: string, tableName: string) {
  const values: Record<string, string> = {};
  let activeTable = "";

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const table = /^\[([^\]]+)]$/.exec(line);
    if (table) {
      activeTable = table[1] ?? "";
      continue;
    }

    if (activeTable !== tableName) {
      continue;
    }

    const entry = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*"((?:\\.|[^"\\])*)"\s*$/.exec(line);
    if (!entry) {
      continue;
    }

    const [, key, rawValue] = entry;
    assert.ok(key, `Missing TOML key at line ${index + 1}`);
    assert.ok(rawValue !== undefined, `Missing TOML value for ${key}`);
    assert.equal(values[key], undefined, `Duplicate [${tableName}].${key}`);
    values[key] = JSON.parse(`"${rawValue}"`) as string;
  }

  return values;
}

describe("Railway deployment contract", () => {
  it("runs Prisma migrations before the current web start command and /ready health check", () => {
    const deployment = parseStringTable(readFileSync(RAILWAY_CONFIG_PATH, "utf8"), "deploy");

    assert.deepEqual(
      {
        healthcheckPath: deployment.healthcheckPath,
        preDeployCommand: deployment.preDeployCommand,
        startCommand: deployment.startCommand,
      },
      {
        healthcheckPath: "/ready",
        preDeployCommand: "pnpm --filter @wizards/db db:migrate:deploy",
        startCommand: "WHISPR_OUTBOX_WORKER=false pnpm --filter @wizards/web start",
      },
    );
  });
});

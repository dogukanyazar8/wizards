import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(prismaDir, "rebaseline-migrations", "20260813110000_auth_sessions", "migration.sql"),
  "utf8",
);

function modelBody(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\n\\}`));
  assert.ok(match, `${name} model is missing`);
  return match[1];
}

describe("AuthSession schema", () => {
  it("stores only safe session metadata and lifecycle state", () => {
    const body = modelBody("AuthSession");
    assert.match(body, /id\s+String\s+@id/);
    assert.match(body, /userId\s+String/);
    assert.match(body, /clientType\s+AnalyticsClientType/);
    assert.match(body, /deviceType\s+AnalyticsDeviceType/);
    assert.match(body, /lastSeenAt\s+DateTime/);
    assert.match(body, /expiresAt\s+DateTime/);
    assert.match(body, /revokedAt\s+DateTime\?/);
    assert.doesNotMatch(body, /token|refreshToken|ipAddress|userAgent|ipHash|userAgentHash/);
  });

  it("indexes active user lists and expiration cleanup", () => {
    const body = modelBody("AuthSession");
    assert.match(body, /@@index\(\[userId, revokedAt, lastSeenAt\]\)/);
    assert.match(body, /@@index\(\[expiresAt\]\)/);
    assert.match(body, /onDelete: Cascade/);
  });

  it("ships an additive table migration with no sensitive columns", () => {
    assert.match(migration, /CREATE TABLE "AuthSession"/);
    assert.match(migration, /FOREIGN KEY \("userId"\).*ON DELETE CASCADE/);
    assert.match(migration, /AuthSession_userId_revokedAt_lastSeenAt_idx/);
    assert.match(migration, /AuthSession_expiresAt_idx/);
    assert.doesNotMatch(migration, /token|refreshToken|ipAddress|userAgent|ipHash|userAgentHash/i);
    assert.doesNotMatch(migration, /DROP |ALTER COLUMN|UPDATE\s+"/);
  });
});

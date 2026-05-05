import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "../../packages/db/prisma/migrations/20260422000000_add_fulltext_search_indexes/migration.sql",
);

describe("full-text search migration SQL", () => {
  it("quotes camelCase identifiers and avoids volatile partial indexes", () => {
    const sql = readFileSync(migrationPath, "utf8");

    assert.equal(/\((replyToId|threadId|parentId|userId|joinedAt|lastMessageId)\)/.test(sql), false);
    assert.equal(/WHERE\s+"joinedAt"\s*>\s*now\(\)/i.test(sql), false);
    assert.match(sql, /"replyToId"/);
    assert.match(sql, /"serverId", "joinedAt"/);
  });
});

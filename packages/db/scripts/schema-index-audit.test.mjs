import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const prismaDir = join(packageDir, "prisma");
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

function modelBody(name) {
  const match = schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, "m"));
  assert.ok(match, `model ${name} is missing`);
  return match[1];
}

function modelIndexes(name) {
  return modelBody(name)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("@@index(") || line.startsWith("@@unique("));
}

describe("database index audit contract", () => {
  it("keeps the exact audited B-tree index set on affected models", () => {
    const expected = {
      AppSession: [
        "@@index([userId, startedAt])",
        "@@index([lastSeenAt])",
        "@@index([clientType])",
        "@@index([clientType, startedAt])",
        "@@index([countryCode])",
        "@@index([userId, lastSeenAt])",
        "@@index([startedAt])",
      ],
      Attachment: [
        "@@index([messageId])",
        "@@index([dmMessageId])",
        "@@index([scanStatus])",
        "@@index([userId])",
      ],
      ChannelReadState: [
        "@@unique([channelId, userId])",
        "@@index([userId, channelId, lastReadAt])",
        "@@index([channelId, lastReadAt])",
      ],
      ClientHealthEvent: [
        "@@index([kind, createdAt])",
        "@@index([clientType, kind, createdAt])",
        "@@index([appVersion, kind, createdAt])",
        "@@index([createdAt])",
      ],
      FriendRequest: [
        "@@unique([senderId, receiverId])",
        "@@index([receiverId])",
        "@@index([senderId, status])",
        "@@index([receiverId, status])",
      ],
      // Ana Sayfa 1a, Faz 3: `[userId]` alone cannot answer "my mentions,
      // newest first" without reading every mention the user ever received.
      //
      // Bahsedilmeler Ş0.2 adds two more, and both earn their write cost:
      //   `[userId, kind, createdAt]` — the "Türe göre" rail narrows by kind and orders by
      //   time. `kind` has three values, so filtering it after `[userId, createdAt]` means
      //   reading every mention to return a third of them.
      //   `[roleId]` — the role relation is `onDelete: SetNull`; without it, deleting one role
      //   scans the whole table.
      MessageMention: [
        "@@unique([messageId, userId])",
        "@@index([userId])",
        "@@index([userId, createdAt])",
        "@@index([userId, kind, createdAt])",
        "@@index([roleId])",
      ],
      // Ana Sayfa 1a, Faz 6: the DM twin is read by the same keyset page. It
      // never needs `[userId]` alone — nothing asks "all my DM mentions,
      // unordered".
      DMMessageMention: ["@@unique([messageId, userId])", "@@index([userId, createdAt])"],
      Notification: [
        "@@unique([dedupeKey])",
        "@@index([userId, read])",
        "@@index([userId, createdAt])",
        "@@index([campaignId])",
        "@@index([userId, read, createdAt])",
      ],
      Session: ["@@index([userId])", "@@index([expiresAt])"],
      // Ana Sayfa 1a, Faz 3: the focus sweep's only filter is `statusExpiresAt`.
      User: [
        "@@index([status])",
        "@@index([premiumType])",
        "@@index([deletedAt])",
        "@@index([statusExpiresAt])",
      ],
    };

    for (const [name, indexes] of Object.entries(expected)) {
      assert.deepEqual(modelIndexes(name), indexes, `${name} index set drifted`);
    }
  });

  it("does not duplicate unique indexes on write-heavy models", () => {
    const forbidden = {
      DMReaction: "@@index([messageId])",
      Reaction: "@@index([messageId])",
      Role: "@@index([name])",
      Server: "@@index([inviteCode])",
      ServerInvite: "@@index([code])",
      Session: "@@index([token])",
      User: "@@index([email])",
    };

    for (const [name, index] of Object.entries(forbidden)) {
      assert.ok(!modelIndexes(name).includes(index), `${name} still carries ${index}`);
    }
    assert.ok(!modelIndexes("Session").includes("@@index([refreshToken])"));
    assert.ok(!modelIndexes("User").includes("@@index([username])"));
  });

  it("preserves an invite when its optional landing channel is deleted", () => {
    assert.match(
      modelBody("ServerInvite"),
      /channel\s+Channel\?\s+@relation\(fields: \[channelId\], references: \[id\], onDelete: SetNull\)/,
    );
  });

  it("documents the code-owned DM reply cleanup while retaining Restrict", () => {
    const dmMessage = modelBody("DMMessage");
    assert.match(dmMessage, /disappearing-service\.ts/);
    assert.match(
      dmMessage,
      /reply\s+DMMessage\?\s+@relation\("DMMessageReply", fields: \[replyToId\], references: \[id\], onDelete: Restrict\)/,
    );
  });

  it("ships one idempotent audit migration in the configured directory", () => {
    const migrations = readdirSync(join(prismaDir, "rebaseline-migrations")).filter((entry) =>
      entry.endsWith("_denetim_indeksleri"),
    );
    assert.equal(migrations.length, 1);

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migrations[0], "migration.sql"),
      "utf8",
    );
    const createdIndexes = [
      "AppSession_userId_lastSeenAt_idx",
      "AppSession_startedAt_idx",
      "ChannelReadState_channelId_lastReadAt_idx",
      "FriendRequest_senderId_status_idx",
      "FriendRequest_receiverId_status_idx",
      "ClientHealthEvent_createdAt_idx",
      "Notification_userId_read_createdAt_idx",
      "Attachment_userId_idx",
      "Session_expiresAt_idx",
      "DMMessage_content_trgm_idx",
      "User_username_trgm_idx",
      "User_displayName_trgm_idx",
    ];
    for (const index of createdIndexes) {
      assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS "${index}"`));
    }

    const droppedIndexes = [
      "User_email_idx",
      "User_username_idx",
      "Session_token_idx",
      "Session_refresh_token_idx",
      "Server_invite_code_idx",
      "ServerInvite_code_idx",
      "Reaction_messageId_idx",
      "DMReaction_messageId_idx",
      "Role_name_idx",
    ];
    for (const index of droppedIndexes) {
      assert.match(sql, new RegExp(`DROP INDEX IF EXISTS "${index}"`));
    }

    assert.match(sql, /ON "DMMessage" USING GIN \("content" gin_trgm_ops\)/);
    assert.match(sql, /ON "User" USING GIN \("username" gin_trgm_ops\)/);
    assert.match(sql, /ON "User" USING GIN \("displayName" gin_trgm_ops\)/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS "ServerInvite_channelId_fkey"/);
    assert.match(sql, /ON DELETE SET NULL ON UPDATE CASCADE/);
  });

  it("ships the focus-mode columns and their sweep index in the configured directory", () => {
    const migrations = readdirSync(join(prismaDir, "rebaseline-migrations")).filter((entry) =>
      entry.endsWith("_home_focus_mode"),
    );
    assert.equal(migrations.length, 1);

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migrations[0], "migration.sql"),
      "utf8",
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "statusExpiresAt" TIMESTAMP\(3\)/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "statusRestoreTo" "UserStatus"/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "statusFocusMinutes" INTEGER/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS "User_statusExpiresAt_idx"/);
    // The rollback path is part of the contract: a focus window is recoverable
    // state, so the migration must stay droppable.
    assert.match(sql, /DROP COLUMN IF EXISTS "statusRestoreTo"/);

    const user = modelBody("User");
    assert.match(user, /statusExpiresAt\s+DateTime\?/);
    assert.match(user, /statusRestoreTo\s+UserStatus\?/);
    assert.match(user, /statusFocusMinutes\s+Int\?/);
  });

  it("creates the DM mention table, backfills it, then indexes it", () => {
    const migrations = readdirSync(join(prismaDir, "rebaseline-migrations")).filter((entry) =>
      entry.endsWith("_dm_message_mention"),
    );
    assert.equal(migrations.length, 1);

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migrations[0], "migration.sql"),
      "utf8",
    );
    const tableAt = sql.indexOf(`CREATE TABLE IF NOT EXISTS "DMMessageMention"`);
    const uniqueAt = sql.indexOf(
      `CREATE UNIQUE INDEX IF NOT EXISTS "DMMessageMention_messageId_userId_key"`,
    );
    const backfillAt = sql.indexOf(`INSERT INTO "DMMessageMention"`);
    const indexAt = sql.indexOf(
      `CREATE INDEX IF NOT EXISTS "DMMessageMention_userId_createdAt_idx"`,
    );

    // The unique index has to exist before the backfill, or `ON CONFLICT DO
    // NOTHING` has nothing to conflict on; the keyset index comes last so the
    // bulk insert does not maintain it row by row.
    assert.ok(tableAt > 0 && uniqueAt > tableAt && backfillAt > uniqueAt && indexAt > backfillAt);
    // History comes from the recipient's own notification row, never from
    // matching "@username" against message text.
    assert.match(sql, /n\."metadata" ->> 'mentioned' = 'true'/);
    assert.match(sql, /ON DELETE CASCADE/);
  });

  it("backfills the denormalized mention timestamp before making it required", () => {
    const migrations = readdirSync(join(prismaDir, "rebaseline-migrations")).filter((entry) =>
      entry.endsWith("_mention_created_at"),
    );
    assert.equal(migrations.length, 1);

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migrations[0], "migration.sql"),
      "utf8",
    );
    const backfillAt = sql.indexOf(`UPDATE "MessageMention" mm`);
    const notNullAt = sql.indexOf(`ALTER COLUMN "createdAt" SET NOT NULL`);
    const indexAt = sql.indexOf(`CREATE INDEX IF NOT EXISTS "MessageMention_userId_createdAt_idx"`);

    // Order is the contract: a NOT NULL before the backfill fails the whole
    // migration on any deployment that already holds mention rows.
    assert.ok(backfillAt > 0 && notNullAt > backfillAt && indexAt > notNullAt);
    assert.match(sql, /SET "createdAt" = m\."createdAt"/);
    assert.match(modelBody("MessageMention"), /createdAt\s+DateTime\s+@default\(now\(\)\)/);
  });
});

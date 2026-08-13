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
      Notification: [
        "@@unique([dedupeKey])",
        "@@index([userId, read])",
        "@@index([userId, createdAt])",
        "@@index([campaignId])",
        "@@index([userId, read, createdAt])",
      ],
      Session: ["@@index([userId])", "@@index([expiresAt])"],
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
});

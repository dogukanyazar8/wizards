import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  anonymizeAccount,
  buildDeletedAccountIdentity,
  createAccountDataExportDocument,
  collectAccountUploadThingFileKeys,
  extractUploadThingFileKey,
  serializeAccountDataExport,
} from "./privacy-service";

type Restore = () => void;
type UnknownRecord = Record<string, unknown>;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as UnknownRecord;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

describe("account privacy service", { concurrency: false }, () => {
  it("captures every deduplicated UploadThing key before account rows are erased", () => {
    assert.deepEqual(
      collectAccountUploadThingFileKeys({
        attachments: [
          { thumbnailUrl: "https://utfs.io/f/thumb-1", url: "https://utfs.io/f/file-1" },
          { thumbnailUrl: null, url: "https://utfs.io/f/file-1" },
        ],
        user: {
          avatarUrl: "https://example.ufs.sh/f/avatar-1",
          bannerUrl: "https://cdn.example.test/not-owned",
        },
      }),
      ["avatar-1", "file-1", "thumb-1"],
    );
  });

  it("versions server-backed account preferences as export schema 2", () => {
    const payload = createAccountDataExportDocument({
      exportedAt: new Date("2026-08-13T00:00:00.000Z"),
      preferences: {
        notificationSettings: null,
        settings: {
          dateFormat: "DMY",
          interfaceDensity: "COMPACT",
          presenceVisibility: "FRIENDS",
          profileVisibility: "NOBODY",
          timeFormat: "H24",
          timeZone: "Europe/Istanbul",
        },
      },
      user: { id: "user-1" },
    });

    assert.equal(payload.schemaVersion, 2);
    assert.match(serializeAccountDataExport(payload), /"profileVisibility": "NOBODY"/);
    assert.match(serializeAccountDataExport(payload), /"timeZone": "Europe\/Istanbul"/);
  });

  it("builds stable non-identifying deleted account identities", () => {
    const identity = buildDeletedAccountIdentity("9b2f0d64-1111-4222-8333-abcdefabcdef");

    assert.equal(identity.email, "deleted-9b2f0d64111142228333abcd@deleted.whispr.local");
    assert.match(identity.username, /^deleted_[a-zA-Z0-9]+$/);
    assert.ok(identity.username.length <= 32);
  });

  it("serializes BigInt values in data exports", () => {
    const payload = serializeAccountDataExport({
      exportedAt: new Date("2026-05-14T00:00:00.000Z"),
      schemaVersion: 1,
      user: { id: "user-1" },
      authentication: { accounts: [], sessions: [] },
      preferences: { notificationSettings: null, settings: null },
      relationships: {
        friendRequestsReceived: [],
        friendRequestsSent: [],
        serverMemberships: [],
      },
      ownedServers: [],
      content: {
        attachments: [],
        authoredDMMessages: [],
        authoredMessages: [],
        dmReactions: [],
        reactions: [],
      },
      notifications: [],
      analytics: {
        appSessions: [{ appVersion: "0.8.15", attributionVerified: true, clientType: "MOBILE" }],
        dailyMetrics: [{ appVersion: "0.8.15", clientType: "MOBILE", uploadedBytes: 123n }],
        mediaUsageSessions: [{ clientType: "MOBILE" }],
      },
    });

    assert.match(payload, /"uploadedBytes": "123"/);
    // The platform dimensions are not PII, so the export carries them verbatim.
    assert.match(payload, /"clientType": "MOBILE"/);
    assert.match(payload, /"appVersion": "0\.8\.15"/);
    assert.match(payload, /"attributionVerified": true/);
  });

  it("extracts UploadThing file keys from supported storage URLs", () => {
    assert.equal(
      extractUploadThingFileKey("https://uploadthing.com/f/file-key.png"),
      "file-key.png",
    );
    assert.equal(
      extractUploadThingFileKey("https://abc123.ufs.sh/f/avatar%20key.webp"),
      "avatar key.webp",
    );
    assert.equal(extractUploadThingFileKey("https://cdn.example.com/f/nope.png"), null);
  });

  it("uses an explicit destructive confirmation phrase", () => {
    assert.equal(ACCOUNT_DELETION_CONFIRMATION, "DELETE MY ACCOUNT");
  });

  it("schedules owned avatars and expired unclaimed media inside account anonymization", async () => {
    const restores: Restore[] = [];
    const now = new Date("2026-07-13T09:00:00.000Z");
    const operations: string[] = [];
    const uploads = [
      {
        claimedAt: new Date("2026-07-13T08:00:00.000Z"),
        cleanupAfter: null as Date | null,
        expiresAt: new Date("2026-07-13T08:15:00.000Z"),
        id: "owned-avatar",
        ownerId: "user-1",
        purpose: "PROFILE_AVATAR",
        storageDeletedAt: null as Date | null,
        targetServerId: null,
      },
      {
        claimedAt: new Date("2026-07-13T08:00:00.000Z"),
        cleanupAfter: null as Date | null,
        expiresAt: new Date("2026-07-13T08:15:00.000Z"),
        id: "deleted-avatar",
        ownerId: "user-1",
        purpose: "PROFILE_AVATAR",
        storageDeletedAt: new Date("2026-07-13T08:30:00.000Z"),
        targetServerId: null,
      },
      {
        claimedAt: new Date("2026-07-13T08:00:00.000Z"),
        cleanupAfter: null as Date | null,
        expiresAt: new Date("2026-07-13T08:15:00.000Z"),
        id: "active-surviving-icon",
        ownerId: "user-1",
        purpose: "SERVER_ICON",
        storageDeletedAt: null as Date | null,
        targetServerId: "server-surviving",
      },
      {
        claimedAt: null,
        cleanupAfter: null as Date | null,
        expiresAt: new Date("2026-07-13T08:59:00.000Z"),
        id: "expired-owned-upload",
        ownerId: "user-1",
        purpose: "SERVER_ICON",
        storageDeletedAt: null as Date | null,
        targetServerId: "server-surviving",
      },
      {
        claimedAt: null,
        cleanupAfter: null as Date | null,
        expiresAt: new Date("2026-07-13T08:59:00.000Z"),
        id: "expired-other-upload",
        ownerId: "user-2",
        purpose: "SERVER_ICON",
        storageDeletedAt: null as Date | null,
        targetServerId: "server-other",
      },
      {
        claimedAt: new Date("2026-07-13T08:00:00.000Z"),
        cleanupAfter: null as Date | null,
        expiresAt: new Date("2026-07-13T08:15:00.000Z"),
        id: "active-other-avatar",
        ownerId: "user-2",
        purpose: "PROFILE_AVATAR",
        storageDeletedAt: null as Date | null,
        targetServerId: null,
      },
    ];

    patchMethod(
      prisma.user,
      "findUnique",
      async () => {
        throw new Error("anonymization must use its injected client");
      },
      restores,
    );

    const genericDelegate = {
      async deleteMany() {},
      async upsert() {
        operations.push("outbox.upsert");
      },
      async update() {},
      async updateMany() {},
    };
    const dependencies = {
      async collectUploadThingFileKeys() {
        operations.push("storage.collect");
        return ["avatar-1", "attachment-1"];
      },
      async clearRuntimeState(userId: string, serverIds: string[]) {
        operations.push("runtime.clear");
        assert.equal(userId, "user-1");
        assert.deepEqual(serverIds, ["server-surviving"]);
      },
      client: {
        async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
          operations.push("transaction.begin");
          const tx = new Proxy(
            {
              $executeRaw: async (_query: TemplateStringsArray, ..._values: unknown[]) => {
                operations.push("server.memberCount.decrementBatch");
                return 1;
              },
              mobileMediaUpload: {
                async updateMany(args: {
                  data: { cleanupAfter: Date };
                  where: {
                    OR: Array<Record<string, unknown>>;
                    storageDeletedAt: null;
                  };
                }) {
                  operations.push("media.schedule");
                  assert.deepEqual(args.where, {
                    OR: [
                      { ownerId: "user-1", purpose: "PROFILE_AVATAR" },
                      { claimedAt: null, expiresAt: { lte: now } },
                    ],
                    storageDeletedAt: null,
                  });
                  for (const upload of uploads) {
                    const ownedAvatar =
                      upload.ownerId === "user-1" && upload.purpose === "PROFILE_AVATAR";
                    const expiredUnclaimed = upload.claimedAt === null && upload.expiresAt <= now;
                    if (upload.storageDeletedAt === null && (ownedAvatar || expiredUnclaimed)) {
                      upload.cleanupAfter = args.data.cleanupAfter;
                    }
                  }
                  return { count: 3 };
                },
              },
              mobilePushToken: {
                async deleteMany(args: { where: { userId: string } }) {
                  operations.push("mobilePushToken.deleteMany");
                  assert.deepEqual(args.where, { userId: "user-1" });
                  return { count: 1 };
                },
              },
              serverMember: {
                async deleteMany() {
                  operations.push("serverMember.deleteMany");
                  return { count: 1 };
                },
                async findMany() {
                  operations.push("serverMember.findMany");
                  return [{ serverId: "server-surviving" }];
                },
              },
            },
            {
              get(target, property) {
                return property in target
                  ? target[property as keyof typeof target]
                  : genericDelegate;
              },
            },
          );
          const result = await callback(tx);
          operations.push("transaction.commit");
          return result;
        },
        user: {
          async findUnique() {
            return {
              deletedAt: null,
              id: "user-1",
              ownedServers: [],
              serverMembers: [{ serverId: "server-surviving" }],
            };
          },
        },
      },
      async deleteUploadThingFiles() {
        operations.push("storage.delete");
      },
      now: () => now,
      async revokeSessions() {
        operations.push("sessions.revoke");
      },
    };

    try {
      const result = await anonymizeAccount("user-1", dependencies as never);

      assert.deepEqual(result, { deletedAt: now });
      assert.ok(operations.indexOf("storage.collect") < operations.indexOf("transaction.begin"));
      assert.ok(operations.indexOf("outbox.upsert") < operations.indexOf("transaction.commit"));
      assert.ok(operations.indexOf("transaction.commit") < operations.indexOf("storage.delete"));
      assert.ok(
        operations.indexOf("mobilePushToken.deleteMany") < operations.indexOf("transaction.commit"),
      );
      assert.ok(
        operations.indexOf("authSession.deleteMany") < operations.indexOf("transaction.commit"),
      );
      assert.ok(operations.indexOf("media.schedule") < operations.indexOf("transaction.commit"));
      assert.ok(operations.indexOf("transaction.commit") < operations.indexOf("sessions.revoke"));
      // The affected server ids must be read before the membership rows are
      // deleted, and the batched decrement must land inside the same
      // transaction as the delete rather than after it.
      assert.ok(
        operations.indexOf("serverMember.findMany") < operations.indexOf("serverMember.deleteMany"),
      );
      assert.ok(
        operations.indexOf("serverMember.deleteMany") <
          operations.indexOf("server.memberCount.decrementBatch"),
      );
      assert.ok(
        operations.indexOf("server.memberCount.decrementBatch") <
          operations.indexOf("transaction.commit"),
      );
      assert.equal(uploads.find((upload) => upload.id === "owned-avatar")?.cleanupAfter, now);
      assert.equal(
        uploads.find((upload) => upload.id === "expired-owned-upload")?.cleanupAfter,
        now,
      );
      assert.equal(
        uploads.find((upload) => upload.id === "expired-other-upload")?.cleanupAfter,
        now,
      );
      assert.equal(
        uploads.find((upload) => upload.id === "active-surviving-icon")?.cleanupAfter,
        null,
      );
      assert.equal(uploads.find((upload) => upload.id === "deleted-avatar")?.cleanupAfter, null);
      assert.equal(
        uploads.find((upload) => upload.id === "active-other-avatar")?.cleanupAfter,
        null,
      );
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("keeps storage intact when account anonymization rolls back", async () => {
    let storageDeletes = 0;
    const now = new Date("2026-08-12T12:00:00.000Z");

    await assert.rejects(
      anonymizeAccount("user-1", {
        clearRuntimeState: async () => {},
        client: {
          $transaction: async () => {
            throw new Error("deadlock");
          },
          user: {
            findUnique: async () => ({
              deletedAt: null,
              id: "user-1",
              ownedServers: [],
              serverMembers: [],
            }),
          },
        },
        deleteUploadThingFiles: async () => {
          storageDeletes += 1;
        },
        now: () => now,
        revokeSessions: async () => {},
      } as never),
      /deadlock/,
    );

    assert.equal(storageDeletes, 0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  buildDeletedAccountIdentity,
  extractUploadThingFileKey,
  serializeAccountDataExport,
} from "./privacy-service";

describe("account privacy service", () => {
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
        appSessions: [],
        dailyMetrics: [{ uploadedBytes: 123n }],
        mediaUsageSessions: [],
      },
    });

    assert.match(payload, /"uploadedBytes": "123"/);
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
});

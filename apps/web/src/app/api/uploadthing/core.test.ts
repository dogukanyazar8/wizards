import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MobileMediaUploadIntentSchema } from "@wizards/types";
import {
  isUploadUserAllowed,
  resolveMessageUploadUserId,
  uploadRouter,
} from "./core";

const existingRouteConfigs = {
  messageAttachmentUploader: {
    "audio/mp4": { maxFileCount: 5, maxFileSize: "16MB" },
    "application/msword": { maxFileCount: 5, maxFileSize: "16MB" },
    "application/pdf": { maxFileCount: 5, maxFileSize: "16MB" },
    "application/rtf": { maxFileCount: 5, maxFileSize: "16MB" },
    "application/vnd.ms-excel": { maxFileCount: 5, maxFileSize: "16MB" },
    "application/vnd.ms-powerpoint": { maxFileCount: 5, maxFileSize: "16MB" },
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "image/gif": { maxFileCount: 5, maxFileSize: "8MB" },
    "image/jpeg": { maxFileCount: 5, maxFileSize: "8MB" },
    "image/png": { maxFileCount: 5, maxFileSize: "8MB" },
    "image/webp": { maxFileCount: 5, maxFileSize: "8MB" },
    "text/csv": { maxFileCount: 5, maxFileSize: "16MB" },
    "text/markdown": { maxFileCount: 5, maxFileSize: "16MB" },
    "text/plain": { maxFileCount: 5, maxFileSize: "16MB" },
    "video/mp4": { maxFileCount: 5, maxFileSize: "32MB" },
    "video/quicktime": { maxFileCount: 5, maxFileSize: "32MB" },
    "video/webm": { maxFileCount: 5, maxFileSize: "32MB" },
  },
  messageImageUploader: {
    "image/gif": { maxFileCount: 5, maxFileSize: "8MB" },
    "image/jpeg": { maxFileCount: 5, maxFileSize: "8MB" },
    "image/png": { maxFileCount: 5, maxFileSize: "8MB" },
    "image/webp": { maxFileCount: 5, maxFileSize: "8MB" },
  },
  profileAvatarUploader: {
    "image/jpeg": { maxFileCount: 1, maxFileSize: "4MB" },
    "image/png": { maxFileCount: 1, maxFileSize: "4MB" },
    "image/webp": { maxFileCount: 1, maxFileSize: "4MB" },
  },
  serverIconUploader: {
    image: { maxFileCount: 1, maxFileSize: "4MB" },
  },
} as const;

describe("UploadThing active-user guard", () => {
  it("accepts verified users that are not banned", () => {
    assert.equal(
      isUploadUserAllowed({
        emailVerified: true,
        id: "user-1",
        isBanned: false,
      }),
      true,
    );
  });

  it("rejects banned or unverified users", () => {
    assert.equal(
      isUploadUserAllowed({
        emailVerified: true,
        id: "user-1",
        isBanned: true,
      }),
      false,
    );
    assert.equal(
      isUploadUserAllowed({
        emailVerified: false,
        id: "user-1",
        isBanned: false,
      }),
      false,
    );
  });

  it("rejects deleted users", () => {
    assert.equal(
      isUploadUserAllowed({
        deletedAt: new Date("2026-05-14T00:00:00.000Z"),
        emailVerified: true,
        id: "user-1",
        isBanned: false,
      }),
      false,
    );
  });
});

describe("message attachment mobile authentication", () => {
  it("uses the verified mobile bearer identity when the upload request has a bearer token", async () => {
    const requireMobileApiUserId = async () => "mobile-user-1";
    const requireWebUploadUser = async () => {
      throw new Error("web session must not be used for bearer uploads");
    };

    const userId = await resolveMessageUploadUserId({
      dependencies: { requireMobileApiUserId, requireWebUploadUser },
      request: new Request("https://whispr.test/api/uploadthing", {
        headers: { Authorization: "Bearer mobile-access-token" },
      }),
    });

    assert.equal(userId, "mobile-user-1");
  });

  it("does not fall back to a web session when bearer verification fails", async () => {
    let webFallbackCalled = false;

    await assert.rejects(() =>
      resolveMessageUploadUserId({
        dependencies: {
          requireMobileApiUserId: async () => {
            throw new Error("invalid bearer token");
          },
          requireWebUploadUser: async () => {
            webFallbackCalled = true;
            return "web-user-1";
          },
        },
        request: new Request("https://whispr.test/api/uploadthing", {
          headers: { Authorization: "Bearer invalid-token" },
        }),
      }),
    );

    assert.equal(webFallbackCalled, false);
  });
});

describe("UploadThing route contracts", () => {
  it("preserves every existing web uploader configuration", () => {
    for (const [slug, expectedConfig] of Object.entries(existingRouteConfigs)) {
      assert.deepEqual(uploadRouter[slug]?.routerConfig, expectedConfig, slug);
    }
  });

  it("adds only the mobile media uploader slug", () => {
    assert.deepEqual(Object.keys(uploadRouter).sort(), [
      "messageAttachmentUploader",
      "messageImageUploader",
      "mobileMediaUploader",
      "profileAvatarUploader",
      "serverIconUploader",
    ]);
  });

  it("accepts only one four-MiB JPEG, PNG, or WebP mobile image", () => {
    assert.deepEqual(uploadRouter.mobileMediaUploader?.routerConfig, {
      "image/jpeg": { maxFileCount: 1, maxFileSize: "4MB" },
      "image/png": { maxFileCount: 1, maxFileSize: "4MB" },
      "image/webp": { maxFileCount: 1, maxFileSize: "4MB" },
    });
  });

  it("binds the strict mobile upload intent schema", async () => {
    const route = uploadRouter.mobileMediaUploader;
    assert.ok(route);
    assert.equal(route.inputParser, MobileMediaUploadIntentSchema);
    assert.deepEqual(
      await MobileMediaUploadIntentSchema.parseAsync({ purpose: "profile-avatar" }),
      {
        purpose: "profile-avatar",
      },
    );
    assert.deepEqual(
      await MobileMediaUploadIntentSchema.parseAsync({
        purpose: "server-icon",
        targetServerId: "server-1",
      }),
      { purpose: "server-icon", targetServerId: "server-1" },
    );
    await assert.rejects(() =>
      MobileMediaUploadIntentSchema.parseAsync({ purpose: "server-icon", targetServerId: "" }),
    );
    await assert.rejects(() =>
      MobileMediaUploadIntentSchema.parseAsync({
        purpose: "profile-avatar",
        targetServerId: "server-1",
      }),
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const schemas = import("./mobile-social");

const friendUser = {
  avatarUrl: null,
  displayName: "Ada",
  id: "user-2",
  username: "ada",
};

describe("mobile social and account schemas", () => {
  it("keeps profile updates narrow and presence values whitelisted", async () => {
    const { MobilePresenceUpdateSchema, MobileProfileUpdateSchema } = await schemas;

    assert.deepEqual(MobileProfileUpdateSchema.parse({ displayName: "  Ada  ", username: "ada" }), {
      displayName: "Ada",
      username: "ada",
    });
    assert.equal(
      MobileProfileUpdateSchema.safeParse({ displayName: "Ada", email: "a@b.co" }).success,
      false,
    );
    assert.equal(
      MobileProfileUpdateSchema.safeParse({ avatarUrl: "https://example.com/a.png" }).success,
      false,
    );
    assert.equal(MobilePresenceUpdateSchema.safeParse({ status: "DND" }).success, true);
    assert.equal(MobilePresenceUpdateSchema.safeParse({ status: "INVISIBLE" }).success, false);
  });

  it("validates the combined friends list and strict mutation inputs", async () => {
    const {
      MobileFriendRequestActionResponseSchema,
      MobileFriendRequestCreateSchema,
      MobileFriendsOverviewResponseSchema,
    } = await schemas;
    const request = {
      createdAt: "2026-07-11T10:00:00.000Z",
      id: "request-1",
      receiver: friendUser,
      receiverId: friendUser.id,
      sender: { ...friendUser, id: "user-1", username: "dogukan" },
      senderId: "user-1",
      status: "PENDING",
      updatedAt: "2026-07-11T10:00:00.000Z",
    };

    assert.equal(
      MobileFriendsOverviewResponseSchema.safeParse({
        blocked: [friendUser],
        friends: [
          {
            ...friendUser,
            customStatus: null,
            presence: { customStatus: null, status: "ONLINE" },
            status: "ONLINE",
          },
        ],
        pending: { incoming: [request], outgoing: [] },
      }).success,
      true,
    );
    assert.deepEqual(MobileFriendRequestCreateSchema.parse({ username: "  ada  " }), {
      username: "ada",
    });
    assert.equal(
      MobileFriendRequestCreateSchema.safeParse({ username: "a", userId: "x" }).success,
      false,
    );
    assert.equal(MobileFriendRequestActionResponseSchema.safeParse({ request }).success, true);
  });

  it("bounds two-factor secrets and keeps disable reauthentication explicit", async () => {
    const {
      MobileTwoFactorConfirmRequestSchema,
      MobileTwoFactorConfirmResponseSchema,
      MobileTwoFactorDisableRequestSchema,
      MobileTwoFactorSetupResponseSchema,
    } = await schemas;

    assert.equal(
      MobileTwoFactorSetupResponseSchema.safeParse({
        manualEntryKey: "ABCD EFGH IJKL MNOP",
        otpauthUri: "otpauth://totp/Whispr:user@example.com?secret=ABCDEFGHIJKLMNOP",
        qrCodeDataUrl: "data:image/png;base64,AAAA",
      }).success,
      true,
    );
    assert.deepEqual(MobileTwoFactorConfirmRequestSchema.parse({ code: " 123456 " }), {
      code: "123456",
    });
    assert.equal(
      MobileTwoFactorConfirmResponseSchema.safeParse({ recoveryCodes: ["ABCD-EFGH-IJKL"] }).success,
      true,
    );
    assert.equal(
      MobileTwoFactorDisableRequestSchema.safeParse({ code: "123456", password: "password" })
        .success,
      true,
    );
    assert.equal(MobileTwoFactorDisableRequestSchema.safeParse({ code: "123456" }).success, false);
  });

  it("accepts only bounded HTTPS Giphy results", async () => {
    const { MobileGiphySearchQuerySchema, MobileGiphySearchResponseSchema } = await schemas;
    assert.deepEqual(MobileGiphySearchQuerySchema.parse({ limit: "24", offset: "0", q: "wave" }), {
      limit: 24,
      offset: 0,
      q: "wave",
    });
    const gif = {
      giphyUrl: "https://giphy.com/gifs/one",
      height: 240,
      id: "gif-1",
      previewUrl: "https://media.giphy.com/preview.webp",
      size: 1024,
      title: "Wave",
      url: "https://media.giphy.com/image.gif",
      width: 320,
    };
    assert.equal(MobileGiphySearchResponseSchema.safeParse({ gifs: [gif] }).success, true);
    assert.equal(
      MobileGiphySearchResponseSchema.safeParse({
        gifs: [{ ...gif, url: "http://example.com/a.gif" }],
      }).success,
      false,
    );
  });

  it("validates server-created GIF attachments and HTTPS link previews", async () => {
    const {
      MobileGiphyAttachmentRequestSchema,
      MobileGiphyAttachmentResponseSchema,
      MobileLinkPreviewRequestSchema,
      MobileLinkPreviewResponseSchema,
    } = await schemas;
    assert.deepEqual(MobileGiphyAttachmentRequestSchema.parse({ gifId: "gif-1" }), {
      gifId: "gif-1",
    });
    const attachment = {
      contentType: "image/gif",
      filename: "giphy-gif-1.gif",
      height: 120,
      id: "attachment-1",
      scanStatus: "CLEAN",
      size: 1024,
      url: "https://media.giphy.com/a.gif",
      width: 160,
    };
    assert.equal(
      MobileGiphyAttachmentResponseSchema.safeParse({
        attachment,
        input: { height: 120, id: attachment.id, width: 160 },
      }).success,
      true,
    );
    assert.equal(
      MobileGiphyAttachmentRequestSchema.safeParse({ gifId: "x".repeat(129) }).success,
      false,
    );
    assert.deepEqual(MobileLinkPreviewRequestSchema.parse({ url: "https://example.com/post" }), {
      url: "https://example.com/post",
    });
    assert.equal(
      MobileLinkPreviewResponseSchema.safeParse({
        description: "Safe",
        imageUrl: "https://example.com/image.png",
        siteName: "Example",
        title: "Post",
        url: "https://example.com/post",
      }).success,
      true,
    );
    assert.equal(
      MobileLinkPreviewRequestSchema.safeParse({ url: "http://127.0.0.1/private" }).success,
      false,
    );
  });

  it("validates cursor-bounded DM details without exposing private server fields", async () => {
    const { MobileDMDetailsQuerySchema, MobileDMDetailsResponseSchema } = await schemas;
    assert.deepEqual(MobileDMDetailsQuerySchema.parse({ cursor: "message-1", limit: "20" }), {
      cursor: "message-1",
      limit: 20,
    });
    assert.equal(
      MobileDMDetailsResponseSchema.safeParse({
        mutualServers: [
          { iconUrl: null, id: "server-1", memberCount: 4, name: "UAT", shortName: "UA" },
        ],
        nextCursor: null,
        participant: { ...friendUser, customStatus: null, status: "ONLINE" },
        sharedAttachments: { files: [], media: [] },
      }).success,
      true,
    );
    assert.equal(MobileDMDetailsQuerySchema.safeParse({ limit: 101 }).success, false);
  });
});

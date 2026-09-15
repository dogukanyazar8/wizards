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

  it("carries the 2a banner, status emoji and expiry fields with bounded shapes", async () => {
    const {
      MOBILE_PROFILE_BANNER_COLORS,
      MOBILE_PROFILE_BIO_MAX_LENGTH,
      MobileProfileResponseSchema,
      MobileProfileUpdateSchema,
    } = await schemas;

    assert.deepEqual(
      MobileProfileUpdateSchema.parse({
        bannerColor: MOBILE_PROFILE_BANNER_COLORS[1],
        bannerOffsetX: 0.25,
        bannerOffsetY: 0.75,
        bannerUrl: null,
        customStatusEmoji: "🎧",
        customStatusExpiresAt: "2026-07-23T18:00:00.000Z",
      }),
      {
        bannerColor: "#22A366",
        bannerOffsetX: 0.25,
        bannerOffsetY: 0.75,
        bannerUrl: null,
        customStatusEmoji: "🎧",
        customStatusExpiresAt: "2026-07-23T18:00:00.000Z",
      },
    );
    assert.equal(MOBILE_PROFILE_BIO_MAX_LENGTH, 250);
    assert.equal(MobileProfileUpdateSchema.safeParse({ bannerColor: "indigo" }).success, false);
    assert.equal(MobileProfileUpdateSchema.safeParse({ bannerOffsetX: -0.01 }).success, false);
    assert.equal(MobileProfileUpdateSchema.safeParse({ bannerOffsetY: 1.01 }).success, false);
    assert.equal(
      MobileProfileUpdateSchema.safeParse({ bannerUrl: "http://cdn.example.com/b.png" }).success,
      false,
    );
    assert.equal(
      MobileProfileUpdateSchema.safeParse({ customStatusExpiresAt: "tomorrow" }).success,
      false,
    );
    assert.equal(
      MobileProfileUpdateSchema.safeParse({ bio: "x".repeat(MOBILE_PROFILE_BIO_MAX_LENGTH + 1) })
        .success,
      false,
    );

    // An un-redeployed server omits every new field; the device must still parse it.
    const legacy = MobileProfileResponseSchema.parse({
      user: {
        avatarUrl: null,
        customStatus: null,
        displayName: "Ada",
        id: "user-1",
        status: "ONLINE",
        twoFactorEnabled: false,
        username: "ada",
      },
    });
    assert.equal(legacy.user.bannerColor, null);
    assert.equal(legacy.user.bannerOffsetX, null);
    assert.equal(legacy.user.bannerOffsetY, null);
    assert.equal(legacy.user.bannerUrl, null);
    assert.equal(legacy.user.customStatusEmoji, null);
    assert.equal(legacy.user.customStatusExpiresAt, null);
    assert.equal(legacy.user.nextUsernameChangeAt, null);
  });

  it("shapes the account settings contract around real privacy enums", async () => {
    const { MobileAccountSettingsResponseSchema, MobileAccountSettingsUpdateSchema } =
      await schemas;

    const parsed = MobileAccountSettingsResponseSchema.parse({
      account: {
        bio: null,
        customStatus: "focus",
        email: "dogukan@whispr.app",
        emailVerified: true,
      },
      privacy: { dmPermission: "FRIENDS", friendRequests: "EVERYONE" },
    });
    assert.equal(parsed.privacy.dmPermission, "FRIENDS");
    assert.equal(
      MobileAccountSettingsResponseSchema.safeParse({
        account: { bio: null, customStatus: null, email: "not-an-email", emailVerified: false },
        privacy: { dmPermission: "FRIENDS", friendRequests: "EVERYONE" },
      }).success,
      false,
    );
    assert.equal(
      MobileAccountSettingsUpdateSchema.safeParse({ dmPermission: "NOBODY" }).success,
      true,
    );
    assert.equal(MobileAccountSettingsUpdateSchema.safeParse({}).success, false);
    assert.equal(
      MobileAccountSettingsUpdateSchema.safeParse({ friendRequests: "FRIENDS" }).success,
      false,
    );
    for (const dmPermission of ["EVERYONE", "FRIENDS", "MUTUAL_SERVERS", "NOBODY"]) {
      assert.equal(MobileAccountSettingsUpdateSchema.safeParse({ dmPermission }).success, true);
    }
    for (const friendRequests of ["EVERYONE", "MUTUAL_SERVERS", "MUTUAL_FRIENDS", "NOBODY"]) {
      assert.equal(MobileAccountSettingsUpdateSchema.safeParse({ friendRequests }).success, true);
    }
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

  it("limits new passwords by UTF-8 bytes without narrowing current-password verification", async () => {
    const { MobilePasswordChangeRequestSchema } = await schemas;
    const base = {
      confirmPassword: "p".repeat(72),
      currentPassword: "c".repeat(256),
      newPassword: "p".repeat(72),
    };

    assert.equal(MobilePasswordChangeRequestSchema.safeParse(base).success, true);
    assert.equal(
      MobilePasswordChangeRequestSchema.safeParse({
        ...base,
        confirmPassword: "🙂".repeat(18),
        newPassword: "🙂".repeat(18),
      }).success,
      true,
    );
    const overLimit = MobilePasswordChangeRequestSchema.safeParse({
      ...base,
      confirmPassword: "p".repeat(73),
      newPassword: "p".repeat(73),
    });
    assert.equal(overLimit.success, false);
    if (!overLimit.success) {
      assert.ok(
        overLimit.error.issues.some(
          (issue) =>
            issue.path.join(".") === "newPassword" &&
            issue.message === "validation.password.bcryptMax",
        ),
      );
    }
    assert.equal(
      MobilePasswordChangeRequestSchema.safeParse({
        ...base,
        confirmPassword: "🙂".repeat(19),
        newPassword: "🙂".repeat(19),
      }).success,
      false,
    );
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

  it("bounds the 9d user search query and tags every result with a relationship", async () => {
    const {
      MobileUserSearchQuerySchema,
      MobileUserSearchResponseSchema,
      MOBILE_USER_SEARCH_LIMIT,
    } = await schemas;

    assert.deepEqual(MobileUserSearchQuerySchema.parse({ q: "  ada  " }), {
      limit: MOBILE_USER_SEARCH_LIMIT,
      q: "ada",
    });
    assert.deepEqual(MobileUserSearchQuerySchema.parse({ limit: "5", q: "ada" }), {
      limit: 5,
      q: "ada",
    });
    assert.equal(MobileUserSearchQuerySchema.safeParse({ q: "a" }).success, false);
    assert.equal(MobileUserSearchQuerySchema.safeParse({ limit: 100, q: "ada" }).success, false);
    assert.equal(
      MobileUserSearchQuerySchema.safeParse({ page: 2, q: "ada" }).success,
      false,
      "unknown query keys stay rejected",
    );

    assert.deepEqual(
      MobileUserSearchQuerySchema.parse({ q: "ada", serverId: "server-1" }),
      { limit: MOBILE_USER_SEARCH_LIMIT, q: "ada", serverId: "server-1" },
      "invite-sheet 2b scopes the same search to one server",
    );

    // Server-context fields default, so a global search response from an
    // un-redeployed server still parses into the widened result shape.
    assert.deepEqual(
      MobileUserSearchResponseSchema.parse({
        results: [{ ...friendUser, relationship: "outgoing", requestId: "request-1" }],
      }),
      {
        results: [
          {
            ...friendUser,
            isMember: false,
            mutualServerCount: 0,
            pendingInviteId: null,
            relationship: "outgoing",
            requestId: "request-1",
          },
        ],
      },
    );
    assert.deepEqual(
      MobileUserSearchResponseSchema.parse({
        results: [
          {
            ...friendUser,
            isMember: true,
            mutualServerCount: 2,
            pendingInviteId: "invite-1",
            relationship: "friend",
            requestId: null,
          },
        ],
      }).results[0],
      {
        ...friendUser,
        isMember: true,
        mutualServerCount: 2,
        pendingInviteId: "invite-1",
        relationship: "friend",
        requestId: null,
      },
    );
    assert.equal(
      MobileUserSearchResponseSchema.safeParse({
        results: [{ ...friendUser, mutualServerCount: -1, relationship: "none", requestId: null }],
      }).success,
      false,
      "a negative mutual-server count is rejected",
    );
    assert.equal(
      MobileUserSearchResponseSchema.safeParse({
        results: [{ ...friendUser, relationship: "pending", requestId: null }],
      }).success,
      false,
    );
    assert.equal(
      MobileUserSearchResponseSchema.safeParse({ results: [{ ...friendUser }] }).success,
      false,
      "relationship and requestId are required on every row",
    );
  });

  it("carries request timestamps so 9d rows can render relative times", async () => {
    const { MobileFriendsOverviewResponseSchema } = await schemas;
    const request = {
      createdAt: "2026-07-22T09:00:00.000Z",
      id: "request-1",
      receiver: friendUser,
      receiverId: friendUser.id,
      sender: { ...friendUser, id: "user-3", username: "grace" },
      senderId: "user-3",
      status: "PENDING" as const,
      updatedAt: "2026-07-22T09:00:00.000Z",
    };

    const parsed = MobileFriendsOverviewResponseSchema.parse({
      blocked: [friendUser],
      friends: [],
      pending: { incoming: [request], outgoing: [] },
    });

    assert.equal(parsed.pending.incoming[0]?.createdAt, "2026-07-22T09:00:00.000Z");
    assert.equal(
      MobileFriendsOverviewResponseSchema.safeParse({
        blocked: [],
        friends: [],
        pending: {
          incoming: [{ ...request, createdAt: "not-a-date" }],
          outgoing: [],
        },
      }).success,
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
        mediaCount: 12,
        mutualServers: [
          { iconUrl: null, id: "server-1", memberCount: 4, name: "UAT", shortName: "UA" },
        ],
        nextCursor: null,
        participant: { ...friendUser, customStatus: null, status: "ONLINE" },
        sharedAttachments: { files: [], media: [] },
      }).success,
      true,
    );
    // The preview list is a page artefact; the total has to be its own field.
    assert.equal(
      MobileDMDetailsResponseSchema.safeParse({
        mutualServers: [],
        nextCursor: null,
        participant: { ...friendUser, customStatus: null, status: "ONLINE" },
        sharedAttachments: { files: [], media: [] },
      }).success,
      false,
    );
    assert.equal(MobileDMDetailsQuerySchema.safeParse({ limit: 101 }).success, false);
  });

  it("defaults the shared-media query to the media tab and bounds its page", async () => {
    const { MobileDMAttachmentsQuerySchema } = await schemas;

    assert.deepEqual(MobileDMAttachmentsQuerySchema.parse({}), { limit: 30, tab: "media" });
    assert.deepEqual(
      MobileDMAttachmentsQuerySchema.parse({ cursor: "message-1", limit: "12", tab: "links" }),
      {
        cursor: "message-1",
        limit: 12,
        tab: "links",
      },
    );
    assert.equal(MobileDMAttachmentsQuerySchema.safeParse({ limit: 51 }).success, false);
    assert.equal(MobileDMAttachmentsQuerySchema.safeParse({ tab: "voice" }).success, false);
  });

  it("keeps shared-media items on one discriminated kind and https link URLs", async () => {
    const { MobileDMAttachmentsResponseSchema } = await schemas;
    const attachment = {
      contentType: "image/png",
      duration: null,
      filename: "shot.png",
      height: 1200,
      id: "attachment-1",
      size: 4096,
      thumbnailUrl: null,
      url: "https://cdn.whispr.test/shot.png",
      width: 900,
    };

    assert.equal(
      MobileDMAttachmentsResponseSchema.safeParse({
        items: [
          {
            attachment,
            kind: "media",
            messageCreatedAt: "2026-07-14T09:00:00.000Z",
            messageId: "message-1",
          },
          {
            id: "message-2:0",
            kind: "link",
            messageCreatedAt: "2026-07-13T09:00:00.000Z",
            messageId: "message-2",
            url: "https://whispr.test/changelog",
          },
        ],
        nextCursor: "message-2",
        tab: "media",
      }).success,
      true,
    );

    // A link item may not smuggle an attachment payload, and http is not https.
    assert.equal(
      MobileDMAttachmentsResponseSchema.safeParse({
        items: [
          {
            attachment,
            id: "message-2:0",
            kind: "link",
            messageCreatedAt: "2026-07-13T09:00:00.000Z",
            messageId: "message-2",
            url: "https://whispr.test/changelog",
          },
        ],
        nextCursor: null,
        tab: "links",
      }).success,
      false,
    );
    assert.equal(
      MobileDMAttachmentsResponseSchema.safeParse({
        items: [
          {
            id: "message-2:0",
            kind: "link",
            messageCreatedAt: "2026-07-13T09:00:00.000Z",
            messageId: "message-2",
            url: "http://whispr.test/changelog",
          },
        ],
        nextCursor: null,
        tab: "links",
      }).success,
      false,
    );
  });
});

describe("11e note contract", () => {
  it("collapses an empty or whitespace body to the delete signal", async () => {
    const { MobileUserNoteUpdateSchema } = await schemas;

    assert.deepEqual(MobileUserNoteUpdateSchema.parse({ body: "  staging  " }), {
      body: "staging",
    });
    assert.deepEqual(MobileUserNoteUpdateSchema.parse({ body: "   " }), { body: null });
    assert.deepEqual(MobileUserNoteUpdateSchema.parse({ body: null }), { body: null });
  });

  it("refuses a note past the stored length and any extra field", async () => {
    const { MOBILE_USER_NOTE_MAX_LENGTH, MobileUserNoteUpdateSchema } = await schemas;

    assert.equal(
      MobileUserNoteUpdateSchema.safeParse({
        body: "x".repeat(MOBILE_USER_NOTE_MAX_LENGTH),
      }).success,
      true,
    );
    assert.equal(
      MobileUserNoteUpdateSchema.safeParse({
        body: "x".repeat(MOBILE_USER_NOTE_MAX_LENGTH + 1),
      }).success,
      false,
    );
    assert.equal(
      MobileUserNoteUpdateSchema.safeParse({ authorId: "user-1", body: "hi" }).success,
      false,
    );
  });

  it("carries a nullable note back and rejects anything else", async () => {
    const { MobileUserNoteResponseSchema } = await schemas;

    assert.deepEqual(MobileUserNoteResponseSchema.parse({ note: null }), { note: null });
    assert.deepEqual(MobileUserNoteResponseSchema.parse({ note: "staging" }), { note: "staging" });
    assert.equal(MobileUserNoteResponseSchema.safeParse({ note: 42 }).success, false);
  });
});

describe("mobile peer profile schemas", () => {
  const profile = {
    badges: ["earlyMember", "supporter"],
    bannerColor: "#4F46E5",
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: "UAT",
    blocked: false,
    blockedBy: false,
    mutualFriends: { count: 1, preview: [friendUser] },
    mutualServers: {
      count: 1,
      preview: [
        { iconUrl: null, id: "server-1", memberCount: 128, name: "UAT ENV", shortName: "UE" },
      ],
    },
    note: null,
    presence: { customStatus: "Test", customStatusEmoji: "🧪", status: "ONLINE" },
    registeredAt: "2025-04-02T09:00:00.000Z",
    relationship: "friend",
    self: false,
    serverContext: {
      joinedAt: "2026-01-04T10:00:00.000Z",
      roles: [{ color: 5198053, id: "role-1", name: "Geliştirici" }],
      serverId: "server-1",
      serverName: "UAT ENV",
    },
    user: friendUser,
  };

  it("carries the whole quick card in one payload", async () => {
    const { MobileUserProfileResponseSchema } = await schemas;

    assert.deepEqual(MobileUserProfileResponseSchema.parse({ profile }), { profile });
    // The status emoji arrived after the card shipped, so a server that does not
    // send it yet still parses and reads as "no emoji".
    assert.deepEqual(
      MobileUserProfileResponseSchema.parse({
        profile: { ...profile, presence: { customStatus: "Test", status: "ONLINE" } },
      }).profile.presence,
      { customStatus: "Test", customStatusEmoji: null, status: "ONLINE" },
    );
    // The DM context has no server, so the role block is absent rather than empty.
    assert.equal(
      MobileUserProfileResponseSchema.safeParse({
        profile: { ...profile, serverContext: null },
      }).success,
      true,
    );
  });

  it("fails closed on unknown fields, bad badges and loose presence", async () => {
    const { MobileUserProfileSchema } = await schemas;

    assert.equal(MobileUserProfileSchema.safeParse({ ...profile, extra: 1 }).success, false);
    assert.equal(MobileUserProfileSchema.safeParse({ ...profile, badges: ["vip"] }).success, false);
    assert.equal(
      MobileUserProfileSchema.safeParse({
        ...profile,
        presence: { customStatus: null, status: "INVISIBLE" },
      }).success,
      false,
    );
    assert.equal(
      MobileUserProfileSchema.safeParse({ ...profile, relationship: "acquaintance" }).success,
      false,
    );
  });

  it("keeps the server context query and the report body bounded", async () => {
    const { MobileUserProfileQuerySchema, MobileUserReportRequestSchema } = await schemas;

    assert.deepEqual(MobileUserProfileQuerySchema.parse({ serverId: "server-1" }), {
      serverId: "server-1",
    });
    assert.deepEqual(MobileUserProfileQuerySchema.parse({}), {});
    assert.equal(MobileUserProfileQuerySchema.safeParse({ userId: "user-2" }).success, false);

    assert.deepEqual(MobileUserReportRequestSchema.parse({ reason: "spam" }), { reason: "spam" });
    assert.equal(
      MobileUserReportRequestSchema.safeParse({ details: "x".repeat(501), reason: "spam" }).success,
      false,
    );
    assert.equal(MobileUserReportRequestSchema.safeParse({ reason: "because" }).success, false);
  });

  it("accepts evidence pointers without breaking a client that sends none", async () => {
    const { MobileUserReportRequestSchema } = await schemas;

    assert.deepEqual(
      MobileUserReportRequestSchema.parse({ messageId: "message-1", reason: "harassment" }),
      { messageId: "message-1", reason: "harassment" },
    );
    assert.deepEqual(MobileUserReportRequestSchema.parse({ dmMessageId: "dm-1", reason: "spam" }), {
      dmMessageId: "dm-1",
      reason: "spam",
    });
    // The old body is still the whole contract for an app released before this.
    assert.deepEqual(MobileUserReportRequestSchema.parse({ reason: "spam" }), { reason: "spam" });
    assert.equal(
      MobileUserReportRequestSchema.safeParse({ evidenceUrl: "https://x", reason: "spam" }).success,
      false,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as workspaceSchemas from "./workspace";
import {
  AddServerMemberSchema,
  AdminCreateServerSchema,
  AdminUpdateServerSchema,
  CreateCategorySchema,
  CreateChannelSchema,
  CreateInviteSchema,
  CreateServerSchema,
  CreateWorkspaceRoleSchema,
  DeleteServerSchema,
  ReorderCategoriesSchema,
  ReorderChannelsSchema,
  RoleBadgeSchema,
  ServerDiscoveryCardSchema,
  ServerDiscoveryPageSchema,
  ServerDiscoveryQuerySchema,
  ServerPublicProfileChannelSchema,
  ServerPublicProfileFriendSchema,
  ServerPublicProfileSchema,
  ServerTypeSchema,
  ServerVerificationLevelSchema,
  UpdateCategorySchema,
  UpdateChannelFieldsSchema,
  UpdateChannelSchema,
  UpdateServerFieldsSchema,
  UpdateServerSchema,
  UpdateWorkspaceChannelPermissionsSchema,
  UpdateWorkspaceMemberRolesSchema,
  UpdateWorkspaceRoleSchema,
  WorkspaceAccessLevelSchema,
  WorkspaceCategorySchema,
  WorkspaceChannelPermissionPresetSchema,
  WorkspaceChannelPermissionSettingsSchema,
  WorkspaceChannelSchema,
  WorkspaceChannelTypeSchema,
  WorkspaceInviteSchema,
  WorkspaceMemberPageSchema,
  WorkspaceMembersResponseSchema,
  WorkspaceMemberSchema,
  WorkspacePermissionKeySchema,
  WorkspaceRoleMutationSchema,
  WorkspaceRoleSchema,
  WorkspaceServerDetailSchema,
  WorkspaceServerResponseSchema,
  WorkspaceServersResponseSchema,
  WorkspaceServerSummarySchema,
} from "./workspace";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const permissionSettings = { allowedRoleIds: ["role-1"], preset: "ROLE_GATED" as const };
const roleBadge = { color: 0x336699, id: "role-1", name: "Moderator" };
const role = {
  color: 0x336699,
  id: "role-1",
  isDefault: false,
  managed: false,
  mentionable: true,
  name: "Moderator",
  permissions: ["VIEW_CHANNEL" as const],
  position: 1,
};
const channel = {
  categoryId: null,
  id: "channel-1",
  name: "general",
  position: 0,
  topic: null,
  type: "TEXT" as const,
};
const category = { channels: [channel], id: "category-1", name: "General", position: 0 };
const member = {
  accessLevel: "MEMBER" as const,
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada Lovelace",
  id: "member-1",
  roles: [roleBadge],
  status: "ONLINE" as const,
  userId: "user-1",
  username: "ada",
};
const invite = {
  channelId: "channel-1",
  code: "invite-code",
  createdAt: "2026-07-09T12:00:00.000Z",
  createdByDisplayName: "Ada",
  expiresAt: null,
  id: "invite-1",
  maxUses: null,
  uses: 0,
};
const memberPage = { limit: 50, nextCursor: null };
const serverSummary = {
  accessLevel: "OWNER" as const,
  allowFileUploads: true,
  allowGifs: true,
  allowMemberAdds: true,
  defaultChannelId: "channel-1",
  deletedMessageNoticeMinutes: 60,
  iconUrl: null,
  id: "server-1",
  inviteCode: "invite-code",
  memberCount: 1,
  messageCharacterLimit: 2_000,
  name: "Analytical Engine",
  shortName: "AE",
  unreadCount: 0,
};
const serverDetail = {
  categories: [category],
  invites: [invite],
  memberPage,
  members: [member],
  roles: [role],
  server: {
    ...serverSummary,
    description: null,
    discoverable: false,
    isAdmin: true,
    isOwner: true,
    isPublic: false,
    type: "PERSONAL" as const,
  },
  ungroupedChannels: [channel],
};
const serverPublicProfile = {
  bannerUrl: null,
  channels: [{ liveCount: null, name: "duyurular", readOnly: true, type: "text" as const }],
  description: "",
  discoverable: true,
  iconUrl: null,
  isPublic: true,
  joined: false,
  memberCount: 12_400,
  mutualFriendCount: 0,
  mutualFriends: [],
  name: "Whispr Topluluk",
  onlineCount: 1_200,
  serverId: "s1",
  shortName: null,
  type: "COMMUNITY" as const,
  verified: true,
};

describe("workspace schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(workspaceSchemas, {
      AddServerMemberSchema: {
        schema: AddServerMemberSchema,
        valid: { username: "ada" },
        invalid: { username: "a" },
      },
      AdminCreateServerSchema: {
        schema: AdminCreateServerSchema,
        valid: {
          discoverable: true,
          isPublic: true,
          name: "Whispr Topluluk",
          type: "COMMUNITY",
        },
        invalid: {
          isPublic: false,
          name: "Whispr Topluluk",
          type: "COMMUNITY",
        },
      },
      AdminUpdateServerSchema: {
        schema: AdminUpdateServerSchema,
        valid: { type: "COMMUNITY" },
        invalid: {},
      },
      CreateCategorySchema: {
        schema: CreateCategorySchema,
        valid: { name: "General" },
        invalid: { name: "!!!" },
      },
      CreateChannelSchema: {
        schema: CreateChannelSchema,
        valid: { name: "general", type: "TEXT" },
        invalid: { name: "!!!", type: "TEXT" },
      },
      CreateInviteSchema: {
        schema: CreateInviteSchema,
        valid: { expiresInHours: 24, maxUses: 10 },
        invalid: { expiresInHours: 0 },
      },
      CreateServerSchema: {
        schema: CreateServerSchema,
        valid: { name: "Whispr", shortName: "ws" },
        invalid: { name: "W" },
      },
      CreateWorkspaceRoleSchema: {
        schema: CreateWorkspaceRoleSchema,
        valid: { name: "Moderator" },
        invalid: { name: "!!!" },
      },
      DeleteServerSchema: {
        schema: DeleteServerSchema,
        valid: { confirmationName: "Whispr" },
        invalid: { confirmationName: " " },
      },
      ReorderCategoriesSchema: {
        schema: ReorderCategoriesSchema,
        valid: { items: [{ id: "category-1", position: 0 }] },
        invalid: { items: [] },
      },
      ReorderChannelsSchema: {
        schema: ReorderChannelsSchema,
        valid: { items: [{ categoryId: null, id: "channel-1", position: 0 }] },
        invalid: { items: [] },
      },
      RoleBadgeSchema: {
        schema: RoleBadgeSchema,
        valid: roleBadge,
        invalid: { ...roleBadge, color: -1 },
      },
      ServerDiscoveryCardSchema: {
        schema: ServerDiscoveryCardSchema,
        valid: {
          bannerUrl: null,
          description: "",
          iconUrl: null,
          id: "s1",
          memberCount: 12_400,
          name: "Whispr Topluluk",
          onlineCount: 1_200,
          shortName: null,
          type: "COMMUNITY",
          verified: true,
        },
        invalid: {
          bannerUrl: null,
          description: "",
          iconUrl: null,
          id: "s1",
          memberCount: -1,
          name: "Whispr Topluluk",
          onlineCount: 1_200,
          shortName: null,
          type: "COMMUNITY",
          verified: true,
        },
      },
      ServerDiscoveryPageSchema: {
        schema: ServerDiscoveryPageSchema,
        valid: { nextCursor: null, servers: [] },
        invalid: { nextCursor: null, servers: "not-an-array" },
      },
      ServerDiscoveryQuerySchema: {
        schema: ServerDiscoveryQuerySchema,
        valid: { cursor: "12400|s1", limit: 20, query: "whispr" },
        invalid: { cursor: "12400|s1", limit: 20, query: "whispr", extra: true },
      },
      ServerPublicProfileChannelSchema: {
        schema: ServerPublicProfileChannelSchema,
        valid: { liveCount: null, name: "duyurular", readOnly: true, type: "text" },
        invalid: { liveCount: null, name: "duyurular", readOnly: true, type: "forum" },
      },
      ServerPublicProfileFriendSchema: {
        schema: ServerPublicProfileFriendSchema,
        valid: { avatarUrl: null, displayName: "Ada", id: "friend-1" },
        invalid: { avatarUrl: null, displayName: "Ada", id: 1 },
      },
      ServerPublicProfileSchema: {
        schema: ServerPublicProfileSchema,
        valid: serverPublicProfile,
        invalid: { ...serverPublicProfile, memberCount: -1 },
      },
      ServerTypeSchema: {
        schema: ServerTypeSchema,
        valid: "PERSONAL",
        invalid: "SYSTEM",
      },
      ServerVerificationLevelSchema: {
        schema: ServerVerificationLevelSchema,
        valid: "NONE",
        invalid: "EXTREME",
      },
      UpdateCategorySchema: {
        schema: UpdateCategorySchema,
        valid: { name: "Product" },
        invalid: { name: "<>" },
      },
      UpdateChannelFieldsSchema: {
        schema: UpdateChannelFieldsSchema,
        valid: {},
        invalid: { name: "!!!" },
      },
      UpdateChannelSchema: {
        schema: UpdateChannelSchema,
        valid: { locked: true },
        invalid: {},
      },
      UpdateServerFieldsSchema: {
        schema: UpdateServerFieldsSchema,
        valid: {},
        invalid: { name: "n" },
      },
      UpdateServerSchema: {
        schema: UpdateServerSchema,
        valid: { name: "Updated server" },
        invalid: {},
      },
      UpdateWorkspaceChannelPermissionsSchema: {
        schema: UpdateWorkspaceChannelPermissionsSchema,
        valid: permissionSettings,
        invalid: { ...permissionSettings, preset: "UNKNOWN" },
      },
      UpdateWorkspaceMemberRolesSchema: {
        schema: UpdateWorkspaceMemberRolesSchema,
        valid: { roleIds: ["role-1"] },
        invalid: { roleIds: Array.from({ length: 26 }, (_, index) => `role-${index}`) },
      },
      UpdateWorkspaceRoleSchema: {
        schema: UpdateWorkspaceRoleSchema,
        valid: { mentionable: true },
        invalid: {},
      },
      WorkspaceAccessLevelSchema: {
        schema: WorkspaceAccessLevelSchema,
        valid: "ADMIN",
        invalid: "GUEST",
      },
      WorkspaceCategorySchema: {
        schema: WorkspaceCategorySchema,
        valid: category,
        invalid: { ...category, position: -1 },
      },
      WorkspaceChannelPermissionPresetSchema: {
        schema: WorkspaceChannelPermissionPresetSchema,
        valid: "PRIVATE",
        invalid: "HIDDEN",
      },
      WorkspaceChannelPermissionSettingsSchema: {
        schema: WorkspaceChannelPermissionSettingsSchema,
        valid: permissionSettings,
        invalid: { ...permissionSettings, allowedRoleIds: "role-1" },
      },
      WorkspaceChannelSchema: {
        schema: WorkspaceChannelSchema,
        valid: channel,
        invalid: { ...channel, position: -1 },
      },
      WorkspaceChannelTypeSchema: {
        schema: WorkspaceChannelTypeSchema,
        valid: "VOICE",
        invalid: "FORUM",
      },
      WorkspaceInviteSchema: {
        schema: WorkspaceInviteSchema,
        valid: invite,
        invalid: { ...invite, createdAt: "today" },
      },
      WorkspaceMemberPageSchema: {
        schema: WorkspaceMemberPageSchema,
        valid: memberPage,
        invalid: { ...memberPage, limit: 0 },
      },
      WorkspaceMembersResponseSchema: {
        schema: WorkspaceMembersResponseSchema,
        valid: { memberPage, members: [member] },
        invalid: { memberPage, members: "member-1" },
      },
      WorkspaceMemberSchema: {
        schema: WorkspaceMemberSchema,
        valid: member,
        invalid: { ...member, accessLevel: "GUEST" },
      },
      WorkspacePermissionKeySchema: {
        schema: WorkspacePermissionKeySchema,
        valid: "SEND_MESSAGES",
        invalid: "DELETE_SERVER",
      },
      WorkspaceRoleMutationSchema: {
        schema: WorkspaceRoleMutationSchema,
        valid: { color: 0xffffff },
        invalid: { color: 0x1000000 },
      },
      WorkspaceRoleSchema: {
        schema: WorkspaceRoleSchema,
        valid: role,
        invalid: { ...role, position: 1.5 },
      },
      WorkspaceServerDetailSchema: {
        schema: WorkspaceServerDetailSchema,
        valid: serverDetail,
        invalid: { ...serverDetail, server: { ...serverDetail.server, isOwner: "yes" } },
      },
      WorkspaceServerResponseSchema: {
        schema: WorkspaceServerResponseSchema,
        valid: { detail: serverDetail },
        invalid: { detail: null },
      },
      WorkspaceServersResponseSchema: {
        schema: WorkspaceServersResponseSchema,
        valid: { servers: [serverSummary] },
        invalid: { servers: serverSummary },
      },
      WorkspaceServerSummarySchema: {
        schema: WorkspaceServerSummarySchema,
        valid: serverSummary,
        invalid: { ...serverSummary, deletedMessageNoticeMinutes: 4 },
      },
    });
  });

  it("normalizes create-server optional text and defaults", () => {
    const parsed = assertAccepts(CreateServerSchema, {
      description: "  A community  ",
      iconUrl: "",
      name: "  Whispr  ",
      shortName: "ws",
    });
    assert.deepEqual(parsed, {
      allowFileUploads: true,
      allowGifs: true,
      allowMemberAdds: true,
      description: "A community",
      iconUrl: null,
      name: "Whispr",
      shortName: "WS",
    });

    assert.equal(assertAccepts(CreateServerSchema, { name: "Whispr" })?.description, null);
    assert.equal(assertAccepts(CreateServerSchema, { name: "Whispr" })?.shortName, undefined);
  });

  it("enforces create-server name, description, icon, and short-name boundaries", () => {
    assertAccepts(CreateServerSchema, {
      description: "d".repeat(160),
      iconUrl: "https://cdn.example.com/icon.png",
      name: "n".repeat(64),
      shortName: "Ab_1",
    });
    assertRejects(CreateServerSchema, { name: "n" }, ["name"]);
    assertRejects(CreateServerSchema, { name: "n".repeat(65) }, ["name"]);
    assertRejects(CreateServerSchema, { description: "d".repeat(161), name: "Whispr" }, [
      "description",
    ]);
    assertRejects(CreateServerSchema, { iconUrl: "not-a-url", name: "Whispr" }, ["iconUrl"]);
    assertRejects(CreateServerSchema, { name: "Whispr", shortName: "ABCDE" }, ["shortName"]);
    assertRejects(CreateServerSchema, { name: "Whispr", shortName: "-ABC" }, ["shortName"]);
  });

  it("requires at least one server, channel, or role update field", () => {
    assertRejects(UpdateServerSchema, {});
    assertRejects(UpdateChannelSchema, {});
    assertRejects(UpdateWorkspaceRoleSchema, {});
    assertAccepts(UpdateServerSchema, { allowGifs: false });
    assertAccepts(UpdateChannelSchema, { categoryId: null });
    assertAccepts(UpdateWorkspaceRoleSchema, { permissions: [] });

    const clearedServer = assertAccepts(UpdateServerSchema, {
      description: "",
      iconUrl: "",
    });
    assert.equal(clearedServer?.description, null);
    assert.equal(clearedServer?.iconUrl, null);
    assert.equal(assertAccepts(UpdateChannelSchema, { topic: "" })?.topic, null);
  });

  it("carries the visibility triple on the server detail, so settings needs no second read", () => {
    const parsed = assertAccepts(WorkspaceServerDetailSchema, serverDetail);
    assert.equal(parsed.server.discoverable, false);
    assert.equal(parsed.server.isPublic, false);
    assert.equal(parsed.server.type, "PERSONAL");

    for (const missing of ["discoverable", "isPublic", "type"] as const) {
      const { [missing]: _omitted, ...server } = serverDetail.server;
      assertRejects(WorkspaceServerDetailSchema, { ...serverDetail, server }, ["server", missing]);
    }
  });

  it("enforces server update numeric boundaries", () => {
    assertAccepts(UpdateServerSchema, {
      deletedMessageNoticeMinutes: 5,
      messageCharacterLimit: 250,
    });
    assertAccepts(UpdateServerSchema, {
      deletedMessageNoticeMinutes: 10_080,
      messageCharacterLimit: 40_000,
    });
    assertRejects(UpdateServerSchema, { messageCharacterLimit: 249 }, ["messageCharacterLimit"]);
    assertRejects(UpdateServerSchema, { messageCharacterLimit: 40_001 }, ["messageCharacterLimit"]);
    assertRejects(UpdateServerSchema, { deletedMessageNoticeMinutes: 4 }, [
      "deletedMessageNoticeMinutes",
    ]);
    assertRejects(UpdateServerSchema, { deletedMessageNoticeMinutes: 10_081 }, [
      "deletedMessageNoticeMinutes",
    ]);
  });

  it("accepts Unicode workspace names and rejects punctuation-only or unsafe names", () => {
    for (const schema of [CreateCategorySchema, UpdateCategorySchema]) {
      assertAccepts(schema, { name: "  Ürün Ekibi  " });
      assertAccepts(schema, { name: "n".repeat(48) });
      assertRejects(schema, { name: "" }, ["name"]);
      assertRejects(schema, { name: "n".repeat(49) }, ["name"]);
      assertRejects(schema, { name: "---" }, ["name"]);
      assertRejects(schema, { name: "General!" }, ["name"]);
    }

    assertAccepts(CreateChannelSchema, {
      name: "ses-kanalı",
      topic: "  Daily sync  ",
      type: "VOICE",
    });
    assertRejects(CreateChannelSchema, { name: "channel/name", type: "TEXT" }, ["name"]);
    assertRejects(CreateChannelSchema, { name: "general", topic: "t".repeat(121), type: "TEXT" }, [
      "topic",
    ]);
  });

  it("enforces reorder, invite, and role mutation boundaries", () => {
    assertRejects(
      ReorderChannelsSchema,
      { items: [{ categoryId: null, id: "channel-1", position: -1 }] },
      ["items", 0, "position"],
    );
    assertRejects(ReorderCategoriesSchema, { items: [{ id: "category-1", position: 1.5 }] }, [
      "items",
      0,
      "position",
    ]);
    assertAccepts(CreateInviteSchema, { expiresInHours: 1, maxUses: 1 });
    assertAccepts(CreateInviteSchema, { expiresInHours: 720, maxUses: 1_000 });
    assertRejects(CreateInviteSchema, { expiresInHours: 721 }, ["expiresInHours"]);
    assertRejects(CreateInviteSchema, { maxUses: 1_001 }, ["maxUses"]);
    assertAccepts(CreateWorkspaceRoleSchema, { color: 0, name: "Mod", permissions: [] });
    assertAccepts(CreateWorkspaceRoleSchema, { color: 0xffffff, name: "Mod" });
    assertRejects(CreateWorkspaceRoleSchema, { color: -1, name: "Mod" }, ["color"]);
    assertRejects(CreateWorkspaceRoleSchema, { name: "role!" }, ["name"]);
    assertAccepts(UpdateWorkspaceMemberRolesSchema, {
      roleIds: Array.from({ length: 25 }, (_, index) => `role-${index}`),
    });
  });

  it("enforces nested response counters and timestamps", () => {
    assertRejects(WorkspaceInviteSchema, { ...invite, maxUses: 0 }, ["maxUses"]);
    assertRejects(WorkspaceInviteSchema, { ...invite, uses: -1 }, ["uses"]);
    assertRejects(WorkspaceInviteSchema, { ...invite, expiresAt: "tomorrow" }, ["expiresAt"]);
    assertRejects(WorkspaceMemberPageSchema, { ...memberPage, limit: 1.5 }, ["limit"]);
    assertRejects(WorkspaceServerSummarySchema, { ...serverSummary, memberCount: -1 }, [
      "memberCount",
    ]);
    assertRejects(WorkspaceServerSummarySchema, { ...serverSummary, messageCharacterLimit: 0 }, [
      "messageCharacterLimit",
    ]);
  });
});

describe("server type contract", () => {
  it("accepts only the two known server types", () => {
    assert.equal(ServerTypeSchema.parse("PERSONAL"), "PERSONAL");
    assert.equal(ServerTypeSchema.parse("COMMUNITY"), "COMMUNITY");
    assert.equal(ServerTypeSchema.safeParse("SYSTEM").success, false);
  });

  it("keeps the consumer create contract free of privileged fields", () => {
    assert.equal("type" in CreateServerSchema.shape, false);
    assert.equal("isPublic" in CreateServerSchema.shape, false);
    assert.equal("discoverable" in CreateServerSchema.shape, false);
    assert.equal("verificationLevel" in CreateServerSchema.shape, false);
  });

  it("lets the admin create contract carry the privileged fields", () => {
    const parsed = AdminCreateServerSchema.parse({
      discoverable: true,
      isPublic: true,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    assert.equal(parsed.type, "COMMUNITY");
    assert.equal(parsed.isPublic, true);
    assert.equal(parsed.discoverable, true);
  });

  it("forces community servers to stay publicly joinable", () => {
    const result = AdminCreateServerSchema.safeParse({
      isPublic: false,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    assert.equal(result.success, false);
  });

  it("defaults verificationLevel to NONE and lets the admin contract override it", () => {
    const defaulted = AdminCreateServerSchema.parse({ name: "Whispr Topluluk" });
    assert.equal(defaulted.verificationLevel, "NONE");

    const overridden = AdminCreateServerSchema.parse({
      name: "Whispr Topluluk",
      verificationLevel: "HIGH",
    });
    assert.equal(overridden.verificationLevel, "HIGH");

    assert.equal(
      AdminCreateServerSchema.safeParse({ name: "Whispr Topluluk", verificationLevel: "EXTREME" })
        .success,
      false,
    );
  });

  it("accepts every admin update field on its own, so the predicate cannot go stale", () => {
    const samples: Record<string, unknown> = {
      discoverable: true,
      featured: true,
      isPublic: true,
      type: "COMMUNITY",
      verificationLevel: "HIGH",
      verified: true,
    };

    // Derived from the schema's own keys, so adding a field to the contract
    // without teaching this test about it fails here instead of shipping a
    // predicate that silently ignores the new field.
    assert.deepEqual(
      Object.keys(AdminUpdateServerSchema.shape).sort(),
      Object.keys(samples).sort(),
    );

    for (const [field, value] of Object.entries(samples)) {
      assert.equal(
        AdminUpdateServerSchema.safeParse({ [field]: value }).success,
        true,
        `${field} alone must satisfy the at-least-one predicate`,
      );
    }

    assert.equal(AdminUpdateServerSchema.safeParse({}).success, false);
  });

  it("accepts every server update field on its own, so the predicate cannot go stale", () => {
    const samples: Record<string, unknown> = {
      allowFileUploads: true,
      allowGifs: true,
      allowMemberAdds: true,
      deletedMessageNoticeMinutes: 60,
      description: "Updated description",
      discoverable: true,
      iconUrl: "https://example.com/icon.png",
      isPublic: true,
      messageCharacterLimit: 2000,
      name: "Updated server",
      shortName: "ws1",
    };

    // Derived from the schema's own keys, so a field that lands on
    // `UpdateServerFieldsSchema` without this test knowing about it fails
    // here instead of silently being accepted by a hand-list that forgot it
    // -- the drift `UpdateServerSchema` itself has already hit once.
    assert.deepEqual(
      Object.keys(UpdateServerFieldsSchema.shape).sort(),
      Object.keys(samples).sort(),
    );

    for (const [field, value] of Object.entries(samples)) {
      assert.equal(
        UpdateServerSchema.safeParse({ [field]: value }).success,
        true,
        `${field} alone must satisfy the at-least-one predicate`,
      );
    }

    assert.equal(UpdateServerSchema.safeParse({}).success, false);
  });

  it("exposes visibility switches on update but never the type", () => {
    assert.equal("isPublic" in UpdateServerFieldsSchema.shape, true);
    assert.equal("discoverable" in UpdateServerFieldsSchema.shape, true);
    assert.equal("type" in UpdateServerFieldsSchema.shape, false);
  });

  it("describes the canonical public profile payload", () => {
    const profile = ServerPublicProfileSchema.parse({
      bannerUrl: null,
      channels: [{ liveCount: null, name: "duyurular", readOnly: true, type: "text" }],
      description: "",
      discoverable: true,
      iconUrl: null,
      isPublic: true,
      joined: false,
      memberCount: 12_400,
      mutualFriendCount: 0,
      mutualFriends: [],
      name: "Whispr Topluluk",
      onlineCount: 1_200,
      serverId: "s1",
      shortName: null,
      type: "COMMUNITY",
      verified: true,
    });

    assert.equal(profile.channels[0]?.name, "duyurular");
    assert.equal(profile.type, "COMMUNITY");
  });

  it("rejects a privileged field smuggled into the consumer contract", () => {
    const result = CreateServerSchema.safeParse({
      name: "Sızma denemesi",
      type: "COMMUNITY",
    });

    assert.equal(result.success, false);
  });

  it("accepts a visibility-only update", () => {
    assert.equal(UpdateServerSchema.safeParse({ isPublic: true }).success, true);
    assert.equal(UpdateServerSchema.safeParse({ discoverable: true }).success, true);
  });

  it("still rejects an update with no fields at all", () => {
    assert.equal(UpdateServerSchema.safeParse({}).success, false);
  });
});

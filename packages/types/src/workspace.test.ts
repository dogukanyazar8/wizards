import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as workspaceSchemas from "./workspace";
import {
  AddServerMemberSchema,
  CreateCategorySchema,
  CreateChannelSchema,
  CreateInviteSchema,
  CreateServerSchema,
  CreateWorkspaceRoleSchema,
  DeleteServerSchema,
  ReorderCategoriesSchema,
  ReorderChannelsSchema,
  RoleBadgeSchema,
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
  server: { ...serverSummary, description: null, isAdmin: true, isOwner: true },
  ungroupedChannels: [channel],
};

describe("workspace schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(workspaceSchemas, {
      AddServerMemberSchema: {
        schema: AddServerMemberSchema,
        valid: { username: "ada" },
        invalid: { username: "a" },
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

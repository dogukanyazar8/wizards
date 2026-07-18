import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileServerCreateRequestSchema as IndexedMobileServerCreateRequestSchema } from "./index";
import * as mobileWorkspaceSchemas from "./mobile-workspace-management";
import {
  MobileAssignableRoleSchema,
  MobileAssignableRolesResponseSchema,
  MobileCategoryCreateRequestSchema,
  MobileCategoryCreateResponseSchema,
  MobileCategoryUpdateRequestSchema,
  MobileChannelCreateRequestSchema,
  MobileChannelCreateResponseSchema,
  MobileChannelHistoryClearResponseSchema,
  MobileChannelIdParamsSchema,
  MobileChannelUpdateRequestSchema,
  MobileManagedWorkspaceServerDetailResponseSchema,
  MobileMediaClaimRequestSchema,
  MobileMediaClaimResponseSchema,
  MobileMediaUploadCompletionResponseSchema,
  MobileMediaUploadContentTypeSchema,
  MobileMediaUploadIntentSchema,
  MobileMediaUploadPurposeSchema,
  MobileMemberRolesUpdateRequestSchema,
  MobileMessageHistoryClearedEventSchema,
  MobileMutationSuccessResponseSchema,
  MobilePresenceUpdateEventSchema,
  MobileServerCapabilitiesSchema,
  MobileServerCategoryParamsSchema,
  MobileServerChannelParamsSchema,
  MobileServerCreateRequestSchema,
  MobileServerCreateResponseSchema,
  MobileServerDeleteRequestSchema,
  MobileServerIdParamsSchema,
  MobileServerInviteCreateRequestSchema,
  MobileServerInviteCreateResponseSchema,
  MobileServerInviteSchema,
  MobileServerInvitesResponseSchema,
  MobileServerJoinRequestSchema,
  MobileServerJoinResponseSchema,
  MobileServerMemberActionsSchema,
  MobileServerMemberParamsSchema,
  MobileServerMemberSchema,
  MobileServerMembersQuerySchema,
  MobileServerMembersResponseSchema,
  MobileServerMembershipAddedEventSchema,
  MobileServerMembershipRemovedEventSchema,
  MobileServerSettingsUpdatedEventSchema,
  MobileServerUpdateRequestSchema,
  MobileUserProfileUpdatedEventSchema,
} from "./mobile-workspace-management";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const resourceId = "resource-1";
const capabilities = {
  canClearHistory: true,
  canDeleteServer: true,
  canKickMembers: true,
  canManageChannels: true,
  canManageInvites: true,
  canManageRoles: true,
  canManageServer: true,
  canUploadServerIcon: true,
};
const profile = {
  avatarUrl: "https://cdn.example.com/avatar.png",
  customStatus: null,
  displayName: "Ada Lovelace",
  id: "user-1",
  status: "ONLINE" as const,
  twoFactorEnabled: false,
  username: "ada",
};
const profileClaim = {
  claimId: "claim-1",
  claimedAt: "2026-07-13T08:00:00.000Z",
  profile,
  purpose: "profile-avatar" as const,
};
const uploadCompletion = {
  claimId: "claim-1",
  expiresAt: "2026-07-13T08:15:00.000Z",
  purpose: "server-icon" as const,
  targetServerId: "server-1",
};
const invite = {
  channelId: "channel-1",
  createdAt: "2026-07-13T08:00:00.000Z",
  createdByDisplayName: "Ada",
  expiresAt: null,
  id: "invite-1",
  maxUses: null,
  shareUrl: "https://whispr.example/invite/safe_code-1",
  uses: 0,
};
const member = {
  accessLevel: "MEMBER" as const,
  actions: { canKick: true, canManageRoles: true },
  avatarUrl: null,
  customStatus: null,
  displayName: "Grace Hopper",
  id: "member-1",
  roleIds: ["managed-role", "member-role"],
  roles: [{ color: 0x336699, id: "member-role", name: "Member" }],
  status: "ONLINE" as const,
  userId: "user-2",
  username: "grace",
};
const managedDetail = {
  detail: {
    capabilities,
    categories: [],
    hasMoreChannels: false,
    members: [],
    server: {
      allowFileUploads: true,
      allowGifs: true,
      defaultChannelId: null,
      description: null,
      iconUrl: null,
      id: "server-1",
      memberCount: 1,
      mentionCount: 0,
      name: "Whispr Guild",
      shortName: null,
      unreadCount: 0,
      visibleChannelCount: 0,
    },
    ungroupedChannels: [],
  },
};
const assignableRole = {
  color: 0x336699,
  id: "role-1",
  name: "Moderator",
  position: 1,
};

describe("mobile workspace management schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(mobileWorkspaceSchemas, {
      MobileAssignableRoleSchema: {
        schema: MobileAssignableRoleSchema,
        valid: assignableRole,
        invalid: { ...assignableRole, permissions: ["ADMINISTRATOR"] },
      },
      MobileAssignableRolesResponseSchema: {
        schema: MobileAssignableRolesResponseSchema,
        valid: { roles: [assignableRole] },
        invalid: { roles: "role-1" },
      },
      MobileCategoryCreateRequestSchema: {
        schema: MobileCategoryCreateRequestSchema,
        valid: { name: "General" },
        invalid: { name: "!!!" },
      },
      MobileCategoryCreateResponseSchema: {
        schema: MobileCategoryCreateResponseSchema,
        valid: { category: { id: "category-1" } },
        invalid: { category: { id: "" } },
      },
      MobileCategoryUpdateRequestSchema: {
        schema: MobileCategoryUpdateRequestSchema,
        valid: { name: "Product" },
        invalid: { name: "<>" },
      },
      MobileChannelCreateRequestSchema: {
        schema: MobileChannelCreateRequestSchema,
        valid: { categoryId: "category-1", name: "general", type: "TEXT" },
        invalid: { name: "general", permissions: {}, type: "TEXT" },
      },
      MobileChannelCreateResponseSchema: {
        schema: MobileChannelCreateResponseSchema,
        valid: { channel: { id: "channel-1" } },
        invalid: { channel: { id: "" } },
      },
      MobileChannelHistoryClearResponseSchema: {
        schema: MobileChannelHistoryClearResponseSchema,
        valid: { deletedCount: 3 },
        invalid: { deletedCount: -1 },
      },
      MobileChannelIdParamsSchema: {
        schema: MobileChannelIdParamsSchema,
        valid: { channelId: resourceId },
        invalid: { channelId: "" },
      },
      MobileChannelUpdateRequestSchema: {
        schema: MobileChannelUpdateRequestSchema,
        valid: { topic: null },
        invalid: {},
      },
      MobileManagedWorkspaceServerDetailResponseSchema: {
        schema: MobileManagedWorkspaceServerDetailResponseSchema,
        valid: managedDetail,
        invalid: {
          detail: { ...managedDetail.detail, capabilities: { ...capabilities, canKickMembers: 1 } },
        },
      },
      MobileMediaClaimRequestSchema: {
        schema: MobileMediaClaimRequestSchema,
        valid: { claimId: "claim-1" },
        invalid: { claimId: "claim-1", url: "https://x.test/a" },
      },
      MobileMediaClaimResponseSchema: {
        schema: MobileMediaClaimResponseSchema,
        valid: profileClaim,
        invalid: { ...profileClaim, storageKey: "secret-key" },
      },
      MobileMediaUploadCompletionResponseSchema: {
        schema: MobileMediaUploadCompletionResponseSchema,
        valid: uploadCompletion,
        invalid: { ...uploadCompletion, storageKey: "secret-key" },
      },
      MobileMediaUploadContentTypeSchema: {
        schema: MobileMediaUploadContentTypeSchema,
        valid: "image/webp",
        invalid: "image/gif",
      },
      MobileMediaUploadIntentSchema: {
        schema: MobileMediaUploadIntentSchema,
        valid: { purpose: "profile-avatar" },
        invalid: { purpose: "server-icon" },
      },
      MobileMediaUploadPurposeSchema: {
        schema: MobileMediaUploadPurposeSchema,
        valid: "profile-avatar",
        invalid: "message-attachment",
      },
      MobileMemberRolesUpdateRequestSchema: {
        schema: MobileMemberRolesUpdateRequestSchema,
        valid: { roleIds: ["role-1"] },
        invalid: { roleIds: ["role-1", "role-1"] },
      },
      MobileMessageHistoryClearedEventSchema: {
        schema: MobileMessageHistoryClearedEventSchema,
        valid: { channelId: "channel-1" },
        invalid: { channelId: "" },
      },
      MobileMutationSuccessResponseSchema: {
        schema: MobileMutationSuccessResponseSchema,
        valid: { success: true },
        invalid: { success: false },
      },
      MobilePresenceUpdateEventSchema: {
        schema: MobilePresenceUpdateEventSchema,
        valid: { customStatus: "Reviewing", status: "IDLE", userId: "user-1" },
        invalid: { customStatus: "Reviewing", status: "INVISIBLE", userId: "user-1" },
      },
      MobileServerCapabilitiesSchema: {
        schema: MobileServerCapabilitiesSchema,
        valid: capabilities,
        invalid: { ...capabilities, canManageServer: "yes" },
      },
      MobileServerCategoryParamsSchema: {
        schema: MobileServerCategoryParamsSchema,
        valid: { categoryId: "category-1", serverId: "server-1" },
        invalid: { categoryId: "", serverId: "server-1" },
      },
      MobileServerChannelParamsSchema: {
        schema: MobileServerChannelParamsSchema,
        valid: { channelId: "channel-1", serverId: "server-1" },
        invalid: { channelId: "", serverId: "server-1" },
      },
      MobileServerCreateRequestSchema: {
        schema: MobileServerCreateRequestSchema,
        valid: { name: "Whispr Guild" },
        invalid: { iconUrl: "https://attacker.example/icon.png", name: "Whispr Guild" },
      },
      MobileServerCreateResponseSchema: {
        schema: MobileServerCreateResponseSchema,
        valid: { server: { id: "server-1" } },
        invalid: { server: { id: "" } },
      },
      MobileServerDeleteRequestSchema: {
        schema: MobileServerDeleteRequestSchema,
        valid: { confirmationName: "Whispr Guild" },
        invalid: { confirmationName: " " },
      },
      MobileServerIdParamsSchema: {
        schema: MobileServerIdParamsSchema,
        valid: { serverId: resourceId },
        invalid: { serverId: "" },
      },
      MobileServerInviteCreateRequestSchema: {
        schema: MobileServerInviteCreateRequestSchema,
        valid: { channelId: "channel-1", maxUses: 10 },
        invalid: { channelId: "x".repeat(129) },
      },
      MobileServerInviteCreateResponseSchema: {
        schema: MobileServerInviteCreateResponseSchema,
        valid: { invite },
        invalid: { invite: { ...invite, code: "secret" } },
      },
      MobileServerInviteSchema: {
        schema: MobileServerInviteSchema,
        valid: invite,
        invalid: { ...invite, shareUrl: "http://whispr.example/invite/code" },
      },
      MobileServerInvitesResponseSchema: {
        schema: MobileServerInvitesResponseSchema,
        valid: { invites: [invite] },
        invalid: { invites: "invite-1" },
      },
      MobileServerJoinRequestSchema: {
        schema: MobileServerJoinRequestSchema,
        valid: { inviteCode: "safe_code-1" },
        invalid: { inviteCode: "unsafe code" },
      },
      MobileServerJoinResponseSchema: {
        schema: MobileServerJoinResponseSchema,
        valid: { server: { id: "server-1" } },
        invalid: { server: { id: "" } },
      },
      MobileServerMemberActionsSchema: {
        schema: MobileServerMemberActionsSchema,
        valid: { canKick: true, canManageRoles: false },
        invalid: { canKick: true },
      },
      MobileServerMemberParamsSchema: {
        schema: MobileServerMemberParamsSchema,
        valid: { memberId: "member-1", serverId: "server-1" },
        invalid: { memberId: "", serverId: "server-1" },
      },
      MobileServerMemberSchema: {
        schema: MobileServerMemberSchema,
        valid: member,
        invalid: { ...member, roleIds: ["role-1", "role-1"] },
      },
      MobileServerMembersQuerySchema: {
        schema: MobileServerMembersQuerySchema,
        valid: { cursor: "member-1", limit: "50" },
        invalid: { limit: 101 },
      },
      MobileServerMembersResponseSchema: {
        schema: MobileServerMembersResponseSchema,
        valid: { memberPage: { limit: 50, nextCursor: null }, members: [member] },
        invalid: { memberPage: { limit: 101, nextCursor: null }, members: [member] },
      },
      MobileServerMembershipAddedEventSchema: {
        schema: MobileServerMembershipAddedEventSchema,
        valid: { serverId: "server-1" },
        invalid: { serverId: "", userId: "user-1" },
      },
      MobileServerMembershipRemovedEventSchema: {
        schema: MobileServerMembershipRemovedEventSchema,
        valid: { reason: "kicked", serverId: "server-1" },
        invalid: { reason: "banned", serverId: "server-1" },
      },
      MobileServerSettingsUpdatedEventSchema: {
        schema: MobileServerSettingsUpdatedEventSchema,
        valid: { serverId: "server-1" },
        invalid: { serverId: "server-1", settings: {} },
      },
      MobileServerUpdateRequestSchema: {
        schema: MobileServerUpdateRequestSchema,
        valid: { name: "Renamed Guild" },
        invalid: {},
      },
      MobileUserProfileUpdatedEventSchema: {
        schema: MobileUserProfileUpdatedEventSchema,
        valid: {
          avatarUrl: "https://cdn.example.com/avatar.png",
          customStatus: null,
          displayName: "Ada Lovelace",
          status: "ONLINE",
          userId: "user-1",
          username: "ada",
        },
        invalid: {
          avatarUrl: "not-a-url",
          customStatus: null,
          displayName: "Ada Lovelace",
          status: "ONLINE",
          userId: "user-1",
          username: "ada",
        },
      },
    });
  });

  it("exports the mobile management surface from the package index", () => {
    assert.equal(IndexedMobileServerCreateRequestSchema, MobileServerCreateRequestSchema);
  });

  it("rejects unknown request and response keys instead of stripping them", () => {
    const strictCases = [
      [MobileMediaClaimRequestSchema, { claimId: "claim-1", url: "https://x.test/a" }],
      [MobileMediaUploadCompletionResponseSchema, { ...uploadCompletion, storageKey: "key" }],
      [MobileServerCapabilitiesSchema, { ...capabilities, isAdmin: true }],
      [MobileServerIdParamsSchema, { serverId: "server-1", userId: "user-1" }],
      [MobileServerCreateRequestSchema, { name: "Guild", ownerId: "user-1" }],
      [MobileServerJoinRequestSchema, { inviteCode: "code", serverId: "server-1" }],
      [MobileServerInviteSchema, { ...invite, code: "secret" }],
      [MobileCategoryCreateRequestSchema, { name: "General", serverId: "server-1" }],
      [MobileChannelCreateRequestSchema, { name: "general", permissions: {}, type: "TEXT" }],
      [MobileServerMemberSchema, { ...member, permissions: ["ADMINISTRATOR"] }],
      [MobileAssignableRoleSchema, { ...assignableRole, managed: false }],
      [MobileMutationSuccessResponseSchema, { success: true, serverId: "server-1" }],
    ] as const;

    for (const [schema, value] of strictCases) {
      assertRejects(schema, value);
    }
  });

  it("bounds every independent path parameter to a trimmed 128-character id", () => {
    const id128 = "i".repeat(128);
    const id129 = "i".repeat(129);

    assertAccepts(MobileServerIdParamsSchema, { serverId: `  ${id128}  ` });
    assertRejects(MobileServerIdParamsSchema, { serverId: id129 }, ["serverId"]);
    assertAccepts(MobileServerCategoryParamsSchema, { categoryId: id128, serverId: id128 });
    assertRejects(MobileServerCategoryParamsSchema, { categoryId: id129, serverId: "server-1" }, [
      "categoryId",
    ]);
    assertAccepts(MobileServerChannelParamsSchema, { channelId: id128, serverId: id128 });
    assertRejects(MobileServerChannelParamsSchema, { channelId: id129, serverId: "server-1" }, [
      "channelId",
    ]);
    assertAccepts(MobileServerMemberParamsSchema, { memberId: id128, serverId: id128 });
    assertRejects(MobileServerMemberParamsSchema, { memberId: id129, serverId: "server-1" }, [
      "memberId",
    ]);
    assertAccepts(MobileChannelIdParamsSchema, { channelId: id128 });
    assertRejects(MobileChannelIdParamsSchema, { channelId: id129 }, ["channelId"]);
  });

  it("inherits bounded workspace fields while excluding client-owned media URLs", () => {
    assertAccepts(MobileServerCreateRequestSchema, {
      description: "d".repeat(160),
      name: "n".repeat(64),
    });
    assertRejects(MobileServerCreateRequestSchema, { name: "n".repeat(65) }, ["name"]);
    assertRejects(
      MobileServerCreateRequestSchema,
      { description: "d".repeat(161), name: "Whispr Guild" },
      ["description"],
    );
    assertRejects(MobileServerCreateRequestSchema, {
      iconUrl: "https://attacker.example/icon.png",
      name: "Whispr Guild",
    });

    assertAccepts(MobileServerUpdateRequestSchema, { description: "d".repeat(160) });
    assertRejects(MobileServerUpdateRequestSchema, { description: "d".repeat(161) }, [
      "description",
    ]);
    assertRejects(MobileServerUpdateRequestSchema, {});
    assertRejects(MobileServerUpdateRequestSchema, { iconUrl: null });
    assertAccepts(MobileChannelUpdateRequestSchema, { categoryId: null });
    assertRejects(MobileChannelUpdateRequestSchema, {});
  });

  it("bounds inherited nested ids, invite codes, and member pagination", () => {
    const id129 = "i".repeat(129);

    assertRejects(
      MobileChannelCreateRequestSchema,
      { categoryId: id129, name: "general", type: "TEXT" },
      ["categoryId"],
    );
    assertRejects(MobileChannelUpdateRequestSchema, { categoryId: id129 }, ["categoryId"]);
    assertRejects(MobileServerInviteCreateRequestSchema, { channelId: id129 }, ["channelId"]);

    assertAccepts(MobileServerJoinRequestSchema, { inviteCode: "A_b-9" });
    assertAccepts(MobileServerJoinRequestSchema, { inviteCode: "A".repeat(96) });
    assertRejects(MobileServerJoinRequestSchema, { inviteCode: "" }, ["inviteCode"]);
    assertRejects(MobileServerJoinRequestSchema, { inviteCode: "A".repeat(97) }, ["inviteCode"]);
    assertRejects(MobileServerJoinRequestSchema, { inviteCode: "bad code" }, ["inviteCode"]);

    assertAccepts(MobileServerMembersQuerySchema, { limit: 1 });
    assertAccepts(MobileServerMembersQuerySchema, { limit: 100 });
    assertRejects(MobileServerMembersQuerySchema, { limit: 0 }, ["limit"]);
    assertRejects(MobileServerMembersQuerySchema, { limit: 101 }, ["limit"]);
  });

  it("bounds typed server deletion confirmation to the server name contract", () => {
    assertAccepts(MobileServerDeleteRequestSchema, { confirmationName: "n".repeat(64) });
    assertRejects(MobileServerDeleteRequestSchema, { confirmationName: "n".repeat(65) }, [
      "confirmationName",
    ]);
  });

  it("keeps role replacement and member role sets unique, complete, and bounded", () => {
    const roleIds25 = Array.from({ length: 25 }, (_, index) => `role-${index}`);

    assertAccepts(MobileMemberRolesUpdateRequestSchema, { roleIds: [] });
    assertAccepts(MobileMemberRolesUpdateRequestSchema, { roleIds: roleIds25 });
    assertRejects(MobileMemberRolesUpdateRequestSchema, {
      roleIds: Array.from({ length: 26 }, (_, index) => `r-${index}`),
    });
    assertRejects(MobileMemberRolesUpdateRequestSchema, { roleIds: ["role-1", "role-1"] });
    assertRejects(MobileMemberRolesUpdateRequestSchema, { roleIds: ["r".repeat(129)] }, [
      "roleIds",
      0,
    ]);

    const parsed = assertAccepts(MobileServerMemberSchema, member);
    assert.deepEqual(parsed?.roleIds, ["managed-role", "member-role"]);
    assert.equal(parsed?.roleIds.includes("default-role"), false);
    assertAccepts(MobileServerMemberSchema, { ...member, roleIds: roleIds25 });
    assertRejects(MobileServerMemberSchema, {
      ...member,
      roleIds: Array.from({ length: 26 }, (_, index) => `role-${index}`),
    });
    assertRejects(MobileServerMemberSchema, { ...member, roleIds: ["role-1", "role-1"] });
    assertRejects(MobileServerMemberSchema, { ...member, roleIds: ["r".repeat(129)] }, [
      "roleIds",
      0,
    ]);
  });

  it("accepts only canonical HTTPS invite URLs and never exposes invite codes", () => {
    assertAccepts(MobileServerInviteSchema, invite);
    assert.doesNotThrow(() => {
      assert.equal(
        MobileServerInviteSchema.safeParse({ ...invite, shareUrl: "not a url" }).success,
        false,
      );
    });
    assertRejects(MobileServerInviteSchema, {
      ...invite,
      shareUrl: "http://whispr.example/invite/code",
    });
    assertRejects(MobileServerInviteSchema, { ...invite, code: "secret-code" });
  });

  it("keeps media responses purpose-discriminated and free of storage metadata", () => {
    assertAccepts(MobileMediaUploadIntentSchema, { purpose: "profile-avatar" });
    assertAccepts(MobileMediaUploadIntentSchema, {
      purpose: "server-icon",
      targetServerId: "server-1",
    });
    assertRejects(MobileMediaUploadIntentSchema, { purpose: "server-icon" });
    assertRejects(MobileMediaUploadIntentSchema, {
      purpose: "profile-avatar",
      targetServerId: "server-1",
    });

    assertAccepts(MobileMediaClaimResponseSchema, profileClaim);
    assertRejects(MobileMediaClaimResponseSchema, {
      ...profileClaim,
      profile: { ...profile, avatarUrl: "http://cdn.example.com/avatar.png" },
    });
    assertRejects(MobileMediaClaimResponseSchema, {
      ...profileClaim,
      profile: { ...profile, avatarUrl: null },
    });
    assertAccepts(MobileMediaClaimResponseSchema, {
      claimId: "claim-1",
      claimedAt: "2026-07-13T08:00:00.000Z",
      purpose: "server-icon",
      server: { iconUrl: "https://cdn.example.com/icon.png", id: "server-1" },
    });
    assertRejects(MobileMediaClaimResponseSchema, {
      claimId: "claim-1",
      claimedAt: "2026-07-13T08:00:00.000Z",
      purpose: "server-icon",
      server: { iconUrl: "http://cdn.example.com/icon.png", id: "server-1" },
    });
    assertRejects(MobileMediaClaimResponseSchema, { ...profileClaim, storageKey: "secret-key" });
    assertRejects(MobileMediaClaimResponseSchema, {
      ...profileClaim,
      profile: { ...profile, storageKey: "secret-key" },
    });
    assertRejects(MobileMediaUploadCompletionResponseSchema, {
      ...uploadCompletion,
      storageKey: "secret-key",
    });
  });
});

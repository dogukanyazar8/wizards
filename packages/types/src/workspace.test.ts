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
  CreateServerInviteSchema,
  CreateServerSchema,
  CreateServerScheduledEventSchema,
  CreateWorkspaceRoleSchema,
  DeleteServerSchema,
  ReorderCategoriesSchema,
  ReorderChannelsSchema,
  RoleBadgeSchema,
  ServerBanEntrySchema,
  ServerBanSchema,
  ServerBansResponseSchema,
  ServerDiscoveryCardSchema,
  ServerDiscoveryPageSchema,
  ServerDiscoveryQuerySchema,
  ServerIconToneSchema,
  ServerMemberTimeoutSchema,
  ServerNotificationLevelSchema,
  ServerPendingInviteSchema,
  ServerPendingInviteUserSchema,
  ServerPendingInvitesResponseSchema,
  ServerProfileAccessLevelSchema,
  ServerPublicProfileAdminSchema,
  ServerPublicProfileChannelSchema,
  ServerPublicProfileFriendSchema,
  ServerPublicProfileParticipantSchema,
  ServerPublicProfileSchema,
  ServerScheduledEventEntityTypeSchema,
  ServerScheduledEventKindSchema,
  ServerScheduledEventRsvpStatusSchema,
  ServerScheduledEventSchema,
  ServerScheduledEventStatusSchema,
  ServerSlowModeSchema,
  ServerTagSchema,
  ServerTagsSchema,
  ServerTypeSchema,
  ServerUserSettingsSchema,
  ServerVerificationLevelSchema,
  SetServerScheduledEventInterestSchema,
  TargetedInviteSchema,
  TransferServerOwnershipSchema,
  UpdateCategorySchema,
  UpdateChannelFieldsSchema,
  UpdateChannelSchema,
  UpdateServerFieldsSchema,
  UpdateServerSchema,
  UpdateServerScheduledEventSchema,
  UpdateServerTagsSchema,
  UpdateServerUserSettingsSchema,
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
  WorkspaceInvitesResponseSchema,
  WorkspaceMemberCountsSchema,
  WorkspaceMemberFilterSchema,
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
  communicationDisabledUntil: null,
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
  targetUserId: null,
  uses: 0,
};
const pendingInviteUser = {
  avatarUrl: null,
  displayName: "Ayşe Kaya",
  id: "user-7",
  username: "aysek",
};
const pendingInvite = {
  ...invite,
  maxUses: 1,
  targetUser: pendingInviteUser,
  targetUserId: "user-7",
};
const memberPage = { limit: 50, nextCursor: null };
const memberCounts = { filtered: 3, total: 24 };
const banEntry = {
  avatarUrl: null,
  bannedAt: "2026-08-25T10:00:00.000Z",
  bannedByDisplayName: "Ada",
  bannedByUserId: "user-owner",
  displayName: "Spam Bot",
  reason: "spam",
  userId: "user-banned",
  username: "spambot",
};
const serverSummary = {
  accessLevel: "OWNER" as const,
  allowFileUploads: true,
  allowGifs: true,
  allowMemberAdds: true,
  defaultChannelId: "channel-1",
  deletedMessageNoticeMinutes: 60,
  iconColor: "accent2" as const,
  iconUrl: null,
  id: "server-1",
  inviteCode: "invite-code",
  memberCount: 1,
  messageCharacterLimit: 2_000,
  name: "Analytical Engine",
  shortName: "AE",
  slowModeDelay: 0,
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
const serverPublicProfileChannel = {
  categoryId: null,
  categoryName: null,
  id: "c1",
  isPrivate: false,
  lastActivityAt: null,
  liveCount: null,
  name: "duyurular",
  participants: [],
  readOnly: true,
  type: "text" as const,
};
const serverScheduledEvent = {
  attendeeCount: 3,
  channelId: "c9",
  channelName: "live-room",
  description: null,
  entityType: "VOICE" as const,
  externalLocation: null,
  id: "e1",
  interestedCount: 12,
  name: "Topluluk buluşması",
  scheduledEndAt: null,
  scheduledStartAt: "2026-08-11T18:00:00.000Z",
  serverId: "s1",
  status: "SCHEDULED" as const,
  viewerInterested: false,
};
const serverPublicProfile = {
  accessLevel: "public" as const,
  admins: [],
  bannerUrl: null,
  canManageServer: false,
  category: "destek" as const,
  channelCount: 1,
  channels: [serverPublicProfileChannel],
  createdAt: "2026-01-02T03:04:05.000Z",
  description: "",
  discoverable: true,
  iconColor: null,
  iconUrl: null,
  inviteAddress: "whispr.gg/mobile-test",
  isPublic: true,
  joined: false,
  joinedAt: null,
  languages: ["tr", "en"],
  memberCount: 12_400,
  muted: false,
  mutualFriendCount: 0,
  mutualFriends: [],
  name: "Whispr Topluluk",
  notificationLevel: "all" as const,
  onlineCount: 1_200,
  serverId: "s1",
  shortName: null,
  starred: false,
  tags: ["sohbet", "oyun"],
  type: "COMMUNITY" as const,
  upcomingEvent: serverScheduledEvent,
  verified: true,
  voiceActiveCount: 2,
  voiceRoomCount: 4,
  weeklyMessageCount: 480,
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
          shortName: "WHS",
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
      CreateServerScheduledEventSchema: {
        schema: CreateServerScheduledEventSchema,
        valid: {
          entityType: "VOICE",
          name: "Topluluk buluşması",
          scheduledStartAt: "2026-08-11T18:00:00.000Z",
        },
        invalid: {
          entityType: "VOICE",
          name: "Topluluk buluşması",
          scheduledEndAt: "2026-08-11T17:00:00.000Z",
          scheduledStartAt: "2026-08-11T18:00:00.000Z",
        },
      },
      CreateServerSchema: {
        schema: CreateServerSchema,
        valid: { name: "Whispr", shortName: "wsz" },
        invalid: { name: "Whispr", shortName: "ws" },
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
      ServerBanEntrySchema: {
        schema: ServerBanEntrySchema,
        valid: banEntry,
        invalid: { ...banEntry, bannedAt: "dün" },
      },
      ServerBanSchema: {
        schema: ServerBanSchema,
        valid: { deleteMessageSeconds: 604_800, reason: "spam" },
        invalid: { deleteMessageSeconds: 604_801 },
      },
      ServerBansResponseSchema: {
        schema: ServerBansResponseSchema,
        valid: { bans: [banEntry], nextCursor: null, total: 1 },
        invalid: { bans: [banEntry], nextCursor: null, total: -1 },
      },
      ServerDiscoveryCardSchema: {
        schema: ServerDiscoveryCardSchema,
        valid: {
          bannerUrl: null,
          description: "",
          iconColor: null,
          iconUrl: null,
          id: "s1",
          memberCount: 12_400,
          name: "Whispr Topluluk",
          onlineCount: 1_200,
          shortName: null,
          tags: ["sohbet"],
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
          tags: ["sohbet"],
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
      ServerIconToneSchema: {
        schema: ServerIconToneSchema,
        valid: "accent2",
        // Token adı `--accent-2`, ton adı `accent2`: tire sözleşmede yok, çünkü tonlar
        // aynı zamanda nesne anahtarı olarak kullanılıyor.
        invalid: "accent-2",
      },
      ServerMemberTimeoutSchema: {
        schema: ServerMemberTimeoutSchema,
        valid: { until: null },
        invalid: { until: "yarın" },
      },
      ServerNotificationLevelSchema: {
        schema: ServerNotificationLevelSchema,
        valid: "mentions",
        invalid: "MENTIONS",
      },
      ServerProfileAccessLevelSchema: {
        schema: ServerProfileAccessLevelSchema,
        valid: "invite",
        invalid: "secret",
      },
      ServerPublicProfileAdminSchema: {
        schema: ServerPublicProfileAdminSchema,
        valid: {
          avatarUrl: null,
          displayName: "Ada",
          id: "u1",
          lastSeenAt: null,
          presence: "offline",
          role: "owner",
          shortName: null,
          username: "ada",
        },
        invalid: {
          avatarUrl: null,
          displayName: "Ada",
          id: "u1",
          lastSeenAt: null,
          presence: "idle",
          role: "owner",
          shortName: null,
          username: "ada",
        },
      },
      ServerPublicProfileChannelSchema: {
        schema: ServerPublicProfileChannelSchema,
        valid: serverPublicProfileChannel,
        invalid: { ...serverPublicProfileChannel, type: "forum" },
      },
      ServerPublicProfileFriendSchema: {
        schema: ServerPublicProfileFriendSchema,
        valid: {
          avatarUrl: null,
          displayName: "Ada",
          id: "friend-1",
          presence: "online",
          role: "admin",
        },
        invalid: { avatarUrl: null, displayName: "Ada", id: "friend-1" },
      },
      ServerPublicProfileParticipantSchema: {
        schema: ServerPublicProfileParticipantSchema,
        valid: { avatarUrl: null, displayName: "Ada", id: "u1", shortName: "AD" },
        invalid: { avatarUrl: null, displayName: "Ada", id: "u1" },
      },
      ServerPublicProfileSchema: {
        schema: ServerPublicProfileSchema,
        valid: serverPublicProfile,
        invalid: { ...serverPublicProfile, memberCount: -1 },
      },
      ServerScheduledEventEntityTypeSchema: {
        schema: ServerScheduledEventEntityTypeSchema,
        valid: "VOICE",
        invalid: "voice",
      },
      ServerScheduledEventKindSchema: {
        schema: ServerScheduledEventKindSchema,
        valid: "WORKSHOP",
        invalid: "workshop",
      },
      ServerScheduledEventRsvpStatusSchema: {
        schema: ServerScheduledEventRsvpStatusSchema,
        valid: "MAYBE",
        // K1 — yanıt yokluğu üçüncü bir üye değil, satırın yokluğu.
        invalid: "NONE",
      },
      ServerScheduledEventSchema: {
        schema: ServerScheduledEventSchema,
        valid: serverScheduledEvent,
        invalid: { ...serverScheduledEvent, interestedCount: -1 },
      },
      ServerScheduledEventStatusSchema: {
        schema: ServerScheduledEventStatusSchema,
        valid: "SCHEDULED",
        // The database enum doubles the L; a single-L spelling is a drift bug.
        invalid: "CANCELED",
      },
      ServerSlowModeSchema: {
        schema: ServerSlowModeSchema,
        valid: 3_600,
        // 45 saniye kanal çip grubunda yok; iki küme ayrışırsa `max(server, channel)` kuralı
        // seçili görünecek bir çip bulamaz.
        invalid: 45,
      },
      ServerTagSchema: {
        schema: ServerTagSchema,
        valid: "sohbet-odasi",
        invalid: "sohbet odası",
      },
      ServerTagsSchema: {
        schema: ServerTagsSchema,
        valid: ["sohbet", "oyun"],
        invalid: ["a", "b", "c", "d", "e", "f"],
      },
      ServerUserSettingsSchema: {
        schema: ServerUserSettingsSchema,
        valid: {
          muted: false,
          mutedUntil: null,
          notificationLevel: "all",
          starred: true,
        },
        invalid: {
          muted: false,
          mutedUntil: "yarın",
          notificationLevel: "all",
          starred: true,
        },
      },
      SetServerScheduledEventInterestSchema: {
        schema: SetServerScheduledEventInterestSchema,
        valid: { interested: true },
        invalid: { interested: true, extra: 1 },
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
      TargetedInviteSchema: {
        schema: TargetedInviteSchema,
        valid: { targetUserId: "user-1" },
        invalid: { targetUserId: "user-1", maxUses: 5 },
      },
      TransferServerOwnershipSchema: {
        schema: TransferServerOwnershipSchema,
        valid: { acknowledged: true, newOwnerUserId: "user-2" },
        invalid: { acknowledged: false, newOwnerUserId: "user-2" },
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
      UpdateServerScheduledEventSchema: {
        schema: UpdateServerScheduledEventSchema,
        valid: { name: "Yeni ad" },
        invalid: {},
      },
      UpdateServerTagsSchema: {
        schema: UpdateServerTagsSchema,
        valid: { tags: ["sohbet"] },
        invalid: { tags: ["Sohbet Odası"] },
      },
      UpdateServerUserSettingsSchema: {
        schema: UpdateServerUserSettingsSchema,
        valid: { starred: true },
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
      WorkspaceInvitesResponseSchema: {
        schema: WorkspaceInvitesResponseSchema,
        valid: { invites: [invite] },
        invalid: { invites: invite },
      },
      ServerPendingInviteUserSchema: {
        schema: ServerPendingInviteUserSchema,
        valid: pendingInviteUser,
        invalid: { ...pendingInviteUser, username: 7 },
      },
      ServerPendingInviteSchema: {
        schema: ServerPendingInviteSchema,
        valid: pendingInvite,
        invalid: { ...pendingInvite, targetUser: undefined },
      },
      ServerPendingInvitesResponseSchema: {
        schema: ServerPendingInvitesResponseSchema,
        valid: { invites: [pendingInvite] },
        invalid: { invites: [invite] },
      },
      CreateServerInviteSchema: {
        schema: CreateServerInviteSchema,
        valid: { expiresInHours: 168, maxUses: 25, targetUserId: "user-7" },
        invalid: { targetUserId: "" },
      },
      WorkspaceMemberCountsSchema: {
        schema: WorkspaceMemberCountsSchema,
        valid: memberCounts,
        invalid: { ...memberCounts, filtered: -1 },
      },
      WorkspaceMemberFilterSchema: {
        schema: WorkspaceMemberFilterSchema,
        valid: "moderator",
        invalid: "MODERATOR",
      },
      WorkspaceMemberPageSchema: {
        schema: WorkspaceMemberPageSchema,
        valid: memberPage,
        invalid: { ...memberPage, limit: 0 },
      },
      WorkspaceMembersResponseSchema: {
        schema: WorkspaceMembersResponseSchema,
        valid: { memberCounts, memberPage, members: [member] },
        invalid: { memberCounts, memberPage, members: "member-1" },
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
      shortName: "wsz",
    });
    assert.deepEqual(parsed, {
      allowFileUploads: true,
      allowGifs: true,
      allowMemberAdds: true,
      description: "A community",
      // Ş10: erişim varsayılanı `false`/`false` — alanı hiç göndermeyen bir istemci
      // (eski mobil sürüm, admin ötesi her çağrı) eskisi gibi **özel** sunucu doğurur.
      discoverable: false,
      iconUrl: null,
      isPublic: false,
      name: "Whispr",
      shortName: "WSZ",
    });

    assertRejects(CreateServerSchema, { name: "Whispr" }, ["shortName"]);
  });

  it("enforces create-server name, description, icon, and short-name boundaries", () => {
    assertAccepts(CreateServerSchema, {
      description: "d".repeat(160),
      iconUrl: "https://cdn.example.com/icon.png",
      name: "n".repeat(64),
      shortName: "Ab1",
    });
    assertRejects(CreateServerSchema, { name: "n" }, ["name"]);
    assertRejects(CreateServerSchema, { name: "n".repeat(65) }, ["name"]);
    assertRejects(CreateServerSchema, { description: "d".repeat(161), name: "Whispr" }, [
      "description",
    ]);
    assertRejects(CreateServerSchema, { iconUrl: "not-a-url", name: "Whispr" }, ["iconUrl"]);
    for (const shortName of ["", "A", "AB", "ABCD", "ABCDE"]) {
      assertRejects(CreateServerSchema, { name: "Whispr", shortName }, ["shortName"]);
    }
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

  it("narrows the role name to 32 and the event name/description to 60/180 (K6)", () => {
    // Daraltma öncesi ihlal taraması koştu: `wizards` ve `wizards_e2e` veritabanlarında
    // `length(name) > 32` (Role), `length(name) > 60` ve
    // `length(coalesce(description,'')) > 180` (ScheduledEvent) sorgularının üçü de 0 satır
    // döndü. Sınırın tam değeri geçmeli, bir fazlası düşmeli — aksi hâlde tasarımın `0/32`,
    // `0/60`, `0/180` sayaçları uyarı rengine dönmeden kayıt reddedilirdi.
    for (const schema of [CreateWorkspaceRoleSchema, UpdateWorkspaceRoleSchema]) {
      assertAccepts(schema, { name: "r".repeat(32) });
      assertRejects(schema, { name: "r".repeat(33) }, ["name"]);
    }

    assertAccepts(CreateServerScheduledEventSchema, {
      entityType: "VOICE",
      name: "e".repeat(60),
      scheduledStartAt: "2026-08-18T17:00:00.000Z",
    });
    assertRejects(
      CreateServerScheduledEventSchema,
      {
        entityType: "VOICE",
        name: "e".repeat(61),
        scheduledStartAt: "2026-08-18T17:00:00.000Z",
      },
      ["name"],
    );

    assertAccepts(UpdateServerScheduledEventSchema, { description: "d".repeat(180) });
    assertRejects(UpdateServerScheduledEventSchema, { description: "d".repeat(181) }, [
      "description",
    ]);
    assertAccepts(UpdateServerScheduledEventSchema, { name: "e".repeat(60) });
    assertRejects(UpdateServerScheduledEventSchema, { name: "e".repeat(61) }, ["name"]);
  });

  it("reads the icon tone as required and writable back to null (K2)", () => {
    // `null` "sahibi seçmedi" demek, "alan yok" değil: okuma tarafında zorunlu, yazma
    // tarafında ise `Kaldır` düğmesinin gönderdiği değer.
    assertAccepts(WorkspaceServerSummarySchema, { ...serverSummary, iconColor: null });
    assertRejects(WorkspaceServerSummarySchema, { ...serverSummary, iconColor: "accent-2" }, [
      "iconColor",
    ]);
    assertRejects(WorkspaceServerSummarySchema, { ...serverSummary, iconColor: undefined }, [
      "iconColor",
    ]);

    assertAccepts(UpdateServerSchema, { iconColor: null });
    for (const tone of ["primary", "info", "success", "warning", "danger", "accent2"]) {
      assertAccepts(UpdateServerSchema, { iconColor: tone });
      assertAccepts(CreateServerSchema, {
        iconColor: tone,
        name: "Whispr",
        shortName: "WHS",
      });
    }
    assertRejects(CreateServerSchema, { iconColor: null, name: "Whispr" }, ["iconColor"]);
  });

  it("shares one slow-mode value set between the server and its channels (K2)", () => {
    for (const slowModeDelay of [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600]) {
      assertAccepts(UpdateServerSchema, { slowModeDelay });
      assertAccepts(WorkspaceServerSummarySchema, { ...serverSummary, slowModeDelay });
    }

    assertRejects(UpdateServerSchema, { slowModeDelay: 45 }, ["slowModeDelay"]);
    assertRejects(UpdateServerSchema, { slowModeDelay: 7_200 }, ["slowModeDelay"]);
    assertRejects(WorkspaceServerSummarySchema, { ...serverSummary, slowModeDelay: 45 }, [
      "slowModeDelay",
    ]);
  });

  it("defaults the two new read fields that older responses omit (K3)", () => {
    const { targetUserId: _omittedInviteTarget, ...inviteWithoutTarget } = invite;
    const { communicationDisabledUntil: _omittedTimeout, ...memberWithoutTimeout } = member;

    assert.equal(assertAccepts(WorkspaceInviteSchema, inviteWithoutTarget)?.targetUserId, null);
    assert.equal(
      assertAccepts(WorkspaceMemberSchema, memberWithoutTimeout)?.communicationDisabledUntil,
      null,
    );
    assert.equal(
      assertAccepts(WorkspaceInviteSchema, { ...invite, targetUserId: "user-9" })?.targetUserId,
      "user-9",
    );
  });

  it("carries the member counter and the seven filters the chips need (Ş2, SPEC §8.6)", () => {
    // Yedi çip: dördü atanmış role, ikisi presence'a bakar, biri her şeyi geçirir.
    assert.deepEqual(WorkspaceMemberFilterSchema.options, [
      "all",
      "member",
      "moderator",
      "admin",
      "owner",
      "online",
      "offline",
    ]);
    assertRejects(WorkspaceMemberFilterSchema, "MODERATOR");

    // Sayaç zorunlu: eksik bırakılsa yanıt `0 / 0` çizerdi.
    assertRejects(WorkspaceMembersResponseSchema, { memberPage, members: [member] }, [
      "memberCounts",
    ]);
    const parsed = assertAccepts(WorkspaceMembersResponseSchema, {
      memberCounts: { filtered: 3, total: 24 },
      memberPage,
      members: [member],
    });
    assert.deepEqual(parsed?.memberCounts, { filtered: 3, total: 24 });
    assertRejects(WorkspaceMemberCountsSchema, { filtered: 3, total: 24, extra: 1 });
  });

  it("describes a ban row by who, why, by whom and when (Ş2)", () => {
    assertAccepts(ServerBanEntrySchema, banEntry);
    // Sebep girilmemiş ban boş metin değil, `null` taşır.
    assert.equal(assertAccepts(ServerBanEntrySchema, { ...banEntry, reason: null })?.reason, null);
    // Hesabı silinmiş moderatörün adı düşebilir, kimliği düşemez.
    assertAccepts(ServerBanEntrySchema, { ...banEntry, bannedByDisplayName: null });
    assertRejects(ServerBanEntrySchema, { ...banEntry, bannedByUserId: 4 }, ["bannedByUserId"]);
    assertRejects(ServerBanEntrySchema, { ...banEntry, bannedAt: "dün" }, ["bannedAt"]);
    assertRejects(ServerBansResponseSchema, { bans: [banEntry], nextCursor: null }, ["total"]);
  });

  it("keeps ownership transfer, timeout and ban as strict, single-purpose bodies (K2, K3)", () => {
    assertAccepts(TransferServerOwnershipSchema, {
      acknowledged: true,
      newOwnerUserId: "user-2",
    });
    // Onay anahtarı kapalıyken düğme pasif: `false` diye geçerli bir istek yok.
    assertRejects(
      TransferServerOwnershipSchema,
      { acknowledged: false, newOwnerUserId: "user-2" },
      ["acknowledged"],
    );
    assertRejects(TransferServerOwnershipSchema, { acknowledged: true, newOwnerUserId: "" }, [
      "newOwnerUserId",
    ]);

    assertAccepts(ServerMemberTimeoutSchema, {
      reason: "  spam  ",
      until: "2026-08-18T17:00:00.000Z",
    });
    assert.equal(assertAccepts(ServerMemberTimeoutSchema, { until: null })?.until, null);
    assertRejects(ServerMemberTimeoutSchema, { reason: "r".repeat(201), until: null }, ["reason"]);
    assertRejects(ServerMemberTimeoutSchema, {}, ["until"]);

    assertAccepts(ServerBanSchema, {});
    assertAccepts(ServerBanSchema, { deleteMessageSeconds: 0 });
    assertAccepts(ServerBanSchema, { deleteMessageSeconds: 604_800 });
    assertRejects(ServerBanSchema, { deleteMessageSeconds: -1 }, ["deleteMessageSeconds"]);
    assertRejects(ServerBanSchema, { deleteMessageSeconds: 604_801 }, ["deleteMessageSeconds"]);

    assertAccepts(TargetedInviteSchema, { targetUserId: "user-1" });
    assertRejects(TargetedInviteSchema, { targetUserId: "" }, ["targetUserId"]);
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

    const createdChannel = assertAccepts(CreateChannelSchema, {
      name: "  Sürüm  Notları  ",
      topic: "  Daily sync  ",
      type: "TEXT",
    });
    assert.equal(createdChannel?.name, "Sürüm  Notları");

    const updatedChannel = assertAccepts(UpdateChannelSchema, { name: "Tasarım Odası" });
    assert.equal(updatedChannel?.name, "Tasarım Odası");
    assertRejects(CreateChannelSchema, { name: "channel/name", type: "TEXT" }, ["name"]);
    assertRejects(CreateChannelSchema, { name: "general", topic: "t".repeat(121), type: "TEXT" }, [
      "topic",
    ]);
  });

  it("preserves channel advanced settings and rejects settings from the wrong channel type", () => {
    const text = assertAccepts(CreateChannelSchema, {
      name: "general",
      slowModeDelay: 30,
      type: "TEXT",
    });
    assert.equal(text?.slowModeDelay, 30);

    const voice = assertAccepts(CreateChannelSchema, {
      bitrate: 128_000,
      name: "voice",
      rtcRegion: "EU_WEST",
      userLimit: 7,
      videoQualityMode: "FULL",
      type: "VOICE",
    });
    assert.equal(voice?.bitrate, 128_000);
    assert.equal(voice?.userLimit, 7);
    assert.equal(voice?.rtcRegion, "EU_WEST");
    assert.equal(voice?.videoQualityMode, "FULL");

    for (const slowModeDelay of [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600]) {
      assertAccepts(CreateChannelSchema, { name: "text", slowModeDelay, type: "TEXT" });
    }
    for (const bitrate of [32_000, 64_000, 96_000, 128_000]) {
      assertAccepts(CreateChannelSchema, { bitrate, name: "voice", type: "VOICE" });
    }

    assertRejects(CreateChannelSchema, { bitrate: 64_000, name: "text", type: "TEXT" }, [
      "bitrate",
    ]);
    assertRejects(CreateChannelSchema, { name: "voice", slowModeDelay: 5, type: "VOICE" }, [
      "slowModeDelay",
    ]);
    assertRejects(CreateChannelSchema, { name: "voice", type: "VOICE", userLimit: 11 }, [
      "userLimit",
    ]);
    assertRejects(CreateChannelSchema, { bitrate: 48_000, name: "voice", type: "VOICE" }, [
      "bitrate",
    ]);
    assertRejects(CreateChannelSchema, {
      name: "voice",
      rtcRegion: "https://attacker.example",
      type: "VOICE",
    });
    assertRejects(CreateChannelSchema, { name: "text", type: "TEXT", unexpected: true });
  });

  it("validates channel advanced settings on updates and projects them to clients", () => {
    assertAccepts(UpdateChannelSchema, { slowModeDelay: 60 });
    assertAccepts(UpdateChannelSchema, {
      bitrate: 96_000,
      rtcRegion: null,
      userLimit: 0,
      videoQualityMode: "AUTO",
    });
    assertRejects(UpdateChannelSchema, { slowModeDelay: 1 }, ["slowModeDelay"]);
    assertRejects(UpdateChannelSchema, { userLimit: -1 }, ["userLimit"]);
    assertRejects(UpdateChannelSchema, { videoQualityMode: "LOW" }, ["videoQualityMode"]);

    const parsed = assertAccepts(WorkspaceChannelSchema, {
      ...channel,
      bitrate: 64_000,
      rtcRegion: null,
      slowModeDelay: 0,
      userLimit: 0,
      videoQualityMode: "AUTO",
    });
    assert.equal(parsed?.slowModeDelay, 0);
    assert.equal(parsed?.bitrate, 64_000);
    assert.equal(parsed?.userLimit, 0);
    assert.equal(parsed?.rtcRegion, null);
    assert.equal(parsed?.videoQualityMode, "AUTO");
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
    // Ş3 · SPEC §8.7 — altı süre ve altı kullanım çipinin tamamı sözleşmeden geçer.
    for (const expiresInHours of [1, 12, 24, 168, 720, null]) {
      assertAccepts(CreateServerInviteSchema, { expiresInHours });
    }
    for (const maxUses of [1, 5, 25, 100, 1_000, null]) {
      assertAccepts(CreateServerInviteSchema, { maxUses });
    }
    assertAccepts(CreateServerInviteSchema, { targetUserId: null });
    assertAccepts(CreateServerInviteSchema, {});
    assertRejects(CreateServerInviteSchema, { targetUserId: "" }, ["targetUserId"]);
    assertRejects(CreateServerInviteSchema, { expiresInHours: 721 }, ["expiresInHours"]);
    assertRejects(CreateServerInviteSchema, { maxUses: 1_001 }, ["maxUses"]);
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

  /**
   * Ş10 (SPEC-SUNUCU §7.4) `isPublic`/`discoverable`'ı tüketici sözleşmesine **taşıdı**:
   * oluşturma penceresinin `ERİŞİM` radyosu üç kombinasyonu da gönderiyor ve sahip bu iki
   * alanı `PATCH` ile zaten yazabiliyordu. Gate artık `type` ve `verificationLevel`: bir
   * sunucunun `COMMUNITY` ya da doğrulanmış olması hâlâ yalnız admin yüzeyinden gelir.
   */
  it("keeps the consumer create contract free of privileged fields", () => {
    assert.equal("type" in CreateServerSchema.shape, false);
    assert.equal("verificationLevel" in CreateServerSchema.shape, false);
    assert.equal("isPublic" in CreateServerSchema.shape, true);
    assert.equal("discoverable" in CreateServerSchema.shape, true);
  });

  it("defaults the consumer create contract to a private, undiscoverable server (Ş10)", () => {
    const parsed = CreateServerSchema.parse({ name: "Whispr", shortName: "WHS" });

    assert.equal(parsed.isPublic, false);
    assert.equal(parsed.discoverable, false);
    assert.equal(parsed.tags, undefined);
    assert.equal(parsed.messageCharacterLimit, undefined);
    assert.equal(parsed.deletedMessageNoticeMinutes, undefined);
  });

  it("carries the three access combinations the create window can send (Ş10)", () => {
    for (const [isPublic, discoverable] of [
      [false, false],
      [true, false],
      [true, true],
    ] as const) {
      const parsed = assertAccepts(CreateServerSchema, {
        discoverable,
        isPublic,
        name: "Whispr",
        shortName: "WHS",
      });

      assert.equal(parsed?.isPublic, isPublic);
      assert.equal(parsed?.discoverable, discoverable);
    }
  });

  it("shares one advanced-field boundary set with the update contract (Ş10)", () => {
    assertAccepts(CreateServerSchema, {
      messageCharacterLimit: 250,
      name: "Whispr",
      shortName: "WHS",
    });
    assertAccepts(CreateServerSchema, {
      messageCharacterLimit: 40_000,
      name: "Whispr",
      shortName: "WHS",
    });
    assertRejects(CreateServerSchema, { messageCharacterLimit: 249, name: "Whispr" }, [
      "messageCharacterLimit",
    ]);
    assertRejects(CreateServerSchema, { messageCharacterLimit: 40_001, name: "Whispr" }, [
      "messageCharacterLimit",
    ]);

    assertAccepts(CreateServerSchema, {
      deletedMessageNoticeMinutes: 5,
      name: "Whispr",
      shortName: "WHS",
    });
    assertAccepts(CreateServerSchema, {
      deletedMessageNoticeMinutes: 10_080,
      name: "Whispr",
      shortName: "WHS",
    });
    assertRejects(CreateServerSchema, { deletedMessageNoticeMinutes: 4, name: "Whispr" }, [
      "deletedMessageNoticeMinutes",
    ]);

    // Etiketler oluşturmada da `ServerTagsSchema`'dan geçer: slug'lanır, tekilleşir, 5'te durur.
    assert.deepEqual(
      assertAccepts(CreateServerSchema, {
        name: "Whispr",
        shortName: "WHS",
        tags: ["Oyun", "oyun", "Espor"],
      })?.tags,
      ["oyun", "espor"],
    );
    assertRejects(CreateServerSchema, { name: "Whispr", tags: ["a", "b", "c", "d", "e", "f"] }, [
      "tags",
    ]);
  });

  it("lets the admin create contract carry the privileged fields", () => {
    const parsed = AdminCreateServerSchema.parse({
      discoverable: true,
      isPublic: true,
      name: "Whispr Topluluk",
      shortName: "WHS",
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
    const defaulted = AdminCreateServerSchema.parse({
      name: "Whispr Topluluk",
      shortName: "WHS",
    });
    assert.equal(defaulted.verificationLevel, "NONE");

    const overridden = AdminCreateServerSchema.parse({
      name: "Whispr Topluluk",
      shortName: "WHS",
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
      iconColor: "accent2",
      iconUrl: "https://example.com/icon.png",
      isPublic: true,
      messageCharacterLimit: 2000,
      name: "Updated server",
      shortName: "ws1",
      slowModeDelay: 300,
      tags: ["sohbet"],
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
    const profile = ServerPublicProfileSchema.parse(serverPublicProfile);

    assert.equal(profile.channels[0]?.name, "duyurular");
    assert.equal(profile.type, "COMMUNITY");
    assert.equal(profile.upcomingEvent?.channelName, "live-room");
    assert.equal(profile.weeklyMessageCount, 480);
  });

  it("keeps the profile the single read model rather than a second schema", () => {
    // Faz 1 §C1: every 6c/6d/6e field is on this schema, so Faz 5 has no
    // reason to define a parallel profile contract.
    for (const field of [
      "accessLevel",
      "admins",
      "canManageServer",
      "channelCount",
      "createdAt",
      "inviteAddress",
      "joinedAt",
      "muted",
      "notificationLevel",
      "starred",
      "tags",
      "upcomingEvent",
      "voiceActiveCount",
      "weeklyMessageCount",
    ]) {
      assert.equal(field in ServerPublicProfileSchema.shape, true, `${field} missing`);
    }
  });

  it("lets the profile drop a weekly count without dropping the payload", () => {
    const profile = ServerPublicProfileSchema.parse({
      ...serverPublicProfile,
      weeklyMessageCount: null,
    });

    assert.equal(profile.weeklyMessageCount, null);
  });

  it("normalises a tag to a lowercase slug and rejects anything else", () => {
    assert.equal(ServerTagSchema.parse("  SOHBET  "), "sohbet");
    assert.equal(ServerTagSchema.safeParse("sohbet odası").success, false);
    assert.equal(ServerTagSchema.safeParse("").success, false);
    assert.equal(ServerTagSchema.safeParse("a".repeat(25)).success, false);
  });

  it("drops repeated tags but still refuses a sixth one", () => {
    assert.deepEqual(ServerTagsSchema.parse(["Sohbet", "sohbet", "oyun"]), ["sohbet", "oyun"]);
    assert.equal(ServerTagsSchema.safeParse(["a", "b", "c", "d", "e", "f"]).success, false);
  });

  it("carries tags on the server update contract instead of a dedicated route", () => {
    assert.equal("tags" in UpdateServerFieldsSchema.shape, true);
    assert.equal(UpdateServerSchema.safeParse({ tags: [] }).success, true);
    assert.equal(UpdateServerSchema.safeParse({ tags: ["Oyun"] }).success, true);
  });

  it("writes every per-user server preference through one body", () => {
    assert.equal(UpdateServerUserSettingsSchema.safeParse({ muted: true }).success, true);
    assert.equal(
      UpdateServerUserSettingsSchema.safeParse({ notificationLevel: "mentions" }).success,
      true,
    );
    assert.equal(UpdateServerUserSettingsSchema.safeParse({ mutedUntil: null }).success, true);
    assert.equal(UpdateServerUserSettingsSchema.safeParse({}).success, false);
    assert.equal(UpdateServerUserSettingsSchema.safeParse({ pinned: true }).success, false);
  });

  it("refuses an event that ends before it starts, on create and on update", () => {
    const window = {
      scheduledEndAt: "2026-08-11T17:00:00.000Z",
      scheduledStartAt: "2026-08-11T18:00:00.000Z",
    };

    assert.equal(
      CreateServerScheduledEventSchema.safeParse({
        entityType: "VOICE",
        name: "Buluşma",
        ...window,
      }).success,
      false,
    );
    assert.equal(UpdateServerScheduledEventSchema.safeParse(window).success, false);
    assert.equal(
      UpdateServerScheduledEventSchema.safeParse({
        scheduledEndAt: "2026-08-11T19:00:00.000Z",
        scheduledStartAt: "2026-08-11T18:00:00.000Z",
      }).success,
      true,
    );
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

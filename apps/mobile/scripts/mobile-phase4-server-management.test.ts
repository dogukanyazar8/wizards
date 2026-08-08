import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { getMobileServerMembersInfiniteQueryOptions } from "../src/workspace/mobile-server-management-query";
import {
  buildMobileServerMemberRows,
  buildNextMobileMemberRoleIds,
} from "../src/workspace/mobile-server-member-model";
import {
  buildMobileChannelHistoryClearPath,
  buildMobileServerCategoryPath,
  buildMobileServerChannelPath,
  buildMobileServerMemberPath,
  buildMobileServerMemberRolesPath,
  buildMobileServerMembersPath,
  buildMobileServerPath,
  buildMobileServerRolesPath,
  clearMobileChannelHistory,
  createMobileCategory,
  createMobileChannel,
  deleteMobileCategory,
  deleteMobileChannel,
  deleteMobileServer,
  fetchMobileAssignableRoles,
  fetchMobileServerMembers,
  kickMobileMember,
  updateMobileCategory,
  updateMobileChannel,
  updateMobileMemberRoles,
  updateMobileServer,
} from "../src/workspace/mobile-server-management-client";

const serverId = "server/id 1";
const categoryId = "category/id 2";
const channelId = "channel/id 3";
const memberId = "member/id 4";

const managedDetail = {
  detail: {
    capabilities: {
      canClearHistory: true,
      canDeleteServer: true,
      canKickMembers: true,
      canManageChannels: true,
      canManageInvites: true,
      canManageMessages: true,
      canManageRoles: true,
      canManageServer: true,
      canUploadServerIcon: true,
    },
    categories: [],
    hasMoreChannels: false,
    members: [],
    server: {
      allowFileUploads: true,
      allowGifs: true,
      defaultChannelId: null,
      description: null,
      iconUrl: null,
      id: serverId,
      memberCount: 1,
      mentionCount: 0,
      name: "Wizards",
      shortName: null,
      unreadCount: 0,
      visibleChannelCount: 0,
    },
    ungroupedChannels: [],
  },
};

const onlineMember = {
  accessLevel: "MEMBER" as const,
  actions: { canKick: true, canManageRoles: true },
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada Lovelace",
  id: "member-online",
  roleIds: ["role-member", "role-moderator"],
  roles: [{ color: 0x336699, id: "role-member", name: "Member" }],
  status: "ONLINE" as const,
  userId: "user-online",
  username: "ada",
};

const offlineMember = {
  ...onlineMember,
  displayName: "Grace Hopper",
  id: "member-offline",
  status: "OFFLINE" as const,
  userId: "user-offline",
  username: "grace",
};

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function createClient() {
  const requests: Array<{ options: MobileApiRequestOptions | undefined; path: string }> = [];
  const client: MobileApiClient = {
    async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
      requests.push({ options, path });

      if (path === buildMobileServerPath({ serverId })) {
        return (options?.method === "DELETE" ? { success: true } : managedDetail) as TResponse;
      }
      if (path === buildMobileServerCategoryPath({ categoryId, serverId })) {
        return options?.method === "DELETE"
          ? ({ success: true } as TResponse)
          : ({ category: { id: categoryId } } as TResponse);
      }
      if (path === buildMobileServerChannelPath({ channelId, serverId })) {
        return options?.method === "DELETE"
          ? ({ success: true } as TResponse)
          : ({ channel: { id: channelId } } as TResponse);
      }
      if (path === buildMobileServerMembersPath({ cursor: "cursor/2", serverId })) {
        return {
          memberPage: { limit: 50, nextCursor: null },
          members: [onlineMember],
        } as TResponse;
      }
      if (path === buildMobileServerRolesPath({ serverId })) {
        return {
          roles: [{ color: 0x336699, id: "role-moderator", name: "Moderator", position: 1 }],
        } as TResponse;
      }
      if (
        path === buildMobileServerMemberRolesPath({ memberId, serverId }) ||
        path === buildMobileServerMemberPath({ memberId, serverId })
      ) {
        return { success: true } as TResponse;
      }
      if (path === buildMobileChannelHistoryClearPath({ channelId })) {
        return { deletedCount: 3 } as TResponse;
      }
      if (path === `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/categories`) {
        return { category: { id: categoryId } } as TResponse;
      }
      if (path === `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/channels`) {
        return { channel: { id: channelId } } as TResponse;
      }

      throw new Error(`Unexpected path ${path}`);
    },
  };

  return { client, requests };
}

describe("mobile Phase 4 server management", () => {
  it("builds encoded management paths and bounded member query keys", () => {
    assert.equal(buildMobileServerPath({ serverId }), "/api/v1/mobile/servers/server%2Fid%201");
    assert.equal(
      buildMobileServerCategoryPath({ categoryId, serverId }),
      "/api/v1/mobile/servers/server%2Fid%201/categories/category%2Fid%202",
    );
    assert.equal(
      buildMobileServerChannelPath({ channelId, serverId }),
      "/api/v1/mobile/servers/server%2Fid%201/channels/channel%2Fid%203",
    );
    assert.equal(
      buildMobileServerMembersPath({ cursor: "cursor/2", serverId }),
      "/api/v1/mobile/servers/server%2Fid%201/members?limit=50&cursor=cursor%2F2",
    );
    assert.equal(
      buildMobileServerRolesPath({ serverId }),
      "/api/v1/mobile/servers/server%2Fid%201/roles",
    );
    assert.equal(
      buildMobileServerMemberRolesPath({ memberId, serverId }),
      "/api/v1/mobile/servers/server%2Fid%201/members/member%2Fid%204/roles",
    );
    assert.equal(
      buildMobileServerMemberPath({ memberId, serverId }),
      "/api/v1/mobile/servers/server%2Fid%201/members/member%2Fid%204",
    );
    assert.equal(
      buildMobileChannelHistoryClearPath({ channelId }),
      "/api/v1/mobile/channels/channel%2Fid%203/history",
    );
    assert.deepEqual(mobileQueryKeys.workspaceMembers(serverId), [
      "mobile",
      "workspace",
      serverId,
      "members",
    ]);
    assert.deepEqual(mobileQueryKeys.workspaceRoles(serverId), [
      "mobile",
      "workspace",
      serverId,
      "roles",
    ]);
  });

  it("uses only approved methods, validates responses, and keeps route ids out of request bodies", async () => {
    const { client, requests } = createClient();

    await updateMobileServer(client, { name: "  Wizards  ", serverId });
    await deleteMobileServer(client, { name: "Wizards", serverId });
    await createMobileCategory(client, { name: "  Planning  ", serverId });
    await updateMobileCategory(client, { categoryId, name: "  Product  ", serverId });
    await deleteMobileCategory(client, { categoryId, serverId });
    await createMobileChannel(client, {
      categoryId,
      name: "  roadmap  ",
      serverId,
      topic: "  Quarter plan  ",
      type: "TEXT",
    });
    await updateMobileChannel(client, {
      categoryId: null,
      channelId,
      name: "  ship-it  ",
      serverId,
      topic: "  Ready  ",
    });
    await deleteMobileChannel(client, { channelId, serverId });
    await fetchMobileServerMembers(client, { cursor: "cursor/2", serverId });
    await fetchMobileAssignableRoles(client, { serverId });
    await updateMobileMemberRoles(client, {
      memberId,
      roleIds: ["role-member", "role-moderator"],
      serverId,
    });
    await kickMobileMember(client, { memberId, serverId });
    await clearMobileChannelHistory(client, { channelId });

    assert.deepEqual(
      requests.map(({ options, path }) => ({
        body: options?.body,
        method: options?.method ?? "GET",
        path,
      })),
      [
        { body: { name: "Wizards" }, method: "PATCH", path: buildMobileServerPath({ serverId }) },
        {
          body: { confirmationName: "Wizards" },
          method: "DELETE",
          path: buildMobileServerPath({ serverId }),
        },
        {
          body: { name: "Planning" },
          method: "POST",
          path: `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/categories`,
        },
        {
          body: { name: "Product" },
          method: "PATCH",
          path: buildMobileServerCategoryPath({ categoryId, serverId }),
        },
        {
          body: undefined,
          method: "DELETE",
          path: buildMobileServerCategoryPath({ categoryId, serverId }),
        },
        {
          body: { categoryId, name: "roadmap", topic: "Quarter plan", type: "TEXT" },
          method: "POST",
          path: `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/channels`,
        },
        {
          body: { categoryId: null, name: "ship-it", topic: "Ready" },
          method: "PATCH",
          path: buildMobileServerChannelPath({ channelId, serverId }),
        },
        {
          body: undefined,
          method: "DELETE",
          path: buildMobileServerChannelPath({ channelId, serverId }),
        },
        {
          body: undefined,
          method: "GET",
          path: buildMobileServerMembersPath({ cursor: "cursor/2", serverId }),
        },
        { body: undefined, method: "GET", path: buildMobileServerRolesPath({ serverId }) },
        {
          body: { roleIds: ["role-member", "role-moderator"] },
          method: "PATCH",
          path: buildMobileServerMemberRolesPath({ memberId, serverId }),
        },
        {
          body: undefined,
          method: "DELETE",
          path: buildMobileServerMemberPath({ memberId, serverId }),
        },
        {
          body: undefined,
          method: "DELETE",
          path: buildMobileChannelHistoryClearPath({ channelId }),
        },
      ],
    );

    const malformedClient: MobileApiClient = {
      async requestJson<TResponse>() {
        return { success: true, unexpected: true } as TResponse;
      },
    };
    await assert.rejects(
      () => deleteMobileServer(malformedClient, { name: "Wizards", serverId }),
      /Unrecognized key/,
    );
  });

  it("uses the server cursor exactly and preserves complete current role ids", () => {
    const options = getMobileServerMembersInfiniteQueryOptions(createClient().client, serverId);
    assert.equal(options.initialPageParam, null);
    assert.equal(
      options.getNextPageParam?.(
        { memberPage: { limit: 50, nextCursor: "cursor-next" }, members: [] },
        [],
        null,
        [],
      ),
      "cursor-next",
    );
    assert.equal(
      options.getNextPageParam?.(
        { memberPage: { limit: 50, nextCursor: null }, members: [] },
        [],
        null,
        [],
      ),
      undefined,
    );
    assert.deepEqual(
      buildNextMobileMemberRoleIds({
        assigned: true,
        currentRoleIds: ["role-member", "role-moderator"],
        roleId: "role-admin",
      }),
      ["role-member", "role-moderator", "role-admin"],
    );
    assert.deepEqual(
      buildNextMobileMemberRoleIds({
        assigned: false,
        currentRoleIds: ["role-member", "role-moderator", "role-admin"],
        roleId: "role-moderator",
      }),
      ["role-member", "role-admin"],
    );
  });

  it("groups first-seen members by presence without reordering or duplicating them", () => {
    const rows = buildMobileServerMemberRows([
      {
        memberPage: { limit: 50, nextCursor: "cursor-next" },
        members: [onlineMember, offlineMember],
      },
      {
        memberPage: { limit: 50, nextCursor: null },
        members: [{ ...onlineMember, status: "IDLE" as const }],
      },
    ]);

    assert.deepEqual(
      rows.map((row) => row.id),
      ["present", "member-online", "offline", "member-offline"],
    );
    assert.equal(rows[1]?.kind, "member");
    assert.equal(rows[3]?.kind, "member");
  });

  it("keeps every management mutation scoped to exact server, member, or channel cache keys", () => {
    const source = read("../src/query/use-mobile-server-management-mutations.ts");

    for (const mutationName of [
      "updateServer",
      "deleteServer",
      "createCategory",
      "updateCategory",
      "deleteCategory",
      "createChannel",
      "updateChannel",
      "deleteChannel",
      "updateMemberRoles",
      "kickMember",
      "clearChannelHistory",
    ]) {
      assert.match(source, new RegExp(`${mutationName}: useMutation`));
    }

    assert.match(source, /mobileQueryKeys\.workspaceMembers/);
    assert.match(source, /mobileQueryKeys\.workspaceRoles/);
    assert.match(source, /mobileQueryKeys\.channelMessages/);
    assert.match(source, /removeQueries\(/);
  });

  // The entry used to be gated on the compact layout, which left the default rail layout
  // with no way into server settings at all.
  it("offers the server settings entry in both the rail and the compact workspace layouts", () => {
    const source = read("../src/app/screens/workspace-browser.tsx");
    const entry = source.slice(
      source.indexOf("copy.workspaceServerSettingsAction") - 400,
      source.indexOf("mobile-server-settings-open-") + 120,
    );

    assert.match(entry, /activeServerId && \(canManageServer \|\| canManageInvites\)/);
    assert.doesNotMatch(entry, /isCompactWorkspaceLayout &&\s*\r?\n?\s*activeServerId/);
    // Layout only picks the chrome, never whether the control exists.
    assert.match(
      entry,
      /isCompactWorkspaceLayout\s*\r?\n?\s*\?\s*styles\.mobileWorkspaceCompactAddButton\s*\r?\n?\s*:\s*styles\.mobileWorkspaceHeaderIconButton/,
    );
  });

  // The profile route serves any member, and web offers it to every member from
  // the server header menu. Gating the mobile entry on a manage capability --
  // the way the settings entry above is gated -- would leave a plain member with
  // no way to the card at all.
  it("offers the server profile entry to every member, not only managers", () => {
    const source = read("../src/app/screens/workspace-browser.tsx");
    const marker = source.indexOf("mobile-server-profile-open-");

    assert.notEqual(marker, -1);

    const entry = source.slice(source.lastIndexOf("{activeServerId", marker), marker + 160);

    assert.match(entry, /navigate\("ServerProfile", \{ serverId: activeServerId \}\)/);
    assert.doesNotMatch(entry, /canManage/);
  });

  // Discover used to be reachable only from the create/join sheet's third card,
  // which a user with no servers -- the one who needs it most -- never opens.
  it("routes every discover entry through one workspace handler", () => {
    const source = read("../src/app/screens/workspace-browser.tsx");

    assert.match(source, /const openDiscover = useCallback\(\(\) => \{/);

    const switcher = source.slice(
      source.indexOf("<MobileWorkspaceServerSwitcherSheet"),
      source.indexOf("<MobileWorkspaceCreateSheets"),
    );
    assert.match(switcher, /onOpenDiscover=\{openDiscover\}/);

    const emptyStart = source.indexOf("mobile-workspace-empty");
    const empty = source.slice(emptyStart, emptyStart + 900);
    assert.match(empty, /action=\{/);
    assert.match(empty, /copy\.workspaceServerDiscoverAction/);
    assert.match(empty, /onPress=\{openDiscover\}/);
  });
});

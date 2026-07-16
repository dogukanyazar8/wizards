import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileFriendsOverviewResponse,
  MobileManagedWorkspaceServerDetailResponse,
  MobileProfileResponse,
} from "@wizards/types";

import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  patchMobileProfileAvatarCaches,
  patchMobileProfilePresenceCaches,
  restoreMobileProfilePresenceCaches,
} from "../src/query/mobile-profile-cache";

function bootstrapFor(userId: string, avatarUrl: string | null): MobileBootstrapPayload {
  return {
    user: {
      avatarUrl,
      displayName: "Ada Test",
      id: userId,
      locale: "tr",
      status: "ONLINE",
      username: "ada_test",
    },
  } as MobileBootstrapPayload;
}

function profileFor(userId: string, avatarUrl: string | null): MobileProfileResponse {
  return {
    user: {
      avatarUrl,
      customStatus: null,
      displayName: "Ada Test",
      id: userId,
      status: "ONLINE",
      twoFactorEnabled: false,
      username: "ada_test",
    },
  };
}

function friendsFor(userId: string, avatarUrl: string | null): MobileFriendsOverviewResponse {
  const user = {
    avatarUrl,
    displayName: "Ada Test",
    id: userId,
    username: "ada_test",
  };
  const other = {
    avatarUrl: "https://cdn.whispr.team/other.webp",
    displayName: "Other Test",
    id: "user-other",
    username: "other_test",
  };

  return {
    blocked: [user],
    friends: [
      {
        ...user,
        customStatus: null,
        presence: { customStatus: null, status: "ONLINE" },
        status: "ONLINE",
      },
      {
        ...other,
        customStatus: null,
        presence: { customStatus: null, status: "OFFLINE" },
        status: "OFFLINE",
      },
    ],
    pending: {
      incoming: [
        {
          createdAt: "2026-07-13T00:00:00.000Z",
          id: "request-1",
          receiver: other,
          receiverId: other.id,
          sender: user,
          senderId: user.id,
          status: "PENDING",
          updatedAt: "2026-07-13T00:00:00.000Z",
        },
      ],
      outgoing: [],
    },
  };
}

function workspaceFor(
  userId: string,
  avatarUrl: string | null,
): MobileManagedWorkspaceServerDetailResponse {
  return {
    detail: {
      capabilities: {
        canClearHistory: false,
        canDeleteServer: false,
        canKickMembers: false,
        canManageChannels: false,
        canManageInvites: false,
        canManageRoles: false,
        canManageServer: false,
        canUploadServerIcon: false,
      },
      members: [
        {
          accessLevel: "MEMBER",
          avatarUrl,
          customStatus: null,
          displayName: "Ada Test",
          id: "member-1",
          roles: [],
          status: "ONLINE",
          userId,
          username: "ada_test",
        },
        {
          accessLevel: "MEMBER",
          avatarUrl: "https://cdn.whispr.team/other.webp",
          customStatus: null,
          displayName: "Other Test",
          id: "member-2",
          roles: [],
          status: "OFFLINE",
          userId: "user-other",
          username: "other_test",
        },
      ],
    },
  } as unknown as MobileManagedWorkspaceServerDetailResponse;
}

describe("mobile profile avatar cache contract", () => {
  it("patches only matching identities and preserves unrelated cache references", () => {
    const queryClient = new QueryClient();
    const bootstrap = bootstrapFor("user-1", "https://cdn.whispr.team/old.webp");
    const profile = profileFor("user-1", "https://cdn.whispr.team/old.webp");
    const friends = friendsFor("user-1", "https://cdn.whispr.team/old.webp");
    const workspace = workspaceFor("user-1", "https://cdn.whispr.team/old.webp");
    const unrelatedWorkspace = workspaceFor("user-other", "https://cdn.whispr.team/other.webp");

    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);
    queryClient.setQueryData(mobileQueryKeys.profile(), profile);
    queryClient.setQueryData(mobileQueryKeys.friends(), friends);
    queryClient.setQueryData(mobileQueryKeys.workspace("server-1"), workspace);
    queryClient.setQueryData(mobileQueryKeys.workspace("server-2"), unrelatedWorkspace);

    patchMobileProfileAvatarCaches({
      avatarUrl: "https://cdn.whispr.team/canonical.webp",
      queryClient,
      userId: "user-1",
    });

    const patchedBootstrap = queryClient.getQueryData<MobileBootstrapPayload>(
      mobileQueryKeys.bootstrap(),
    )!;
    const patchedProfile = queryClient.getQueryData<MobileProfileResponse>(
      mobileQueryKeys.profile(),
    )!;
    const patchedFriends = queryClient.getQueryData<MobileFriendsOverviewResponse>(
      mobileQueryKeys.friends(),
    )!;
    const patchedWorkspace = queryClient.getQueryData<MobileManagedWorkspaceServerDetailResponse>(
      mobileQueryKeys.workspace("server-1"),
    )!;

    assert.equal(patchedBootstrap.user.avatarUrl, "https://cdn.whispr.team/canonical.webp");
    assert.equal(patchedProfile.user.avatarUrl, "https://cdn.whispr.team/canonical.webp");
    assert.equal(patchedFriends.friends[0]?.avatarUrl, "https://cdn.whispr.team/canonical.webp");
    assert.equal(patchedFriends.blocked[0]?.avatarUrl, "https://cdn.whispr.team/canonical.webp");
    assert.equal(
      patchedFriends.pending.incoming[0]?.sender.avatarUrl,
      "https://cdn.whispr.team/canonical.webp",
    );
    assert.equal(
      patchedWorkspace.detail.members[0]?.avatarUrl,
      "https://cdn.whispr.team/canonical.webp",
    );
    assert.equal(patchedFriends.friends[1], friends.friends[1]);
    assert.equal(patchedWorkspace.detail.members[1], workspace.detail.members[1]);
    assert.equal(patchedWorkspace.detail.capabilities, workspace.detail.capabilities);
    assert.equal(
      queryClient.getQueryData(mobileQueryKeys.workspace("server-2")),
      unrelatedWorkspace,
    );
  });

  it("fails closed when a caller attempts to patch a non-HTTPS avatar URL", () => {
    const queryClient = new QueryClient();
    const bootstrap = bootstrapFor("user-1", "https://cdn.whispr.team/old.webp");
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);

    patchMobileProfileAvatarCaches({
      avatarUrl: "file:///private/avatar.jpg",
      queryClient,
      userId: "user-1",
    });

    assert.equal(queryClient.getQueryData(mobileQueryKeys.bootstrap()), bootstrap);
  });

  it("optimistically patches and restores only the current user's presence caches", () => {
    const queryClient = new QueryClient();
    const bootstrap = bootstrapFor("user-1", "https://cdn.whispr.team/ada.webp");
    const profile = profileFor("user-1", "https://cdn.whispr.team/ada.webp");
    const friends = friendsFor("user-1", "https://cdn.whispr.team/ada.webp");
    const workspace = workspaceFor("user-1", "https://cdn.whispr.team/ada.webp");
    const unrelatedWorkspace = workspaceFor("user-other", "https://cdn.whispr.team/other.webp");

    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);
    queryClient.setQueryData(mobileQueryKeys.profile(), profile);
    queryClient.setQueryData(mobileQueryKeys.friends(), friends);
    queryClient.setQueryData(mobileQueryKeys.workspace("server-1"), workspace);
    queryClient.setQueryData(mobileQueryKeys.workspace("server-2"), unrelatedWorkspace);

    const snapshot = patchMobileProfilePresenceCaches({
      queryClient,
      status: "DND",
      userId: "user-1",
    });

    const patchedBootstrap = queryClient.getQueryData<MobileBootstrapPayload>(
      mobileQueryKeys.bootstrap(),
    )!;
    const patchedProfile = queryClient.getQueryData<MobileProfileResponse>(mobileQueryKeys.profile())!;
    const patchedFriends = queryClient.getQueryData<MobileFriendsOverviewResponse>(
      mobileQueryKeys.friends(),
    )!;
    const patchedWorkspace = queryClient.getQueryData<MobileManagedWorkspaceServerDetailResponse>(
      mobileQueryKeys.workspace("server-1"),
    )!;

    assert.equal(patchedBootstrap.user.status, "DND");
    assert.equal(patchedProfile.user.status, "DND");
    assert.equal(patchedFriends.friends[0]?.status, "DND");
    assert.equal(patchedFriends.friends[0]?.presence.status, "DND");
    assert.equal(patchedWorkspace.detail.members[0]?.status, "DND");
    assert.equal(patchedFriends.friends[1], friends.friends[1]);
    assert.equal(queryClient.getQueryData(mobileQueryKeys.workspace("server-2")), unrelatedWorkspace);

    restoreMobileProfilePresenceCaches(snapshot);

    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.bootstrap()), bootstrap);
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.profile()), profile);
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.friends()), friends);
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.workspace("server-1")), workspace);
  });
});

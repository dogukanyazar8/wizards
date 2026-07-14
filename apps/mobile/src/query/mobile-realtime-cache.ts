import type {
  MobileBootstrapPayload,
  MobileFriendsOverviewResponse,
  MobileManagedWorkspaceServerDetailResponse,
  MobilePresenceUpdateEvent,
  MobileServerUnreadUpdateEvent,
  MobileUserProfileUpdatedEvent,
} from "@wizards/types";

export type MobileRealtimeCachePatch<T> = {
  readonly data: T | undefined;
  readonly patched: boolean;
};

function unchanged<T>(data: T | undefined): MobileRealtimeCachePatch<T> {
  return { data, patched: false };
}

export function removeMobileRealtimeBootstrapServer(
  data: MobileBootstrapPayload | undefined,
  serverId: string,
): MobileRealtimeCachePatch<MobileBootstrapPayload> {
  if (!data) {
    return unchanged<MobileBootstrapPayload>(data);
  }

  const recent = data.home.servers.recent.filter((server) => server.id !== serverId);
  if (recent.length === data.home.servers.recent.length) {
    return unchanged(data);
  }

  return {
    data: {
      ...data,
      home: {
        ...data.home,
        servers: {
          ...data.home.servers,
          recent,
          totalCount: Math.max(0, data.home.servers.totalCount - 1),
        },
      },
    },
    patched: true,
  };
}

export function patchMobileRealtimeBootstrapServerUnread(
  data: MobileBootstrapPayload | undefined,
  event: MobileServerUnreadUpdateEvent,
): MobileRealtimeCachePatch<MobileBootstrapPayload> {
  if (!data) {
    return unchanged<MobileBootstrapPayload>(data);
  }

  let patched = false;
  const recent = data.home.servers.recent.map((server) => {
    if (server.id !== event.serverId) return server;
    const next = { ...server, mentionCount: event.mentionCount, unreadCount: event.unreadCount };
    const changed =
      next.mentionCount !== server.mentionCount || next.unreadCount !== server.unreadCount;
    patched ||= changed;
    return changed ? next : server;
  });

  return patched
    ? { data: { ...data, home: { ...data.home, servers: { ...data.home.servers, recent } } }, patched }
    : unchanged(data);
}

export function patchMobileRealtimeWorkspaceServerUnread(
  data: MobileManagedWorkspaceServerDetailResponse | undefined,
  event: MobileServerUnreadUpdateEvent,
): MobileRealtimeCachePatch<MobileManagedWorkspaceServerDetailResponse> {
  if (!data || data.detail.server.id !== event.serverId) {
    return unchanged<MobileManagedWorkspaceServerDetailResponse>(data);
  }
  const server = data.detail.server;
  if (server.mentionCount === event.mentionCount && server.unreadCount === event.unreadCount) {
    return unchanged(data);
  }
  return {
    data: {
      ...data,
      detail: {
        ...data.detail,
        server: { ...server, mentionCount: event.mentionCount, unreadCount: event.unreadCount },
      },
    },
    patched: true,
  };
}

export function patchMobileRealtimeBootstrapPresence(
  data: MobileBootstrapPayload | undefined,
  event: MobilePresenceUpdateEvent,
): MobileRealtimeCachePatch<MobileBootstrapPayload> {
  if (!data || data.user.id !== event.userId || data.user.status === event.status) {
    return unchanged<MobileBootstrapPayload>(data);
  }

  return {
    data: { ...data, user: { ...data.user, status: event.status } },
    patched: true,
  };
}

export function patchMobileRealtimeBootstrapProfile(
  data: MobileBootstrapPayload | undefined,
  event: MobileUserProfileUpdatedEvent,
): MobileRealtimeCachePatch<MobileBootstrapPayload> {
  if (!data || data.user.id !== event.userId) {
    return unchanged<MobileBootstrapPayload>(data);
  }

  const nextUser = {
    ...data.user,
    avatarUrl: event.avatarUrl,
    displayName: event.displayName,
    status: event.status,
    username: event.username,
  };
  const unchangedUser =
    nextUser.avatarUrl === data.user.avatarUrl &&
    nextUser.displayName === data.user.displayName &&
    nextUser.status === data.user.status &&
    nextUser.username === data.user.username;
  if (unchangedUser) {
    return unchanged(data);
  }

  return { data: { ...data, user: nextUser }, patched: true };
}

export function patchMobileRealtimeFriendsPresence(
  data: MobileFriendsOverviewResponse | undefined,
  event: MobilePresenceUpdateEvent,
): MobileRealtimeCachePatch<MobileFriendsOverviewResponse> {
  if (!data) {
    return unchanged<MobileFriendsOverviewResponse>(data);
  }

  let patched = false;
  const friends = data.friends.map((friend) => {
    if (friend.id !== event.userId) {
      return friend;
    }
    const nextFriend = {
      ...friend,
      customStatus: event.customStatus,
      presence: {
        ...friend.presence,
        customStatus: event.customStatus,
        status: event.status,
      },
      status: event.status,
    };
    const changed =
      nextFriend.customStatus !== friend.customStatus ||
      nextFriend.presence.customStatus !== friend.presence.customStatus ||
      nextFriend.presence.status !== friend.presence.status ||
      nextFriend.status !== friend.status;
    patched ||= changed;
    return changed ? nextFriend : friend;
  });

  return patched ? { data: { ...data, friends }, patched: true } : unchanged(data);
}

export function patchMobileRealtimeFriendsProfile(
  data: MobileFriendsOverviewResponse | undefined,
  event: MobileUserProfileUpdatedEvent,
): MobileRealtimeCachePatch<MobileFriendsOverviewResponse> {
  if (!data) {
    return unchanged<MobileFriendsOverviewResponse>(data);
  }

  let patched = false;
  const friends = data.friends.map((friend) => {
    if (friend.id !== event.userId) {
      return friend;
    }
    const nextFriend = {
      ...friend,
      avatarUrl: event.avatarUrl,
      customStatus: event.customStatus,
      displayName: event.displayName,
      presence: {
        ...friend.presence,
        customStatus: event.customStatus,
        status: event.status,
      },
      status: event.status,
      username: event.username,
    };
    const changed =
      nextFriend.avatarUrl !== friend.avatarUrl ||
      nextFriend.customStatus !== friend.customStatus ||
      nextFriend.displayName !== friend.displayName ||
      nextFriend.presence.customStatus !== friend.presence.customStatus ||
      nextFriend.presence.status !== friend.presence.status ||
      nextFriend.status !== friend.status ||
      nextFriend.username !== friend.username;
    patched ||= changed;
    return changed ? nextFriend : friend;
  });

  const patchUser = <
    T extends {
      avatarUrl: string | null;
      displayName: string | null;
      id: string;
      username: string;
    },
  >(
    user: T,
  ): T => {
    if (user.id !== event.userId) {
      return user;
    }
    const nextUser = {
      ...user,
      avatarUrl: event.avatarUrl,
      displayName: event.displayName,
      username: event.username,
    };
    const changed =
      nextUser.avatarUrl !== user.avatarUrl ||
      nextUser.displayName !== user.displayName ||
      nextUser.username !== user.username;
    patched ||= changed;
    return changed ? nextUser : user;
  };

  const blocked = data.blocked.map(patchUser);
  const patchRequests = (requests: typeof data.pending.incoming) =>
    requests.map((request) => {
      const sender = patchUser(request.sender);
      const receiver = patchUser(request.receiver);
      return sender === request.sender && receiver === request.receiver
        ? request
        : { ...request, receiver, sender };
    });
  const incoming = patchRequests(data.pending.incoming);
  const outgoing = patchRequests(data.pending.outgoing);

  return patched
    ? {
        data: {
          ...data,
          blocked,
          friends,
          pending: { incoming, outgoing },
        },
        patched: true,
      }
    : unchanged(data);
}

export function patchMobileRealtimeWorkspacePresence(
  data: MobileManagedWorkspaceServerDetailResponse | undefined,
  event: MobilePresenceUpdateEvent,
): MobileRealtimeCachePatch<MobileManagedWorkspaceServerDetailResponse> {
  if (!data) {
    return unchanged<MobileManagedWorkspaceServerDetailResponse>(data);
  }

  let patched = false;
  const members = data.detail.members.map((member) => {
    if (member.userId !== event.userId) {
      return member;
    }
    const nextMember = {
      ...member,
      customStatus: event.customStatus,
      status: event.status,
    };
    const changed =
      nextMember.customStatus !== member.customStatus || nextMember.status !== member.status;
    patched ||= changed;
    return changed ? nextMember : member;
  });

  return patched
    ? { data: { ...data, detail: { ...data.detail, members } }, patched: true }
    : unchanged(data);
}

export function patchMobileRealtimeWorkspaceProfile(
  data: MobileManagedWorkspaceServerDetailResponse | undefined,
  event: MobileUserProfileUpdatedEvent,
): MobileRealtimeCachePatch<MobileManagedWorkspaceServerDetailResponse> {
  if (!data) {
    return unchanged<MobileManagedWorkspaceServerDetailResponse>(data);
  }

  let patched = false;
  const members = data.detail.members.map((member) => {
    if (member.userId !== event.userId) {
      return member;
    }
    const nextMember = {
      ...member,
      avatarUrl: event.avatarUrl,
      customStatus: event.customStatus,
      displayName: event.displayName ?? member.displayName,
      status: event.status,
      username: event.username,
    };
    const changed =
      nextMember.avatarUrl !== member.avatarUrl ||
      nextMember.customStatus !== member.customStatus ||
      nextMember.displayName !== member.displayName ||
      nextMember.status !== member.status ||
      nextMember.username !== member.username;
    patched ||= changed;
    return changed ? nextMember : member;
  });

  return patched
    ? { data: { ...data, detail: { ...data.detail, members } }, patched: true }
    : unchanged(data);
}

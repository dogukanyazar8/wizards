import type { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileFriendsOverviewResponse,
  MobileManagedWorkspaceServerDetailResponse,
  MobileProfileResponse,
} from "@wizards/types";

import { mobileQueryKeys } from "./mobile-query-keys";

interface MobileAvatarIdentity {
  readonly avatarUrl: string | null;
  readonly id: string;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function patchAvatarIdentity<T extends MobileAvatarIdentity>(
  identity: T,
  userId: string,
  avatarUrl: string,
): T {
  if (identity.id !== userId || identity.avatarUrl === avatarUrl) {
    return identity;
  }

  return { ...identity, avatarUrl };
}

function patchAvatarArray<T>(items: readonly T[], patch: (item: T) => T): readonly T[] {
  let changed = false;
  const nextItems = items.map((item) => {
    const nextItem = patch(item);
    changed ||= nextItem !== item;
    return nextItem;
  });

  return changed ? nextItems : items;
}

function patchFriends(
  data: MobileFriendsOverviewResponse | undefined,
  userId: string,
  avatarUrl: string,
): MobileFriendsOverviewResponse | undefined {
  if (!data) {
    return data;
  }

  const patchUser = <T extends MobileAvatarIdentity>(user: T) =>
    patchAvatarIdentity(user, userId, avatarUrl);
  const friends = patchAvatarArray(data.friends, patchUser);
  const blocked = patchAvatarArray(data.blocked, patchUser);
  const incoming = patchAvatarArray(data.pending.incoming, (request) => {
    const sender = patchUser(request.sender);
    const receiver = patchUser(request.receiver);
    return sender === request.sender && receiver === request.receiver
      ? request
      : { ...request, receiver, sender };
  });
  const outgoing = patchAvatarArray(data.pending.outgoing, (request) => {
    const sender = patchUser(request.sender);
    const receiver = patchUser(request.receiver);
    return sender === request.sender && receiver === request.receiver
      ? request
      : { ...request, receiver, sender };
  });
  const pending =
    incoming === data.pending.incoming && outgoing === data.pending.outgoing
      ? data.pending
      : { incoming, outgoing };

  return (
    friends === data.friends && blocked === data.blocked && pending === data.pending
      ? data
      : { ...data, blocked, friends, pending }
  ) as MobileFriendsOverviewResponse;
}

function patchWorkspace(
  data: MobileManagedWorkspaceServerDetailResponse | undefined,
  userId: string,
  avatarUrl: string,
): MobileManagedWorkspaceServerDetailResponse | undefined {
  if (!data) {
    return data;
  }

  let changed = false;
  const members = data.detail.members.map((member) => {
    if (member.userId !== userId || member.avatarUrl === avatarUrl) {
      return member;
    }

    changed = true;
    return { ...member, avatarUrl };
  });

  return changed ? { ...data, detail: { ...data.detail, members } } : data;
}

export function patchMobileProfileAvatarCaches(input: {
  avatarUrl: string;
  queryClient: QueryClient;
  userId: string;
}): void {
  if (!isHttpsUrl(input.avatarUrl)) {
    return;
  }

  const { avatarUrl, queryClient, userId } = input;

  queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
    if (!current || current.user.id !== userId || current.user.avatarUrl === avatarUrl) {
      return current;
    }

    return { ...current, user: { ...current.user, avatarUrl } };
  });
  queryClient.setQueryData<MobileProfileResponse>(mobileQueryKeys.profile(), (current) => {
    if (!current || current.user.id !== userId || current.user.avatarUrl === avatarUrl) {
      return current;
    }

    return { ...current, user: { ...current.user, avatarUrl } };
  });
  queryClient.setQueryData<MobileFriendsOverviewResponse>(mobileQueryKeys.friends(), (current) =>
    patchFriends(current, userId, avatarUrl),
  );
  queryClient.setQueriesData<MobileManagedWorkspaceServerDetailResponse>(
    { queryKey: mobileQueryKeys.workspaceRoot() },
    (current) => patchWorkspace(current, userId, avatarUrl),
  );
}

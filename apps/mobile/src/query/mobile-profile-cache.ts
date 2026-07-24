import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileFriendPresenceStatus,
  MobileFriendsOverviewResponse,
  MobileManagedWorkspaceServerDetailResponse,
  MobileProfileResponse,
  MobileUserProfileResponse,
} from "@wizards/types";

import { mobileQueryKeys } from "./mobile-query-keys";

interface MobileAvatarIdentity {
  readonly avatarUrl: string | null;
  readonly id: string;
}

interface MobileProfileIdentity extends MobileAvatarIdentity {
  readonly displayName: string | null;
  readonly username: string;
}

export interface MobileProfilePresenceCacheSnapshot {
  readonly entries: readonly {
    readonly data: unknown;
    readonly queryKey: QueryKey;
  }[];
  readonly queryClient: QueryClient;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `workspaceRoot()` is a key prefix: it also matches the members, roles, role-overview and
 * invites caches, whose payloads have no `detail`. Patching those with the workspace-detail
 * shape threw "Cannot read property 'members' of undefined" mid-upload and aborted the rest
 * of the avatar flow, so every workspace fan-out must filter down to the detail key.
 */
function isMobileWorkspaceDetailKey(queryKey: QueryKey): boolean {
  return queryKey.length === 3 && queryKey[0] === "mobile" && queryKey[1] === "workspace";
}

function hasWorkspaceDetailMembers(
  data: MobileManagedWorkspaceServerDetailResponse | undefined,
): data is MobileManagedWorkspaceServerDetailResponse {
  return Array.isArray(data?.detail?.members);
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

function patchProfileIdentity<T extends MobileProfileIdentity>(
  identity: T,
  profile: MobileProfileResponse,
): T {
  const canonical = profile.user;
  if (identity.id !== canonical.id) {
    return identity;
  }

  if (
    identity.avatarUrl === canonical.avatarUrl &&
    identity.displayName === canonical.displayName &&
    identity.username === canonical.username
  ) {
    return identity;
  }

  return {
    ...identity,
    avatarUrl: canonical.avatarUrl,
    displayName: canonical.displayName,
    username: canonical.username,
  };
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

function patchFriendsIdentity(
  data: MobileFriendsOverviewResponse | undefined,
  profile: MobileProfileResponse,
): MobileFriendsOverviewResponse | undefined {
  if (!data) {
    return data;
  }

  const patchUser = <T extends MobileProfileIdentity>(user: T) =>
    patchProfileIdentity(user, profile);
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

  return friends === data.friends && blocked === data.blocked && pending === data.pending
    ? data
    : ({ ...data, blocked, friends, pending } as MobileFriendsOverviewResponse);
}

function patchWorkspace(
  data: MobileManagedWorkspaceServerDetailResponse | undefined,
  userId: string,
  avatarUrl: string,
): MobileManagedWorkspaceServerDetailResponse | undefined {
  if (!hasWorkspaceDetailMembers(data)) {
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

function patchBootstrapPresence(
  data: MobileBootstrapPayload | undefined,
  userId: string,
  status: MobileFriendPresenceStatus,
): MobileBootstrapPayload | undefined {
  if (!data || data.user.id !== userId || data.user.status === status) {
    return data;
  }

  return { ...data, user: { ...data.user, status } };
}

function patchProfilePresence(
  data: MobileProfileResponse | undefined,
  userId: string,
  status: MobileFriendPresenceStatus,
): MobileProfileResponse | undefined {
  if (!data || data.user.id !== userId || data.user.status === status) {
    return data;
  }

  return { ...data, user: { ...data.user, status } };
}

function patchFriendsPresence(
  data: MobileFriendsOverviewResponse | undefined,
  userId: string,
  status: MobileFriendPresenceStatus,
): MobileFriendsOverviewResponse | undefined {
  if (!data) {
    return data;
  }

  let changed = false;
  const friends = data.friends.map((friend) => {
    if (friend.id !== userId || (friend.status === status && friend.presence.status === status)) {
      return friend;
    }

    changed = true;
    return { ...friend, presence: { ...friend.presence, status }, status };
  });

  return changed ? { ...data, friends } : data;
}

function patchWorkspacePresence(
  data: MobileManagedWorkspaceServerDetailResponse | undefined,
  userId: string,
  status: MobileFriendPresenceStatus,
): MobileManagedWorkspaceServerDetailResponse | undefined {
  if (!hasWorkspaceDetailMembers(data)) {
    return data;
  }

  let changed = false;
  const members = data.detail.members.map((member) => {
    if (member.userId !== userId || member.status === status) {
      return member;
    }

    changed = true;
    return { ...member, status };
  });

  return changed ? { ...data, detail: { ...data.detail, members } } : data;
}

function patchCachedValue<T>(input: {
  entries: { data: unknown; queryKey: QueryKey }[];
  queryClient: QueryClient;
  queryKey: QueryKey;
  update(current: T | undefined): T | undefined;
}): void {
  const current = input.queryClient.getQueryData<T>(input.queryKey);
  const next = input.update(current);
  if (next === current) {
    return;
  }

  input.entries.push({ data: current, queryKey: input.queryKey });
  input.queryClient.setQueryData<T>(input.queryKey, next);
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
    {
      predicate: (query) => isMobileWorkspaceDetailKey(query.queryKey),
      queryKey: mobileQueryKeys.workspaceRoot(),
    },
    (current) => patchWorkspace(current, userId, avatarUrl),
  );
}

export interface MobileProfileBannerFields {
  readonly bannerColor: string | null;
  readonly bannerOffsetX: number | null;
  readonly bannerOffsetY: number | null;
  readonly bannerUrl: string | null;
}

/**
 * The profile card and full page both read the banner from the `userProfile` cache,
 * which the 2a editor never touched — so a saved banner stayed stale until the next
 * cold fetch. This patches every self entry (one per server context the card was
 * opened from) in place, so back-navigation shows the new banner immediately.
 */
export function patchMobileProfileBannerCaches(input: {
  banner: MobileProfileBannerFields;
  queryClient: QueryClient;
  userId: string;
}): void {
  const { banner, queryClient, userId } = input;

  queryClient.setQueriesData<MobileUserProfileResponse>(
    { queryKey: mobileQueryKeys.userProfileRoot() },
    (current) => {
      if (!current || current.profile.user.id !== userId) {
        return current;
      }

      const { profile } = current;
      if (
        profile.bannerColor === banner.bannerColor &&
        profile.bannerUrl === banner.bannerUrl &&
        profile.bannerOffsetX === banner.bannerOffsetX &&
        profile.bannerOffsetY === banner.bannerOffsetY
      ) {
        return current;
      }

      return { ...current, profile: { ...profile, ...banner } };
    },
  );
}

export function patchMobileProfileIdentityCaches(input: {
  profile: MobileProfileResponse;
  queryClient: QueryClient;
}): void {
  const { profile, queryClient } = input;

  queryClient.setQueryData<MobileProfileResponse>(mobileQueryKeys.profile(), profile);
  queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
    if (!current) {
      return current;
    }

    const user = patchProfileIdentity(current.user, profile);
    return user === current.user ? current : { ...current, user };
  });
  queryClient.setQueryData<MobileFriendsOverviewResponse>(mobileQueryKeys.friends(), (current) =>
    patchFriendsIdentity(current, profile),
  );
}

export function patchMobileProfilePresenceCaches(input: {
  queryClient: QueryClient;
  status: MobileFriendPresenceStatus;
  userId: string;
}): MobileProfilePresenceCacheSnapshot {
  const entries: { data: unknown; queryKey: QueryKey }[] = [];
  const { queryClient, status, userId } = input;

  patchCachedValue<MobileBootstrapPayload>({
    entries,
    queryClient,
    queryKey: mobileQueryKeys.bootstrap(),
    update: (current) => patchBootstrapPresence(current, userId, status),
  });
  patchCachedValue<MobileProfileResponse>({
    entries,
    queryClient,
    queryKey: mobileQueryKeys.profile(),
    update: (current) => patchProfilePresence(current, userId, status),
  });
  patchCachedValue<MobileFriendsOverviewResponse>({
    entries,
    queryClient,
    queryKey: mobileQueryKeys.friends(),
    update: (current) => patchFriendsPresence(current, userId, status),
  });

  for (const [queryKey] of queryClient.getQueriesData<MobileManagedWorkspaceServerDetailResponse>({
    predicate: (query) => isMobileWorkspaceDetailKey(query.queryKey),
    queryKey: mobileQueryKeys.workspaceRoot(),
  })) {
    patchCachedValue<MobileManagedWorkspaceServerDetailResponse>({
      entries,
      queryClient,
      queryKey,
      update: (current) => patchWorkspacePresence(current, userId, status),
    });
  }

  return { entries, queryClient };
}

export function restoreMobileProfilePresenceCaches(
  snapshot: MobileProfilePresenceCacheSnapshot,
): void {
  for (const entry of snapshot.entries) {
    snapshot.queryClient.setQueryData(entry.queryKey, entry.data);
  }
}

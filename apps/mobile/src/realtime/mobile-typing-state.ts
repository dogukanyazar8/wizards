import { activeMobileCopy as copy } from "../locale/mobile-locale-preferences";

export type MobileChannelTypingUser = {
  expiresAt: number;
  name: string;
  userId: string;
};

export type MobileChannelTypingState = Readonly<Record<string, readonly MobileChannelTypingUser[]>>;

export type MobileChannelTypingUpdate = {
  channelId: string;
  currentUserId?: string | null;
  isTyping: boolean;
  now?: number;
  userId: string;
  username: string;
};

export type MobileChannelTypingUsersUpdate = {
  channelId: string;
  currentUserNames?: readonly string[];
  now?: number;
  usernames: readonly string[];
};

export const MOBILE_TYPING_TTL_MS = 3_500;
const MOBILE_TYPING_RENDER_LIMIT = 4;

export function createInitialMobileChannelTypingState(): MobileChannelTypingState {
  return {};
}

function normalizeTypingName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : copy.unknownUserLabel;
}

export function applyMobileChannelTypingUpdate(
  state: MobileChannelTypingState,
  update: MobileChannelTypingUpdate,
): MobileChannelTypingState {
  const channelId = update.channelId.trim();
  const userId = update.userId.trim();

  if (channelId.length === 0 || userId.length === 0 || userId === update.currentUserId) {
    return state;
  }

  const now = update.now ?? Date.now();
  const currentUsers = state[channelId] ?? [];
  const nextUsers = currentUsers.filter((user) => user.userId !== userId && user.expiresAt > now);

  if (update.isTyping) {
    nextUsers.push({
      expiresAt: now + MOBILE_TYPING_TTL_MS,
      name: normalizeTypingName(update.username),
      userId,
    });
  }

  const boundedUsers = nextUsers
    .sort((first, second) => first.name.localeCompare(second.name, "tr"))
    .slice(0, MOBILE_TYPING_RENDER_LIMIT);

  if (boundedUsers.length === 0) {
    const { [channelId]: _removed, ...rest } = state;
    return rest;
  }

  return {
    ...state,
    [channelId]: boundedUsers,
  };
}

export function replaceMobileChannelTypingUsers(
  state: MobileChannelTypingState,
  update: MobileChannelTypingUsersUpdate,
): MobileChannelTypingState {
  const channelId = update.channelId.trim();
  if (channelId.length === 0) {
    return state;
  }

  const now = update.now ?? Date.now();
  const currentUserNames = new Set(
    (update.currentUserNames ?? [])
      .map((name) => normalizeTypingName(name).toLocaleLowerCase("tr"))
      .filter((name) => name.length > 0),
  );
  const seenNames = new Set<string>();
  const users = update.usernames
    .map(normalizeTypingName)
    .filter((name) => {
      const normalizedName = name.toLocaleLowerCase("tr");
      if (currentUserNames.has(normalizedName) || seenNames.has(normalizedName)) {
        return false;
      }

      seenNames.add(normalizedName);
      return true;
    })
    .sort((first, second) => first.localeCompare(second, "tr"))
    .slice(0, MOBILE_TYPING_RENDER_LIMIT)
    .map((name) => ({
      expiresAt: now + MOBILE_TYPING_TTL_MS,
      name,
      userId: `typing:${name}`,
    }));

  if (users.length === 0) {
    const { [channelId]: _removed, ...rest } = state;
    return rest;
  }

  return {
    ...state,
    [channelId]: users,
  };
}

export function pruneMobileChannelTypingState(
  state: MobileChannelTypingState,
  now = Date.now(),
): MobileChannelTypingState {
  let didChange = false;
  const nextState: Record<string, readonly MobileChannelTypingUser[]> = {};

  for (const [channelId, users] of Object.entries(state)) {
    const visibleUsers = users.filter((user) => user.expiresAt > now);
    if (visibleUsers.length !== users.length) {
      didChange = true;
    }

    if (visibleUsers.length > 0) {
      nextState[channelId] = visibleUsers;
    } else if (users.length > 0) {
      didChange = true;
    }
  }

  return didChange ? nextState : state;
}

export function getVisibleMobileChannelTypingUsers(
  state: MobileChannelTypingState,
  channelId: string | null,
  now = Date.now(),
): readonly MobileChannelTypingUser[] {
  if (!channelId) {
    return [];
  }

  return (state[channelId] ?? []).filter((user) => user.expiresAt > now);
}

export function formatMobileChannelTypingLabel(
  users: readonly Pick<MobileChannelTypingUser, "name">[],
): string | null {
  if (users.length === 0) {
    return null;
  }

  if (users.length === 1) {
    return `${users[0]!.name} yaziyor`;
  }

  if (users.length === 2) {
    return `${users[0]!.name}, ${users[1]!.name} yaziyor`;
  }

  return `${users[0]!.name}, ${users[1]!.name} ve ${users.length - 2} kisi yaziyor`;
}

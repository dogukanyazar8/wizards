import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import type { MobileApiClient } from "../api/mobile-api-client";
import { useMobileServerMembersInfiniteQuery } from "../workspace/mobile-server-management-query";
import {
  normalizeMobileMentionUsername,
  shouldLoadMoreMobileMentionRoster,
  type MobileMentionCandidate,
} from "./mobile-mention";

/**
 * The members screen wants a fresh page the moment it opens; the roster wants
 * the opposite, because every refetch replays all of its loaded pages. Member
 * lists change rarely, and the realtime bridge invalidates this key on join and
 * leave events anyway, which refetches regardless of this window.
 */
const MOBILE_MENTION_ROSTER_STALE_MS = 5 * 60_000;

/**
 * The server-member roster a chat surface needs for 10a mentions: who the
 * composer may suggest, which handles the stream is allowed to highlight, and
 * the viewer's own handle for the "mentions you" row accent.
 */
export interface MobileMentionRegistry {
  /** Suggestion source; excludes the viewer, who gains nothing from self-mentions. */
  readonly candidates: readonly MobileMentionCandidate[];
  readonly selfUsername: string | null;
  /** Lowercase handles of every member, the viewer included. */
  readonly usernames: ReadonlySet<string>;
}

const MobileMentionRegistryContext = createContext<MobileMentionRegistry | null>(null);

/**
 * Wraps a channel or thread surface so message rows can highlight mentions
 * without every list in between forwarding a member roster prop.
 */
export function MobileMentionRegistryProvider({
  children,
  registry,
}: {
  readonly children: ReactNode;
  readonly registry: MobileMentionRegistry;
}) {
  return (
    <MobileMentionRegistryContext.Provider value={registry}>
      {children}
    </MobileMentionRegistryContext.Provider>
  );
}

/** `null` outside a server surface — DM rows have no roster to check against. */
export function useMobileMentionRegistry(): MobileMentionRegistry | null {
  return useContext(MobileMentionRegistryContext);
}

const EMPTY_USERNAMES: ReadonlySet<string> = new Set<string>();

/**
 * Reads the member roster from the same paginated query the members screen
 * uses, so opening a channel reuses that cache instead of adding a second
 * member endpoint. Suggestions and highlighting are local, over the loaded
 * pages — so while the channel is open the hook walks the remaining pages in
 * the background, one request at a time, up to
 * `MOBILE_MENTION_ROSTER_MEMBER_LIMIT`.
 */
export function useMobileServerMentionRegistry({
  apiClient,
  currentUserId,
  currentUsername,
  enabled = true,
  serverId,
}: {
  readonly apiClient: MobileApiClient;
  readonly currentUserId: string | null;
  readonly currentUsername: string | null;
  readonly enabled?: boolean;
  readonly serverId: string | null;
}): MobileMentionRegistry {
  const isEnabled = enabled && Boolean(serverId);
  const membersQuery = useMobileServerMembersInfiniteQuery(
    apiClient,
    isEnabled && serverId ? serverId : "",
    { staleTime: MOBILE_MENTION_ROSTER_STALE_MS },
  );
  const pages = membersQuery.data?.pages;
  const loadedMemberCount = useMemo(
    () => (pages ?? []).reduce((total, page) => total + page.members.length, 0),
    [pages],
  );
  const { fetchNextPage, hasNextPage, isError, isFetching } = membersQuery;

  useEffect(() => {
    if (
      !shouldLoadMoreMobileMentionRoster({
        enabled: isEnabled,
        hasError: isError,
        hasNextPage,
        isFetching,
        loadedMemberCount,
      })
    ) {
      return;
    }

    // Each resolved page re-runs this effect through `loadedMemberCount`, so
    // the walk continues without a loop of its own. A rejection is already
    // reflected in `isError`, which stops the next round.
    void fetchNextPage().catch(() => undefined);
  }, [fetchNextPage, hasNextPage, isEnabled, isError, isFetching, loadedMemberCount]);

  return useMemo(() => {
    const members = (pages ?? []).flatMap((page) => page.members);
    if (members.length === 0) {
      return { candidates: [], selfUsername: currentUsername, usernames: EMPTY_USERNAMES };
    }

    const usernames = new Set<string>();
    const candidates: MobileMentionCandidate[] = [];

    for (const member of members) {
      usernames.add(normalizeMobileMentionUsername(member.username));
      if (member.userId === currentUserId) {
        continue;
      }

      candidates.push({
        avatarUrl: member.avatarUrl,
        displayName: member.displayName,
        userId: member.userId,
        username: member.username,
      });
    }

    return { candidates, selfUsername: currentUsername, usernames };
  }, [currentUserId, currentUsername, pages]);
}

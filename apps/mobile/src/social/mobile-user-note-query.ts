import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MobileUserProfile } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { normalizeMobileUserNote, saveMobileUserNote } from "./mobile-user-note-client";

export interface MobileUserNoteCacheSnapshot {
  readonly entries: readonly {
    readonly data: MobileUserProfile | undefined;
    readonly queryKey: QueryKey;
  }[];
  readonly queryClient: QueryClient;
}

/**
 * `userProfileRoot()` is a prefix over `[…, "user-profile", userId, serverId]`:
 * the same person can be cached once per server context (role chips differ), and
 * a note belongs to the person, not the context — so every context moves at once.
 */
function isProfileKeyForUser(queryKey: QueryKey, userId: string): boolean {
  return queryKey.length === 4 && queryKey[1] === "user-profile" && queryKey[2] === userId;
}

/**
 * Writes the note into every cached profile for `userId` and returns what was
 * there before, so a failed save can put the card back exactly as it was.
 */
export function patchMobileUserNoteCaches(input: {
  note: string | null;
  queryClient: QueryClient;
  userId: string;
}): MobileUserNoteCacheSnapshot {
  const { note, queryClient, userId } = input;
  const entries: { data: MobileUserProfile | undefined; queryKey: QueryKey }[] = [];

  for (const [queryKey, data] of queryClient.getQueriesData<MobileUserProfile>({
    predicate: (query) => isProfileKeyForUser(query.queryKey, userId),
    queryKey: mobileQueryKeys.userProfileRoot(),
  })) {
    if (!data || data.note === note) {
      continue;
    }

    entries.push({ data, queryKey });
    queryClient.setQueryData<MobileUserProfile>(queryKey, { ...data, note });
  }

  return { entries, queryClient };
}

export function restoreMobileUserNoteCaches(snapshot: MobileUserNoteCacheSnapshot): void {
  for (const entry of snapshot.entries) {
    snapshot.queryClient.setQueryData(entry.queryKey, entry.data);
  }
}

export interface MobileUserNoteMutationInput {
  readonly body: string;
  readonly userId: string;
}

/**
 * Saving a note is a one-field write the user watches land: the 1c note card and
 * the card menu label both read the profile cache, so the mutation patches the
 * cache first and lets the server confirm. Nothing here refetches on success —
 * the response *is* the stored note.
 */
export function useMobileUserNoteMutation(client: MobileApiClient) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MobileUserNoteMutationInput) =>
      saveMobileUserNote(client, input.userId, input.body),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.userProfileRoot() });
      const normalized = normalizeMobileUserNote(input.body);
      return patchMobileUserNoteCaches({
        note: normalized.length === 0 ? null : normalized,
        queryClient,
        userId: input.userId,
      });
    },
    onError: (_error, _input, snapshot) => {
      if (snapshot) {
        restoreMobileUserNoteCaches(snapshot);
      }
    },
    onSuccess: (note, input) => {
      // The server may have trimmed differently than the client did; the stored
      // value wins so the card never disagrees with what a refetch would show.
      patchMobileUserNoteCaches({ note, queryClient, userId: input.userId });
    },
  });
}

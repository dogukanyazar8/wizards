import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  MobileFeedbackDetailResponse,
  MobileRoadmapItem,
  MobileRoadmapListResponse,
  MobileRoadmapVoteResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  fetchMobileFeedback,
  fetchMobileFeedbackList,
  fetchMobileRoadmap,
  setMobileRoadmapVote,
} from "./mobile-feedback-client";
import { toggleMobileRoadmapVote } from "./mobile-feedback-model";

export function useMobileFeedbackQuery(
  client: MobileApiClient,
  feedbackId: string | null,
  enabled: boolean,
) {
  return useQuery({
    enabled: enabled && feedbackId !== null,
    queryFn: () => fetchMobileFeedback(client, feedbackId ?? ""),
    queryKey: mobileQueryKeys.feedback(feedbackId ?? ""),
  });
}

export function useMobileFeedbackListQuery(client: MobileApiClient, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => fetchMobileFeedbackList(client),
    queryKey: mobileQueryKeys.myFeedback(),
  });
}

export function useMobileRoadmapQuery(client: MobileApiClient, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => fetchMobileRoadmap(client),
    queryKey: mobileQueryKeys.roadmap(),
  });
}

function patchRoadmapItem(
  items: readonly MobileRoadmapItem[],
  roadmapItemId: string,
  next: MobileRoadmapItem,
): MobileRoadmapItem[] {
  return items.map((item) => (item.id === roadmapItemId ? next : item));
}

/**
 * Writes an optimistic vote into every cached surface that renders the row —
 * the standalone roadmap list and the three-row preview a submitted/tracking
 * screen holds — and hands back a restore closure so a rejected vote puts the
 * button and the count back exactly as they were.
 */
export function applyMobileRoadmapVote(input: {
  queryClient: QueryClient;
  roadmapItemId: string;
}): () => void {
  const { queryClient, roadmapItemId } = input;
  const restores: (() => void)[] = [];

  const list = queryClient.getQueryData<MobileRoadmapListResponse>(mobileQueryKeys.roadmap());
  const listed = list?.items.find((item) => item.id === roadmapItemId);
  if (list && listed) {
    const next = { ...listed, ...toggleMobileRoadmapVote(listed) };
    queryClient.setQueryData<MobileRoadmapListResponse>(mobileQueryKeys.roadmap(), {
      ...list,
      items: patchRoadmapItem(list.items, roadmapItemId, next),
    });
    restores.push(() => queryClient.setQueryData(mobileQueryKeys.roadmap(), list));
  }

  for (const [queryKey, detail] of queryClient.getQueriesData<MobileFeedbackDetailResponse>({
    queryKey: mobileQueryKeys.feedbackRoot(),
  })) {
    const previewed = detail?.roadmap.find((item) => item.id === roadmapItemId);
    if (!detail || !previewed) {
      continue;
    }

    const next = { ...previewed, ...toggleMobileRoadmapVote(previewed) };
    queryClient.setQueryData<MobileFeedbackDetailResponse>(queryKey, {
      ...detail,
      roadmap: patchRoadmapItem(detail.roadmap, roadmapItemId, next),
    });
    restores.push(() => queryClient.setQueryData(queryKey, detail));
  }

  return () => {
    for (const restore of restores) {
      restore();
    }
  };
}

/** Replaces a row everywhere with the server's own copy of it. */
export function commitMobileRoadmapItem(queryClient: QueryClient, item: MobileRoadmapItem): void {
  const list = queryClient.getQueryData<MobileRoadmapListResponse>(mobileQueryKeys.roadmap());
  if (list?.items.some((entry) => entry.id === item.id)) {
    queryClient.setQueryData<MobileRoadmapListResponse>(mobileQueryKeys.roadmap(), {
      ...list,
      items: patchRoadmapItem(list.items, item.id, item),
    });
  }

  for (const [queryKey, detail] of queryClient.getQueriesData<MobileFeedbackDetailResponse>({
    queryKey: mobileQueryKeys.feedbackRoot(),
  })) {
    if (!detail?.roadmap.some((entry) => entry.id === item.id)) {
      continue;
    }

    queryClient.setQueryData<MobileFeedbackDetailResponse>(queryKey, {
      ...detail,
      roadmap: patchRoadmapItem(detail.roadmap, item.id, item),
    });
  }
}

export interface MobileRoadmapVoteInput {
  readonly roadmapItemId: string;
  readonly voted: boolean;
}

export function useMobileRoadmapVoteMutation(client: MobileApiClient) {
  const queryClient = useQueryClient();

  return useMutation<MobileRoadmapVoteResponse, Error, MobileRoadmapVoteInput, () => void>({
    mutationFn: (input) => setMobileRoadmapVote(client, input.roadmapItemId, input.voted),
    onError: (_error, _input, restore) => {
      restore?.();
    },
    onMutate: (input) =>
      applyMobileRoadmapVote({ queryClient, roadmapItemId: input.roadmapItemId }),
    onSuccess: (response) => {
      // The server owns the count: another voter may have moved it while this
      // tap was in flight, so its number replaces the optimistic one.
      commitMobileRoadmapItem(queryClient, response.item);
    },
  });
}

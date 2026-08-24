import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ThreadFollowState } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import {
  fetchMobileChannelThreadFollow,
  setMobileChannelThreadFollow,
} from "../workspace/mobile-workspace-client";
import { mobileQueryKeys } from "./mobile-query-keys";

export function useMobileChannelThreadFollow(
  client: MobileApiClient,
  channelId: string,
  messageId: string,
) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.channelThreadFollow(channelId, messageId);
  const query = useQuery({
    enabled: channelId.length > 0 && messageId.length > 0,
    queryFn: () => fetchMobileChannelThreadFollow(client, { channelId, messageId }),
    queryKey,
  });
  const mutation = useMutation<
    ThreadFollowState,
    Error,
    boolean,
    { previous: ThreadFollowState | undefined }
  >({
    mutationFn: (following) =>
      setMobileChannelThreadFollow(client, { channelId, following, messageId }),
    onError: (_error, _following, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
    },
    onMutate: async (following) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ThreadFollowState>(queryKey);
      queryClient.setQueryData<ThreadFollowState>(queryKey, { following });
      return { previous };
    },
    onSuccess: (state) => queryClient.setQueryData(queryKey, state),
  });

  return { mutation, query };
}

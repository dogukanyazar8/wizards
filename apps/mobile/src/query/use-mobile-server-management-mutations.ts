import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MobileServerCreateRequest,
  MobileServerInviteCreateRequest,
  MobileServerJoinRequest,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "./mobile-query-keys";
import {
  createMobileServer,
  createMobileServerInvite,
  joinMobileServer,
} from "../workspace/mobile-server-management-client";

export function useMobileServerManagementMutations(client: MobileApiClient) {
  const queryClient = useQueryClient();
  const invalidateServer = async (serverId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspace(serverId),
      }),
    ]);
  };

  return {
    createInvite: useMutation({
      mutationFn: (input: { request?: MobileServerInviteCreateRequest; serverId: string }) =>
        createMobileServerInvite(client, input.serverId, input.request ?? {}),
    }),
    createServer: useMutation({
      mutationFn: (input: MobileServerCreateRequest) => createMobileServer(client, input),
      onSuccess: (response) => {
        void invalidateServer(response.server.id).catch(() => undefined);
      },
    }),
    joinServer: useMutation({
      mutationFn: (input: MobileServerJoinRequest) => joinMobileServer(client, input),
      onSuccess: (response) => {
        void invalidateServer(response.server.id).catch(() => undefined);
      },
    }),
  };
}

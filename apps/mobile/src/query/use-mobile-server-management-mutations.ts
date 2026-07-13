import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MobileServerCreateRequest,
  MobileServerInviteCreateRequest,
  MobileServerJoinRequest,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "./mobile-query-keys";
import {
  clearMobileChannelHistory,
  createMobileCategory,
  createMobileChannel,
  createMobileServer,
  createMobileServerInvite,
  deleteMobileCategory,
  deleteMobileChannel,
  deleteMobileServer,
  kickMobileMember,
  joinMobileServer,
  updateMobileCategory,
  updateMobileChannel,
  updateMobileMemberRoles,
  updateMobileServer,
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
  const invalidateWorkspace = (serverId: string) =>
    queryClient.invalidateQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspace(serverId),
    });
  const invalidateMembers = (serverId: string) =>
    queryClient.invalidateQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspaceMembers(serverId),
    });
  const removeServerScope = (serverId: string) => {
    queryClient.removeQueries({ exact: true, queryKey: mobileQueryKeys.workspace(serverId) });
    queryClient.removeQueries({ exact: true, queryKey: mobileQueryKeys.workspaceMembers(serverId) });
    queryClient.removeQueries({ exact: true, queryKey: mobileQueryKeys.workspaceRoles(serverId) });
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
    updateServer: useMutation({
      mutationFn: (input: { name: string; serverId: string }) => updateMobileServer(client, input),
      onSuccess: (_response, input) => {
        void invalidateServer(input.serverId).catch(() => undefined);
      },
    }),
    deleteServer: useMutation({
      mutationFn: (input: { name: string; serverId: string }) => deleteMobileServer(client, input),
      onSuccess: (_response, input) => {
        removeServerScope(input.serverId);
        void queryClient
          .invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() })
          .catch(() => undefined);
      },
    }),
    createCategory: useMutation({
      mutationFn: (input: { name: string; serverId: string }) => createMobileCategory(client, input),
      onSuccess: (_response, input) => {
        void invalidateWorkspace(input.serverId).catch(() => undefined);
      },
    }),
    updateCategory: useMutation({
      mutationFn: (input: { categoryId: string; name: string; serverId: string }) =>
        updateMobileCategory(client, input),
      onSuccess: (_response, input) => {
        void invalidateWorkspace(input.serverId).catch(() => undefined);
      },
    }),
    deleteCategory: useMutation({
      mutationFn: (input: { categoryId: string; serverId: string }) =>
        deleteMobileCategory(client, input),
      onSuccess: (_response, input) => {
        void invalidateWorkspace(input.serverId).catch(() => undefined);
      },
    }),
    createChannel: useMutation({
      mutationFn: (input: {
        categoryId?: string | null;
        name: string;
        serverId: string;
        topic?: string | null;
        type: "TEXT" | "VOICE";
      }) => createMobileChannel(client, input),
      onSuccess: (_response, input) => {
        void invalidateWorkspace(input.serverId).catch(() => undefined);
      },
    }),
    updateChannel: useMutation({
      mutationFn: (input: {
        categoryId?: string | null;
        channelId: string;
        name?: string;
        serverId: string;
        topic?: string | null;
      }) => updateMobileChannel(client, input),
      onSuccess: (_response, input) => {
        void invalidateWorkspace(input.serverId).catch(() => undefined);
      },
    }),
    deleteChannel: useMutation({
      mutationFn: (input: { channelId: string; serverId: string }) =>
        deleteMobileChannel(client, input),
      onSuccess: (_response, input) => {
        void invalidateWorkspace(input.serverId).catch(() => undefined);
      },
    }),
    updateMemberRoles: useMutation({
      mutationFn: (input: { memberId: string; roleIds: readonly string[]; serverId: string }) =>
        updateMobileMemberRoles(client, input),
      onSuccess: (_response, input) => {
        void invalidateMembers(input.serverId).catch(() => undefined);
      },
    }),
    kickMember: useMutation({
      mutationFn: (input: { memberId: string; serverId: string }) => kickMobileMember(client, input),
      onSuccess: (_response, input) => {
        void invalidateMembers(input.serverId).catch(() => undefined);
      },
    }),
    clearChannelHistory: useMutation({
      mutationFn: (input: { channelId: string }) => clearMobileChannelHistory(client, input),
      onSuccess: (_response, input) => {
        void queryClient
          .invalidateQueries({
            exact: true,
            queryKey: mobileQueryKeys.channelMessages(input.channelId),
          })
          .catch(() => undefined);
      },
    }),
  };
}

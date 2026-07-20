import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  MobileManagedWorkspaceServerDetailResponse,
  MobileServerCreateRequest,
  MobileServerInviteCreateRequest,
  MobileServerInvitesResponse,
  MobileServerJoinRequest,
  MobileServerMembersResponse,
  MobileServerRoleOverviewResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "./mobile-query-keys";
import {
  clearMobileChannelHistory,
  createMobileCategory,
  createMobileChannel,
  createMobileRole,
  createMobileServer,
  createMobileServerInvite,
  deleteMobileServerInvite,
  deleteMobileCategory,
  deleteMobileChannel,
  deleteMobileRole,
  deleteMobileServer,
  kickMobileMember,
  joinMobileServer,
  updateMobileCategory,
  updateMobileChannel,
  updateMobileMemberRoles,
  updateMobileRole,
  updateMobileServer,
  type CreateMobileRoleInput,
  type UpdateMobileRoleInput,
  type UpdateMobileServerInput,
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
  const invalidateInvites = (serverId: string) =>
    queryClient.invalidateQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspaceInvites(serverId),
    });
  const invalidateRoles = (serverId: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspaceRoleOverview(serverId),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspaceRoles(serverId),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspaceMembers(serverId),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspace(serverId),
      }),
    ]);
  const invalidateRoleOverview = (serverId: string) =>
    queryClient.invalidateQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspaceRoleOverview(serverId),
    });
  const removeServerScope = (serverId: string) => {
    queryClient.removeQueries({ exact: true, queryKey: mobileQueryKeys.workspace(serverId) });
    queryClient.removeQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspaceMembers(serverId),
    });
    queryClient.removeQueries({ exact: true, queryKey: mobileQueryKeys.workspaceRoles(serverId) });
    queryClient.removeQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspaceRoleOverview(serverId),
    });
  };

  return {
    createInvite: useMutation({
      mutationFn: (input: { request?: MobileServerInviteCreateRequest; serverId: string }) =>
        createMobileServerInvite(client, input.serverId, input.request ?? {}),
    }),
    deleteInvite: useMutation({
      mutationFn: (input: { inviteId: string; serverId: string }) =>
        deleteMobileServerInvite(client, input),
      // Drop the invite from the cache immediately so the row disappears the
      // moment the user confirms, then reconcile with the server on settle.
      onMutate: async (input) => {
        const queryKey = mobileQueryKeys.workspaceInvites(input.serverId);
        await queryClient.cancelQueries({ exact: true, queryKey });
        const previous = queryClient.getQueryData<MobileServerInvitesResponse>(queryKey);
        if (previous) {
          queryClient.setQueryData<MobileServerInvitesResponse>(queryKey, {
            ...previous,
            invites: previous.invites.filter((invite) => invite.id !== input.inviteId),
          });
        }
        return { previous, queryKey };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(context.queryKey, context.previous);
        }
      },
      onSettled: (_response, _error, input) => {
        void invalidateInvites(input.serverId).catch(() => undefined);
      },
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
      mutationFn: (input: UpdateMobileServerInput) => updateMobileServer(client, input),
      onMutate: async (input) => {
        const queryKey = mobileQueryKeys.workspace(input.serverId);
        await queryClient.cancelQueries({ exact: true, queryKey });
        const previous =
          queryClient.getQueryData<MobileManagedWorkspaceServerDetailResponse>(queryKey);
        if (previous) {
          queryClient.setQueryData<MobileManagedWorkspaceServerDetailResponse>(queryKey, {
            ...previous,
            detail: {
              ...previous.detail,
              server: {
                ...previous.detail.server,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.shortName !== undefined ? { shortName: input.shortName } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
                ...(input.allowGifs !== undefined ? { allowGifs: input.allowGifs } : {}),
                ...(input.allowFileUploads !== undefined
                  ? { allowFileUploads: input.allowFileUploads }
                  : {}),
              },
            },
          });
        }
        return { previous, queryKey };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(context.queryKey, context.previous);
        }
      },
      onSuccess: (response, input) => {
        queryClient.setQueryData(mobileQueryKeys.workspace(input.serverId), response);
      },
      onSettled: (_response, _error, input) => {
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
      mutationFn: (input: { name: string; serverId: string }) =>
        createMobileCategory(client, input),
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
      // Flip the member's roles in the cache immediately so the role toggle
      // reacts instantly (like the permission toggles) instead of waiting for
      // the network round-trip and refetch.
      onMutate: async (input) => {
        const queryKey = mobileQueryKeys.workspaceMembers(input.serverId);
        await queryClient.cancelQueries({ exact: true, queryKey });
        const previous =
          queryClient.getQueryData<InfiniteData<MobileServerMembersResponse>>(queryKey);
        if (previous) {
          queryClient.setQueryData<InfiniteData<MobileServerMembersResponse>>(queryKey, {
            ...previous,
            pages: previous.pages.map((page) => ({
              ...page,
              members: page.members.map((member) =>
                member.id === input.memberId ? { ...member, roleIds: [...input.roleIds] } : member,
              ),
            })),
          });
        }
        return { previous, queryKey };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(context.queryKey, context.previous);
        }
      },
      onSettled: (_response, _error, input) => {
        void invalidateMembers(input.serverId).catch(() => undefined);
        void invalidateRoleOverview(input.serverId).catch(() => undefined);
      },
    }),
    createRole: useMutation({
      mutationFn: (input: CreateMobileRoleInput) => createMobileRole(client, input),
      onSuccess: (_response, input) => {
        void invalidateRoles(input.serverId).catch(() => undefined);
      },
    }),
    updateRole: useMutation({
      mutationFn: (input: UpdateMobileRoleInput) => updateMobileRole(client, input),
      onSuccess: (_response, input) => {
        void invalidateRoles(input.serverId).catch(() => undefined);
      },
    }),
    deleteRole: useMutation({
      mutationFn: (input: { roleId: string; serverId: string }) => deleteMobileRole(client, input),
      // Drop the role from the overview cache immediately so the roles list
      // updates the moment the user confirms, before the refetch lands.
      onMutate: async (input) => {
        const overviewKey = mobileQueryKeys.workspaceRoleOverview(input.serverId);
        await queryClient.cancelQueries({ exact: true, queryKey: overviewKey });
        const previousOverview =
          queryClient.getQueryData<MobileServerRoleOverviewResponse>(overviewKey);
        if (previousOverview) {
          queryClient.setQueryData<MobileServerRoleOverviewResponse>(overviewKey, {
            ...previousOverview,
            roles: previousOverview.roles.filter((role) => role.id !== input.roleId),
          });
        }
        return { overviewKey, previousOverview };
      },
      onError: (_error, _input, context) => {
        if (context?.previousOverview) {
          queryClient.setQueryData(context.overviewKey, context.previousOverview);
        }
      },
      onSettled: (_response, _error, input) => {
        void invalidateRoles(input.serverId).catch(() => undefined);
      },
    }),
    kickMember: useMutation({
      mutationFn: (input: { memberId: string; serverId: string }) =>
        kickMobileMember(client, input),
      onSuccess: (_response, input) => {
        void invalidateMembers(input.serverId).catch(() => undefined);
        void invalidateRoleOverview(input.serverId).catch(() => undefined);
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

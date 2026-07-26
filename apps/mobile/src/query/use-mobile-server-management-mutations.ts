import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  MobileManagedWorkspaceServerDetailResponse,
  MobileNotificationsResponse,
  MobileServerCreateRequest,
  MobileServerInviteCreateRequest,
  MobileServerInviteSheetResponse,
  MobileServerInvitesResponse,
  MobileServerJoinRequest,
  MobileServerMembersResponse,
  MobileServerRoleOverviewResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { removeMobileNotificationsByInviteCode } from "../notifications/mobile-notification-invite-model";
import { mobileQueryKeys } from "./mobile-query-keys";
import {
  clearMobileChannelHistory,
  declineMobileServerInvite,
  createMobileCategory,
  createMobileChannel,
  createMobileRole,
  createMobileServer,
  createMobileServerInvite,
  createMobileTargetedServerInvite,
  updateMobileServerLinkInvite,
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

/**
 * Placeholder id an optimistically sent invite carries until the server hands
 * back the real one. It only has to be non-null — the row reads "sent" from the
 * presence of an id, never from its value.
 */
const OPTIMISTIC_INVITE_ID = "optimistic-invite";

type NotificationPages = InfiniteData<MobileNotificationsResponse>;
type NotificationSnapshot = readonly (readonly [readonly unknown[], NotificationPages])[];

/**
 * Retires an answered invite row from every cached notification filter at once,
 * returning what was there so a failed decline can put it straight back.
 */
function dropAnsweredInviteNotifications(
  queryClient: QueryClient,
  code: string,
): NotificationSnapshot {
  const snapshot = queryClient
    .getQueriesData<NotificationPages>({ queryKey: mobileQueryKeys.notificationsRoot() })
    .filter((entry): entry is [readonly unknown[], NotificationPages] => Boolean(entry[1]));

  queryClient.setQueriesData<NotificationPages>(
    { queryKey: mobileQueryKeys.notificationsRoot() },
    (current) =>
      current
        ? { ...current, pages: removeMobileNotificationsByInviteCode(current.pages, code) }
        : current,
  );

  return snapshot;
}

function restoreNotificationSnapshots(
  queryClient: QueryClient,
  snapshot: NotificationSnapshot | undefined,
) {
  for (const [queryKey, pages] of snapshot ?? []) {
    queryClient.setQueryData(queryKey, pages);
  }
}

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
    Promise.all([
      queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspaceInvites(serverId),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspaceInviteSheet(serverId),
      }),
    ]);
  /**
   * Both invite-sheet writes move the same cached rows, so they share one
   * patcher instead of each re-deriving the shape.
   */
  const patchInviteSheet = (
    serverId: string,
    update: (current: MobileServerInviteSheetResponse) => MobileServerInviteSheetResponse,
  ) => {
    const queryKey = mobileQueryKeys.workspaceInviteSheet(serverId);
    const previous = queryClient.getQueryData<MobileServerInviteSheetResponse>(queryKey);
    if (previous) {
      queryClient.setQueryData<MobileServerInviteSheetResponse>(queryKey, update(previous));
    }
    return { previous, queryKey };
  };
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
      // The 2a card reads its link from the sheet payload, so a fresh invite has
      // to land there rather than only in the mutation result.
      onSuccess: (response, input) => {
        patchInviteSheet(input.serverId, (current) => ({
          ...current,
          linkInvite: response.invite,
        }));
      },
      onSettled: (_response, _error, input) => {
        void invalidateInvites(input.serverId).catch(() => undefined);
      },
    }),
    updateLinkInvite: useMutation({
      mutationFn: (input: {
        expiresInHours: number | null;
        maxUses: number | null;
        serverId: string;
      }) => updateMobileServerLinkInvite(client, input),
      onSuccess: (response, input) => {
        patchInviteSheet(input.serverId, (current) => ({
          ...current,
          linkInvite: response.invite,
        }));
      },
      onSettled: (_response, _error, input) => {
        void invalidateInvites(input.serverId).catch(() => undefined);
      },
    }),
    /**
     * Recipient declines a targeted invite from its notification. The row is
     * dropped optimistically so the feed answers on tap, and restored if the
     * write fails — the invite is still live in that case.
     */
    declineInvite: useMutation({
      mutationFn: (input: { code: string }) => declineMobileServerInvite(client, input),
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: mobileQueryKeys.notificationsRoot() });
        return dropAnsweredInviteNotifications(queryClient, input.code);
      },
      onError: (_error, _input, context) => {
        restoreNotificationSnapshots(queryClient, context);
      },
      onSettled: (response, _error, _input) => {
        void queryClient
          .invalidateQueries({ queryKey: mobileQueryKeys.notificationsRoot() })
          .catch(() => undefined);
        if (response) {
          void invalidateInvites(response.serverId).catch(() => undefined);
        }
      },
    }),
    /** Accepting from a notification joins, then retires the answered row. */
    acceptInvite: useMutation({
      mutationFn: (input: { code: string }) => joinMobileServer(client, { inviteCode: input.code }),
      onSuccess: (response, input) => {
        dropAnsweredInviteNotifications(queryClient, input.code);
        void invalidateServer(response.server.id).catch(() => undefined);
      },
      onSettled: () => {
        void queryClient
          .invalidateQueries({ queryKey: mobileQueryKeys.notificationsRoot() })
          .catch(() => undefined);
      },
    }),
    createTargetedInvite: useMutation({
      mutationFn: (input: { serverId: string; userId: string }) =>
        createMobileTargetedServerInvite(client, input),
      // 2a/2b flip the row to "Gönderildi" on tap; a failure rolls the whole
      // sheet back so the row cannot claim an invite that never landed.
      onMutate: async (input) => {
        const queryKey = mobileQueryKeys.workspaceInviteSheet(input.serverId);
        await queryClient.cancelQueries({ exact: true, queryKey });
        return patchInviteSheet(input.serverId, (current) => ({
          ...current,
          friends: current.friends.map((friend) =>
            friend.id === input.userId
              ? { ...friend, pendingInviteId: OPTIMISTIC_INVITE_ID }
              : friend,
          ),
        }));
      },
      onError: (_error, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(context.queryKey, context.previous);
        }
      },
      onSuccess: (response, input) => {
        patchInviteSheet(input.serverId, (current) => ({
          ...current,
          friends: current.friends.map((friend) =>
            friend.id === input.userId
              ? { ...friend, pendingInviteId: response.invite.id }
              : friend,
          ),
          pendingInvites: [
            response.invite,
            ...current.pendingInvites.filter((invite) => invite.id !== response.invite.id),
          ],
        }));
      },
      onSettled: (_response, _error, input) => {
        void invalidateInvites(input.serverId).catch(() => undefined);
        void queryClient
          .invalidateQueries({ queryKey: mobileQueryKeys.userSearchRoot() })
          .catch(() => undefined);
      },
    }),
    deleteInvite: useMutation({
      mutationFn: (input: { inviteId: string; serverId: string }) =>
        deleteMobileServerInvite(client, input),
      // Drop the invite from the cache immediately so the row disappears the
      // moment the user confirms, then reconcile with the server on settle.
      onMutate: async (input) => {
        const queryKey = mobileQueryKeys.workspaceInvites(input.serverId);
        const sheetKey = mobileQueryKeys.workspaceInviteSheet(input.serverId);
        await Promise.all([
          queryClient.cancelQueries({ exact: true, queryKey }),
          queryClient.cancelQueries({ exact: true, queryKey: sheetKey }),
        ]);
        const previous = queryClient.getQueryData<MobileServerInvitesResponse>(queryKey);
        if (previous) {
          queryClient.setQueryData<MobileServerInvitesResponse>(queryKey, {
            ...previous,
            invites: previous.invites.filter((invite) => invite.id !== input.inviteId),
          });
        }
        // "Geri al" on a 2b pending row: the row leaves and the matching friend
        // returns to "Davet et" in the same frame.
        const sheet = patchInviteSheet(input.serverId, (current) => ({
          ...current,
          friends: current.friends.map((friend) =>
            friend.pendingInviteId === input.inviteId
              ? { ...friend, pendingInviteId: null }
              : friend,
          ),
          pendingInvites: current.pendingInvites.filter((invite) => invite.id !== input.inviteId),
        }));
        return { previous, previousSheet: sheet.previous, queryKey, sheetKey };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(context.queryKey, context.previous);
        }
        if (context?.previousSheet) {
          queryClient.setQueryData(context.sheetKey, context.previousSheet);
        }
      },
      onSettled: (_response, _error, input) => {
        void invalidateInvites(input.serverId).catch(() => undefined);
        void queryClient
          .invalidateQueries({ queryKey: mobileQueryKeys.userSearchRoot() })
          .catch(() => undefined);
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

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

let mockWorkspaceQuery: Record<string, unknown>;
let mockMutations: Record<string, { isPending: boolean; mutateAsync: jest.Mock }>;
let mockMembersQuery: Record<string, unknown>;
let mockRolesQuery: Record<string, unknown>;
const mockSelectAndUpload = jest.fn();
const mockPatchServerIconCaches = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({ data, renderItem, testID }: {
    data: readonly unknown[];
    renderItem(input: { item: unknown }): React.ReactNode;
    testID: string;
  }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(
      View,
      { testID },
      data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item }))),
    );
  },
}));

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: {} }),
}));

jest.mock("../src/query/mobile-workspace-query", () => ({
  useMobileWorkspaceQuery: () => mockWorkspaceQuery,
}));

jest.mock("../src/query/use-mobile-server-management-mutations", () => ({
  useMobileServerManagementMutations: () => mockMutations,
}));

jest.mock("../src/media/use-mobile-image-upload", () => ({
  useMobileImageUpload: () => ({ isBusy: false, selectAndUpload: mockSelectAndUpload }),
}));

jest.mock("../src/query/mobile-server-cache", () => ({
  patchMobileServerIconCaches: (...args: unknown[]) => mockPatchServerIconCaches(...args),
}));

jest.mock("../src/workspace/mobile-server-management-query", () => ({
  useMobileAssignableRolesQuery: () => mockRolesQuery,
  useMobileServerMembersInfiniteQuery: () => mockMembersQuery,
}));

jest.mock("../src/workspace/mobile-workspace-editor-sheets", () => ({
  MobileWorkspaceEditorSheets: () => null,
}));

jest.mock("../src/app/components/kit", () => {
  const actual = jest.requireActual("../src/app/components/kit");
  const React = require("react");
  const { Pressable, Text, View } = require("react-native");
  return {
    ...actual,
    DestructiveConfirmationSheet: ({ onConfirm, open, testID }: {
      onConfirm(): void | Promise<void>;
      open: boolean;
      testID: string;
    }) =>
      open
        ? React.createElement(
            View,
            null,
            React.createElement(
              Pressable,
              { onPress: () => void onConfirm(), testID: `${testID}-confirm` },
              React.createElement(Text, null, "Confirm"),
            ),
          )
        : null,
  };
});

import { MobileServerSettingsScreen } from "../src/workspace/mobile-server-settings-screen";
import { MobileChannelSettingsScreen } from "../src/workspace/mobile-channel-settings-screen";
import { MobileServerMembersScreen } from "../src/workspace/mobile-server-members-screen";

function createMutation() {
  return { isPending: false, mutateAsync: jest.fn().mockResolvedValue({ success: true }) };
}

function createDetail(overrides: Record<string, boolean> = {}) {
  return {
    capabilities: {
      canClearHistory: true,
      canDeleteServer: true,
      canKickMembers: true,
      canManageChannels: true,
      canManageInvites: true,
      canManageRoles: true,
      canManageServer: true,
      canUploadServerIcon: true,
      ...overrides,
    },
    categories: [],
    hasMoreChannels: false,
    members: [],
    server: {
      defaultChannelId: null,
      description: null,
      iconUrl: null,
      id: "server-1",
      memberCount: 4,
      mentionCount: 0,
      name: "Wizards",
      shortName: null,
      unreadCount: 0,
      visibleChannelCount: 1,
    },
    ungroupedChannels: [
      {
        categoryId: null,
        categoryName: null,
        id: "channel-text",
        locked: false,
        mentionCount: 0,
        name: "general",
        position: 0,
        readOnly: false,
        topic: null,
        type: "TEXT" as const,
        unreadCount: 0,
      },
      {
        categoryId: null,
        categoryName: null,
        id: "channel-voice",
        locked: false,
        mentionCount: 0,
        name: "lobby",
        position: 1,
        readOnly: false,
        topic: null,
        type: "VOICE" as const,
        unreadCount: 0,
      },
    ],
  };
}

function resetMocks() {
  mockMutations = {
    clearChannelHistory: createMutation(),
    createCategory: createMutation(),
    createChannel: createMutation(),
    createInvite: createMutation(),
    createServer: createMutation(),
    deleteCategory: createMutation(),
    deleteChannel: createMutation(),
    deleteServer: createMutation(),
    joinServer: createMutation(),
    kickMember: createMutation(),
    updateCategory: createMutation(),
    updateChannel: createMutation(),
    updateMemberRoles: createMutation(),
    updateServer: createMutation(),
  };
  mockWorkspaceQuery = { data: { detail: createDetail() }, isError: false, isLoading: false };
  mockMembersQuery = {
    data: {
      pages: [
        {
          memberPage: { limit: 50, nextCursor: null },
          members: [
            {
              accessLevel: "MEMBER",
              actions: { canKick: true, canManageRoles: true },
              avatarUrl: null,
              customStatus: null,
              displayName: "Ada",
              id: "member-1",
              roleIds: ["role-1"],
              roles: [],
              status: "ONLINE",
              userId: "user-1",
              username: "ada",
            },
          ],
        },
      ],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn().mockResolvedValue({}),
  };
  mockRolesQuery = { data: { roles: [] }, isLoading: false };
  mockSelectAndUpload.mockReset();
  mockPatchServerIconCaches.mockReset();
}

describe("mobile server management", () => {
  it("uses server capabilities, trims server names, and keeps the id contextual", async () => {
    resetMocks();
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenChannelSettings={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    await fireEvent.changeText(view.getByTestId("mobile-server-settings-name"), "  Wizards UAT  ");
    await fireEvent.press(view.getByTestId("mobile-server-settings-save"));

    await waitFor(() =>
      expect(mockMutations.updateServer.mutateAsync).toHaveBeenCalledWith({
        name: "Wizards UAT",
        serverId: "server-1",
      }),
    );
    expect(view.getByTestId("mobile-server-members-open-server-1")).toBeTruthy();
    expect(view.getByTestId("mobile-channel-settings-open-channel-text")).toBeTruthy();
  });

  it("uses the approved server-icon claim target and exact name for deletion", async () => {
    resetMocks();
    mockSelectAndUpload.mockImplementation(async (_target, onLocalPreview) => {
      onLocalPreview("file:///temporary.png");
      return {
        response: {
          claimId: "claim-1",
          claimedAt: "2026-07-13T00:00:00.000Z",
          purpose: "server-icon",
          server: { iconUrl: "https://cdn.example.com/icon.png", id: "server-1" },
        },
        status: "claimed",
      };
    });
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenChannelSettings={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-icon-picker"));
    await waitFor(() =>
      expect(mockSelectAndUpload).toHaveBeenCalledWith(
        { purpose: "server-icon", targetServerId: "server-1" },
        expect.any(Function),
      ),
    );
    expect(mockPatchServerIconCaches).toHaveBeenCalledWith(
      expect.objectContaining({
        iconUrl: "https://cdn.example.com/icon.png",
        serverId: "server-1",
      }),
    );

    await fireEvent.press(view.getByTestId("mobile-server-delete-open"));
    await fireEvent.press(view.getByTestId("mobile-server-delete-confirm-confirm"));
    await waitFor(() =>
      expect(mockMutations.deleteServer.mutateAsync).toHaveBeenCalledWith({
        name: "Wizards",
        serverId: "server-1",
      }),
    );
  });

  it("does not expose server or channel actions without server-provided capabilities", async () => {
    resetMocks();
    mockWorkspaceQuery = {
      data: {
        detail: createDetail({
          canClearHistory: false,
          canDeleteServer: false,
          canKickMembers: false,
          canManageChannels: false,
          canManageRoles: false,
          canManageServer: false,
          canUploadServerIcon: false,
        }),
      },
      isError: false,
      isLoading: false,
    };
    const server = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenChannelSettings={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );
    const channel = await render(
      <MobileChannelSettingsScreen channelId="channel-voice" serverId="server-1" onBack={jest.fn()} />,
    );

    expect(server.queryByTestId("mobile-server-settings-save")).toBeNull();
    expect(server.queryByTestId("mobile-server-icon-picker")).toBeNull();
    expect(server.queryByTestId("mobile-server-delete-open")).toBeNull();
    expect(channel.queryByTestId("mobile-channel-history-clear-open-channel-voice")).toBeNull();
    expect(channel.queryByTestId("mobile-channel-delete-open-channel-voice")).toBeNull();
  });

  it("shows role and kick affordances only from the server-provided member actions", async () => {
    resetMocks();
    const view = await render(<MobileServerMembersScreen serverId="server-1" onBack={jest.fn()} />);

    expect(view.getByTestId("mobile-server-members-list")).toBeTruthy();
    expect(view.getByTestId("mobile-server-member-member-1")).toBeTruthy();
    expect(view.getByTestId("mobile-member-member-1-roles")).toBeTruthy();
    expect(view.getByTestId("mobile-member-member-1-kick")).toBeTruthy();
  });
});

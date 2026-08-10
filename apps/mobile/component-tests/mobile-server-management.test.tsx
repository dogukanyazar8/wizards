import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

let mockWorkspaceQuery: Record<string, unknown>;
let mockMutations: Record<string, { isPending: boolean; mutateAsync: jest.Mock }>;
let mockMembersQuery: Record<string, unknown>;
let mockRolesQuery: Record<string, unknown>;
let mockInvitesQuery: Record<string, unknown>;
// S3 Section C: the settings screen's own `useQuery` call for isPublic/discoverable/type
// (the workspace detail payload carries none of the three -- see the screen's comment).
let mockVisibilityQuery: Record<string, unknown>;
const mockSelectAndUpload = jest.fn();
const mockPatchServerIconCaches = jest.fn();
const mockConfirmServerIconPersisted = jest.fn(async () => true);

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => mockVisibilityQuery,
  useQueryClient: () => ({ fetchQuery: jest.fn(), invalidateQueries: jest.fn() }),
}));

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    testID,
  }: {
    data: readonly unknown[];
    renderItem(input: { item: unknown }): React.ReactNode;
    testID: string;
  }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(
      View,
      { testID },
      data.map((item, index) =>
        React.createElement(React.Fragment, { key: index }, renderItem({ item })),
      ),
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
  confirmMobileServerIconPersisted: (...args: unknown[]) =>
    mockConfirmServerIconPersisted(...(args as [])),
  patchMobileServerIconCaches: (...args: unknown[]) => mockPatchServerIconCaches(...args),
}));

jest.mock("../src/workspace/mobile-server-management-query", () => ({
  useMobileAssignableRolesQuery: () => mockRolesQuery,
  useMobileServerRoleOverviewQuery: () => mockRolesQuery,
  useMobileServerInvitesQuery: () => mockInvitesQuery,
  useMobileServerMembersInfiniteQuery: () => mockMembersQuery,
}));

jest.mock("../src/workspace/mobile-workspace-editor-sheets", () => ({
  MobileWorkspaceEditorSheets: () => null,
}));

const mockShareInvite = jest.fn();
const mockCopyToClipboard = jest.fn();
jest.mock("expo-clipboard", () => ({
  setStringAsync: (...args: unknown[]) => mockCopyToClipboard(...args),
}));
jest.mock("../src/invite/mobile-invite-share", () => ({
  shareMobileInviteUrl: (...args: unknown[]) => mockShareInvite(...args),
}));

jest.mock("../src/app/components/kit", () => {
  const actual = jest.requireActual("../src/app/components/kit");
  const React = require("react");
  const { Pressable, Text, View } = require("react-native");
  return {
    ...actual,
    BottomSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? React.createElement(View, null, children) : null,
    DestructiveConfirmationSheet: ({
      onConfirm,
      open,
      testID,
    }: {
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
import { MobileServerRolesScreen } from "../src/workspace/mobile-server-roles-screen";
import { MobileChannelSettingsScreen } from "../src/workspace/mobile-channel-settings-screen";
import { MobileServerMembersScreen } from "../src/workspace/mobile-server-members-screen";
import { MobileServerInvitesScreen } from "../src/workspace/mobile-server-invites-screen";

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
      canManageMessages: true,
      canManageRoles: true,
      canManageServer: true,
      canUploadServerIcon: true,
      ...overrides,
    },
    categories: [],
    hasMoreChannels: false,
    members: [],
    server: {
      allowFileUploads: true,
      allowGifs: true,
      defaultChannelId: null,
      description: null,
      iconUrl: null,
      id: "server-1",
      memberCount: 4,
      mentionCount: 0,
      name: "Wizards",
      onlineMemberCount: 2,
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
    createRole: createMutation(),
    createServer: createMutation(),
    deleteCategory: createMutation(),
    deleteChannel: createMutation(),
    deleteInvite: createMutation(),
    deleteRole: createMutation(),
    deleteServer: createMutation(),
    joinServer: createMutation(),
    kickMember: createMutation(),
    leaveServer: createMutation(),
    updateCategory: createMutation(),
    updateChannel: createMutation(),
    updateMemberRoles: createMutation(),
    updateRole: createMutation(),
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
  mockRolesQuery = {
    data: {
      roles: [
        {
          color: 0xe0527e,
          id: "role-owner",
          isDefault: false,
          managed: false,
          memberCount: 1,
          name: "Kurucu",
          permissionKeys: ["ADMINISTRATOR"],
          position: 2,
        },
        {
          color: 0xb7bcd6,
          id: "role-everyone",
          isDefault: true,
          managed: false,
          memberCount: 4,
          name: "@everyone",
          permissionKeys: ["SEND_MESSAGES", "CONNECT_VOICE"],
          position: 0,
        },
      ],
    },
    isError: false,
    isLoading: false,
    refetch: jest.fn().mockResolvedValue({}),
  };
  mockInvitesQuery = { data: { invites: [] }, isLoading: false };
  mockVisibilityQuery = {
    data: { discoverable: false, isPublic: true, tags: ["turkce-sohbet"], type: "PERSONAL" },
    isError: false,
    isLoading: false,
  };
  mockSelectAndUpload.mockReset();
  mockPatchServerIconCaches.mockReset();
  mockConfirmServerIconPersisted.mockReset();
  mockConfirmServerIconPersisted.mockResolvedValue(true);
}

describe("mobile server management", () => {
  it("edits server fields and keeps management actions contextual", async () => {
    resetMocks();
    const onOpenInvites = jest.fn();
    const onOpenMembers = jest.fn();
    const onOpenProfile = jest.fn();
    const onOpenRoles = jest.fn();
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenInvites={onOpenInvites}
        onOpenMembers={onOpenMembers}
        onOpenProfile={onOpenProfile}
        onOpenRoles={onOpenRoles}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-name-pill"));
    await fireEvent.changeText(
      view.getByTestId("mobile-server-field-editor-input"),
      "  Wizards UAT  ",
    );
    await fireEvent.press(view.getByTestId("mobile-server-field-editor-save"));

    await waitFor(() =>
      expect(mockMutations.updateServer.mutateAsync).toHaveBeenCalledWith({
        name: "Wizards UAT",
        serverId: "server-1",
      }),
    );
    await fireEvent.press(view.getByTestId("mobile-server-members-row"));
    await fireEvent.press(view.getByTestId("mobile-server-roles-row"));
    await fireEvent.press(view.getByTestId("mobile-server-invites-row"));
    await fireEvent.press(view.getByTestId("mobile-server-profile-row"));
    expect(onOpenMembers).toHaveBeenCalledTimes(1);
    expect(onOpenRoles).toHaveBeenCalledTimes(1);
    expect(onOpenInvites).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  // 6c §E: a mobile-only admin has to be able to enter discovery tags, or the
  // field Faz 1 opened is web-only in practice.
  it("adds a discovery tag through the existing server update endpoint", async () => {
    resetMocks();
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    expect(view.getByText("turkce-sohbet")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("mobile-server-tag-input"), "  Oyun-Gecesi ");
    await fireEvent.press(view.getByTestId("mobile-server-tag-add"));

    await waitFor(() =>
      // The slug rules are `@wizards/types`': lowercased and trimmed there, not
      // re-implemented here.
      expect(mockMutations.updateServer.mutateAsync).toHaveBeenCalledWith({
        serverId: "server-1",
        tags: ["turkce-sohbet", "oyun-gecesi"],
      }),
    );
  });

  it("removes a tag by writing the remaining list, not a delete of its own", async () => {
    resetMocks();
    mockVisibilityQuery = {
      ...mockVisibilityQuery,
      data: { discoverable: false, isPublic: true, tags: ["alpha", "beta"], type: "PERSONAL" },
    };
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-tag-remove-alpha"));

    await waitFor(() =>
      expect(mockMutations.updateServer.mutateAsync).toHaveBeenCalledWith({
        serverId: "server-1",
        tags: ["beta"],
      }),
    );
  });

  it("rejects a tag the shared schema refuses and stops at the shared limit", async () => {
    resetMocks();
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    await fireEvent.changeText(view.getByTestId("mobile-server-tag-input"), "Büyük Harf!");
    await fireEvent.press(view.getByTestId("mobile-server-tag-add"));

    expect(mockMutations.updateServer.mutateAsync).not.toHaveBeenCalled();
    expect(view.getByText("Etiket yalnızca küçük harf, rakam ve tire içerebilir")).toBeTruthy();

    // At the limit the input is gone rather than disabled.
    mockVisibilityQuery = {
      ...mockVisibilityQuery,
      data: {
        discoverable: false,
        isPublic: true,
        tags: ["a", "b", "c", "d", "e"],
        type: "PERSONAL",
      },
    };
    const full = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    expect(full.queryByTestId("mobile-server-tag-input")).toBeNull();
    expect(full.getByText("En fazla 5 etiket")).toBeTruthy();
  });

  it("hides the tag editor from a member who cannot manage the server", async () => {
    resetMocks();
    mockWorkspaceQuery = {
      ...mockWorkspaceQuery,
      data: { detail: createDetail({ canManageServer: false }) },
    };
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    expect(view.queryByTestId("mobile-server-tag-input")).toBeNull();
    expect(view.queryByTestId("mobile-server-tags-card")).toBeNull();
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

  it("reports an unpersisted server icon instead of keeping the optimistic preview", async () => {
    resetMocks();
    mockConfirmServerIconPersisted.mockResolvedValue(false);
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
        onOpenMembers={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-icon-picker"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-server-settings-error").props.children).toBe(
        "Yeni sunucu simgesi sunucuya kaydedilmedi. Lütfen yeniden deneyin.",
      ),
    );
    expect(view.queryByTestId("mobile-server-icon-image")).toBeNull();
  });

  it("keeps a confirmed icon on screen when a stale workspace refetch lands afterwards", async () => {
    resetMocks();
    // The real read-back publishes the verified detail into the workspace cache, so the
    // query already agrees with the claimed icon by the time the pin is taken.
    mockConfirmServerIconPersisted.mockImplementation(async () => {
      const confirmed = createDetail();
      mockWorkspaceQuery = {
        data: {
          detail: {
            ...confirmed,
            server: { ...confirmed.server, iconUrl: "https://cdn.example.com/icon.png" },
          },
        },
        isError: false,
        isLoading: false,
      };
      return true;
    });
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
        onOpenMembers={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-icon-picker"));
    await waitFor(() =>
      expect(view.getByTestId("mobile-server-icon-image").props.source.uri).toBe(
        "https://cdn.example.com/icon.png",
      ),
    );

    // Returning from the OS picker refocuses the app, so a workspace refetch that left the
    // device before the claim committed can still resolve here and rewrite the cache with
    // the pre-upload icon. Any later local state change re-reads that cache, which is how
    // the stale response reaches the screen.
    mockWorkspaceQuery = { data: { detail: createDetail() }, isError: false, isLoading: false };
    await fireEvent.press(view.getByTestId("mobile-server-delete-open"));

    expect(view.getByTestId("mobile-server-icon-image").props.source.uri).toBe(
      "https://cdn.example.com/icon.png",
    );
    expect(view.queryByTestId("mobile-server-settings-error")).toBeNull();
  });

  it("surfaces the failing upload hop instead of a generic error", async () => {
    resetMocks();
    mockSelectAndUpload.mockResolvedValue({
      message: "The image upload could not be completed. (409 UPLOAD_CLAIM_UNAVAILABLE)",
      status: "error",
    });
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-icon-picker"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-server-settings-error").props.children).toBe(
        "The image upload could not be completed. (409 UPLOAD_CLAIM_UNAVAILABLE)",
      ),
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
          canManageInvites: false,
          canManageMessages: false,
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
        onOpenInvites={jest.fn()}
        onOpenMembers={jest.fn()}
        onOpenRoles={jest.fn()}
      />,
    );
    const channel = await render(
      <MobileChannelSettingsScreen
        channelId="channel-voice"
        serverId="server-1"
        onBack={jest.fn()}
      />,
    );

    expect(server.queryByTestId("mobile-server-icon-picker")).toBeNull();
    expect(server.queryByTestId("mobile-server-delete-open")).toBeNull();
    expect(server.getByTestId("mobile-server-name-pill").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(server.getByTestId("mobile-server-gif-toggle").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(server.getByTestId("mobile-server-members-row").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(server.getByTestId("mobile-server-roles-row").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(server.getByTestId("mobile-server-invites-row").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(
      server.getByTestId("mobile-server-public-toggle").props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      server.getByTestId("mobile-server-discoverable-toggle").props.accessibilityState.disabled,
    ).toBe(true);
    expect(channel.queryByTestId("mobile-channel-history-clear-open-channel-voice")).toBeNull();
    expect(channel.queryByTestId("mobile-channel-delete-open-channel-voice")).toBeNull();
  });

  it("toggles server visibility and forces discoverable off when public is turned off", async () => {
    resetMocks();
    mockVisibilityQuery = {
      data: { discoverable: true, isPublic: true, type: "PERSONAL" },
      isError: false,
      isLoading: false,
    };
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    expect(view.getByTestId("mobile-server-public-toggle").props.accessibilityState.checked).toBe(
      true,
    );
    expect(
      view.getByTestId("mobile-server-discoverable-toggle").props.accessibilityState.checked,
    ).toBe(true);

    // S3 Section C binding rule: the off-cascade is one request, not two.
    await fireEvent.press(view.getByTestId("mobile-server-public-toggle"));

    await waitFor(() =>
      expect(mockMutations.updateServer.mutateAsync).toHaveBeenCalledWith({
        discoverable: false,
        isPublic: false,
        serverId: "server-1",
      }),
    );
    expect(
      view.getByTestId("mobile-server-discoverable-toggle").props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("keeps both visibility toggles read-only on a COMMUNITY server", async () => {
    resetMocks();
    mockVisibilityQuery = {
      data: { discoverable: true, isPublic: true, type: "COMMUNITY" },
      isError: false,
      isLoading: false,
    };
    const view = await render(
      <MobileServerSettingsScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    expect(view.getByTestId("mobile-server-public-toggle").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(
      view.getByTestId("mobile-server-discoverable-toggle").props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      view.getAllByText("Topluluk sunucusu · görünürlük yönetim ekibi tarafından yönetilir"),
    ).toHaveLength(2);

    await fireEvent.press(view.getByTestId("mobile-server-public-toggle"));
    expect(mockMutations.updateServer.mutateAsync).not.toHaveBeenCalled();
  });

  it("shows role and kick affordances only from the server-provided member actions", async () => {
    resetMocks();
    const view = await render(<MobileServerMembersScreen serverId="server-1" onBack={jest.fn()} />);

    expect(view.getByTestId("mobile-server-members-list")).toBeTruthy();
    expect(view.getByTestId("mobile-server-member-member-1")).toBeTruthy();
    expect(view.getByTestId("mobile-member-member-1-roles")).toBeTruthy();
    expect(view.getByTestId("mobile-member-member-1-kick")).toBeTruthy();
  });

  it("opens the server profile from the member list header", async () => {
    resetMocks();
    const onOpenServerProfile = jest.fn();
    const view = await render(
      <MobileServerMembersScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenServerProfile={onOpenServerProfile}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-members-profile"));
    expect(onOpenServerProfile).toHaveBeenCalledTimes(1);
  });

  it("renders the server role overview and creates a role through the managed mutation", async () => {
    resetMocks();
    const onOpenRoleDetail = jest.fn();
    mockMutations.createRole.mutateAsync.mockResolvedValue({
      role: { id: "role-support" },
    });
    const view = await render(
      <MobileServerRolesScreen
        serverId="server-1"
        onBack={jest.fn()}
        onOpenRoleDetail={onOpenRoleDetail}
      />,
    );

    expect(view.getByTestId("mobile-server-roles-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-server-role-role-owner")).toBeTruthy();
    expect(view.getByTestId("mobile-server-role-role-everyone")).toBeTruthy();
    expect(view.getByText("Kurucu")).toBeTruthy();
    expect(view.getByText("1")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-server-roles-create"));
    await fireEvent.changeText(view.getByTestId("mobile-server-role-create-name"), "Support");
    await fireEvent.press(view.getByTestId("mobile-server-role-create-submit"));

    await waitFor(() =>
      expect(mockMutations.createRole.mutateAsync).toHaveBeenCalledWith({
        color: 0x4f46e5,
        name: "Support",
        permissionKeys: [],
        serverId: "server-1",
      }),
    );
    expect(onOpenRoleDetail).toHaveBeenCalledWith("role-support");
  });

  it("shows the empty invites state and creates an invite through the managed mutation", async () => {
    resetMocks();
    mockShareInvite.mockReset();
    mockCopyToClipboard.mockReset();
    const view = await render(<MobileServerInvitesScreen serverId="server-1" onBack={jest.fn()} />);

    expect(view.getByTestId("mobile-server-invites-empty")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-server-invites-create"));
    await waitFor(() =>
      expect(mockMutations.createInvite.mutateAsync).toHaveBeenCalledWith({ serverId: "server-1" }),
    );
  });

  it("renders invite cards and shares the exact canonical url", async () => {
    resetMocks();
    mockShareInvite.mockReset();
    mockCopyToClipboard.mockReset();
    mockInvitesQuery = {
      data: {
        invites: [
          {
            channelId: null,
            createdAt: "2026-07-01T00:00:00.000Z",
            createdByDisplayName: "Ada",
            expiresAt: null,
            id: "invite-1",
            maxUses: null,
            shareUrl: "https://whispr.example/invite/abc123",
            uses: 3,
          },
        ],
      },
      isLoading: false,
    };
    const view = await render(<MobileServerInvitesScreen serverId="server-1" onBack={jest.fn()} />);

    expect(view.getByTestId("mobile-server-invite-invite-1")).toBeTruthy();
    expect(view.getByText("abc123")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-server-invite-invite-1-copy"));
    expect(mockCopyToClipboard).toHaveBeenCalledWith("https://whispr.example/invite/abc123");

    await fireEvent.press(view.getByTestId("mobile-server-invite-invite-1-share"));
    expect(mockShareInvite).toHaveBeenCalledWith("https://whispr.example/invite/abc123");
  });

  it("revokes an invite after confirmation through the managed mutation", async () => {
    resetMocks();
    mockInvitesQuery = {
      data: {
        invites: [
          {
            channelId: null,
            createdAt: "2026-07-01T00:00:00.000Z",
            createdByDisplayName: "Ada",
            expiresAt: null,
            id: "invite-1",
            maxUses: null,
            shareUrl: "https://whispr.example/invite/abc123",
            uses: 3,
          },
        ],
      },
      isLoading: false,
      refetch: jest.fn().mockResolvedValue({}),
    };
    const view = await render(<MobileServerInvitesScreen serverId="server-1" onBack={jest.fn()} />);

    await fireEvent.press(view.getByTestId("mobile-server-invite-invite-1-delete"));
    await fireEvent.press(view.getByTestId("mobile-server-invite-delete-confirm-confirm"));

    await waitFor(() =>
      expect(mockMutations.deleteInvite.mutateAsync).toHaveBeenCalledWith({
        inviteId: "invite-1",
        serverId: "server-1",
      }),
    );
  });

  it("shows the invites loading skeleton while the query is pending", async () => {
    resetMocks();
    mockInvitesQuery = { data: undefined, isLoading: true };
    const view = await render(<MobileServerInvitesScreen serverId="server-1" onBack={jest.fn()} />);

    expect(view.getByTestId("mobile-server-invites-loading")).toBeTruthy();
  });
});

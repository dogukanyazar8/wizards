import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";

const mockShowToast = jest.fn();
let mockMutations: Record<string, { isPending: boolean; mutateAsync: jest.Mock }>;
let mockMembersQuery: Record<string, unknown>;
let mockRolesQuery: Record<string, unknown>;

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { roles: [] } }),
}));

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: {} }),
}));

jest.mock("../src/query/use-mobile-server-management-mutations", () => ({
  useMobileServerManagementMutations: () => mockMutations,
}));

jest.mock("../src/workspace/mobile-server-management-query", () => ({
  useMobileServerMembersInfiniteQuery: () => mockMembersQuery,
  useMobileServerRoleOverviewQuery: () => mockRolesQuery,
}));

jest.mock("../src/app/components/kit", () => {
  const actual = jest.requireActual("../src/app/components/kit");
  const React = require("react");
  const { View } = require("react-native");
  return {
    ...actual,
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? React.createElement(View, { testID }, children) : null),
    useSheetPresentation: () => "content",
    useToast: () => ({ dismissToast: jest.fn(), showToast: mockShowToast }),
  };
});

import { MobileRoleDetailScreen } from "../src/workspace/mobile-role-detail-screen";
import { MobileWorkspaceCreateSheets } from "../src/workspace/mobile-workspace-create-sheets";

const role = {
  color: 0x4f46e5,
  id: "role-1",
  isDefault: false,
  managed: false,
  memberCount: 1,
  name: "Moderator",
  permissionKeys: ["VIEW_CHANNEL"],
  position: 1,
};

const member = {
  accessLevel: "MEMBER",
  actions: { canKick: false, canManageRoles: true },
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada",
  id: "member-1",
  roleIds: ["role-1"],
  roles: [],
  status: "ONLINE",
  userId: "user-1",
  username: "ada",
};

function createMutation(result: unknown = { success: true }) {
  return { isPending: false, mutateAsync: jest.fn().mockResolvedValue(result) };
}

beforeEach(() => {
  mockShowToast.mockReset();
  mockMutations = {
    createCategory: createMutation({ category: { id: "category-new", name: "Yeni" } }),
    createChannel: createMutation({ channel: { id: "channel-new" } }),
    deleteRole: createMutation(),
    updateMemberRoles: createMutation(),
    updateRole: createMutation(),
  };
  mockRolesQuery = {
    data: { roles: [role] },
    isFetching: false,
    isLoading: false,
    refetch: jest.fn().mockResolvedValue({}),
  };
  mockMembersQuery = {
    data: { pages: [{ memberPage: { limit: 50, nextCursor: null }, members: [member] }] },
    fetchNextPage: jest.fn().mockResolvedValue({}),
    hasNextPage: false,
    isFetchingNextPage: false,
  };
});

describe("mobile error surfaces and draft state", () => {
  it("reuses a category created before a failed channel request", async () => {
    mockMutations.createChannel.mutateAsync
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ channel: { id: "channel-new" } });
    const onChannelCreated = jest.fn();
    const view = await render(
      <MobileWorkspaceCreateSheets
        detail={{ categories: [], ungroupedChannels: [] } as never}
        onChangeState={jest.fn()}
        onChannelCreated={onChannelCreated}
        serverId="server-1"
        serverName="Wizards"
        state={{ categoryId: null, channelType: "TEXT", kind: "channel" }}
      />,
    );

    await fireEvent.changeText(view.getByTestId("mobile-workspace-channel-form-name"), "general");
    await fireEvent.press(view.getByTestId("mobile-workspace-channel-form-category-new"));
    await fireEvent.changeText(
      view.getByTestId("mobile-workspace-channel-form-new-category-name"),
      "Yeni",
    );
    await fireEvent.press(view.getByTestId("mobile-workspace-channel-form-submit"));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));

    const retry = mockShowToast.mock.calls[0]?.[0]?.action?.onPress;
    await act(async () => retry?.());

    await waitFor(() => expect(mockMutations.createChannel.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mockMutations.createCategory.mutateAsync).toHaveBeenCalledTimes(1);
    expect(onChannelCreated).toHaveBeenCalledWith("channel-new");
  });

  it("retries a missing role only once across unstable query objects", async () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockRolesQuery = {
      data: { roles: [] },
      isFetching: false,
      isLoading: false,
      refetch,
    };
    const props = { onBack: jest.fn(), roleId: "missing-role", serverId: "server-1" };
    const view = await render(<MobileRoleDetailScreen {...props} />);

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    mockRolesQuery = { ...mockRolesQuery };
    view.rerender(
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileRoleDetailScreen {...props} />
        </MobileLocaleProvider>
      </MobileThemeProvider>,
    );

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("fetches the next member page when the role detail reaches the end", async () => {
    const fetchNextPage = jest.fn().mockResolvedValue({});
    mockMembersQuery = {
      ...mockMembersQuery,
      fetchNextPage,
      hasNextPage: true,
    };
    const view = await render(
      <MobileRoleDetailScreen onBack={jest.fn()} roleId="role-1" serverId="server-1" />,
    );

    await fireEvent.scroll(view.getByTestId("mobile-role-detail-scroll"), {
      nativeEvent: {
        contentOffset: { y: 700 },
        contentSize: { height: 1_000 },
        layoutMeasurement: { height: 400 },
      },
    });

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

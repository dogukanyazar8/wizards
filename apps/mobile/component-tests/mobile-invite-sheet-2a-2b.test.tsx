import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Clipboard from "expo-clipboard";

const mockUseMobileAuth = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? ReactRuntime.createElement(View, { testID: `${testID}-panel` }, children) : null),
  };
});

import { MobileInviteSheet } from "../src/invite/mobile-invite-sheet";
import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileCopy } from "../src/locale/mobile-copy";

const labels = mobileCopy.tr;

const linkInvite = {
  channelId: null,
  createdAt: "2026-07-26T12:00:00.000Z",
  createdByDisplayName: "Doğukan",
  expiresAt: null,
  id: "invite-1",
  maxUses: null,
  shareUrl: "https://whispr.gg/invite/mobile-test-a7x2",
  uses: 0,
};

/** The sheet formats against the real clock, so the fixtures are relative too. */
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const YESTERDAY = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

const friends = [
  {
    avatarUrl: null,
    displayName: "Ayşegül",
    id: "user-2",
    isMember: false,
    lastSeenAt: null,
    pendingInviteId: null,
    status: "ONLINE" as const,
    username: "aysegul_dev",
  },
  {
    avatarUrl: null,
    displayName: "Atakan",
    id: "user-3",
    isMember: false,
    lastSeenAt: TWO_HOURS_AGO,
    pendingInviteId: "invite-9",
    status: "OFFLINE" as const,
    username: "atakantuymaz",
  },
  {
    avatarUrl: null,
    displayName: "Emre",
    id: "user-4",
    isMember: true,
    lastSeenAt: null,
    pendingInviteId: null,
    status: "OFFLINE" as const,
    username: "emre.kaya",
  },
];

const pendingInvites = [
  {
    createdAt: YESTERDAY,
    id: "invite-9",
    user: { avatarUrl: null, displayName: "Atakan", id: "user-3", username: "atakantuymaz" },
  },
];

const searchResults = [
  {
    avatarUrl: null,
    displayName: "Doğukan Yazar",
    id: "user-5",
    isMember: false,
    mutualServerCount: 2,
    pendingInviteId: null,
    relationship: "none" as const,
    requestId: null,
    username: "dogukanyazar",
  },
  {
    avatarUrl: null,
    displayName: null,
    id: "user-6",
    isMember: false,
    mutualServerCount: 0,
    pendingInviteId: null,
    relationship: "none" as const,
    requestId: null,
    username: "dogu_gamer",
  },
  {
    avatarUrl: null,
    displayName: "Doğuhan",
    id: "user-7",
    isMember: true,
    mutualServerCount: 1,
    pendingInviteId: null,
    relationship: "none" as const,
    requestId: null,
    username: "doguhan.aksoy",
  },
];

type RequestHandler = (path: string, options?: { body?: unknown; method?: string }) => unknown;

async function mountSheet(handler: RequestHandler, overrides: { canManageServer?: boolean } = {}) {
  const requestJson = jest.fn(async (path: string, options?: { body?: unknown; method?: string }) =>
    handler(path, options),
  );
  mockUseMobileAuth.mockReturnValue({ apiClient: { requestJson } });

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const onClose = jest.fn();
  const onOpenInviteManagement = jest.fn();

  const view = await render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <MobileInviteSheet
              canManageServer={overrides.canManageServer ?? true}
              onClose={onClose}
              onOpenInviteManagement={onOpenInviteManagement}
              open
              serverId="server-1"
              serverName="Mobile Test"
            />
          </QueryClientProvider>
        </ToastProvider>
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );

  return { onClose, onOpenInviteManagement, requestJson, view };
}

/**
 * Stateful stub: a sent invite really is stored, and a revoke really removes
 * it, so the tests exercise the refetch path instead of a frozen payload that
 * would silently undo every optimistic write.
 */
function sheetHandler(overrides: { readonly startWithoutLink?: boolean } = {}): RequestHandler {
  const sentByUserId = new Map<string, string>();
  const revoked = new Set<string>();
  let nextInviteId = 1;
  let currentLink = overrides.startWithoutLink === true ? null : linkInvite;

  const currentPending = () => [
    ...[...sentByUserId.entries()].map(([userId, id]) => ({
      createdAt: new Date().toISOString(),
      id,
      user: { avatarUrl: null, displayName: null, id: userId, username: "aysegul_dev" },
    })),
    ...pendingInvites.filter((invite) => !revoked.has(invite.id)),
  ];

  const currentFriends = () =>
    friends.map((friend) => {
      const sent = sentByUserId.get(friend.id);
      if (sent) {
        return { ...friend, pendingInviteId: sent };
      }
      return friend.pendingInviteId && revoked.has(friend.pendingInviteId)
        ? { ...friend, pendingInviteId: null }
        : friend;
    });

  return (path, options) => {
    if (path.endsWith("/invites/sheet") && options?.method === undefined) {
      return {
        friends: currentFriends(),
        linkInvite: currentLink,
        pendingInvites: currentPending(),
      };
    }
    if (path.endsWith("/invites/sheet") && options?.method === "PUT") {
      currentLink = { ...linkInvite, expiresAt: "2026-07-27T12:00:00.000Z", maxUses: 10 };
      return { invite: currentLink };
    }
    if (path.endsWith("/invites/targeted")) {
      const body = options?.body as { userId: string };
      const id = `invite-new-${nextInviteId}`;
      nextInviteId += 1;
      sentByUserId.set(body.userId, id);
      return {
        invite: {
          createdAt: new Date().toISOString(),
          id,
          user: { avatarUrl: null, displayName: null, id: body.userId, username: "aysegul_dev" },
        },
      };
    }
    if (path.includes("/qr")) {
      return { qrCodeDataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    }
    if (path.includes("/friends/search")) {
      return { results: searchResults };
    }
    if (options?.method === "DELETE") {
      revoked.add(String(path).split("/").pop() ?? "");
      return { success: true };
    }
    if (path.endsWith("/invites")) {
      currentLink = linkInvite;
      return { invite: currentLink };
    }
    return { success: true };
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe("2a — invite sheet, link tab", () => {
  it("renders the link card, its meta line and the friend rows from live data", async () => {
    const { view } = await mountSheet(sheetHandler());

    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-link-value")).toBeTruthy());
    expect(view.getByTestId("mobile-invite-sheet-link-value").props.children).toBe(
      linkInvite.shareUrl,
    );
    expect(view.getByTestId("mobile-invite-sheet-meta").props.children).toBe(
      "Süresiz · sınırsız kullanım",
    );
    expect(view.getByText("aysegul_dev")).toBeTruthy();
    expect(view.getByText(labels.inviteSheetFriendOnline)).toBeTruthy();
    expect(view.getByText(labels.inviteSheetFriendMember)).toBeTruthy();
  });

  it("shows 'Kopyalandı' for two seconds after a copy, then reverts", async () => {
    const setString = jest
      .spyOn(Clipboard, "setStringAsync")
      .mockResolvedValue(true as unknown as void);
    const { view } = await mountSheet(sheetHandler());
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-copy")).toBeTruthy());

    jest.useFakeTimers();
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-copy"));
    });

    expect(setString).toHaveBeenCalledWith(linkInvite.shareUrl);
    await waitFor(() => expect(view.getByText(labels.inviteSheetCopiedAction)).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(view.getByText(labels.inviteSheetCopyAction)).toBeTruthy();
    jest.useRealTimers();
  });

  it("keeps a friend with a stored pending invite on 'Gönderildi' without any tap", async () => {
    const { view } = await mountSheet(sheetHandler());
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-link-value")).toBeTruthy());

    const sentRow = view.getByTestId("mobile-invite-sheet-friend-user-3-action");
    expect(sentRow).toBeTruthy();
    expect(view.getByText(labels.inviteSheetSentAction)).toBeTruthy();
    // Its subtitle comes from lastSeenAt, not from a placeholder.
    expect(view.getByText("2 sa önce görüldü")).toBeTruthy();
  });

  it("flips a row to 'Gönderildi' optimistically and posts a targeted invite", async () => {
    const { requestJson, view } = await mountSheet(sheetHandler());
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-link-value")).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-friend-user-2-action"));
    });

    await waitFor(() =>
      expect(
        requestJson.mock.calls.some(
          ([path, options]) =>
            String(path).endsWith("/invites/targeted") &&
            (options as { body?: { userId?: string } } | undefined)?.body?.userId === "user-2",
        ),
      ).toBe(true),
    );
    expect(view.getAllByText(labels.inviteSheetSentAction).length).toBeGreaterThanOrEqual(2);
  });

  it("rolls the row back and does not claim a sent invite when the write fails", async () => {
    const { view } = await mountSheet((path, options) => {
      if (String(path).endsWith("/invites/targeted")) {
        throw new Error("network");
      }
      return sheetHandler()(path, options);
    });
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-link-value")).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-friend-user-2-action"));
    });

    await waitFor(() => expect(view.getByText(labels.inviteSheetInviteFailed)).toBeTruthy());
    // Only the pre-existing pending row still reads "Gönderildi".
    expect(view.getAllByText(labels.inviteSheetSentAction)).toHaveLength(1);
  });

  it("hides 'Düzenle' from a member who cannot manage the server", async () => {
    const { view } = await mountSheet(sheetHandler(), { canManageServer: false });
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-meta")).toBeTruthy());

    expect(view.queryByTestId("mobile-invite-sheet-edit-open")).toBeNull();
  });

  it("replaces the link through the admin-only edit sheet", async () => {
    const { requestJson, view } = await mountSheet(sheetHandler());
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-edit-open")).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-edit-open"));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-expiry-24"));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-uses-10"));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-edit-submit"));
    });

    await waitFor(() =>
      expect(
        requestJson.mock.calls.some(
          ([path, options]) =>
            String(path).endsWith("/invites/sheet") &&
            (options as { method?: string } | undefined)?.method === "PUT",
        ),
      ).toBe(true),
    );
    const call = requestJson.mock.calls.find(
      ([, options]) => (options as { method?: string } | undefined)?.method === "PUT",
    );
    expect((call?.[1] as { body: unknown }).body).toEqual({ expiresInHours: 24, maxUses: 10 });
  });

  it("renders the QR view from a server-generated data URL", async () => {
    const { view } = await mountSheet(sheetHandler());
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-qr-open")).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-qr-open"));
    });

    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-qr-image")).toBeTruthy());
    expect(view.getByTestId("mobile-invite-sheet-qr-image").props.source).toEqual({
      uri: "data:image/png;base64,iVBORw0KGgo=",
    });
  });

  it("mints the 7-day default link when the server has no live one", async () => {
    const { requestJson, view } = await mountSheet(sheetHandler({ startWithoutLink: true }));

    await waitFor(() =>
      expect(
        requestJson.mock.calls.some(
          ([path, options]) =>
            String(path).endsWith("/invites") &&
            (options as { method?: string } | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
    const create = requestJson.mock.calls.find(
      ([path, options]) =>
        String(path).endsWith("/invites") &&
        (options as { method?: string } | undefined)?.method === "POST",
    );
    expect((create?.[1] as { body: unknown }).body).toEqual({
      expiresInHours: 168,
      maxUses: null,
    });
    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-link-value")).toBeTruthy());
  });
});

describe("2b — invite sheet, username tab", () => {
  async function openUsernameTab(handler: RequestHandler, canManageServer = true) {
    const mounted = await mountSheet(handler, { canManageServer });
    await waitFor(() =>
      expect(mounted.view.getByTestId("mobile-invite-sheet-tab-username")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(mounted.view.getByTestId("mobile-invite-sheet-tab-username"));
    });
    return mounted;
  }

  it("waits for the debounce and the two-character minimum before searching", async () => {
    const { requestJson, view } = await openUsernameTab(sheetHandler());

    await act(async () => {
      fireEvent.changeText(view.getByTestId("mobile-invite-sheet-search"), "d");
    });
    // Let the debounce actually elapse: a single character must still not search.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(requestJson.mock.calls.some(([path]) => String(path).includes("/friends/search"))).toBe(
      false,
    );

    await act(async () => {
      fireEvent.changeText(view.getByTestId("mobile-invite-sheet-search"), "dogu");
    });
    await waitFor(() =>
      expect(
        requestJson.mock.calls.some(
          ([path]) =>
            String(path).includes("/friends/search") && String(path).includes("serverId=server-1"),
        ),
      ).toBe(true),
    );
  });

  it("tints the matching run of each username and labels the mutual-server counts", async () => {
    const { view } = await openUsernameTab(sheetHandler());
    await act(async () => {
      fireEvent.changeText(view.getByTestId("mobile-invite-sheet-search"), "dogu");
    });

    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-result-user-5")).toBeTruthy());
    const row = view.getByTestId("mobile-invite-sheet-result-user-5");
    expect(JSON.stringify(row)).toContain("dogu");
    expect(view.getByText("Doğukan Yazar · 2 ortak sunucu")).toBeTruthy();
    expect(view.getByText(labels.inviteSheetNoMutualServers)).toBeTruthy();
    expect(view.getByTestId("mobile-invite-sheet-result-user-7-action")).toBeTruthy();
    expect(view.getByText(labels.inviteSheetMemberAction)).toBeTruthy();
  });

  it("offers the link tab from the empty state", async () => {
    const { view } = await openUsernameTab((path, options) =>
      String(path).includes("/friends/search") ? { results: [] } : sheetHandler()(path, options),
    );
    await act(async () => {
      fireEvent.changeText(view.getByTestId("mobile-invite-sheet-search"), "zzzz");
    });

    await waitFor(() => expect(view.getByTestId("mobile-invite-sheet-results-empty")).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-results-empty-link"));
    });
    expect(view.getByTestId("mobile-invite-sheet-link-tab")).toBeTruthy();
  });

  it("revokes a pending invite and drops the row", async () => {
    const { requestJson, view } = await openUsernameTab(sheetHandler());
    await waitFor(() =>
      expect(view.getByTestId("mobile-invite-sheet-pending-invite-9")).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-pending-invite-9-revoke"));
    });

    await waitFor(() =>
      expect(
        requestJson.mock.calls.some(
          ([path, options]) =>
            String(path).endsWith("/invites/invite-9") &&
            (options as { method?: string } | undefined)?.method === "DELETE",
        ),
      ).toBe(true),
    );
    expect(view.queryByTestId("mobile-invite-sheet-pending-invite-9")).toBeNull();
  });

  it("restores the pending row when the revoke fails", async () => {
    const { view } = await openUsernameTab((path, options) => {
      if (String(path).endsWith("/invites/invite-9")) {
        throw new Error("network");
      }
      return sheetHandler()(path, options);
    });
    await waitFor(() =>
      expect(view.getByTestId("mobile-invite-sheet-pending-invite-9")).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-invite-sheet-pending-invite-9-revoke"));
    });

    await waitFor(() => expect(view.getByText(labels.inviteSheetRevokeFailed)).toBeTruthy());
    expect(view.getByTestId("mobile-invite-sheet-pending-invite-9")).toBeTruthy();
  });

  it("shows 'Yönet' only to an admin and routes through the caller", async () => {
    const admin = await openUsernameTab(sheetHandler());
    await waitFor(() =>
      expect(admin.view.getByTestId("mobile-invite-sheet-pending-header-action")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(admin.view.getByTestId("mobile-invite-sheet-pending-header-action"));
    });
    expect(admin.onOpenInviteManagement).toHaveBeenCalledTimes(1);

    const member = await openUsernameTab(sheetHandler(), false);
    await waitFor(() =>
      expect(member.view.getByTestId("mobile-invite-sheet-pending-header")).toBeTruthy(),
    );
    expect(member.view.queryByTestId("mobile-invite-sheet-pending-header-action")).toBeNull();
  });

  it("renders the pending row with a relative send time, not a placeholder", async () => {
    const { view } = await openUsernameTab(sheetHandler());
    await waitFor(() =>
      expect(view.getByTestId("mobile-invite-sheet-pending-invite-9")).toBeTruthy(),
    );

    expect(view.getByText(/yanıt bekleniyor$/)).toBeTruthy();
  });
});

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ServerPublicProfile, ServerScheduledEvent } from "@wizards/types";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockUseMobileAuth = jest.fn();
const mockShowToast = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/components/kit/toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react") as typeof React;
  const { View: NativeView } = require("react-native");

  return {
    BottomSheet: ({ children, open, testID }: never) =>
      (open as unknown as boolean)
        ? ReactRuntime.createElement(NativeView, { testID }, children as never)
        : null,
  };
});

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileServerEventFormScreen } from "../src/app/screens/server-profile/server-event-form-screen";
import { MobileServerEventsScreen } from "../src/app/screens/server-profile/server-events-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;
const EVENTS_PATH = "/api/v1/mobile/servers/server-1/events?includePast=true";
const PROFILE_PATH = "/api/v1/mobile/servers/server-1/profile";

function eventFixture(overrides: Partial<ServerScheduledEvent> = {}): ServerScheduledEvent {
  return {
    attendeeCount: 2,
    channelId: "channel-3",
    channelName: "live-room",
    description: null,
    entityType: "VOICE",
    externalLocation: null,
    id: "event-1",
    interestedCount: 8,
    name: "Topluluk buluşması",
    scheduledEndAt: null,
    scheduledStartAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    serverId: "server-1",
    status: "SCHEDULED",
    viewerInterested: false,
    ...overrides,
  };
}

function profileFixture(canManageServer: boolean): ServerPublicProfile {
  return {
    accessLevel: "public",
    admins: [],
    bannerUrl: null,
    canManageServer,
    channelCount: 1,
    channels: [
      {
        categoryId: null,
        categoryName: null,
        id: "channel-3",
        isPrivate: false,
        lastActivityAt: null,
        liveCount: 0,
        name: "live-room",
        participants: [],
        readOnly: false,
        type: "voice",
      },
    ],
    createdAt: "2025-03-12T10:00:00.000Z",
    description: "",
    discoverable: true,
    iconUrl: null,
    inviteAddress: null,
    isPublic: true,
    joined: true,
    joinedAt: "2026-04-10T10:00:00.000Z",
    memberCount: 5,
    muted: false,
    mutualFriendCount: 0,
    mutualFriends: [],
    name: "Whispr Topluluk",
    notificationLevel: "all",
    onlineCount: 1,
    serverId: "server-1",
    shortName: "WT",
    starred: false,
    tags: [],
    type: "COMMUNITY",
    upcomingEvent: null,
    verified: false,
    voiceActiveCount: 0,
    weeklyMessageCount: null,
  };
}

function createApiClient({
  canManageServer = true,
  events = [eventFixture()],
}: {
  readonly canManageServer?: boolean;
  readonly events?: readonly ServerScheduledEvent[];
} = {}) {
  const state = { events: [...events] };

  return {
    requestJson: jest.fn(
      async (path: string, init?: { readonly body?: unknown; readonly method?: string }) => {
        if (path === EVENTS_PATH) {
          return { events: state.events };
        }
        if (path === PROFILE_PATH) {
          return profileFixture(canManageServer);
        }
        if (path === "/api/v1/mobile/servers/server-1/events" && init?.method === "POST") {
          return { event: eventFixture({ id: "event-new" }) };
        }
        if (
          path === "/api/v1/mobile/servers/server-1/events/event-1" &&
          init?.method === "DELETE"
        ) {
          state.events = state.events.map((event) =>
            event.id === "event-1" ? { ...event, status: "CANCELLED" as const } : event,
          );
          return { event: state.events[0] };
        }
        if (
          path === "/api/v1/mobile/servers/server-1/events/event-1/interest" &&
          init?.method === "POST"
        ) {
          state.events = state.events.map((event) =>
            event.id === "event-1" ? { ...event, viewerInterested: true } : event,
          );
          return { event: state.events[0] };
        }
        throw new Error(`Unexpected event request: ${path}`);
      },
    ),
  };
}

const queryClients: QueryClient[] = [];

function wrap(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  queryClients.push(queryClient);

  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 0 },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <MobileThemeProvider>
          <MobileLocaleProvider>{children}</MobileLocaleProvider>
        </MobileThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function renderList(apiClient = createApiClient()) {
  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: "user-1" } },
    status: "signed-in",
  });

  const props = {
    onBack: jest.fn(),
    onOpenChannel: jest.fn(),
    onOpenForm: jest.fn(),
  };
  const view = await render(wrap(<MobileServerEventsScreen {...props} serverId="server-1" />));

  return { apiClient, props, view };
}

async function renderForm(eventId?: string, apiClient = createApiClient()) {
  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: "user-1" } },
    status: "signed-in",
  });

  const onBack = jest.fn();
  const view = await render(
    wrap(
      <MobileServerEventFormScreen
        onBack={onBack}
        serverId="server-1"
        {...(eventId === undefined ? {} : { eventId })}
      />,
    ),
  );

  return { apiClient, onBack, view };
}

describe("server events list", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it("splits upcoming from past by status and prints the interest count", async () => {
    const { view } = await renderList(
      createApiClient({
        events: [
          eventFixture(),
          eventFixture({ id: "event-old", name: "Geçen ay", status: "COMPLETED" }),
        ],
      }),
    );
    await view.findByText("Topluluk buluşması");

    expect(view.getByText(copy.serverEventsUpcoming)).toBeTruthy();
    expect(view.getByText(copy.serverEventsPast)).toBeTruthy();
    expect(
      within(view.getByTestId("mobile-server-event-event-1")).getByText("8 kişi ilgileniyor"),
    ).toBeTruthy();
    // A finished event carries a status chip instead of actions.
    expect(view.queryByTestId("mobile-server-event-action-event-old")).toBeNull();
    expect(view.getByText(copy.serverEventCompleted)).toBeTruthy();
  });

  it("toggles interest through the idempotent endpoint", async () => {
    const { apiClient, view } = await renderList();
    await view.findByText("Topluluk buluşması");

    await fireEvent.press(view.getByTestId("mobile-server-event-action-event-1"));

    await waitFor(() => {
      expect(apiClient.requestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/servers/server-1/events/event-1/interest",
        { body: { interested: true }, method: "POST" },
      );
    });
    await waitFor(() => {
      expect(view.getByText(copy.serverEventReminderOn)).toBeTruthy();
    });
  });

  it("connects a starting event to its channel instead of toggling interest", async () => {
    const { props, view } = await renderList(
      createApiClient({
        events: [
          eventFixture({ scheduledStartAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }),
        ],
      }),
    );
    await view.findByText("Topluluk buluşması");

    expect(view.getByText(copy.eventJoin)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-server-event-action-event-1"));
    expect(props.onOpenChannel).toHaveBeenCalledWith("server-1", "channel-3");
  });

  // Faz 1 §C7: cancelling marks the row, it never removes it.
  it("cancels behind a confirmation and keeps the row with a cancelled chip", async () => {
    const { apiClient, view } = await renderList();
    await view.findByText("Topluluk buluşması");

    await fireEvent.press(view.getByTestId("mobile-server-event-cancel-event-1"));
    await fireEvent.press(view.getByTestId("mobile-server-event-cancel-confirm-confirm"));

    await waitFor(() => {
      expect(apiClient.requestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/servers/server-1/events/event-1",
        { method: "DELETE" },
      );
    });
    await waitFor(() => {
      expect(view.getByText(copy.serverEventCancelled)).toBeTruthy();
    });
    expect(view.getByTestId("mobile-server-event-event-1")).toBeTruthy();
  });

  it("hides create, edit and cancel from a member without MANAGE_SERVER", async () => {
    const { view } = await renderList(createApiClient({ canManageServer: false }));
    await view.findByText("Topluluk buluşması");

    expect(view.queryByTestId("mobile-server-events-create")).toBeNull();
    expect(view.queryByTestId("mobile-server-event-edit-event-1")).toBeNull();
    expect(view.queryByTestId("mobile-server-event-cancel-event-1")).toBeNull();
    // The interest action stays: it only asks for membership.
    expect(view.getByTestId("mobile-server-event-action-event-1")).toBeTruthy();
  });

  it("shows the empty state and, for a manager, the create call to action", async () => {
    const { view } = await renderList(createApiClient({ events: [] }));
    await view.findByTestId("mobile-server-events-empty");

    expect(view.getByText(copy.serverEventsEmpty)).toBeTruthy();
    expect(view.getByTestId("mobile-server-events-create")).toBeTruthy();
  });
});

describe("server event form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it("rejects a malformed date before anything is sent", async () => {
    const { apiClient, view } = await renderForm();

    await fireEvent.changeText(view.getByTestId("mobile-server-event-form-name"), "Buluşma");
    await fireEvent.changeText(view.getByTestId("mobile-server-event-form-start"), "12 Mart");
    await fireEvent.press(view.getByTestId("mobile-server-event-form-save"));

    expect(view.getByText(copy.serverEventFormInvalidDate)).toBeTruthy();
    expect(apiClient.requestJson).not.toHaveBeenCalledWith(
      "/api/v1/mobile/servers/server-1/events",
      expect.anything(),
    );
  });

  it("refuses an end before its own start", async () => {
    const { view } = await renderForm();

    await fireEvent.changeText(view.getByTestId("mobile-server-event-form-name"), "Buluşma");
    await fireEvent.changeText(
      view.getByTestId("mobile-server-event-form-start"),
      "12.03.2026 18:00",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-server-event-form-end"),
      "12.03.2026 17:00",
    );
    await fireEvent.press(view.getByTestId("mobile-server-event-form-save"));

    expect(view.getByText(copy.serverEventFormEndBeforeStart)).toBeTruthy();
  });

  it("creates an event with the picked voice channel and closes on success", async () => {
    const { apiClient, onBack, view } = await renderForm();
    await view.findByTestId("mobile-server-event-form-channel-channel-3");

    await fireEvent.changeText(view.getByTestId("mobile-server-event-form-name"), "Buluşma");
    await fireEvent.changeText(
      view.getByTestId("mobile-server-event-form-start"),
      "12.03.2026 18:00",
    );
    await fireEvent.press(view.getByTestId("mobile-server-event-form-channel-channel-3"));
    await fireEvent.press(view.getByTestId("mobile-server-event-form-save"));

    await waitFor(() => {
      expect(apiClient.requestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/servers/server-1/events",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = apiClient.requestJson.mock.calls.find(
      (call) => call[0] === "/api/v1/mobile/servers/server-1/events",
    )?.[1] as { body: Record<string, unknown> };
    expect(body.body).toMatchObject({
      channelId: "channel-3",
      entityType: "VOICE",
      name: "Buluşma",
      scheduledEndAt: null,
    });
    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      title: copy.serverEventSaved,
      variant: "success",
    });
  });

  it("swaps the channel picker for a location field on an external event", async () => {
    const { view } = await renderForm();
    await view.findByTestId("mobile-server-event-form-channel-none");

    await fireEvent.press(view.getByTestId("mobile-server-event-form-type-EXTERNAL"));

    expect(view.getByTestId("mobile-server-event-form-external")).toBeTruthy();
    expect(view.queryByTestId("mobile-server-event-form-channel-none")).toBeNull();
  });

  it("seeds the edit path from the event it is editing", async () => {
    const { view } = await renderForm("event-1");

    await waitFor(() => {
      expect(view.getByTestId("mobile-server-event-form-name").props.value).toBe(
        "Topluluk buluşması",
      );
    });
    expect(view.getByText(copy.serverEventEdit)).toBeTruthy();
  });
});

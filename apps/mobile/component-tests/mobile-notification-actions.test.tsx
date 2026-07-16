import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileNotificationItem } from "@wizards/types";

const mockNavigateMobileRouteIntent = jest.fn();
const mockOpenMobileVoiceRoom = jest.fn();
const mockResolveMobileRoutePathIntent = jest.fn();

jest.mock("../src/navigation/mobile-linking", () => ({
  resolveMobileRoutePathIntent: (...args: unknown[]) => mockResolveMobileRoutePathIntent(...args),
}));

jest.mock("../src/navigation/mobile-navigation-ref", () => ({
  navigateMobileRouteIntent: (...args: unknown[]) => mockNavigateMobileRouteIntent(...args),
}));

jest.mock("../src/voice/mobile-voice-room-route-navigation", () => ({
  openMobileVoiceRoom: (...args: unknown[]) => mockOpenMobileVoiceRoom(...args),
}));

import { createMobileNotificationActions } from "../src/app/features/mobile-notification-actions";

const voiceNotification: MobileNotificationItem = {
  actionUrl: null,
  actor: null,
  body: "Ses odas\u0131 ba\u015flad\u0131",
  channel: { id: "channel-1", name: "Genel" },
  createdAt: "2026-07-16T10:00:00.000Z",
  eventKind: "voice-room-started",
  id: "00000000-0000-4000-8000-000000000004",
  messageQuote: null,
  read: false,
  readAt: null,
  server: { id: "server-1", name: "Whispr" },
  type: "SYSTEM",
};

describe("mobile notification actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens only a resolved notification route", () => {
    const routeIntent = { params: { channelId: "channel-1" }, screen: "Channel" } as never;
    mockResolveMobileRoutePathIntent.mockReturnValueOnce(routeIntent).mockReturnValueOnce(null);
    const actions = createMobileNotificationActions({ joinVoiceChannel: jest.fn() });

    actions.onOpenNotification("/channels/server-1/channel-1");
    actions.onOpenNotification("https://untrusted.example");

    expect(mockNavigateMobileRouteIntent).toHaveBeenCalledTimes(1);
    expect(mockNavigateMobileRouteIntent).toHaveBeenCalledWith(routeIntent);
  });

  it("joins and opens a voice room only for a structured voice notification", async () => {
    const joinVoiceChannel = jest.fn(async () => true);
    const actions = createMobileNotificationActions({ joinVoiceChannel });

    await actions.onJoinVoiceNotification(voiceNotification);

    expect(joinVoiceChannel).toHaveBeenCalledWith({
      channelId: "channel-1",
      channelName: "Genel",
      serverId: "server-1",
    });
    expect(mockOpenMobileVoiceRoom).toHaveBeenCalledWith({
      channelId: "channel-1",
      channelName: "Genel",
      serverId: "server-1",
    });
  });

  it("does not join when the notification lacks a verified voice context", async () => {
    const joinVoiceChannel = jest.fn(async () => true);
    const actions = createMobileNotificationActions({ joinVoiceChannel });

    await actions.onJoinVoiceNotification({ ...voiceNotification, server: null });

    expect(joinVoiceChannel).not.toHaveBeenCalled();
    expect(mockOpenMobileVoiceRoom).not.toHaveBeenCalled();
  });
});

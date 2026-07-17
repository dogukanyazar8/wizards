import type { MobileNotificationItem } from "@wizards/types";
import { resolveMobileRoutePathIntent } from "../../navigation/mobile-linking";
import { navigateMobileRouteIntent } from "../../navigation/mobile-navigation-ref";
import { openMobileVoiceRoom } from "../../voice/mobile-voice-room-route-navigation";
import type { MobileNotificationsScreenProps } from "../providers/mobile-product-screen-provider";

type MobileVoiceChannelInput = {
  readonly channelId: string;
  readonly channelName: string;
  readonly serverId: string;
};

export function createMobileNotificationActions({
  joinVoiceChannel,
}: {
  readonly joinVoiceChannel: (input: MobileVoiceChannelInput) => Promise<boolean>;
}) {
  return {
    async onJoinVoiceNotification(notification: MobileNotificationItem) {
      if (
        notification.eventKind !== "voice-room-started" ||
        !notification.channel ||
        !notification.server
      ) {
        return;
      }

      const voiceChannel = {
        channelId: notification.channel.id,
        channelName: notification.channel.name ?? notification.channel.id,
        serverId: notification.server.id,
      };
      const joined = await joinVoiceChannel(voiceChannel);
      if (joined) {
        openMobileVoiceRoom(voiceChannel);
      }
    },
    onOpenNotification(actionUrl: string) {
      const routeIntent = resolveMobileRoutePathIntent(actionUrl);
      if (routeIntent) {
        navigateMobileRouteIntent(routeIntent);
      }
    },
  };
}

/** Assembles the notifications-tab contract from the shared runtimes. */
export function createMobileNotificationsScreenProps({
  joinVoiceChannel,
  ...rest
}: Omit<MobileNotificationsScreenProps, "onJoinVoiceNotification" | "onOpenNotification"> & {
  readonly joinVoiceChannel: (input: MobileVoiceChannelInput) => Promise<boolean>;
}): MobileNotificationsScreenProps {
  return { ...rest, ...createMobileNotificationActions({ joinVoiceChannel }) };
}

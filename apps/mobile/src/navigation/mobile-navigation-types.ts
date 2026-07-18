import type { NavigatorScreenParams } from "@react-navigation/native";
import type { MobileDeepLinkIntent } from "../deep-link/mobile-deep-links";

export type MobileBottomTabParamList = {
  overview: undefined;
  messages: undefined;
  notifications: undefined;
  settings: undefined;
};

export type MobileRootStackParamList = {
  MainTabs: NavigatorScreenParams<MobileBottomTabParamList> | undefined;
  VoiceRoom: undefined;
  ChannelChat: {
    readonly channelId: string;
    readonly serverId: string;
  };
  DirectMessage: {
    readonly conversationId: string;
  };
  MessageThread: {
    readonly contextId: string;
    readonly messageId: string;
    readonly scope: "channel" | "dm";
  };
  SettingsDetail: {
    readonly section: string;
  };
  ProfileEdit: undefined;
  BlockedUsers: undefined;
  Security: undefined;
  DMDetails: { readonly conversationId: string };
  ServerSettings: { readonly serverId: string };
  ServerRoles: { readonly serverId: string };
  ServerMembers: { readonly serverId: string };
  ChannelSettings: { readonly channelId: string; readonly serverId: string };
};

export type MobileNavigationRouteIntent =
  | {
      readonly name: "VoiceRoom";
      readonly params: undefined;
      readonly type: "route";
    }
  | {
      readonly name: "MainTabs";
      readonly params: NavigatorScreenParams<MobileBottomTabParamList>;
      readonly type: "route";
    }
  | {
      readonly name: "ChannelChat";
      readonly params: MobileRootStackParamList["ChannelChat"];
      readonly type: "route";
    }
  | {
      readonly name: "DirectMessage";
      readonly params: MobileRootStackParamList["DirectMessage"];
      readonly type: "route";
    }
  | {
      readonly name: "MessageThread";
      readonly params: MobileRootStackParamList["MessageThread"];
      readonly type: "route";
    }
  | {
      readonly name: "SettingsDetail";
      readonly params: MobileRootStackParamList["SettingsDetail"];
      readonly type: "route";
    }
  | {
      readonly name: "ServerRoles";
      readonly params: MobileRootStackParamList["ServerRoles"];
      readonly type: "route";
    }
  | { readonly name: "ProfileEdit"; readonly params: undefined; readonly type: "route" }
  | { readonly name: "BlockedUsers"; readonly params: undefined; readonly type: "route" };

export type MobileNavigationCommandIntent = Exclude<
  MobileDeepLinkIntent,
  { readonly type: "route" }
>;

export type MobileNavigationIntent = MobileNavigationRouteIntent | MobileNavigationCommandIntent;

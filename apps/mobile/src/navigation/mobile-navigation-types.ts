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
  /** 11c full profile page; `serverId` is what turns the role chips on. */
  UserProfile: {
    readonly serverId?: string | undefined;
    readonly userId: string;
  };
  BlockedUsers: undefined;
  Security: undefined;
  /**
   * 11f shared-media gallery. `userId` is the other participant, carried so a
   * caller that already knows who it is (the 1c profile page) does not make the
   * screen re-derive the name from the conversation.
   */
  SharedMedia: { readonly conversationId: string; readonly userId?: string };
  ServerSettings: { readonly serverId: string };
  ServerRoles: { readonly serverId: string };
  RoleDetail: { readonly roleId: string; readonly serverId: string };
  ServerMembers: { readonly serverId: string };
  ServerInvites: { readonly serverId: string };
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
  | {
      readonly name: "UserProfile";
      readonly params: MobileRootStackParamList["UserProfile"];
      readonly type: "route";
    }
  | { readonly name: "ProfileEdit"; readonly params: undefined; readonly type: "route" }
  | { readonly name: "BlockedUsers"; readonly params: undefined; readonly type: "route" };

export type MobileNavigationCommandIntent = Exclude<
  MobileDeepLinkIntent,
  { readonly type: "route" }
>;

export type MobileNavigationIntent = MobileNavigationRouteIntent | MobileNavigationCommandIntent;

import type { NavigatorScreenParams } from "@react-navigation/native";
import type { MobileDeepLinkIntent } from "../deep-link/mobile-deep-links";

export type MobileBottomTabParamList = {
  overview: undefined;
  messages: undefined;
  notifications: undefined;
  voice: undefined;
  settings: undefined;
};

export type MobileRootStackParamList = {
  MainTabs: NavigatorScreenParams<MobileBottomTabParamList> | undefined;
  ChannelChat: {
    readonly channelId: string;
    readonly serverId: string;
  };
  DirectMessage: {
    readonly conversationId: string;
  };
  SettingsDetail: {
    readonly section: string;
  };
};

export type MobileNavigationRouteIntent =
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
      readonly name: "SettingsDetail";
      readonly params: MobileRootStackParamList["SettingsDetail"];
      readonly type: "route";
    };

export type MobileNavigationCommandIntent = Exclude<
  MobileDeepLinkIntent,
  { readonly type: "route" }
>;

export type MobileNavigationIntent = MobileNavigationRouteIntent | MobileNavigationCommandIntent;

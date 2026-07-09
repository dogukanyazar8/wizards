import type { LinkingOptions } from "@react-navigation/native";
import { parseMobileDeepLink } from "../deep-link/mobile-deep-links";
import { parseMobileChannelsRoutePath } from "./mobile-navigation";
import type {
  MobileNavigationCommandIntent,
  MobileNavigationIntent,
  MobileNavigationRouteIntent,
  MobileRootStackParamList,
} from "./mobile-navigation-types";

export const MOBILE_LINKING_PREFIXES = ["whispr://"] as const;

export interface MobileLinkingAdapter {
  readonly addEventListener: (
    type: "url",
    listener: (event: { readonly url: string }) => void,
  ) => { readonly remove: () => void };
  readonly getInitialURL: () => Promise<string | null> | string | null;
}

export interface MobileNavigationIntentOptions {
  readonly webUrl: string;
}

interface CreateMobileLinkingOptions extends MobileNavigationIntentOptions {
  readonly linking: MobileLinkingAdapter;
  readonly onCommand: (command: MobileNavigationCommandIntent) => void;
}

export function resolveMobileNavigationIntent(
  rawUrl: string,
  options: MobileNavigationIntentOptions,
): MobileNavigationIntent | null {
  const result = parseMobileDeepLink(rawUrl, options);

  if (!result.ok) {
    return null;
  }

  if (result.intent.type !== "route") {
    return result.intent;
  }

  return resolveMobileRouteIntent(result.intent.path);
}

export function createMobileLinkingOptions({
  linking,
  onCommand,
  webUrl,
}: CreateMobileLinkingOptions): LinkingOptions<MobileRootStackParamList> {
  const prefixes = [...MOBILE_LINKING_PREFIXES, getTrustedWebOrigin(webUrl)];

  const resolveRouteUrl = (url: string): string | null => {
    const intent = resolveMobileNavigationIntent(url, { webUrl });

    if (!intent) {
      return null;
    }

    if (intent.type !== "route") {
      onCommand(intent);
      return null;
    }

    return url;
  };

  return {
    config: {
      screens: {
        MainTabs: {
          screens: {
            messages: "channels/@me",
            notifications: "notifications",
            overview: "channels",
            settings: "settings",
            voice: "voice",
          },
        },
        ChannelChat: "channels/:serverId/:channelId",
        DirectMessage: "channels/@me/:conversationId",
        SettingsDetail: "settings/:section",
      },
    },
    filter: (url) => resolveMobileNavigationIntent(url, { webUrl })?.type === "route",
    getInitialURL: async () => {
      const url = await linking.getInitialURL();
      return url ? resolveRouteUrl(url) : null;
    },
    prefixes,
    subscribe: (listener) => {
      const subscription = linking.addEventListener("url", ({ url }) => {
        const routeUrl = resolveRouteUrl(url);
        if (routeUrl) {
          listener(routeUrl);
        }
      });

      return () => subscription.remove();
    },
  };
}

function resolveMobileRouteIntent(path: string): MobileNavigationRouteIntent | null {
  const channelRoute = parseMobileChannelsRoutePath(path);

  if (channelRoute?.serverId === "@me") {
    return channelRoute.channelId
      ? {
          name: "DirectMessage",
          params: { conversationId: channelRoute.channelId },
          type: "route",
        }
      : createMainTabsIntent("messages");
  }

  if (channelRoute?.channelId) {
    return {
      name: "ChannelChat",
      params: {
        channelId: channelRoute.channelId,
        serverId: channelRoute.serverId,
      },
      type: "route",
    };
  }

  const pathname = getPathname(path);
  if (pathname === "/channels" || channelRoute) {
    return createMainTabsIntent("overview");
  }

  if (pathname === "/settings") {
    return createMainTabsIntent("settings");
  }

  const settingsMatch = /^\/settings\/([^/]+)$/.exec(pathname);
  if (settingsMatch?.[1]) {
    return {
      name: "SettingsDetail",
      params: { section: decodePathSegment(settingsMatch[1]) },
      type: "route",
    };
  }

  return null;
}

function createMainTabsIntent(
  screen: "messages" | "overview" | "settings",
): MobileNavigationRouteIntent {
  return {
    name: "MainTabs",
    params: { screen },
    type: "route",
  };
}

function getPathname(path: string): string {
  return path.split(/[?#]/, 1)[0] ?? "";
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function getTrustedWebOrigin(webUrl: string): string {
  return new URL(webUrl).origin;
}

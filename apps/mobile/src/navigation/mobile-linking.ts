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
  readonly onRoute: (route: MobileNavigationRouteIntent) => void;
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

  return resolveMobileRoutePathIntent(result.intent.path);
}

export function createMobileLinkingOptions({
  linking,
  onCommand,
  onRoute,
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

    onRoute(intent);
    return url;
  };

  return {
    config: {
      // A cold-start deep link builds the whole stack from the path, so without
      // an initial route the app would open with the detail screen alone and
      // back would quit instead of landing on the tabs. Naming MainTabs here
      // puts it underneath every detail route; because it is also the stack's
      // first route, foreground links still resolve to a plain navigate and
      // keep the state the user already had.
      initialRouteName: "MainTabs",
      screens: {
        MainTabs: {
          initialRouteName: "overview",
          screens: {
            messages: "channels/@me",
            notifications: "notifications",
            overview: "channels",
            settings: "settings",
          },
        },
        AboutReleaseHistory: "settings/about/releases",
        AboutReleaseNote: "settings/about/releases/:version",
        AboutUpdateChannel: "settings/about/channel",
        AboutWhatsNew: "settings/about/whats-new",
        AdminIncidents: "admin/cases",
        AdminIncidentDetail: "admin/case/:caseId",
        BugReport: "help/report",
        ChannelChat: "channels/:serverId/:channelId",
        /**
         * Path generation only. An incoming `whispr://invite/<code>` is claimed
         * earlier by `parseMobileDeepLink` as a server-invite command intent —
         * that flow predates this screen and still owns the scheme — so this
         * entry never resolves an inbound link, and `resolveMobileRoutePathIntent`
         * is what opens 2g when the app asks for the path itself.
         */
        CommunityInvite: "invite/:slug",
        DirectMessage: "channels/@me/:conversationId",
        HelpCenter: "help",
        ServerRoles: "server/:serverId/settings/roles",
        SettingsDetail: "settings/:section",
        UserProfile: "user/:userId",
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

export function resolveMobileRoutePathIntent(path: string): MobileNavigationRouteIntent | null {
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
  // `whispr://user/<id>` (11c). The optional `?serverId=` decides whether the
  // page can show role chips, so it rides along as a route param.
  const userProfileMatch = /^\/user\/([^/]+)$/.exec(pathname);
  if (userProfileMatch?.[1]) {
    const serverId = getSearchParam(path, "serverId");
    return {
      name: "UserProfile",
      params: {
        ...(serverId ? { serverId } : {}),
        userId: decodePathSegment(userProfileMatch[1]),
      },
      type: "route",
    };
  }

  // `/feedback/<id>` — where a FEEDBACK notification lands. It opens the
  // tracking view for that record rather than the notifications list, so the
  // status the title announced is the first thing on screen.
  const feedbackMatch = /^\/feedback\/([^/]+)$/.exec(pathname);
  if (feedbackMatch?.[1]) {
    return {
      name: "FeedbackSubmitted",
      params: { feedbackId: decodePathSegment(feedbackMatch[1]) },
      type: "route",
    };
  }

  // F7 moderation triage. Two shapes reach the same screen on purpose:
  // `whispr://admin/case/<id>` is the deep link the spec names, and
  // `/admin/moderation/<id>` is the `actionUrl` the MODERATION notification
  // carries — the same path the web console uses, so one row works on both.
  const adminCaseMatch = /^\/admin\/(?:case|moderation)\/([^/]+)$/.exec(pathname);
  if (adminCaseMatch?.[1]) {
    return {
      name: "AdminIncidentDetail",
      params: { caseId: decodePathSegment(adminCaseMatch[1]) },
      type: "route",
    };
  }

  if (pathname === "/admin/cases" || pathname === "/admin/moderation") {
    return { name: "AdminIncidents", params: undefined, type: "route" };
  }

  const serverRolesMatch = /^\/server\/([^/]+)\/settings\/roles$/.exec(pathname);
  if (serverRolesMatch?.[1]) {
    return {
      name: "ServerRoles",
      params: { serverId: decodePathSegment(serverRolesMatch[1]) },
      type: "route",
    };
  }

  if (pathname === "/channels" || channelRoute) {
    return createMainTabsIntent("overview");
  }

  if (pathname === "/settings") {
    return createMainTabsIntent("settings");
  }

  // The four About destinations are matched before `settings/:section`. That
  // regex is single-segment (`[^/]+`) so it could not swallow them today, but
  // the ordering is the guarantee: widening it later must not silently turn
  // `/settings/about/channel` into a settings section named "about".
  if (pathname === "/settings/about/whats-new") {
    return { name: "AboutWhatsNew", params: undefined, type: "route" };
  }

  if (pathname === "/settings/about/releases") {
    return { name: "AboutReleaseHistory", params: undefined, type: "route" };
  }

  const releaseNoteMatch = /^\/settings\/about\/releases\/([^/]+)$/.exec(pathname);
  if (releaseNoteMatch?.[1]) {
    return {
      name: "AboutReleaseNote",
      params: { version: decodePathSegment(releaseNoteMatch[1]) },
      type: "route",
    };
  }

  if (pathname === "/settings/about/channel") {
    return { name: "AboutUpdateChannel", params: undefined, type: "route" };
  }

  if (pathname === "/help") {
    return { name: "HelpCenter", params: undefined, type: "route" };
  }

  // §4.17: 2e's "bulamadık" row enters the form with a category preselected.
  if (pathname === "/help/report") {
    const category = getSearchParam(path, "category");
    return {
      name: "BugReport",
      params: category ? { category } : undefined,
      type: "route",
    };
  }

  const communityInviteMatch = /^\/invite\/([^/]+)$/.exec(pathname);
  if (communityInviteMatch?.[1]) {
    return {
      name: "CommunityInvite",
      params: { slug: decodePathSegment(communityInviteMatch[1]) },
      type: "route",
    };
  }

  const settingsMatch = /^\/settings\/([^/]+)$/.exec(pathname);
  if (settingsMatch?.[1]) {
    // `whispr://settings/badges?badge=<id>` — the shape a BADGE notification's
    // `actionUrl` takes once it names a badge. Every other section ignores it.
    const badgeId = getSearchParam(path, "badge");
    return {
      name: "SettingsDetail",
      params: {
        ...(badgeId ? { badgeId } : {}),
        section: decodePathSegment(settingsMatch[1]),
      },
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

function getSearchParam(path: string, key: string): string | null {
  const queryStart = path.indexOf("?");
  if (queryStart < 0) {
    return null;
  }

  const value = new URLSearchParams(path.slice(queryStart + 1).split("#", 1)[0]).get(key);
  return value?.trim() ? value : null;
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

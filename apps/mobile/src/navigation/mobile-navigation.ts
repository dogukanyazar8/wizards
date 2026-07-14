import type { MobileAuthStatus } from "../auth/session-types";

export const MOBILE_TAB_IDS = ["overview", "messages", "notifications", "settings"] as const;

export type MobileTabId = (typeof MOBILE_TAB_IDS)[number];

export const MOBILE_BOTTOM_TAB_IDS = [
  "overview",
  "messages",
  "notifications",
  "settings",
] as const satisfies readonly MobileTabId[];

export type MobileBottomTabId = (typeof MOBILE_BOTTOM_TAB_IDS)[number];

export interface MobileTabDescriptor {
  readonly id: MobileTabId;
  readonly requiresSession: boolean;
}

export interface MobileNavigationState {
  readonly currentTab: MobileTabId;
  readonly previousTab: MobileTabId | null;
}

export type MobileNavigationAction =
  | {
      readonly tab: string;
      readonly type: "select";
    }
  | {
      readonly type: "reset";
    };

export interface MobileRouteResolution {
  readonly blockedReason: "auth-required" | "checking" | null;
  readonly currentTab: MobileTabId;
  readonly isBlocked: boolean;
  readonly requiresSession: boolean;
}

export interface MobileChannelsRouteTarget {
  readonly channelId: string | null;
  readonly serverId: string;
}

export const DEFAULT_MOBILE_TAB_ID: MobileTabId = "overview";

export const MOBILE_TABS: readonly MobileTabDescriptor[] = [
  { id: "overview", requiresSession: true },
  { id: "messages", requiresSession: true },
  { id: "notifications", requiresSession: true },
  { id: "settings", requiresSession: false },
] as const;

const protectedTabs = new Set<MobileTabId>(
  MOBILE_TABS.filter((tab) => tab.requiresSession).map((tab) => tab.id),
);

export function isMobileTabId(value: string): value is MobileTabId {
  return (MOBILE_TAB_IDS as readonly string[]).includes(value);
}

export function createMobileNavigationState(
  currentTab: string = DEFAULT_MOBILE_TAB_ID,
): MobileNavigationState {
  return {
    currentTab: isMobileTabId(currentTab) ? currentTab : DEFAULT_MOBILE_TAB_ID,
    previousTab: null,
  };
}

export function mobileNavigationReducer(
  state: MobileNavigationState,
  action: MobileNavigationAction,
): MobileNavigationState {
  switch (action.type) {
    case "reset":
      return createMobileNavigationState();
    case "select":
      if (!isMobileTabId(action.tab) || action.tab === state.currentTab) {
        return state;
      }

      return {
        currentTab: action.tab,
        previousTab: state.currentTab,
      };
    default:
      return state;
  }
}

export function resolveMobileRoute(
  currentTab: MobileTabId,
  authStatus: MobileAuthStatus,
): MobileRouteResolution {
  const requiresSession = protectedTabs.has(currentTab);
  const blockedReason =
    requiresSession && authStatus === "checking"
      ? "checking"
      : requiresSession && authStatus !== "signed-in"
        ? "auth-required"
        : null;

  return {
    blockedReason,
    currentTab,
    isBlocked: blockedReason !== null,
    requiresSession,
  };
}

export function parseMobileChannelsRoutePath(path: string): MobileChannelsRouteTarget | null {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (segments[0] !== "channels" || !segments[1]) {
    return null;
  }

  return {
    channelId: segments[2] ?? null,
    serverId: segments[1],
  };
}

export function getMobileTabForRoutePath(path: string): MobileTabId {
  const channelRoute = parseMobileChannelsRoutePath(path);
  if (channelRoute) {
    return channelRoute.serverId === "@me" ? "messages" : "overview";
  }

  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }

  if (pathname === "/invite" || pathname.startsWith("/invite/")) {
    return "overview";
  }

  return DEFAULT_MOBILE_TAB_ID;
}

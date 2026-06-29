import type { MobileAuthStatus } from "../auth/session-types";

export const MOBILE_TAB_IDS = ["overview", "messages", "voice", "settings"] as const;

export type MobileTabId = (typeof MOBILE_TAB_IDS)[number];

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

export const DEFAULT_MOBILE_TAB_ID: MobileTabId = "overview";

export const MOBILE_TABS: readonly MobileTabDescriptor[] = [
  { id: "overview", requiresSession: false },
  { id: "messages", requiresSession: true },
  { id: "voice", requiresSession: true },
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

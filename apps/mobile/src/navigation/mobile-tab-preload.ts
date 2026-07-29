/**
 * Tabs are lazy, so the first visit to one paid for mounting its whole screen
 * tree on the JS thread — a visible stall on the tap that switched to it.
 * Preloading mounts them once the launch has settled; `freezeOnBlur` then keeps
 * them from reacting to anything until they are focused, so the cost is paid
 * where nobody is waiting.
 *
 * Deliberately not every tab: settings and notifications are cheap enough to
 * mount on demand, and warming them at launch would just move the stall.
 */
export const MOBILE_PRELOADED_TABS = ["messages"] as const;

type MobilePreloadableNavigation = {
  readonly preload?: (name: string) => void;
};

/**
 * Returns the tabs that were preloaded. An older navigator without `preload`,
 * or one that rejects the call, is not an error worth surfacing — the tab simply
 * mounts on first visit as it did before.
 */
export function preloadMobileTabs(
  navigation: MobilePreloadableNavigation,
  activeTab: string | null,
): string[] {
  const preload = navigation.preload;
  if (typeof preload !== "function") {
    return [];
  }

  const preloaded: string[] = [];
  for (const tab of MOBILE_PRELOADED_TABS) {
    if (tab === activeTab) {
      continue;
    }

    try {
      preload(tab);
      preloaded.push(tab);
    } catch {
      // A navigator that is not ready yet gets no retry: the next launch warms
      // it, and the tab still works on demand.
    }
  }

  return preloaded;
}

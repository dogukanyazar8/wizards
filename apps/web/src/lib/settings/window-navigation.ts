import { buildSettingsHref, resolveSettingsRoute, type SettingsRoute } from "./navigation";

/** Read the current URL after a native-history change or browser Back/Forward. */
export function settingsRouteFromPathname(pathname: string | null, fallback: SettingsRoute) {
  const match = pathname?.match(/^\/settings\/([^/]+)(?:\/([^/]+))?\/?$/);
  return match ? resolveSettingsRoute(match[1], match[2]) : fallback;
}

/** The window already owns every tab. Changing it must not fetch/remount an RSC page. */
export function writeSettingsHistory(
  history: Pick<History, "pushState" | "replaceState">,
  mode: "push" | "replace",
  route: SettingsRoute,
  highlight?: string,
) {
  const href = buildSettingsHref(route.section, route.tab);
  history[mode === "push" ? "pushState" : "replaceState"](
    null,
    "",
    highlight ? `${href}?highlight=${encodeURIComponent(highlight)}` : href,
  );
}

export const RESPONSIVE_BREAKPOINTS = {
  /**
   * Ana Sayfa kompozisyonunun iki eşiği (`08-faz7` §3). Kabuğun `mobileMax`/`tablet` eşikleriyle
   * çelişmezler: onlar **kabuğun** hangi sütunu göstereceğini, bunlar komuta merkezinin ızgarasının
   * kaç kolon olacağını söyler. Ayrı sorular, ayrı sayılar; ikisi de tek yerde.
   */
  commandCenter: 960,
  commandCenterWide: 1360,
  desktop: 1024,
  mobileMax: 767,
  supportPanel: 1280,
  tablet: 768,
} as const;

export const RESPONSIVE_MEDIA_QUERIES = {
  desktop: `(min-width: ${RESPONSIVE_BREAKPOINTS.desktop}px)`,
  mobile: `(max-width: ${RESPONSIVE_BREAKPOINTS.mobileMax}px)`,
  supportPanel: `(min-width: ${RESPONSIVE_BREAKPOINTS.supportPanel}px)`,
  tablet: `(min-width: ${RESPONSIVE_BREAKPOINTS.tablet}px) and (max-width: ${
    RESPONSIVE_BREAKPOINTS.supportPanel - 1
  }px)`,
} as const;

export const RESPONSIVE_SHELL_SIZES = {
  mobileActionSheetMaxHeight: "min(70dvh, 28rem)",
  mobileComposerReserve: "max(7.5rem, calc(env(safe-area-inset-bottom) + 6.75rem))",
  mobileOverlayInset: "0.75rem",
  mobilePopupMaxHeight: "min(28rem, calc(100dvh - 1.5rem))",
  infoDrawerWidth: "min(100vw, 24rem)",
  mobileWorkspaceDrawerWidth: "min(100vw, 28rem)",
  safeBottomPadding: "max(0.75rem, env(safe-area-inset-bottom))",
  safeTopPadding: "max(0.75rem, env(safe-area-inset-top))",
} as const;

export type ResponsiveLayoutMode = "desktop" | "mobile" | "tablet";

export function getResponsiveLayoutMode(width: number): ResponsiveLayoutMode {
  if (width <= RESPONSIVE_BREAKPOINTS.mobileMax) {
    return "mobile";
  }

  if (width < RESPONSIVE_BREAKPOINTS.supportPanel) {
    return "tablet";
  }

  return "desktop";
}

export function shouldUseWorkspaceDrawer(mode: ResponsiveLayoutMode): boolean {
  return mode === "mobile";
}

export function shouldUseInfoDrawer(mode: ResponsiveLayoutMode): boolean {
  return mode !== "desktop";
}

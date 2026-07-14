import type { MobileTheme } from "./themes";

/**
 * Transitional aliases for presentation modules that are being moved from the
 * Phase 0 token names to semantic theme roles. Values remain theme-derived;
 * this layer carries no palette literals and can be deleted after migration.
 */
export function getMobileThemeCompatibilityColors(theme: MobileTheme) {
  return {
    accent: theme.accent.default,
    accentStrong: theme.accent.strong,
    ambientPrimary: theme.accent.soft,
    ambientSecondary: theme.surface.soft,
    background: theme.surface.base,
    border: theme.border.subtle,
    borderSubtle: theme.border.subtle,
    card: theme.surface.card,
    danger: theme.status.danger,
    dangerSoft: theme.status.dangerSoft,
    infoSoft: theme.status.infoSoft,
    input: theme.surface.soft,
    muted: theme.text.muted,
    mutedSoft: theme.text.soft,
    primary: theme.accent.action,
    primaryForeground: theme.text.onPrimary,
    primarySoft: theme.accent.soft,
    ring: theme.border.focus,
    shadow: theme.elevation.headerCard.shadowColor,
    success: theme.status.success,
    successSoft: theme.status.successSoft,
    surfaceBase: theme.surface.base,
    surfaceCard: theme.surface.card,
    surfaceElevated: theme.surface.elevated,
    surfaceOverlay: theme.surface.overlay,
    surfacePanel: theme.surface.soft,
    surfaceRail: theme.surface.rail,
    surfaceSoft: theme.surface.soft,
    text: theme.text.primary,
    textMuted: theme.text.muted,
    textPrimary: theme.text.primary,
    textSecondary: theme.text.secondary,
    textSoft: theme.text.soft,
    warning: theme.status.warning,
    warningSoft: theme.status.warningSoft,
    white: theme.text.onPrimary,
  } as const;
}

import type { MobileTheme } from "../../../design/themes";

export const createAuthLoginScreenStyles = (theme: MobileTheme) => ({
  divider: {
    backgroundColor: theme.border.subtle,
    flex: 1,
    height: theme.layout.border.hairline,
  },
  dividerLabel: {
    ...theme.typography.authSubtitle,
    color: theme.text.muted,
    textAlign: "center" as const,
  },
  dividerRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    minWidth: 0,
  },
  error: {
    ...theme.typography.authSubtitle,
    backgroundColor: theme.status.dangerSoft,
    borderColor: theme.status.danger,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    color: theme.status.dangerOnBase,
    padding: theme.spacing.section,
  },
  footerAction: {
    ...theme.typography.authFieldLabel,
    color: theme.accent.strong,
  },
  footerPrompt: {
    ...theme.typography.authSubtitle,
    color: theme.text.muted,
  },
  footerRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.layout.spacing.tightPlus,
    justifyContent: "center" as const,
    minWidth: 0,
  },
  form: {
    gap: theme.spacing.section,
    minWidth: 0,
  },
  inlineAction: {
    ...theme.typography.authFieldLabel,
    color: theme.accent.strong,
    textAlign: "right" as const,
  },
  inlineActionTarget: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  inlineRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    justifyContent: "space-between" as const,
    minWidth: 0,
  },
  screen: {
    gap: theme.spacing.section,
    minWidth: 0,
  },
  socialAction: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: theme.layout.border.hairline,
    flexDirection: "row" as const,
    gap: theme.layout.auth.ctaContentGap,
    height: theme.layout.auth.loginSocialActionHeight,
    justifyContent: "center" as const,
    minWidth: 0,
  },
  socialActionLabel: {
    ...theme.typography.authFieldLabel,
    color: theme.text.primary,
  },
  socialGroup: {
    gap: theme.spacing.row,
    minWidth: 0,
  },
  topSection: {
    gap: theme.spacing.section,
    minWidth: 0,
  },
});

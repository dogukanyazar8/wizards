import type { MobileTheme } from "../../../design/themes";

export const createAuthRegisterScreenStyles = (theme: MobileTheme) => ({
  compactInput: theme.typography.authCompactInput,
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
    paddingTop: theme.spacing.row,
  },
  form: {
    gap: theme.layout.auth.registerContentGap,
    minWidth: 0,
  },
  inlineActionTarget: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  legalCopy: {
    ...theme.typography.authLegalCopy,
    color: theme.text.secondary,
  },
  legalLink: {
    ...theme.typography.authFieldLabel,
    color: theme.accent.strong,
  },
  passwordColumn: {
    flexBasis: theme.layout.auth.registerPasswordColumnMinWidth,
    flexGrow: 1,
    minWidth: theme.layout.auth.registerPasswordColumnMinWidth,
  },
  passwordColumns: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.layout.auth.registerPasswordColumnGap,
    minWidth: 0,
  },
  screen: {
    gap: theme.spacing.section,
    minWidth: 0,
  },
  success: {
    ...theme.typography.authSubtitle,
    backgroundColor: theme.status.successSoft,
    borderColor: theme.status.success,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    color: theme.status.successText,
    padding: theme.spacing.section,
  },
  topSection: {
    gap: theme.spacing.section,
    minWidth: 0,
  },
});

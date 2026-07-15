import type { MobileTheme } from "../../../design/themes";

export const createAuthForgotPasswordScreenStyles = (theme: MobileTheme) => ({
  backAction: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.layout.auth.forgotActionGap,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  backActionLabel: {
    ...theme.typography.authResetAction,
    color: theme.accent.strong,
  },
  error: {
    ...theme.typography.authResetSubtitle,
    backgroundColor: theme.status.dangerSoft,
    borderColor: theme.status.danger,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    color: theme.status.dangerOnBase,
    padding: theme.spacing.section,
    textAlign: "center" as const,
  },
  iconCard: {
    alignItems: "center" as const,
    alignSelf: "center" as const,
    borderRadius: theme.layout.auth.iconCardRadius,
    borderWidth: theme.layout.border.hairline,
    height: theme.layout.auth.iconCard,
    justifyContent: "center" as const,
    width: theme.layout.auth.iconCard,
  },
  iconCardInitial: {
    backgroundColor: theme.accent.soft,
    borderColor: theme.accent.softBorder,
  },
  iconCardSuccess: {
    backgroundColor: theme.status.successSoft,
    borderColor: theme.status.success,
  },
  initialInfoBanner: {
    marginTop: theme.layout.auth.forgotInfoBannerMarginTop,
  },
  content: {
    flex: 1,
    gap: theme.layout.auth.forgotContentGap,
    minWidth: 0,
    paddingBottom: theme.layout.auth.forgotContentPaddingBottom,
    paddingHorizontal: theme.layout.auth.forgotContentPaddingHorizontal,
    justifyContent: "center" as const,
  },
  screen: {
    flex: 1,
    marginHorizontal: -theme.spacing.page,
    minWidth: 0,
  },
  topSection: {
    paddingHorizontal: theme.spacing.page,
  },
  ttlBanner: {
    marginTop: theme.layout.auth.forgotInfoBannerMarginTop,
  },
});

import type { MobileTheme } from "../../../design/themes";
import { mobileAuthMetrics, mobileAuthTypography } from "../../../design/tokens";

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
  footer: {
    paddingBottom: 26,
    paddingTop: 14,
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
    gap: 14,
    minWidth: 0,
  },
  mainContent: {
    flexGrow: 1,
    gap: 14,
    minWidth: 0,
    // Without a bottom inset the last social tile ends flush with the scroll
    // viewport and its border reads as clipped above the pinned footer.
    paddingBottom: 18,
    paddingTop: 18,
  },
  mainScroll: {
    flex: 1,
    minWidth: 0,
  },
  mainScrollContent: {
    flexGrow: 1,
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
  /** SPEC-GIRIS-KAYIT §6/1 ve §3.4 — başlık satırının sağındaki dil tetikleyicisi. */
  localeTrigger: {
    alignItems: "center" as const,
    alignSelf: "flex-end" as const,
    borderColor: theme.border.subtle,
    borderRadius: mobileAuthMetrics.selectorRadius,
    borderWidth: theme.layout.border.hairline,
    height: mobileAuthMetrics.selectorHeight,
    justifyContent: "center" as const,
    paddingHorizontal: theme.spacing.row,
  },
  localeTriggerLabel: {
    ...mobileAuthTypography.hint,
    color: theme.text.secondary,
  },
  rememberMe: {
    flexShrink: 0,
    width: theme.layout.auth.loginRememberMeWidth,
  },
  notice: {
    ...theme.typography.authSubtitle,
    backgroundColor: theme.status.successSoft,
    borderColor: theme.status.success,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    color: theme.status.successText,
    padding: theme.spacing.section,
  },
  screen: {
    flex: 1,
    minWidth: 0,
  },
  socialAction: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    // 4 equal columns like the redesign grid, capped at the reference tile width
    // so wider devices keep the handoff row centered instead of stretching it.
    flexBasis: 0,
    flexGrow: 1,
    height: theme.layout.auth.loginSocialActionHeight,
    justifyContent: "center" as const,
    maxWidth: theme.layout.auth.loginSocialActionWidth,
    minWidth: 0,
  },
  socialActionMuted: {
    opacity: theme.layout.opacity.disabled,
  },
  socialGrid: {
    flexDirection: "row" as const,
    gap: theme.layout.auth.loginSocialActionGap,
    justifyContent: "center" as const,
    minWidth: 0,
  },
  socialGroup: {
    gap: 14,
    minWidth: 0,
  },
  topSection: {
    gap: 14,
    minWidth: 0,
  },
  twoFactorAction: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    flex: 1,
    gap: theme.layout.spacing.tightPlus,
    minWidth: 0,
  },
  twoFactorActionLabel: {
    ...theme.typography.authFieldLabel,
    color: theme.accent.strong,
    flexShrink: 1,
  },
});

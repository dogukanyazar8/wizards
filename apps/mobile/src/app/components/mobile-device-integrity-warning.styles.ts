import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const createStyles = (theme: MobileTheme) => ({
  warning: {
    minHeight: 64,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.status.warning,
    borderRadius: theme.radii.control,
    backgroundColor: theme.status.warningSoft,
    paddingLeft: theme.spacing.row,
    paddingVertical: 10,
  },
  icon: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: theme.radii.control,
    backgroundColor: theme.status.warningSoft,
  },
  iconGlyph: {
    color: theme.status.warning,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...theme.typography.bodyStrong,
    color: theme.text.primary,
  },
  description: {
    ...theme.typography.caption,
    marginTop: 2,
    color: theme.text.secondary,
  },
  dismiss: {
    width: theme.sizing.minTouchTarget,
    height: theme.sizing.minTouchTarget,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 2,
    marginTop: -6,
    borderRadius: theme.radii.control,
  },
  dismissPressed: {
    backgroundColor: theme.interactive.pressed,
  },
  dismissGlyph: {
    color: theme.text.secondary,
  },
});

export const useMobileDeviceIntegrityWarningStyles = () => useThemedStyles(createStyles);

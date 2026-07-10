import { StyleSheet } from "react-native";

import { mobileColors, mobileSizing, mobileSpacing, mobileTypography } from "../../design/tokens";

export const styles = StyleSheet.create({
  warning: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    paddingLeft: mobileSpacing.row,
    paddingVertical: 10,
  },
  icon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
  },
  iconGlyph: {
    color: mobileColors.warning,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...mobileTypography.bodyStrong,
    color: mobileColors.text,
  },
  description: {
    ...mobileTypography.caption,
    marginTop: 2,
    color: mobileColors.textSecondary,
  },
  dismiss: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
    marginTop: -6,
    borderRadius: 8,
  },
  dismissPressed: {
    backgroundColor: "#FEF3C7",
  },
  dismissGlyph: {
    color: mobileColors.textSecondary,
  },
});

import { StyleSheet } from "react-native";

import { mobileColors, mobileSizing, mobileTypography } from "../../design/tokens";

export const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: mobileColors.background,
  },
  card: {
    width: "100%",
    maxWidth: mobileSizing.maxInlineContentWidth,
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: mobileColors.primarySoft,
  },
  iconGlyph: {
    color: mobileColors.primary,
  },
  title: {
    ...mobileTypography.title,
    color: mobileColors.text,
    textAlign: "center",
  },
  description: {
    ...mobileTypography.body,
    color: mobileColors.textSecondary,
    textAlign: "center",
  },
  actions: {
    marginTop: 12,
    width: "100%",
    gap: 10,
  },
  retryButton: {
    minHeight: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 20,
    backgroundColor: mobileColors.primary,
  },
  retryButtonPressed: {
    backgroundColor: mobileColors.accentStrong,
  },
  retryLabel: {
    ...mobileTypography.button,
    color: mobileColors.primaryForeground,
  },
  signOutButton: {
    minHeight: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.card,
  },
  signOutButtonPressed: {
    backgroundColor: mobileColors.surfaceSoft,
  },
  signOutLabel: {
    ...mobileTypography.button,
    color: mobileColors.textSecondary,
  },
});

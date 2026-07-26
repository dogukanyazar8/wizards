import type { TextStyle, ViewStyle } from "react-native";

import { mobileBrandPalette } from "../../design/palette";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";

/** Rendered edge length of the animated brand mark on the about identity card. */
export const ABOUT_APP_LOGO_SIZE = 76;
/** Corner radius kept proportional to the auth card (13/52 of the edge). */
export const ABOUT_APP_LOGO_RADIUS = 19;

export const createMobileAboutSettingsStyles = (theme: MobileTheme) =>
  ({
    root: { backgroundColor: theme.surface.base, flex: 1 },
    content: { paddingBottom: 40 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingBottom: 4,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
    backVisual: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 14,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    pressed: { opacity: 0.82 },
    title: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 22,
      letterSpacing: -0.44,
      minWidth: 0,
    },
    appCard: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 24,
      borderWidth: 1,
      gap: 10,
      marginHorizontal: 20,
      marginTop: 14,
      paddingHorizontal: 18,
      paddingVertical: 24,
    },
    appIcon: {
      alignItems: "center",
      // The animated mark paints its own gradient card; the matching solid colour
      // keeps the Android elevation shadow anchored to an opaque, same-hue outline.
      backgroundColor: mobileBrandPalette.whisprWave.indigo,
      borderRadius: ABOUT_APP_LOGO_RADIUS,
      height: ABOUT_APP_LOGO_SIZE,
      justifyContent: "center",
      width: ABOUT_APP_LOGO_SIZE,
      ...theme.elevation.primaryAction,
      shadowColor: mobileBrandPalette.whisprWave.indigo,
    },
    appIdentity: { alignItems: "center", gap: 2 },
    appName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 20,
      letterSpacing: -0.4,
    },
    appVersion: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13,
    },
    updateButton: {
      alignItems: "center",
      backgroundColor: theme.accent.action,
      borderRadius: 14,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 11,
      ...theme.elevation.primaryAction,
    },
    updateButtonDisabled: { opacity: 0.6 },
    updateButtonLabel: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
    updateStatus: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
    },
    sectionHeading: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      letterSpacing: 1.38,
      paddingBottom: 8,
      paddingHorizontal: 24,
      paddingTop: 18,
      textTransform: "uppercase",
    },
    card: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 24,
      borderWidth: 1,
      marginHorizontal: 20,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
      minHeight: 52,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    rowDivider: { borderBottomColor: theme.border.subtle, borderBottomWidth: 1 },
    rowDisabled: { opacity: 0.55 },
    rowLabel: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14.5,
      minWidth: 0,
    },
    statusBadge: {
      alignItems: "center",
      backgroundColor: theme.status.successSoft,
      borderRadius: 10,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusBadgeOffline: { backgroundColor: theme.status.dangerSoft },
    statusDot: {
      backgroundColor: theme.status.success,
      borderRadius: 999,
      height: 7,
      width: 7,
    },
    statusDotOffline: { backgroundColor: theme.status.danger },
    statusText: {
      color: theme.status.successText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
    },
    statusTextOffline: { color: theme.status.danger },
    soonBadge: {
      backgroundColor: theme.surface.soft,
      borderRadius: 999,
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    soonBadgeText: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileAboutSettingsStyles = () => useThemedStyles(createMobileAboutSettingsStyles);

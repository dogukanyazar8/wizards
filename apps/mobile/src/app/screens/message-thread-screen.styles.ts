import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { mobileMessagingMetrics } from "../../design/tokens";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

const metrics = mobileMessagingMetrics;

/**
 * MSG-1f thread. Same two tones as the channel (§1.10): the flow and its chrome
 * are `messaging.surface`, the source block is `messaging.screen`. Every reply
 * is a channel row, so nothing here re-describes a message.
 */
export const createMessageThreadStyles = (theme: MobileTheme) =>
  ({
    screen: { flex: 1, minWidth: 0, backgroundColor: theme.messaging.surface },
    header: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      // The source block's own top rule is the header's edge; a second one here
      // would double it.
      borderBottomWidth: 0,
      backgroundColor: theme.messaging.surface,
      paddingTop: 6,
      paddingBottom: 10,
      paddingHorizontal: 16,
    },
    backButton: {
      width: 26,
      height: metrics.iconButton,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    headerText: { flex: 1, minWidth: 0, gap: 1 },
    headerTitle: {
      color: theme.messaging.textPrimary,
      fontSize: 15.5,
      lineHeight: 20,
      letterSpacing: -0.155,
      fontFamily: theme.typography.fontFamilyExtraBold,
      includeFontPadding: false,
    },
    headerSubtitle: {
      color: theme.messaging.textSecondary,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilySemiBold,
      includeFontPadding: false,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
    /** §2 "1f".1: a 38px pill, not a square icon button. */
    followPill: {
      height: metrics.iconButton,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: metrics.iconButtonRadius,
      backgroundColor: theme.messaging.accentSoft,
      paddingHorizontal: 12,
    },
    followPillOff: { backgroundColor: theme.messaging.field },
    followPillLabel: {
      color: theme.messaging.accentText,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    followPillLabelOff: { color: theme.messaging.textSecondary },
    optionsButton: {
      width: metrics.iconButton,
      height: metrics.iconButton,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: metrics.iconButtonRadius,
      backgroundColor: theme.messaging.field,
    },
    optionsButtonDisabled: { opacity: 0.58 },
    body: { flex: 1, minWidth: 0 },
    bodyContent: { paddingBottom: 8 },
    /**
     * §2 "1f".2: `padding: 12px 16px 14px` around a channel row. The row brings
     * its own 16px inset and 6px vertical padding, so the block only adds the
     * remainder — 6 + 6 = 12 above, 8 + 6 = 14 below.
     */
    rootCard: {
      minWidth: 0,
      borderTopWidth: 1,
      borderTopColor: theme.messaging.divider,
      borderBottomWidth: 1,
      borderBottomColor: theme.messaging.divider,
      backgroundColor: theme.messaging.screen,
      paddingTop: 6,
      paddingBottom: 8,
      paddingHorizontal: 0,
    },
    /** §2 "1f".3: the label, then a rule running to the right edge. */
    replySectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingTop: 10,
      paddingBottom: 8,
      paddingHorizontal: metrics.channel.rowPaddingHorizontal,
    },
    replySectionLabel: {
      color: theme.messaging.groupLabel,
      fontSize: 10.5,
      lineHeight: 14,
      letterSpacing: 1.26,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    replySectionLine: { flex: 1, height: 1, backgroundColor: theme.messaging.divider },
    /** The replies keep the channel rhythm: no rail, no indent, no gap stack. */
    replyList: { minWidth: 0 },
    replyRow: { minWidth: 0 },
    typingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingLeft: metrics.channel.continuationPaddingLeft,
      paddingRight: metrics.channel.rowPaddingHorizontal,
      paddingTop: metrics.channel.typingPaddingTop,
      paddingBottom: metrics.channel.typingPaddingBottom,
    },
    typingText: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.messaging.textSecondary,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyBold,
    },
    emptyText: {
      color: theme.messaging.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 16,
      paddingHorizontal: metrics.channel.rowPaddingHorizontal,
      textAlign: "center",
    },
    threadErrorText: {
      // Audited danger-on-base pair: this line stands alone on the surface,
      // where the messaging danger tone does not clear the contrast floor.
      color: theme.status.dangerOnBase,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 16,
      paddingHorizontal: metrics.channel.rowPaddingHorizontal,
    },
    composerShell: { backgroundColor: theme.messaging.surface },
    /** §2 "1f".5: sits above the composer row, inside the composer block. */
    alsoSendRow: {
      minHeight: 19,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 2,
    },
    alsoSendCheckbox: {
      width: 19,
      height: 19,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.messaging.sliderStop,
      backgroundColor: theme.messaging.field,
    },
    alsoSendCheckboxChecked: {
      borderStyle: "solid",
      borderColor: theme.messaging.accent,
      backgroundColor: theme.messaging.accent,
    },
    alsoSendLabel: {
      flex: 1,
      minWidth: 0,
      color: theme.messaging.textTertiary,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyBold,
    },
    ...createSharedStyles(theme),
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

export const useMessageThreadStyles = () => useThemedStyles(createMessageThreadStyles);

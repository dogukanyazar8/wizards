import type { TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";

type ReactionDetailStyles = {
  activeTab: ViewStyle;
  activeTabCount: TextStyle;
  backdrop: ViewStyle;
  handle: ViewStyle;
  handleArea: ViewStyle;
  list: ViewStyle;
  name: TextStyle;
  panel: ViewStyle;
  personEmoji: TextStyle;
  personRow: ViewStyle;
  personText: ViewStyle;
  secondary: TextStyle;
  tab: ViewStyle;
  tabCount: TextStyle;
  tabEmoji: TextStyle;
  tabs: ViewStyle;
  title: TextStyle;
};

export const createMessageReactionDetailSheetStyles = (
  theme: MobileTheme,
): ReactionDetailStyles => ({
  activeTab: {
    backgroundColor: theme.accent.soft,
    borderColor: theme.accent.default,
    borderWidth: 1.5,
  },
  activeTabCount: {
    color: theme.accent.default,
    fontFamily: theme.typography.fontFamilyExtraBold,
  },
  backdrop: { backgroundColor: theme.messageMenu.reactionDetailScrim },
  handle: {
    backgroundColor: theme.authLanguage.handle,
    borderRadius: 3,
    height: 5,
    width: 44,
  },
  handleArea: { paddingBottom: 6, paddingTop: 10 },
  list: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  name: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 14,
    lineHeight: 19,
  },
  panel: {
    backgroundColor: theme.surface.elevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 0,
    elevation: 12,
    shadowColor: theme.messageMenu.shadow,
    shadowOffset: { height: -12, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
  },
  personEmoji: { fontSize: 18, lineHeight: 24 },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingVertical: 9,
  },
  personText: { flex: 1, gap: 1 },
  secondary: {
    color: theme.text.visualPlaceholder,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
  },
  tab: {
    alignItems: "center",
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  tabCount: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 12.5,
    lineHeight: 17,
  },
  tabEmoji: { fontSize: 15, lineHeight: 20 },
  tabs: {
    borderBottomColor: theme.messageMenu.separator,
    borderBottomWidth: 1,
    columnGap: 7,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  title: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 16,
    lineHeight: 22,
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
});

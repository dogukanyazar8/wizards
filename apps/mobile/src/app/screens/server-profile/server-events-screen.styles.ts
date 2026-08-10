import type { MobileTheme } from "../../../design/themes";

/**
 * Faz 5 §D — the event list and the event form. The handoff draws neither
 * screen (6a-6f is the servers surface only), so these reuse the 6d/6e token
 * group rather than opening a third table: the same white card, the same
 * lavender date block, the same primary action.
 */
export const createMobileServerEventStyles = (theme: MobileTheme) => {
  const profile = theme.serverProfile;
  const card = {
    backgroundColor: profile.statCard.bg,
    borderColor: profile.statCard.border,
    borderRadius: profile.friendsRow.radius,
    borderWidth: 1,
  } as const;

  return {
    root: { backgroundColor: theme.surface.base, flex: 1 },
    scroll: { flex: 1 },
    content: { padding: profile.bottomBar.paddingHorizontal, paddingBottom: 40 },

    header: {
      alignItems: "center" as const,
      backgroundColor: theme.surface.base,
      flexDirection: "row" as const,
      gap: 10,
      paddingBottom: profile.stickyHeader.paddingBottom,
      paddingHorizontal: profile.bottomBar.paddingHorizontal,
    },
    headerButton: {
      alignItems: "center" as const,
      borderColor: profile.stickyHeader.border,
      borderRadius: profile.stickyHeader.backRadius,
      borderWidth: 1,
      height: profile.stickyHeader.back,
      justifyContent: "center" as const,
      width: profile.stickyHeader.back,
    },
    headerTitle: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.stickyHeader.name.fontSize,
      minWidth: 0,
    },

    sectionHeader: { paddingBottom: 6, paddingHorizontal: 4, paddingTop: 14 },
    sectionLabel: {
      color: theme.workspace.categoryLabel.color,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: theme.workspace.categoryLabel.fontSize,
      letterSpacing: theme.workspace.categoryLabel.letterSpacing,
    },

    eventCard: {
      ...card,
      flexDirection: "row" as const,
      gap: profile.eventCard.gap,
      marginTop: 8,
      paddingHorizontal: profile.eventCard.paddingHorizontal,
      paddingVertical: profile.eventCard.paddingVertical,
    },
    eventDateBlock: {
      alignItems: "center" as const,
      backgroundColor: profile.eventDateBlock.bg,
      borderRadius: profile.eventDateBlock.radius,
      gap: 1,
      paddingVertical: 5,
      width: profile.eventDateBlock.width,
    },
    eventDateLabel: {
      color: profile.eventDateBlock.label,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.eventDateBlock.labelFontSize,
      letterSpacing: profile.eventDateBlock.labelLetterSpacing,
    },
    eventDateTime: {
      color: profile.eventDateBlock.time,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.eventDateBlock.timeFontSize,
    },
    eventBody: { flex: 1, gap: 3, minWidth: 0 },
    eventName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.channelPreviewRow.nameFontSize,
    },
    eventMeta: {
      color: profile.inviteAddress.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.eventJoinPill.textFontSize,
    },
    eventActions: { flexDirection: "row" as const, gap: 6, marginTop: 4 },
    eventPill: {
      backgroundColor: profile.eventJoinPill.bg,
      borderRadius: profile.eventJoinPill.radius,
      paddingHorizontal: profile.eventJoinPill.paddingHorizontal,
      paddingVertical: profile.eventJoinPill.paddingVertical,
    },
    eventPillText: {
      color: profile.eventJoinPill.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.eventJoinPill.textFontSize,
    },
    eventPillDanger: { backgroundColor: profile.bottomBar.leaveButton.bg },
    eventPillDangerText: { color: profile.bottomBar.leaveButton.icon },
    statusChip: {
      alignSelf: "flex-start" as const,
      backgroundColor: profile.privateChip.bg,
      borderRadius: profile.privateChip.radius,
      paddingHorizontal: profile.privateChip.paddingHorizontal,
      paddingVertical: profile.privateChip.paddingVertical,
    },
    statusChipText: {
      color: profile.privateChip.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.privateChip.textFontSize,
    },

    empty: { alignItems: "center" as const, gap: 14, paddingVertical: 40 },
    emptyText: {
      color: profile.statLabel.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.aboutRowValue.fontSize,
      textAlign: "center" as const,
    },

    primaryAction: {
      alignItems: "center" as const,
      backgroundColor: profile.bottomBar.primary.bg,
      borderRadius: profile.bottomBar.primary.radius,
      height: profile.bottomBar.primary.height,
      justifyContent: "center" as const,
      marginTop: 14,
      paddingHorizontal: 20,
    },
    primaryActionLabel: {
      color: profile.bottomBar.primary.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.bottomBar.primary.textFontSize,
    },
    primaryActionDisabled: { opacity: 0.6 },

    /* Form ------------------------------------------------------------- */
    field: { gap: 6, marginTop: 14 },
    fieldLabel: {
      color: profile.aboutRowLabel.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.aboutRowLabel.fontSize,
    },
    input: {
      ...card,
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: profile.aboutRowValue.fontSize,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    inputMultiline: { minHeight: 96, textAlignVertical: "top" as const },
    optionRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
    option: {
      ...card,
      paddingHorizontal: profile.tagChip.paddingHorizontal,
      paddingVertical: 8,
    },
    optionActive: {
      backgroundColor: profile.tagChip.bg,
      borderColor: profile.tagChip.bg,
    },
    optionText: {
      color: profile.aboutRowLabel.color,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: profile.tagChip.textFontSize,
    },
    optionTextActive: { color: profile.tagChip.text },
    error: {
      color: profile.bottomBar.leaveButton.icon,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.statusChipOnline.textFontSize,
      marginTop: 8,
    },
    pressed: { opacity: 0.82 },
  };
};

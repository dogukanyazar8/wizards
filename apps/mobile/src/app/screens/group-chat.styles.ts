import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import { useMemo } from "react";
import { useReducedMotion } from "react-native-reanimated";

import {
  scaleMobileMessagingMetric,
  useMobileMessagingScale,
} from "../../design/mobile-messaging-scale";
import type { MobileTheme } from "../../design/themes";
import { useTheme } from "../providers/mobile-theme-provider";

/**
 * Grup sohbetleri 2a–2f, Faz 4. Every measurement on this sheet comes from
 * `theme.groupChat` — the 43 sub-groups Faz 3 read off the handoff — and no
 * number is written here that is not already in that token group (§F.1).
 *
 * Its own sheet rather than more of `dm-screen.styles.ts`: that one is built
 * from `theme.messaging` and is what 1a/1b/1c draw with. The group surfaces
 * read `theme.groupChat` (Faz 3 karar C1), and mixing the two in one file is how
 * a 2a row ends up half in one token group and half in the other.
 *
 * `scale` maps the handoff's 390pt frame onto the real screen, exactly as the
 * messaging sheet does, and defaults to the baseline so a test without a window
 * still measures the design's own numbers.
 */
export const createGroupChatStyles = (theme: MobileTheme, scale = 1) => {
  const group = theme.groupChat;
  const s = (value: number) => scaleMobileMessagingMetric(value, scale);
  const type = theme.typography;
  /** §0.4's weights, in the four families this app ships. */
  const font = (weight: string) =>
    weight === "800"
      ? type.fontFamilyExtraBold
      : weight === "700"
        ? type.fontFamilyBold
        : weight === "600"
          ? type.fontFamilySemiBold
          : type.fontFamilyMedium;

  return {
    /* ----------------------------------------------------------------- 2a */
    /**
     * A horizontal `ScrollView` ships with RN's `flexGrow: 1`, so inside the
     * inbox column it grows to eat every spare pixel and centres its chips in
     * the hole it made. The strip is as tall as one chip and no taller.
     */
    filterChipScroll: { flexGrow: 0, flexShrink: 0 },
    /** HTML 57–62. Horizontally scrollable, so the row itself sets padding. */
    filterChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.filterChip.gap),
      paddingTop: s(group.filterChip.paddingTop),
      paddingBottom: s(group.filterChip.paddingBottom),
      paddingHorizontal: s(group.filterChip.paddingHorizontal),
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.filterChip.labelGap),
      height: s(group.filterChip.height),
      paddingHorizontal: s(group.filterChip.idlePaddingHorizontal),
      borderRadius: s(group.filterChip.radius),
      backgroundColor: group.filterChip.idleBg,
    },
    /** HTML 58: the active chip has no counter, so it sits one pixel wider. */
    filterChipActive: {
      paddingHorizontal: s(group.filterChip.activePaddingHorizontal),
      backgroundColor: group.filterChip.activeBg,
    },
    filterChipLabel: {
      color: group.filterChip.idleText,
      fontSize: s(group.filterChip.labelFontSize),
      fontFamily: font("600"),
    },
    filterChipLabelActive: {
      color: group.filterChip.activeText,
      fontFamily: font("700"),
    },
    filterChipCount: {
      color: group.filterChip.count,
      fontSize: s(group.filterChip.countFontSize),
      fontFamily: font(group.filterChip.countFontWeight),
    },
    /** HTML 64: the pin glyph and "SABİTLENEN". */
    pinnedSectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.pinnedSection.gap),
      paddingTop: s(group.pinnedSection.paddingTop),
      paddingBottom: s(group.pinnedSection.paddingBottom),
      paddingHorizontal: s(group.pinnedSection.paddingHorizontal),
    },
    pinnedSectionLabel: {
      color: group.pinnedSection.label,
      fontSize: s(group.pinnedSection.labelFontSize),
      fontFamily: font(group.pinnedSection.labelFontWeight),
      letterSpacing: group.pinnedSection.labelLetterSpacing,
    },
    /**
     * HTML 65. A pinned row takes the card surface against the list surface and
     * sits one pixel tighter; everything else about it is the ordinary row.
     */
    rowPinned: {
      backgroundColor: group.groupRow.pinnedBg,
      paddingVertical: s(group.groupRow.pinnedPaddingVertical),
    },
    /** HTML 79: the hairline starts where the text does, not at the edge. */
    rowHairline: {
      height: group.surfaces.hairlineHeight,
      marginLeft: s(group.groupRow.hairlineInset),
      backgroundColor: group.groupRow.hairline,
    },
    /** HTML 66–68: the 46px slot the two 30px tiles are placed inside. */
    avatarPair: {
      position: "relative",
      width: s(group.groupRow.pairSize),
      height: s(group.groupRow.pairSize),
      flexGrow: 0,
      flexShrink: 0,
    },
    avatarPairTopTile: {
      position: "absolute",
      top: 0,
      left: 0,
    },
    avatarPairBottomTile: {
      position: "absolute",
      right: 0,
      bottom: 0,
    },
    avatarPairTileText: {
      fontSize: s(group.groupRow.tileFontSize),
      fontFamily: font(group.groupRow.tileFontWeight),
    },
    /** HTML 104: the `+3` tile that replaces the second face. */
    avatarPairOverflow: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.groupRow.tileSize),
      height: s(group.groupRow.tileSize),
      borderRadius: s(group.groupRow.tileRadius),
      borderWidth: s(group.groupRow.tileRing),
      backgroundColor: group.groupRow.overflowBg,
    },
    avatarPairOverflowText: {
      color: group.groupRow.overflowText,
      fontSize: s(group.groupRow.overflowFontSize),
      fontFamily: font(group.groupRow.overflowFontWeight),
    },
    /** HTML 71: `· 6`, never squeezed out by a long group name. */
    memberCount: {
      color: group.groupRow.memberCount,
      fontSize: s(group.groupRow.memberCountFontSize),
      fontFamily: font(group.groupRow.memberCountFontWeight),
      flexGrow: 0,
      flexShrink: 0,
    },
    /** HTML 107: a silenced row keeps the name but drops it a weight. */
    nameMuted: {
      color: group.groupRow.nameMuted,
      fontFamily: font(group.groupRow.nameMutedFontWeight),
    },
    /** HTML 72: three green dots and "Ayşegül yazıyor…". */
    typingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.rowTyping.gap),
      minWidth: 0,
    },
    typingDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.rowTyping.dotGap),
    },
    typingDot: {
      width: s(group.rowTyping.dot),
      height: s(group.rowTyping.dot),
      borderRadius: s(group.rowTyping.dot) / 2,
      backgroundColor: group.rowTyping.dotColor,
    },
    typingDotSecond: { opacity: 0.6 },
    typingDotThird: { opacity: 0.3 },
    typingLabel: {
      flexShrink: 1,
      color: group.rowTyping.text,
      fontSize: s(group.rowTyping.fontSize),
      fontFamily: font(group.rowTyping.fontWeight),
    },
    /** HTML 76: `@2` and the unread count, in that order, 4px apart. */
    rowBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.rowBadges.gap),
    },
    rowBadge: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: s(group.rowBadges.minWidth),
      height: s(group.rowBadges.height),
      paddingHorizontal: s(group.rowBadges.paddingHorizontal),
      borderRadius: s(group.rowBadges.radius),
    },
    rowBadgeMention: { backgroundColor: group.rowBadges.mentionBg },
    rowBadgeUnread: { backgroundColor: group.rowBadges.unreadBg },
    /** HTML 110: silenced counters keep their place and lose their weight. */
    rowBadgeMuted: { backgroundColor: group.rowBadges.mutedBg },
    rowBadgeText: {
      fontSize: s(group.rowBadges.fontSize),
      fontFamily: font(group.rowBadges.fontWeight),
    },
    rowBadgeMentionText: { color: group.rowBadges.mentionText },
    rowBadgeUnreadText: { color: group.rowBadges.unreadText },
    rowBadgeMutedText: { color: group.rowBadges.mutedText },
    /** HTML 87/120: the tick, the media glyph and the preview they lead. */
    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.rowPreviewIcon.gap),
      minWidth: 0,
    },
    /** HTML 128. */
    botChip: {
      paddingHorizontal: s(group.rowPreviewIcon.botChipPaddingHorizontal),
      paddingVertical: s(group.rowPreviewIcon.botChipPaddingVertical),
      borderRadius: s(group.rowPreviewIcon.botChipRadius),
      backgroundColor: group.rowPreviewIcon.botChipBg,
    },
    botChipText: {
      color: group.rowPreviewIcon.botChipText,
      fontSize: s(group.rowPreviewIcon.botChipFontSize),
      fontFamily: font(group.rowPreviewIcon.botChipFontWeight),
      letterSpacing: group.rowPreviewIcon.botChipLetterSpacing,
    },
    /** A chip that filters everything away still owes the reader a sentence. */
    filterEmptyState: {
      paddingTop: s(group.sectionLabel.paddingTop),
      paddingHorizontal: s(group.surfaces.screenPaddingHorizontal),
      color: group.sectionLabel.text,
      fontSize: s(group.sectionLabel.fontSize),
      fontFamily: font("600"),
      textAlign: "center",
    },

    /* -------------------------------------------------------------- 2b/2c */
    screen: {
      flex: 1,
      minWidth: 0,
      backgroundColor: group.surfaces.screen,
    },
    /** HTML 152–158: the white header block both steps share. */
    stepHeader: {
      backgroundColor: group.stepHeader.bg,
      paddingTop: s(group.stepHeader.paddingTop),
      paddingBottom: s(group.stepHeader.paddingBottom),
      paddingHorizontal: s(group.stepHeader.paddingHorizontal),
    },
    stepHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.stepHeader.gap),
    },
    stepHeaderBack: {
      alignItems: "flex-start",
      justifyContent: "center",
      width: s(group.stepHeader.backWidth),
      height: s(group.stepHeader.backHeight),
    },
    stepHeaderText: {
      flex: 1,
      minWidth: 0,
      gap: s(group.stepHeader.titleGap),
    },
    stepHeaderTitle: {
      color: group.stepHeader.title,
      fontSize: s(group.stepHeader.titleFontSize),
      fontFamily: font(group.stepHeader.titleFontWeight),
      letterSpacing: group.stepHeader.titleLetterSpacing,
    },
    stepHeaderSubtitle: {
      color: group.stepHeader.subtitle,
      fontSize: s(group.stepHeader.subtitleFontSize),
      fontFamily: font(group.stepHeader.subtitleFontWeight),
    },
    stepHeaderCounter: {
      color: group.stepHeader.counter,
      fontSize: s(group.stepHeader.counterFontSize),
      fontFamily: font(group.stepHeader.counterFontWeight),
    },
    /** HTML 156: only the `/32` half greys out. */
    stepHeaderCounterTotal: { color: group.stepHeader.counterTotal },
    /** D2: the ceiling flashes danger rather than silently refusing a tap. */
    stepHeaderCounterOver: { color: group.formField.overCounter },
    /** HTML 158: two equal bars, filled left to right. */
    stepBarRow: {
      flexDirection: "row",
      gap: s(group.stepBar.gap),
      marginTop: s(group.stepBar.marginTop),
    },
    stepBar: {
      flex: 1,
      height: s(group.stepBar.height),
      borderRadius: s(group.stepBar.radius),
      backgroundColor: group.stepBar.empty,
    },
    stepBarFilled: { backgroundColor: group.stepBar.filled },
    /** HTML 160–163. */
    searchPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.pickerSearch.gap),
      height: s(group.pickerSearch.height),
      marginTop: s(group.pickerSearch.marginTop),
      marginHorizontal: s(group.pickerSearch.marginHorizontal),
      paddingHorizontal: s(group.pickerSearch.paddingHorizontal),
      borderRadius: s(group.pickerSearch.radius),
      backgroundColor: group.pickerSearch.bg,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      color: group.pickerSearch.value,
      fontSize: s(group.pickerSearch.placeholderFontSize),
      fontFamily: font(group.pickerSearch.placeholderFontWeight),
    },
    /**
     * HTML 164–167: the picked members. It wraps rather than scrolls sideways —
     * a 32-person ceiling off the right edge of the screen is a list the reader
     * cannot see, and the strip is the only place a pick can be undone.
     */
    selectedChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: s(group.selectedChip.rowGap),
      paddingTop: s(group.filterChip.paddingTop),
      paddingBottom: s(group.filterChip.paddingBottom),
      paddingHorizontal: s(group.surfaces.screenPaddingHorizontal),
    },
    selectedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.selectedChip.gap),
      // A long name shortens its own chip instead of pushing the line past the
      // right edge; `maxWidth` keeps a single very long name on one line.
      flexShrink: 1,
      maxWidth: "100%",
      height: s(group.selectedChip.height),
      paddingHorizontal: s(group.selectedChip.paddingHorizontal),
      borderRadius: s(group.selectedChip.radius),
      backgroundColor: group.selectedChip.bg,
    },
    selectedChipAvatarText: {
      fontSize: s(group.selectedChip.avatarFontSize),
      fontFamily: font(group.selectedChip.avatarFontWeight),
    },
    selectedChipLabel: {
      flexShrink: 1,
      color: group.selectedChip.label,
      fontSize: s(group.selectedChip.labelFontSize),
      fontFamily: font(group.selectedChip.labelFontWeight),
    },
    /** HTML 170/186: "SIK MESAJLAŞTIKLARIN" and "TÜM ARKADAŞLAR · 12". */
    listSectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.sectionLabel.gap),
      paddingTop: s(group.pinnedSection.paddingTop),
      paddingBottom: s(group.pinnedSection.paddingBottom),
      paddingHorizontal: s(group.surfaces.screenPaddingHorizontal),
    },
    listSectionLabel: {
      color: group.sectionLabel.text,
      fontSize: s(group.sectionLabel.fontSize),
      fontFamily: font(group.sectionLabel.fontWeight),
      letterSpacing: group.sectionLabel.letterSpacing,
    },
    listSectionCount: {
      color: group.sectionLabel.count,
      fontSize: s(group.sectionLabel.countFontSize),
      fontFamily: font(group.sectionLabel.countFontWeight),
    },
    listSectionAction: {
      color: group.sectionLabel.action,
      fontSize: s(group.sectionLabel.actionFontSize),
      fontFamily: font(group.sectionLabel.actionFontWeight),
    },
    /** HTML 171–195: a friend row in the picker. */
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.pickerRow.gap),
      paddingVertical: s(group.pickerRow.paddingVertical),
      paddingHorizontal: s(group.pickerRow.paddingHorizontal),
    },
    /** HTML 197: closed to invites — visible, legible, and not tappable. */
    pickerRowBlocked: { opacity: group.pickerBlocked.opacity },
    /** D2: at the ceiling the rows that are not already picked go quiet. */
    pickerRowCapped: { opacity: 0.4 },
    pickerRowAvatarWrap: {
      position: "relative",
      flexGrow: 0,
      flexShrink: 0,
    },
    pickerRowAvatarText: {
      fontSize: s(group.pickerRow.avatarFontSize),
      fontFamily: font(group.pickerRow.avatarFontWeight),
    },
    pickerRowDot: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: s(group.pickerRow.dot),
      height: s(group.pickerRow.dot),
      borderRadius: s(group.pickerRow.dot) / 2,
      borderWidth: s(group.pickerRow.dotRing),
      borderColor: group.pickerRow.dotRingColor,
      backgroundColor: group.pickerRow.dotColor,
    },
    pickerRowText: {
      flex: 1,
      minWidth: 0,
      gap: s(group.pickerRow.subtitleGap),
    },
    pickerRowName: {
      color: group.pickerRow.name,
      fontSize: s(group.pickerRow.nameFontSize),
      fontFamily: font(group.pickerRow.nameFontWeight),
      letterSpacing: group.pickerRow.nameLetterSpacing,
    },
    pickerRowUsername: {
      color: group.pickerRow.username,
      fontSize: s(group.pickerRow.usernameFontSize),
      fontFamily: font(group.pickerRow.usernameFontWeight),
    },
    pickerCheckbox: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.pickerRow.checkboxSize),
      height: s(group.pickerRow.checkboxSize),
      borderRadius: s(group.pickerRow.checkboxRadius),
      borderWidth: s(group.pickerRow.checkboxBorderWidth),
      borderColor: group.pickerRow.checkboxBorder,
      flexGrow: 0,
      flexShrink: 0,
    },
    pickerCheckboxSelected: {
      borderColor: group.pickerRow.checkboxSelectedBg,
      backgroundColor: group.pickerRow.checkboxSelectedBg,
    },
    /** HTML 203–205: the footer both steps end with. */
    bottomBar: {
      backgroundColor: group.bottomBar.bg,
      borderTopWidth: group.surfaces.hairlineHeight,
      borderTopColor: group.bottomBar.border,
      paddingTop: s(group.bottomBar.paddingTop),
      paddingBottom: s(group.bottomBar.paddingBottom),
      paddingHorizontal: s(group.bottomBar.paddingHorizontal),
    },
    bottomBarButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: s(group.bottomBar.buttonGap),
      height: s(group.bottomBar.height),
      borderRadius: s(group.bottomBar.radius),
      backgroundColor: group.bottomBar.buttonBg,
    },
    bottomBarButtonDisabled: { backgroundColor: group.bottomBar.disabledBg },
    bottomBarLabel: {
      color: group.bottomBar.label,
      fontSize: s(group.bottomBar.labelFontSize),
      fontFamily: font(group.bottomBar.labelFontWeight),
    },
    bottomBarBadge: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: s(group.bottomBar.badgeMinWidth),
      height: s(group.bottomBar.badgeHeight),
      paddingHorizontal: s(group.bottomBar.badgePaddingHorizontal),
      borderRadius: s(group.bottomBar.badgeRadius),
      backgroundColor: group.bottomBar.badgeBg,
    },
    bottomBarBadgeText: {
      color: group.bottomBar.badgeText,
      fontSize: s(group.bottomBar.badgeFontSize),
      fontFamily: font(group.bottomBar.badgeFontWeight),
    },

    /* ------------------------------------------------------------------ 2c */
    identityBody: { paddingHorizontal: s(group.surfaces.screenPaddingHorizontal) },
    /** HTML 226–240: the 72px avatar and the colour strip beside it. */
    identityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.identityAvatar.gap),
      paddingTop: s(16),
      paddingBottom: s(12),
    },
    identityAvatarWrap: { position: "relative", flexGrow: 0, flexShrink: 0 },
    identityAvatar: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.identityAvatar.size),
      height: s(group.identityAvatar.size),
      borderRadius: s(group.identityAvatar.radius),
    },
    identityAvatarInitials: {
      color: group.identityAvatar.initials,
      fontSize: s(group.identityAvatar.initialsFontSize),
      fontFamily: font(group.identityAvatar.initialsFontWeight),
    },
    /**
     * The avatar while its photo is on the wire. A scrim rather than a swap: the
     * tile the reader just acted on stays where it is and only goes quiet, which
     * is what tells them the tap landed.
     */
    identityAvatarBusy: {
      position: "absolute",
      top: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center",
      width: s(group.identityAvatar.size),
      height: s(group.identityAvatar.size),
      borderRadius: s(group.identityAvatar.radius),
      backgroundColor: theme.surface.imageScrim,
    },
    identityCameraButton: {
      position: "absolute",
      right: s(group.identityAvatar.cameraOffset),
      bottom: s(group.identityAvatar.cameraOffset),
      alignItems: "center",
      justifyContent: "center",
      width: s(group.identityAvatar.cameraSize),
      height: s(group.identityAvatar.cameraSize),
      borderRadius: s(group.identityAvatar.cameraRadius),
      borderWidth: group.surfaces.hairlineHeight,
      borderColor: group.identityAvatar.cameraBorder,
      backgroundColor: group.identityAvatar.cameraBg,
      ...theme.elevation.groupChatCameraButton,
    },
    identityColorColumn: { flex: 1, minWidth: 0, gap: s(8) },
    /**
     * The gap is the design's 8 minus the halo the buttons already carry on both
     * sides, so the swatches keep HTML 233's `28 + 8` pitch: picking a colour
     * paints a ring that was always reserved instead of resizing the row.
     */
    colorSwatchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(Math.max(0, group.colorSwatch.gap - 2 * group.colorSwatch.selectedOuterRing)),
    },
    /**
     * HTML 234's `0 0 0 2px zemin, 0 0 0 4px renk` is a shadow: it rings the
     * swatch without taking a pixel of layout. RN has no such ring, so every
     * swatch — picked or not — sits in a box that is already `2 + 2` wider on
     * each side, and picking one only colours the border that box always had.
     * Growing the picked one instead would push the row out of line, which is
     * exactly what it used to do.
     */
    colorSwatchButton: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.colorSwatch.size + 2 * group.colorSwatch.selectedOuterRing),
      height: s(group.colorSwatch.size + 2 * group.colorSwatch.selectedOuterRing),
      borderRadius: s(group.colorSwatch.radius + group.colorSwatch.selectedOuterRing),
      borderWidth: s(group.colorSwatch.selectedOuterRing - group.colorSwatch.selectedInnerRing),
      borderColor: "transparent",
      flexGrow: 0,
      flexShrink: 0,
    },
    /** The inner ring: the screen tone between the swatch and the colour ring. */
    colorSwatchButtonSelected: { backgroundColor: group.colorSwatch.selectedInnerRingColor },
    colorSwatch: {
      width: s(group.colorSwatch.size),
      height: s(group.colorSwatch.size),
      borderRadius: s(group.colorSwatch.radius),
    },
    /** HTML 242/248/250: a label with its counter or link on the right. */
    fieldLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: s(group.sectionLabel.paddingTop),
      paddingBottom: s(group.sectionLabel.paddingBottom),
      paddingHorizontal: s(group.sectionLabel.paddingHorizontal),
    },
    fieldLabel: {
      color: group.formField.label,
      fontSize: s(group.formField.labelFontSize),
      fontFamily: font(group.formField.labelFontWeight),
      letterSpacing: group.formField.labelLetterSpacing,
    },
    fieldLabelOptional: { color: group.sectionLabel.count },
    fieldCounter: {
      color: group.formField.counter,
      fontSize: s(group.formField.counterFontSize),
      fontFamily: font(group.formField.counterFontWeight),
    },
    fieldCounterOver: { color: group.formField.overCounter },
    /** HTML 243–246: the name field, and the ring it grows when focused. */
    nameField: {
      flexDirection: "row",
      alignItems: "center",
      height: s(group.formField.height),
      paddingHorizontal: s(group.formField.paddingHorizontal),
      borderRadius: s(group.formField.radius),
      borderWidth: group.formField.borderWidth,
      borderColor: group.formField.border,
      backgroundColor: group.formField.bg,
    },
    nameFieldFocused: {
      borderColor: group.formField.focusBorder,
      ...theme.elevation.groupChatPrimaryAction,
      shadowColor: group.formField.focusRing,
      shadowOpacity: 1,
      shadowRadius: s(group.formField.focusRingWidth),
      shadowOffset: { width: 0, height: 0 },
    },
    nameInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      color: group.formField.value,
      fontSize: s(group.formField.valueFontSize),
      fontFamily: font(group.formField.valueFontWeight),
      letterSpacing: group.formField.valueLetterSpacing,
    },
    /** HTML 247: the live "Boş bırakırsan…" line. */
    hintRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: s(group.formHint.gap),
      paddingTop: s(group.formHint.paddingTop),
      paddingHorizontal: s(group.sectionLabel.paddingHorizontal),
    },
    hintText: {
      flex: 1,
      color: group.formHint.text,
      fontSize: s(group.formHint.fontSize),
      lineHeight: s(group.formHint.lineHeight),
      fontFamily: font("500"),
    },
    hintStrong: {
      color: group.formHint.strong,
      fontFamily: font(group.formHint.strongFontWeight),
    },
    /** HTML 249: the description box. */
    descriptionField: {
      height: s(group.formTextArea.height),
      paddingVertical: s(group.formTextArea.paddingVertical),
      paddingHorizontal: s(group.formTextArea.paddingHorizontal),
      borderRadius: s(group.formTextArea.radius),
      backgroundColor: group.formTextArea.bg,
    },
    descriptionInput: {
      flex: 1,
      paddingVertical: 0,
      textAlignVertical: "top",
      color: group.formTextArea.value,
      fontSize: s(group.formTextArea.placeholderFontSize),
      fontFamily: font(group.formTextArea.placeholderFontWeight),
    },
    /** HTML 251–257: the member strip and its dashed "Ekle" tile. */
    memberStripRow: { flexDirection: "row", gap: s(group.memberStrip.gap) },
    memberStripCell: {
      alignItems: "center",
      gap: s(group.memberStrip.labelGap),
      width: s(group.memberStrip.columnWidth),
    },
    memberStripTileText: {
      fontSize: s(group.memberStrip.tileFontSize),
      fontFamily: font(group.memberStrip.tileFontWeight),
    },
    memberStripAddTile: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.memberStrip.tileSize),
      height: s(group.memberStrip.tileSize),
      borderRadius: s(group.memberStrip.tileRadius),
      borderWidth: s(group.memberStrip.addBorderWidth),
      borderStyle: "dashed",
      borderColor: group.memberStrip.addBorder,
    },
    memberStripLabel: {
      maxWidth: s(group.memberStrip.columnWidth),
      color: group.memberStrip.otherLabel,
      fontSize: s(group.memberStrip.labelFontSize),
      fontFamily: font(group.memberStrip.otherLabelFontWeight),
    },
    /** HTML 252: your own tile is the one that says so. */
    memberStripLabelSelf: {
      color: group.memberStrip.selfLabel,
      fontFamily: font(group.memberStrip.selfLabelFontWeight),
    },
    memberStripLabelAdd: { color: group.memberStrip.addLabel },
    /** HTML 259–263: the white KATILIM card. */
    settingsCard: {
      borderRadius: s(group.settingsCard.radius),
      backgroundColor: group.settingsCard.bg,
      overflow: "hidden",
    },
    settingsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.settingsCard.gap),
      paddingVertical: s(group.settingsCard.paddingVertical),
      paddingHorizontal: s(group.settingsCard.paddingHorizontal),
    },
    settingsRowDivider: {
      borderBottomWidth: group.surfaces.hairlineHeight,
      borderBottomColor: group.settingsCard.divider,
    },
    settingsRowText: { flex: 1, minWidth: 0 },
    settingsRowTitle: {
      color: group.settingsCard.title,
      fontSize: s(group.settingsCard.titleFontSize),
      fontFamily: font(group.settingsCard.titleFontWeight),
    },
    settingsRowSubtitle: {
      color: group.settingsCard.sub,
      fontSize: s(group.settingsCard.subFontSize),
      fontFamily: font(group.settingsCard.subFontWeight),
    },
    settingsRowValue: {
      color: group.settingsCard.value,
      fontSize: s(group.settingsCard.valueFontSize),
      fontFamily: font(group.settingsCard.valueFontWeight),
    },
    /**
     * §F.6. A press shrinks the target; with reduced motion on it dims instead,
     * because the point is feedback, not the movement.
     */
    pressedScale: { transform: [{ scale: 0.97 }] },
    pressedFlat: { opacity: 0.7 },
    /** 2c §2: with a photo picked, the swatches give way to one link. */
    removePhotoAction: {
      color: group.sectionLabel.action,
      fontSize: s(group.sectionLabel.actionFontSize),
      fontFamily: font(group.sectionLabel.actionFontWeight),
    },

    /* ------------------------------------------------------------------ 2d */
    /** HTML 280–293. Exactly two icon buttons; §11.3/24 caps it there. */
    chatHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.chatHeader.gap),
      backgroundColor: group.chatHeader.bg,
      paddingTop: s(group.chatHeader.paddingTop),
      paddingBottom: s(group.chatHeader.paddingBottom),
      paddingHorizontal: s(group.chatHeader.paddingHorizontal),
    },
    chatHeaderBack: {
      alignItems: "flex-start",
      justifyContent: "center",
      width: s(group.chatHeader.backWidth),
      height: s(group.chatHeader.backHeight),
      flexGrow: 0,
      flexShrink: 0,
    },
    /** HTML 282–285: the 38px slot the two 25px tiles are crossed inside. */
    chatHeaderPair: {
      position: "relative",
      width: s(group.chatHeader.pairSize),
      height: s(group.chatHeader.pairSize),
      flexGrow: 0,
      flexShrink: 0,
    },
    chatHeaderPairTopTile: { position: "absolute", top: 0, left: 0 },
    chatHeaderPairBottomTile: { position: "absolute", right: 0, bottom: 0 },
    chatHeaderTileText: {
      fontSize: s(group.chatHeader.tileFontSize),
      fontFamily: font(group.chatHeader.tileFontWeight),
    },
    chatHeaderOverflowTile: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.chatHeader.tileSize),
      height: s(group.chatHeader.tileSize),
      borderRadius: s(group.chatHeader.tileRadius),
      borderWidth: s(group.chatHeader.tileRing),
      borderColor: group.chatHeader.tileRingColor,
      backgroundColor: group.groupRow.overflowBg,
    },
    chatHeaderOverflowText: {
      color: group.groupRow.overflowText,
      fontSize: s(group.chatHeader.tileFontSize),
      fontFamily: font(group.chatHeader.tileFontWeight),
    },
    /** §11.3/24: the name takes the slack, the buttons never squeeze it. */
    chatHeaderText: { flex: 1, minWidth: 0, gap: 1 },
    chatHeaderName: {
      color: group.chatHeader.name,
      fontSize: s(group.chatHeader.nameFontSize),
      fontFamily: font(group.chatHeader.nameFontWeight),
      letterSpacing: group.chatHeader.nameLetterSpacing,
    },
    chatHeaderMetaRow: { flexDirection: "row", alignItems: "center", gap: s(5) },
    chatHeaderMeta: {
      color: group.chatHeader.meta,
      fontSize: s(group.chatHeader.metaFontSize),
      fontFamily: font(group.chatHeader.metaFontWeight),
    },
    chatHeaderMetaSeparator: { color: group.chatHeader.metaSeparator },
    chatHeaderOnlineDot: {
      width: s(group.chatHeader.onlineDot),
      height: s(group.chatHeader.onlineDot),
      borderRadius: s(group.chatHeader.onlineDot) / 2,
      backgroundColor: group.chatHeader.onlineDotColor,
    },
    chatHeaderOnline: {
      color: group.chatHeader.onlineText,
      fontSize: s(group.chatHeader.metaFontSize),
      fontFamily: font(group.chatHeader.onlineFontWeight),
    },
    chatHeaderActions: {
      flexDirection: "row",
      gap: s(group.chatHeader.actionGap),
      flexGrow: 0,
      flexShrink: 0,
    },
    chatHeaderAction: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.chatHeader.actionSize),
      height: s(group.chatHeader.actionSize),
      borderRadius: s(group.chatHeader.actionRadius),
      backgroundColor: group.chatHeader.actionBg,
    },
    /** §B5: sits above the pinned strip; both together must not push the flow. */
    callBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.pinnedStrip.gap),
      backgroundColor: group.pinnedStrip.bg,
      borderTopWidth: group.surfaces.hairlineHeight,
      borderTopColor: group.pinnedStrip.border,
      paddingVertical: s(group.pinnedStrip.paddingVertical),
      paddingHorizontal: s(group.pinnedStrip.paddingHorizontal),
    },
    callBannerLabel: {
      flex: 1,
      minWidth: 0,
      color: group.pinnedStrip.preview,
      fontSize: s(group.pinnedStrip.previewFontSize),
      fontFamily: font(group.pinnedStrip.previewFontWeight),
    },
    callBannerJoin: {
      alignItems: "center",
      justifyContent: "center",
      height: s(group.filterChip.height),
      paddingHorizontal: s(group.filterChip.activePaddingHorizontal),
      borderRadius: s(group.filterChip.radius),
      backgroundColor: group.memberRow.adminChipBg,
    },
    callBannerJoinLabel: {
      color: group.memberRow.adminChipText,
      fontSize: s(group.filterChip.labelFontSize),
      fontFamily: font("800"),
    },
    /** HTML 295–299. */
    pinnedStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.pinnedStrip.gap),
      backgroundColor: group.pinnedStrip.bg,
      borderTopWidth: group.surfaces.hairlineHeight,
      borderTopColor: group.pinnedStrip.border,
      borderBottomWidth: group.surfaces.hairlineHeight,
      borderBottomColor: group.pinnedStrip.bottomRule,
      paddingVertical: s(group.pinnedStrip.paddingVertical),
      paddingHorizontal: s(group.pinnedStrip.paddingHorizontal),
    },
    pinnedStripText: { flex: 1, minWidth: 0, gap: s(group.pinnedStrip.textGap) },
    pinnedStripLabel: {
      color: group.pinnedStrip.label,
      fontSize: s(group.pinnedStrip.labelFontSize),
      fontFamily: font(group.pinnedStrip.labelFontWeight),
      letterSpacing: group.pinnedStrip.labelLetterSpacing,
    },
    pinnedStripPreview: {
      color: group.pinnedStrip.preview,
      fontSize: s(group.pinnedStrip.previewFontSize),
      fontFamily: font(group.pinnedStrip.previewFontWeight),
    },
    /** HTML 302: the centred lifecycle capsule. */
    systemCapsuleRow: {
      alignItems: "center",
      paddingBottom: s(group.systemCapsule.marginBottom),
    },
    systemCapsule: {
      maxWidth: s(group.systemCapsule.maxWidth),
      paddingVertical: s(group.systemCapsule.paddingVertical),
      paddingHorizontal: s(group.systemCapsule.paddingHorizontal),
      borderRadius: s(group.systemCapsule.radius),
      backgroundColor: group.systemCapsule.bg,
    },
    systemCapsuleText: {
      textAlign: "center",
      color: group.systemCapsule.text,
      fontSize: s(group.systemCapsule.fontSize),
      fontFamily: font(group.systemCapsule.fontWeight),
    },
    systemCapsuleStrong: {
      color: group.systemCapsule.strong,
      fontFamily: font(group.systemCapsule.strongFontWeight),
    },
    /** HTML 306/316: the sender's name, only above the group's first bubble. */
    senderName: {
      paddingLeft: s(group.incomingBubble.senderPaddingLeft),
      fontSize: s(group.incomingBubble.senderFontSize),
      fontFamily: font(group.incomingBubble.senderFontWeight),
    },
    /** HTML 341–344: the receipt under the last outgoing bubble. */
    readStackRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-end",
      gap: s(group.readStack.gap),
      paddingRight: s(2),
      paddingTop: s(4),
    },
    readStack: { flexDirection: "row", alignItems: "center" },
    readStackAvatar: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.readStack.avatarSize),
      height: s(group.readStack.avatarSize),
      borderRadius: s(group.readStack.avatarSize) / 2,
      borderWidth: s(group.readStack.ring),
      borderColor: group.readStack.ringColor,
      overflow: "hidden",
    },
    readStackAvatarOverlap: { marginLeft: s(group.readStack.overlap) },
    readStackInitials: {
      fontSize: s(group.readStack.initialsFontSize),
      fontFamily: font(group.readStack.initialsFontWeight),
    },
    readStackLabel: {
      color: group.readStack.label,
      fontSize: s(group.readStack.labelFontSize),
      fontFamily: font(group.readStack.labelFontWeight),
    },
    /** HTML 346–351: the avatar stack and the capsule beside it. */
    chatTypingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.typingRow.gap),
      paddingVertical: s(2),
    },
    chatTypingStack: { flexDirection: "row", alignItems: "center" },
    chatTypingAvatar: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.typingRow.avatarSize),
      height: s(group.typingRow.avatarSize),
      borderRadius: s(group.typingRow.avatarRadius),
      borderWidth: s(group.typingRow.avatarRing),
      borderColor: group.typingRow.avatarRingColor,
      overflow: "hidden",
    },
    chatTypingAvatarOverlap: { marginLeft: s(group.typingRow.avatarOverlap) },
    chatTypingInitials: {
      fontSize: s(group.typingRow.avatarFontSize),
      fontFamily: font(group.typingRow.avatarFontWeight),
    },
    chatTypingCapsule: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.typingRow.capsuleGap),
      height: s(group.typingRow.capsuleHeight),
      paddingHorizontal: s(group.typingRow.capsulePaddingHorizontal),
      borderRadius: s(group.typingRow.capsuleRadius),
      backgroundColor: group.typingRow.capsuleBg,
      ...theme.elevation.messageBubbleIn,
    },
    chatTypingDots: { flexDirection: "row", alignItems: "center", gap: s(group.typingRow.dotGap) },
    chatTypingDot: {
      width: s(group.typingRow.dot),
      height: s(group.typingRow.dot),
      borderRadius: s(group.typingRow.dot) / 2,
      backgroundColor: group.typingRow.dotColor,
    },
    chatTypingLabel: {
      color: group.typingRow.text,
      fontSize: s(group.typingRow.fontSize),
      fontFamily: font(group.typingRow.fontWeight),
    },
    /**
     * §B4's gate. The server refuses the write either way (Faz 1); this is what
     * keeps a member from typing a message that was never going to land.
     */
    sendBlockedNotice: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: s(group.composer.gap),
      backgroundColor: group.composer.bg,
      borderTopWidth: group.surfaces.hairlineHeight,
      borderTopColor: group.composer.border,
      paddingVertical: s(group.composer.paddingTop),
      paddingHorizontal: s(group.composer.paddingHorizontal),
    },
    sendBlockedText: {
      color: group.composer.placeholder,
      fontSize: s(group.composer.placeholderFontSize),
      fontFamily: font(group.composer.placeholderFontWeight),
      textAlign: "center",
    },

    /* ------------------------------------------------------------------ 2e */
    /** HTML 374–378: back + title + the pencil only an editor sees. */
    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.stepHeader.gap),
      backgroundColor: group.stepHeader.bg,
      paddingTop: s(4),
      paddingBottom: s(12),
      paddingHorizontal: s(group.stepHeader.paddingHorizontal),
    },
    /**
     * A **row** header's title, and only that: `flex: 1` is what makes it take
     * the slack beside the back arrow. Stacked over a subtitle it would mean
     * `flexBasis: 0` on the column's main axis — a title with no height of its
     * own, drawn half-clipped. That header uses `stepHeaderTitle`.
     */
    detailHeaderTitle: {
      flex: 1,
      minWidth: 0,
      color: group.stepHeader.title,
      fontSize: s(group.stepHeader.titleFontSize),
      fontFamily: font(group.stepHeader.titleFontWeight),
      letterSpacing: group.stepHeader.titleLetterSpacing,
    },
    detailHeaderAction: {
      alignItems: "center",
      justifyContent: "center",
      width: s(36),
      height: s(36),
      borderRadius: s(group.chatHeader.actionRadius),
      backgroundColor: group.chatHeader.actionBg,
      flexGrow: 0,
      flexShrink: 0,
    },
    detailBody: { paddingHorizontal: s(group.surfaces.screenPaddingHorizontal) },
    /** HTML 380–385. */
    infoIdentity: {
      alignItems: "center",
      gap: s(group.infoIdentity.gap),
      paddingTop: s(group.infoIdentity.paddingTop),
      paddingBottom: s(group.infoIdentity.paddingBottom),
    },
    infoAvatar: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.infoIdentity.avatarSize),
      height: s(group.infoIdentity.avatarSize),
      borderRadius: s(group.infoIdentity.avatarRadius),
      overflow: "hidden",
    },
    infoAvatarInitials: {
      color: group.infoIdentity.initials,
      fontSize: s(group.infoIdentity.initialsFontSize),
      fontFamily: font(group.infoIdentity.initialsFontWeight),
    },
    infoIdentityText: { alignItems: "center", gap: s(group.infoIdentity.nameGap) },
    infoName: {
      textAlign: "center",
      color: group.infoIdentity.name,
      fontSize: s(group.infoIdentity.nameFontSize),
      fontFamily: font(group.infoIdentity.nameFontWeight),
      letterSpacing: group.infoIdentity.nameLetterSpacing,
    },
    infoMeta: {
      textAlign: "center",
      color: group.infoIdentity.meta,
      fontSize: s(group.infoIdentity.metaFontSize),
      fontFamily: font(group.infoIdentity.metaFontWeight),
    },
    /** HTML 387–392: equal-width boxes, so a hidden one widens the rest. */
    quickActionRow: { flexDirection: "row", gap: s(group.quickAction.gap) },
    quickAction: {
      flex: 1,
      alignItems: "center",
      gap: s(group.quickAction.iconGap),
      paddingVertical: s(group.quickAction.paddingVertical),
      borderRadius: s(group.quickAction.radius),
      backgroundColor: group.quickAction.bg,
    },
    quickActionLabel: {
      color: group.quickAction.label,
      fontSize: s(group.quickAction.labelFontSize),
      fontFamily: font(group.quickAction.labelFontWeight),
    },
    /** HTML 393–397: the pinned card, drawn only when there is a pin. */
    pinnedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.settingsCard.gap),
      marginTop: s(10),
      paddingVertical: s(11),
      paddingHorizontal: s(13),
      borderRadius: s(group.settingsCard.radius),
      backgroundColor: group.settingsCard.bg,
    },
    /** HTML 399–404: four equal boxes. */
    mediaRow: { flexDirection: "row", gap: s(group.mediaTile.gap) },
    mediaTile: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: s(group.mediaTile.fileLabelGap),
      height: s(group.mediaTile.height),
      borderRadius: s(group.mediaTile.radius),
      backgroundColor: group.mediaTile.mediaBg,
      overflow: "hidden",
    },
    mediaTileFile: { backgroundColor: group.mediaTile.fileBg },
    mediaTileOverflow: { backgroundColor: group.mediaTile.overflowBg },
    mediaTileImage: { width: "100%", height: "100%" },
    mediaTileFileLabel: {
      color: group.mediaTile.fileLabel,
      fontSize: s(group.mediaTile.fileLabelFontSize),
      fontFamily: font(group.mediaTile.fileLabelFontWeight),
    },
    mediaTileOverflowLabel: {
      color: group.mediaTile.overflowText,
      fontSize: s(group.mediaTile.overflowFontSize),
      fontFamily: font(group.mediaTile.overflowFontWeight),
    },
    /** HTML 406–411: the member card and its rows. */
    memberCard: {
      borderRadius: s(group.settingsCard.radius),
      backgroundColor: group.settingsCard.bg,
      overflow: "hidden",
    },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.memberRow.gap),
      paddingVertical: s(group.memberRow.paddingVertical),
      paddingHorizontal: s(group.memberRow.paddingHorizontal),
    },
    memberRowDivider: {
      borderBottomWidth: group.surfaces.hairlineHeight,
      borderBottomColor: group.memberRow.divider,
    },
    memberAddIcon: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.memberRow.avatarSize),
      height: s(group.memberRow.avatarSize),
      borderRadius: s(group.memberRow.avatarRadius),
      backgroundColor: group.memberRow.addIconBg,
      flexGrow: 0,
      flexShrink: 0,
    },
    memberAddLabel: {
      flex: 1,
      color: group.memberRow.addLabel,
      fontSize: s(group.memberRow.addLabelFontSize),
      fontFamily: font(group.memberRow.addLabelFontWeight),
    },
    memberAvatarWrap: { position: "relative", flexGrow: 0, flexShrink: 0 },
    memberAvatarText: {
      fontSize: s(group.memberRow.avatarFontSize),
      fontFamily: font(group.memberRow.avatarFontWeight),
    },
    memberDot: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: s(group.memberRow.dot),
      height: s(group.memberRow.dot),
      borderRadius: s(group.memberRow.dot) / 2,
      borderWidth: s(group.memberRow.dotRing),
      borderColor: group.memberRow.dotRingColor,
      backgroundColor: group.memberRow.dotColor,
    },
    memberText: { flex: 1, minWidth: 0, gap: 1 },
    memberNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.memberRow.nameGap),
      minWidth: 0,
    },
    memberName: {
      flexShrink: 1,
      color: group.memberRow.name,
      fontSize: s(group.memberRow.nameFontSize),
      fontFamily: font(group.memberRow.nameFontWeight),
    },
    memberSub: {
      color: group.memberRow.sub,
      fontSize: s(group.memberRow.subFontSize),
      fontFamily: font(group.memberRow.subFontWeight),
    },
    /** HTML 408: gold for the owner, indigo for the other admins. */
    roleChip: {
      paddingVertical: s(group.memberRow.roleChipPaddingVertical),
      paddingHorizontal: s(group.memberRow.roleChipPaddingHorizontal),
      borderRadius: s(group.memberRow.roleChipRadius),
      flexGrow: 0,
      flexShrink: 0,
    },
    roleChipOwner: { backgroundColor: group.memberRow.ownerChipBg },
    roleChipAdmin: { backgroundColor: group.memberRow.adminChipBg },
    roleChipText: {
      fontSize: s(group.memberRow.roleChipFontSize),
      fontFamily: font(group.memberRow.roleChipFontWeight),
    },
    roleChipOwnerText: { color: group.memberRow.ownerChipText },
    roleChipAdminText: { color: group.memberRow.adminChipText },
    selfChip: {
      paddingVertical: s(group.memberRow.selfChipPaddingVertical),
      paddingHorizontal: s(group.memberRow.selfChipPaddingHorizontal),
      borderRadius: s(group.memberRow.selfChipRadius),
      backgroundColor: group.memberRow.selfChipBg,
      flexGrow: 0,
      flexShrink: 0,
    },
    selfChipText: {
      color: group.memberRow.selfChipText,
      fontSize: s(group.memberRow.roleChipFontSize),
      fontFamily: font(group.memberRow.roleChipFontWeight),
    },

    /* ------------------------------------------------------------------ 2f */
    /** The only stacked group header: a title over the group's own name. */
    settingsHeaderText: { flex: 1, minWidth: 0, gap: s(group.stepHeader.titleGap) },
    /** HTML 437: the "YÖNETİCİ" chip beside the permissions heading. */
    adminChip: {
      paddingVertical: s(group.adminChip.paddingVertical),
      paddingHorizontal: s(group.adminChip.paddingHorizontal),
      borderRadius: s(group.adminChip.radius),
      backgroundColor: group.adminChip.bg,
    },
    adminChipText: {
      color: group.adminChip.text,
      fontSize: s(group.adminChip.fontSize),
      fontFamily: font(group.adminChip.fontWeight),
    },
    /** HTML 433–435: the three notification tiers. */
    radioRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.radioRow.gap),
      paddingVertical: s(group.radioRow.paddingVertical),
      paddingHorizontal: s(group.radioRow.paddingHorizontal),
    },
    radioMark: {
      alignItems: "center",
      justifyContent: "center",
      width: s(group.radioRow.size),
      height: s(group.radioRow.size),
      borderRadius: s(group.radioRow.size) / 2,
      borderWidth: s(group.radioRow.borderWidth),
      borderColor: group.radioRow.border,
      flexGrow: 0,
      flexShrink: 0,
    },
    radioMarkSelected: {
      borderWidth: 0,
      backgroundColor: group.radioRow.selectedBg,
    },
    radioDot: {
      width: s(group.radioRow.dot),
      height: s(group.radioRow.dot),
      borderRadius: s(group.radioRow.dot) / 2,
      backgroundColor: group.radioRow.dotColor,
    },
    radioTitle: {
      color: group.radioRow.title,
      fontSize: s(group.radioRow.titleFontSize),
      fontFamily: font(group.radioRow.titleFontWeight),
    },
    radioHint: {
      color: group.radioRow.hint,
      fontSize: s(group.radioRow.hintFontSize),
      fontFamily: font(group.radioRow.hintFontWeight),
    },
    /*
     * §D2 asks for a 44×26/r13 switch with a 20px thumb. The repo's design
     * contract forbids a screen drawing its own track, and `components/kit`
     * ships one shared 46×28/24 switch (Faz 4 karar 8 / S3). The shared control
     * wins again here: two pixels of track against one switch in the app.
     */
    /** HTML 450–451: leaving is its own card, one gap below the rest. */
    dangerCard: {
      marginTop: s(group.dangerRow.marginTop),
      borderRadius: s(group.dangerRow.radius),
      backgroundColor: group.dangerRow.bg,
      overflow: "hidden",
    },
    dangerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(group.dangerRow.gap),
      paddingVertical: s(group.dangerRow.paddingVertical),
      paddingHorizontal: s(group.dangerRow.paddingHorizontal),
    },
    dangerLabel: {
      flex: 1,
      color: group.dangerRow.label,
      fontSize: s(group.dangerRow.labelFontSize),
      fontFamily: font(group.dangerRow.labelFontWeight),
    },
    /** The scroll body every settings-shaped group screen ends with. */
    detailScrollContent: { paddingBottom: s(24) },
  } satisfies Record<string, TextStyle | ViewStyle>;
};

type GroupChatStyles = ReturnType<typeof createGroupChatStyles>;

/**
 * Two-level cache — theme, then scale — for the same reason the messaging sheet
 * has one: every row in the inbox calls this hook.
 */
const groupChatStyleCache = new WeakMap<MobileTheme, Map<number, GroupChatStyles>>();

/**
 * §F.6's press feedback, resolved once per screen rather than per row: the
 * reduced-motion answer is a device setting, not a per-control decision.
 */
export const useGroupPressStyle = (): TextStyle | ViewStyle => {
  const styles = useGroupChatStyles();
  const reducedMotion = useReducedMotion() === true;

  return reducedMotion ? styles.pressedFlat : styles.pressedScale;
};

export const useGroupChatStyles = (): GroupChatStyles => {
  const theme = useTheme();
  const scale = useMobileMessagingScale();

  return useMemo(() => {
    let byScale = groupChatStyleCache.get(theme);
    if (!byScale) {
      byScale = new Map<number, GroupChatStyles>();
      groupChatStyleCache.set(theme, byScale);
    }

    const cached = byScale.get(scale);
    if (cached) {
      return cached;
    }

    const created = StyleSheet.create(createGroupChatStyles(theme, scale)) as GroupChatStyles;
    byScale.set(scale, created);
    return created;
  }, [scale, theme]);
};

export const mobileRadii = {
  card: 22,
  cardLarge: 24,
  row: 16,
  control: 14,
  chip: 16,
  bubble: 18,
  sheet: 36,
  tabBar: 26,
  tabPill: 18,
  pill: 999,
} as const;

export const mobileSizing = {
  maxInlineContentWidth: 520,
  minTouchTarget: 44,
  presenceDot: 14,
  presenceDotBorder: 2.5,
  unreadBadgeMinHeight: 20,
  avatarS: 36,
  avatarSRadius: 12,
  avatarM: 40,
  avatarMRadius: 14,
  avatarL: 44,
  avatarLRadius: 16,
  avatarXL: 50,
  avatarXLRadius: 18,
  avatarXXL: 76,
  avatarXXLRadius: 26,
  squircle38: 38,
  squircle38Radius: 13,
  squircle46: 46,
  squircle46Radius: 16,
  squircle52: 52,
  squircle52Radius: 18,
  squircle60: 60,
  squircle60Radius: 22,
  squircle80: 80,
  squircle80Radius: 28,
  iconStroke: 1.8,
} as const;

export const mobileSpacing = {
  page: 20,
  pageWide: 24,
  section: 16,
  row: 12,
} as const;

/** Measured from the canonical 390x844 reference extractor; do not normalize to the spacing scale. */
export const mobileNavigationMetrics = {
  miniVoiceBarToTabBarGap: 14,
  tabBarPaddingBottom: 15,
  tabBarPaddingHorizontal: 8,
  tabBarPaddingTop: 8,
  tabItemGap: 2,
  tabItemPaddingVertical: 5,
} as const;

/**
 * Named measurements used by the redesign screen trees outside the compact
 * spacing/radius scale. They remain semantic so dark screens without an HTML
 * pixel reference can be validated against the same role contract.
 */
export const mobileLayoutMetrics = {
  auth: {
    backButton: 42,
    backButtonRadius: 15,
    backgroundDot: 4,
    backgroundDotCount: 24,
    backgroundDotHighlightedOpacity: 0.5,
    backgroundDotHighlightInterval: 3,
    backgroundDotHorizontalModulo: 96,
    backgroundDotHorizontalStep: 17,
    backgroundDotOpacity: 0.28,
    backgroundDotVerticalModulo: 92,
    backgroundDotVerticalStep: 29,
    backgroundGlowBottomDiameter: 240,
    backgroundGlowBottomOffsetBottom: 104,
    backgroundGlowBottomOffsetLeft: 84,
    backgroundGlowTopDiameter: 220,
    backgroundGlowTopOffsetRight: 86,
    backgroundGlowTopOffsetTop: 92,
    checkboxCheckGlyph: 14,
    compactRegisterPasswordIcon: 16,
    ctaContentGap: 10,
    ctaHeight: 56,
    ctaRadius: 28,
    formPrimaryActionIcon: 17,
    formCtaHeight: 54,
    formCtaRadius: 27,
    featureChipRadius: 18,
    featureDot: 7,
    fieldRadius: 16,
    forgotActionGap: 6,
    forgotContentGap: 18,
    forgotContentPaddingBottom: 60,
    forgotContentPaddingHorizontal: 24,
    forgotIconCardGlyph: 32,
    forgotInfoBannerMarginTop: 6,
    fullInputIcon: 18,
    focusRingRadius: 3,
    formInputPaddingVertical: 14,
    heroGap: 22,
    heroPadding: 30,
    iconCard: 72,
    iconCardRadius: 26,
    inputPaddingVertical: 13,
    infoBannerGlyph: 16,
    labelGap: 7,
    loginSocialActionHeight: 48,
    loginSocialActionGap: 10,
    loginSocialActionWidth: 78,
    loginRememberMeWidth: 112,
    logoSquircle: 56,
    logoSquircleRadius: 18,
    passwordHintShieldIcon: 14,
    profileCheckGlyph: 9,
    profileGlyph: 15,
    profileIcon: 30,
    profilePreviewOffsetRight: 8,
    profilePreviewOffsetTop: 7,
    profileRadius: 18,
    profileSelectionBadgeBottomOffset: 7,
    profileSelectionBadge: 16,
    profileSelectionBadgeRightOffset: 10,
    profileSelectionBorderWidth: 1.5,
    registerContentGap: 13,
    registerPasswordColumnGap: 10,
    registerPasswordColumnMinWidth: 132,
    securityBadgeIcon: 18,
    securityShieldIcon: 21,
    termsCheckbox: 18,
    themePillRadius: 20,
    topBarBackIcon: 18,
    topBarLogo: 32,
    topBarLogoRadius: 11,
    welcomeBrandCardSize: 52,
    welcomeBrandGap: 13,
    welcomeBackgroundDotRadius: 1.2,
    welcomeBackgroundDotSpacing: 26,
    welcomeBackgroundReferenceHeight: 844,
    welcomeBackgroundReferenceWidth: 390,
    welcomeCopyrightTopPadding: 6,
    welcomeCtaBottomPadding: 26,
    welcomeFeatureChipGap: 8,
    welcomeFeatureChipContentGap: 7,
    welcomeFeatureChipHorizontalPadding: 13,
    welcomeFeatureChipVerticalPadding: 8,
    welcomeLanguageChevronIcon: 12,
    welcomeLanguageControlGap: 6,
    welcomeLanguageControlHeight: 35,
    welcomeLanguageIcon: 14,
    welcomeLanguagePaddingHorizontal: 13,
    welcomeLanguagePaddingVertical: 5,
    welcomePrimaryActionIcon: 18,
    welcomeSecondaryActionIcon: 18,
    welcomeThemeControlGap: 5,
    welcomeThemeIcon: 13,
    welcomeThemePillGap: 2,
    welcomeThemePillPadding: 4,
    welcomeThemeSegmentHorizontalPadding: 11,
    welcomeThemeSegmentVerticalPadding: 5,
    welcomeTopControlsGap: 8,
    welcomeTopControlsPaddingTop: 2,
    languageSheet: {
      badge: 38,
      badgeRadius: 13,
      close: 36,
      closeRadius: 13,
      contentHorizontalPadding: 20,
      contentPaddingBottom: 30,
      deviceRadius: 16,
      handleHeight: 5,
      handleRadius: 3,
      handleWidth: 40,
      panelRadius: 28,
      rowRadius: 18,
      rowPaddingHorizontal: 15,
      rowPaddingVertical: 13,
      toggleHeight: 26,
      toggleThumb: 20,
      toggleWidth: 44,
    },
  },
  border: { hairline: 1 },
  fixed: {
    actionWidth: 104,
    compactActionHeight: 30,
    composeControl: 48,
    conversationMinHeight: 86,
    conversationHeaderHeight: 58,
    denseRowHeight: 56,
    handleHeight: 4,
    handleWidth: 42,
    iconControl: 34,
    metricColumn: 88,
    minimumActionWidth: 54,
    notificationFeedRowMinHeight: 68,
    permissionRowHeight: 64,
    profileHubContentBottomPadding: 108,
    // 1f identity card: a 76px squircle whose 4px white border is the visible frame, with
    // the 68px avatar inside it and an 18px presence dot hanging off the corner.
    profileIdentityAvatarInner: 68,
    profileIdentityAvatarInnerRadius: 22,
    profileIdentityAvatarOverlap: -34,
    profileIdentityAvatarRingBorder: 4,
    // The identity card is the banner: the photo fills the whole block and the
    // avatar/name/edit chip sit on top of it, so the card needs a real height of
    // its own instead of growing out of a body that no longer exists.
    profileIdentityCardHeight: 212,
    // Inset of the edit chip from the banner's top-right corner. Smaller than the 16px the
    // identity block sits on so the 44px touch target, not the chip, lines up with the edge.
    profileIdentityEditActionInset: 10,
    profileIdentityEditActionRadius: 12,
    profileIdentityPresenceDot: 18,
    profileIdentityPresenceDotBorder: 3,
    profileIdentityPresenceDotOffset: -2,
    readingColumn: 92,
    summaryMaxWidth: 128,
  },
  dmInbox: {
    conversationRowMinHeight: 74,
    groupBadgeOffset: -2,
    segmentMinHeight: 41,
  },
  opacity: {
    disabled: 0.62,
    notificationMarkAllReadDisabled: 0.45,
    muted: 0.52,
    pressed: 0.78,
    subdued: 0.56,
    textDisabled: 0.86,
    touched: 0.88,
  },
  notifications: {
    contentBottomPadding: 120,
    mentionBadgeOffset: -4,
  },
  spacing: {
    hairline: 1,
    micro: 2,
    microPlus: 3,
    small: 4,
    smallPlus: 5,
    tight: 7,
    tightPlus: 9,
  },
  typography: {
    compactTracking: 0.7,
    mediaTracking: 0.8,
    sectionTracking: 1.5,
    screenTitleLineHeight: 31,
  },
} as const;

/**
 * Messaging redesign shape and layout scale (handoff PROMPT.md §0.5 shapes, §1
 * layout). Read straight from the reference HTML's inline styles; these are
 * measured values, not a rounded scale, so they live apart from
 * `mobileSizing`/`mobileRadii`.
 */
export const mobileMessagingMetrics = {
  /** §0.5 avatar ladder: size + radius pairs, one per surface. */
  avatar: {
    channelRow: 34,
    channelRowRadius: 12,
    chatHeader: 38,
    chatHeaderRadius: 13,
    conversationList: 46,
    conversationListRadius: 16,
    dmMessage: 30,
    dmMessageRadius: 11,
    friendList: 44,
    friendListRadius: 15,
    onlineStrip: 50,
    onlineStripRadius: 17,
    threadIndicator: 20,
    threadIndicatorRadius: 7,
  },
  bubble: {
    /** §1.2: consecutive bubbles inside one group. */
    gap: 3,
    /** §1.2: between groups, and the wider value when the group carries chips. */
    groupGap: 10,
    groupGapWithReaction: 14,
    /** §1: an outgoing group has no avatar, so its block indents instead. */
    outgoingBlockPaddingLeft: 38,
    paddingBottom: 8,
    paddingHorizontal: 13,
    paddingTop: 9,
    radius: 18,
    /** §0.5: only the last bubble of a group corners its tail. */
    tailRadius: 7,
    maxWidthRatio: 0.76,
  },
  channel: {
    /** §1.2: a continuation message drops the avatar and aligns to 61px. */
    continuationPaddingBottom: 1,
    continuationPaddingLeft: 61,
    continuationPaddingRight: 16,
    continuationPaddingTop: 1,
    rowPaddingHorizontal: 16,
    rowPaddingVertical: 6,
    /** §2 "1e".5: avatar to body. 16 + 34 + 11 is the 61px continuation inset. */
    rowGap: 11,
    /** §2 "1e".4: the flow itself pads vertically; rows own the horizontal inset. */
    flowPaddingTop: 8,
    flowPaddingBottom: 6,
    /** §2 "1e".3 pinned strip. */
    pinnedStripPaddingHorizontal: 16,
    pinnedStripPaddingVertical: 8,
    /** §2 "1e".10 system event line. */
    systemRowPaddingLeft: 22,
    systemRowPaddingVertical: 8,
    /** §2 "1e".12 mention row. */
    mentionRowPaddingLeft: 13,
    mentionRowPaddingVertical: 8,
    mentionRowStripeWidth: 3,
    /** §2 "1e".13 typing line, aligned to the message body. */
    typingPaddingTop: 10,
    typingPaddingBottom: 2,
    /** §2 "1e".7 link preview card. */
    linkPreviewMaxWidth: 268,
    linkPreviewRadius: 14,
    linkPreviewPaddingHorizontal: 12,
    linkPreviewPaddingVertical: 9,
    /** §2 "1e".9 thread indicator block. */
    threadIndicatorRadius: 12,
    threadIndicatorGap: 8,
    threadIndicatorFaceOverlap: -7,
    threadIndicatorFaceBorderWidth: 1.5,
    /** §0.4 BOT badge. */
    botBadgeRadius: 5,
    botBadgePaddingHorizontal: 5,
    botBadgePaddingVertical: 2,
  },
  composer: {
    actionSize: 42,
    actionRadius: 15,
    fieldHeight: 42,
    fieldRadius: 16,
    plusSize: 40,
    plusRadius: 14,
  },
  /** §0.5: 13px on list rows (2.5px ring), 12px on the 38/44px avatars. */
  presenceDot: {
    listSize: 13,
    listRingWidth: 2.5,
    avatarSize: 12,
    avatarRingWidth: 2.5,
    /** §2 "1a": the dot overhangs the avatar corner by a hair. */
    offset: -1,
    /**
     * §2 "1a".5 carried onto a conversation row: the strip's 19px voice tile
     * against a 46px avatar instead of a 50px one, so it keeps the same optical
     * weight rather than the same number.
     */
    rowVoiceTileSize: 17.5,
  },
  /** §2 "1a".6.4: the delivery tick that leads an outgoing preview line. */
  listTick: {
    size: 14,
  },
  /**
   * §1.7 / §2 "1a".6.2: the three typing dots fade back in fixed steps, so the
   * animation reads as a sequence rather than a flicker.
   */
  typingDotOpacity: {
    first: 1,
    second: 0.6,
    third: 0.3,
  },
  /** §2 "1a".5 online strip. */
  onlineStrip: {
    cellWidth: 52,
    gap: 13,
    /** A voice tile is bigger than a dot, so it hangs further out. */
    voiceTileOffset: -3,
    voiceTileRadius: 7,
    voiceTileRingWidth: 2,
    voiceTileSize: 19,
    addTileBorderWidth: 1.6,
  },
  /** §0.4 list typography that is not a plain size: the tracked values. */
  listType: {
    /** Screen title "Mesajlar", 23 / 800 `ls -.03em`. */
    titleSize: 23,
    titleTracking: -0.69,
    /** Row name `ls -.01em` at 15px. */
    rowNameTracking: -0.15,
    /** Group label `ls .1em` at 11px. */
    groupLabelTracking: 1.1,
    /** BOT badge `ls .06em` at 9px. */
    botBadgeTracking: 0.54,
  },
  iconButton: 38,
  iconButtonRadius: 13,
  headerFab: 40,
  headerFabRadius: 14,
  /** §1.4: DM chips ride the bubble edge; channel chips sit under the body. */
  reactionChip: {
    channelHeight: 26,
    channelMarginTop: 4,
    channelRadius: 13,
    dmHeight: 25,
    dmMarginLeft: 10,
    dmMarginTop: -9,
    dmRadius: 13,
    gap: 5,
    paddingHorizontal: 8,
  },
  /** §0.5: the three list surfaces start their hairline at different insets. */
  listHairlineInset: {
    conversations: 79,
    friends: 76,
    requests: 78,
  },
  searchPillHeight: 42,
  searchPillRadius: 14,
  segment: {
    gap: 3,
    itemHeight: 36,
    itemRadius: 11,
    trackPadding: 3,
    trackRadius: 14,
  },
  settings: {
    cardPadding: 14,
    cardRadius: 24,
    dividerInset: 69,
    rowPaddingHorizontal: 16,
    rowPaddingVertical: 14,
  },
} as const;

export const mobileTypography = {
  fontFamily: "WhisprJakarta_400Regular",
  fontFamilyBold: "WhisprJakarta_700Bold",
  fontFamilyExtraBold: "WhisprJakarta_800ExtraBold",
  fontFamilyMedium: "WhisprJakarta_500Medium",
  fontFamilySemiBold: "WhisprJakarta_600SemiBold",
  authEyebrow: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.98,
  },
  authHeroTitle: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 40,
    lineHeight: 44.8,
    letterSpacing: -1.2,
  },
  authHeroBody: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 16,
    lineHeight: 24.8,
    letterSpacing: 0,
  },
  authTitle: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.58,
  },
  authSubtitle: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 13.5,
    lineHeight: 19,
    letterSpacing: 0,
  },
  authFieldLabel: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  authInput: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 14.5,
    lineHeight: 20,
    letterSpacing: 0,
  },
  authCta: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  },
  authWelcomeCta: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 16.5,
    lineHeight: 22,
    letterSpacing: 0,
  },
  authResetCta: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 15.5,
    lineHeight: 22,
    letterSpacing: 0,
  },
  authResetAction: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 13.5,
    lineHeight: 20,
    letterSpacing: 0,
  },
  authCompactInput: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 13.5,
    lineHeight: 20,
    letterSpacing: 0,
  },
  authLegalCopy: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 12.5,
    lineHeight: 18.75,
    letterSpacing: 0,
  },
  authResetSubtitle: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 13.5,
    lineHeight: 20.925,
    letterSpacing: 0,
  },
  authWelcomeBrand: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  authWelcomeControl: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },
  authWelcomeControlMuted: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },
  authWelcomeCopyright: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },
  authWelcomeFeature: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 12.5,
    lineHeight: 15,
    letterSpacing: 0,
  },
  authLanguageSheetTitle: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 0,
  },
  authLanguageSheetSubtitle: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 12.5,
    lineHeight: 17,
    letterSpacing: 0,
  },
  authLanguageOption: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
  },
  authLanguageOptionSecondary: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },
  body: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  button: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: 0,
  },
  display: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.52,
  },
  headline: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 0,
  },
  label: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },
  tabLabel: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0,
  },
  message: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 14.5,
    lineHeight: 21,
    letterSpacing: 0,
  },
  overline: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: 1.38,
  },
  dateSeparator: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
  },
  secondary: {
    fontFamily: "WhisprJakarta_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
    letterSpacing: 0,
  },
  title: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0,
  },
} as const;

/**
 * "Hakkında" redesign shape and layout scale (handoff PROMPT.md §1.4 shapes,
 * §3 layout). `mobileRadii` is a locked ten-entry scale, so the ten extra radii
 * this design measures out (`r5, r6, r9, r11, r12, r13, r15, r16, r18, r20`)
 * live here instead of widening it.
 */
export const mobileAboutMetrics = {
  cardRadius: 24,
  rowRadiusInner: 16,
  searchRadius: 16,
  noticeRadius: 20,
  sheetTopRadius: 30,
  sheetBottomRadius: 44,
  headerButton: 36,
  headerButtonRadius: 13,
  stickyHeaderButton: 32,
  stickyHeaderButtonRadius: 11,
  iconBox26: 26,
  iconBox26Radius: 9,
  iconBox30Radius: 11,
  iconBox32Radius: 11,
  iconBox44Radius: 15,
  currentBadgeRadius: 6,
  chipRadiusSmall: 5,
  chipRadiusMedium: 7,
  pillRadius: 11,
  toggleWidth: 44,
  toggleHeight: 26,
  toggleRadius: 13,
  toggleKnob: 20,
  typePillWidth: 62,
  cardMargin: 16,
  cardPadding: 16,
  minRowHeight: 44,
  stickyHeaderThreshold: 12,
  stickyHeaderDurationMs: 160,
  footerButtonBottom: 26,
  footerButtonRadius: 16,
} as const;

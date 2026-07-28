import {
  mobilePalette,
  redesignAccessibleAvatarTintsLight,
  redesignAvatarTintsDark,
  redesignAuthDark,
  redesignAuthLight,
  redesignDark,
  redesignLight,
  redesignLightbox,
  redesignMessagingDark,
  redesignMessagingLight,
  redesignProfileDark,
  redesignProfileLight,
  redesignToastDark,
  redesignToastLight,
  redesignVoiceRoomDark,
  redesignVoiceRoomLight,
} from "./palette";
import {
  mobileLayoutMetrics,
  mobileRadii,
  mobileSizing,
  mobileSpacing,
  mobileTypography,
} from "./tokens";

export type MobileThemeId = "dark" | "light";

/**
 * Controls that float on a user-supplied image cannot inherit a theme surface:
 * the backdrop is the user's photo, which may be pure white in one banner and
 * black in the next. These two values are therefore identical in both themes —
 * dark enough to carry white text over a white image, translucent enough to let
 * the photo read through, with a light hairline so the chip still separates from
 * a dark image.
 */
const MOBILE_IMAGE_SCRIM_SURFACE = "rgba(14,16,26,.62)";
const MOBILE_IMAGE_SCRIM_BORDER = "rgba(255,255,255,.26)";

/** Ink behind the messaging long-press layer: `rgba(20,23,42,.xx)` in §0.3. */
const MESSAGING_OVERLAY_SHADOW = "#14172A";
/** Flat elevation: dark drops every raised-surface shadow (§0.3, verified in 1h). */
const MESSAGING_FLAT_ELEVATION = {
  elevation: 0,
  shadowColor: "#000000",
  shadowOffset: { height: 0, width: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
} as const;

export interface MobileThemeElevationStyle {
  readonly elevation: number;
  readonly shadowColor: string;
  readonly shadowOffset: {
    readonly height: number;
    readonly width: number;
  };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
}

export interface MobileAvatarTint {
  readonly bg: string;
  readonly fg: string;
}

/**
 * One toast variant's three coloured surfaces (handoff 3b/3c). The card, title
 * and subtitle never change with the variant — colour only reaches the glyph
 * tile, the action button and the countdown fill.
 */
export interface MobileToastVariantPalette {
  readonly actionSurface: string;
  readonly actionText: string;
  /** Only the action/undo tile is outlined; every other tile is a flat tint. */
  readonly iconBorder: string | null;
  readonly iconColor: string;
  readonly iconSurface: string;
  readonly timer: string;
}

export type MobileToastVariantId = "action" | "error" | "info" | "loading" | "success" | "warning";

export type MobileToastVariantPalettes = Readonly<
  Record<MobileToastVariantId, MobileToastVariantPalette>
>;

function createToastVariantPalettes(
  tokens: typeof redesignToastLight | typeof redesignToastDark,
): MobileToastVariantPalettes {
  return {
    // "Geri al" is the one action the handoff fills: undo is the primary move,
    // not a tinted afterthought, so it carries the brand button instead.
    action: {
      actionSurface: tokens.actionEmphasisSurface,
      actionText: tokens.actionEmphasisText,
      iconBorder: tokens.neutralBorder,
      iconColor: tokens.neutralIcon,
      iconSurface: tokens.neutralSurface,
      timer: tokens.neutralTimer,
    },
    error: {
      actionSurface: tokens.errorSurface,
      actionText: tokens.errorIcon,
      iconBorder: null,
      iconColor: tokens.errorIcon,
      iconSurface: tokens.errorSurface,
      timer: tokens.errorIcon,
    },
    info: {
      actionSurface: tokens.infoSurface,
      actionText: tokens.infoIcon,
      iconBorder: null,
      iconColor: tokens.infoIcon,
      iconSurface: tokens.infoSurface,
      timer: tokens.infoIcon,
    },
    loading: {
      actionSurface: tokens.infoSurface,
      actionText: tokens.infoIcon,
      iconBorder: null,
      iconColor: tokens.infoIcon,
      iconSurface: tokens.infoSurface,
      timer: tokens.infoIcon,
    },
    success: {
      actionSurface: tokens.successSurface,
      actionText: tokens.successIcon,
      iconBorder: null,
      iconColor: tokens.successIcon,
      iconSurface: tokens.successSurface,
      timer: tokens.successIcon,
    },
    warning: {
      actionSurface: tokens.warningSurface,
      actionText: tokens.warningIcon,
      iconBorder: null,
      iconColor: tokens.warningIcon,
      iconSurface: tokens.warningSurface,
      timer: tokens.warningIcon,
    },
  };
}

export type MobileAvatarTints = readonly [MobileAvatarTint, ...MobileAvatarTint[]];

/**
 * Messaging redesign colour group (handoff PROMPT.md §0.1/§0.2). DM, channel,
 * thread, the long-press layer and the appearance screen read this instead of
 * `surface`/`text`/`status`, exactly as the voice room reads `voiceRoom` — the
 * app's own light/dark palette is not touched by the redesign.
 */
export type MobileMessagingPalette = {
  readonly [K in keyof typeof redesignMessagingLight]: string;
};

export interface MobileAuthProfileAccent {
  readonly badgeBorder: string;
  readonly badgeSoft: string;
  readonly badgeText: string;
  readonly icon: string;
  readonly iconSoft: string;
}

const lightThemeAccent = {
  action: redesignLight.primary,
  default: redesignLight.primary,
  soft: redesignLight.lavender,
  softBorder: redesignLight.lavenderBorder,
  strong: redesignLight.primaryStrong,
  ownerBadge: redesignLight.ownerBadge,
  tabActive: redesignLight.primary,
} as const;

const darkThemeAccent = {
  action: redesignDark.primaryWithWhiteText,
  default: redesignDark.primary,
  soft: redesignDark.selectedSurface,
  softBorder: redesignDark.selectedBorder,
  strong: redesignDark.accentText,
  ownerBadge: redesignDark.ownerBadge,
  tabActive: redesignDark.accentText,
} as const;

/** Shared by both themes on purpose: a photo viewer is always a dark room. */
const lightboxChrome = {
  backdrop: redesignLightbox.backdrop,
  chromeGradient: [
    redesignLightbox.chromeGradientStrong,
    redesignLightbox.chromeGradientFade,
  ] as const,
  chromeGradientBottom: [
    redesignLightbox.chromeGradientFade,
    redesignLightbox.chromeGradientStrong,
  ] as const,
  chromeText: redesignLightbox.chromeText,
  chromeTextMuted: redesignLightbox.chromeTextMuted,
  control: redesignLightbox.control,
  controlBorder: redesignLightbox.controlBorder,
} as const;

export interface MobileTheme {
  readonly accent: {
    /** Accessible filled-action color; use with text.onPrimary. */
    readonly action: string;
    /** Canonical brand accent for non-text controls and decorative use. */
    readonly default: string;
    /** Non-interactive surface for the channel server-owner badge. */
    readonly ownerBadge: string;
    readonly soft: string;
    readonly softBorder: string;
    /** Accessible accent foreground for normal-size text. */
    readonly strong: string;
    /** 1a edge-to-edge tab bar active icon/label foreground. */
    readonly tabActive: string;
  };
  readonly authFeature: {
    readonly community: string;
    readonly encryption: string;
    readonly fileShare: string;
    readonly realtime: string;
    readonly voice: string;
  };
  readonly authLanguage: {
    readonly backdrop: string;
    readonly closeSurface: string;
    readonly deviceSurface: string;
    readonly handle: string;
    readonly radio: string;
    readonly selectedBorder: string;
    readonly selectedSurface: string;
  };
  readonly authProfile: {
    readonly corporate: MobileAuthProfileAccent;
    readonly gamer: MobileAuthProfileAccent;
    readonly personal: MobileAuthProfileAccent;
  };
  readonly avatarTints: MobileAvatarTints;
  /** Settings/list-row control chrome: disclosure chevrons, separator dots, toggle track. */
  readonly control: {
    readonly chevron: string;
    /** Dashed outline on "add" affordances (1a rail +, 1c new-server row). */
    readonly dashedBorder: string;
    readonly separatorDot: string;
    readonly trackOff: string;
    readonly trackThumb: string;
  };
  readonly border: {
    readonly default: string;
    readonly focus: string;
    /** Translucent external focus ring for auth text fields. */
    readonly focusRing: string;
    /**
     * Hairline for controls that sit on user-supplied imagery. Pairs with
     * `surface.imageScrim`; theme-independent because the backdrop is a photo,
     * not an app surface.
     */
    readonly imageScrim: string;
    /** Surface-matched ring for non-text controls layered on a card. */
    readonly onSurfaceRing: string;
    readonly subtle: string;
    /** 1a edge-to-edge tab bar top hairline. */
    readonly tabBarTop: string;
  };
  readonly dark: boolean;
  readonly elevation: {
    readonly authBrandMark: MobileThemeElevationStyle;
    readonly profileCard: MobileThemeElevationStyle;
    readonly authPrimaryAction: MobileThemeElevationStyle;
    readonly bottomSheet: MobileThemeElevationStyle;
    readonly dangerAction: MobileThemeElevationStyle;
    readonly headerCard: MobileThemeElevationStyle;
    /**
     * Messaging redesign shadows (PROMPT.md §0.3). Raised *surfaces* flatten on
     * dark — 1h draws both bubbles without a shadow — while the long-press
     * overlay shadows keep their geometry over black ink.
     */
    readonly actionMenu: MobileThemeElevationStyle;
    readonly messageBubbleIn: MobileThemeElevationStyle;
    readonly messageBubbleOut: MobileThemeElevationStyle;
    /** §1.4: the softer lift under a reaction chip that is not the viewer's own. */
    readonly reactionChip: MobileThemeElevationStyle;
    readonly miniVoiceBar: MobileThemeElevationStyle;
    readonly primaryAction: MobileThemeElevationStyle;
    readonly reactionStrip: MobileThemeElevationStyle;
    readonly segmentActive: MobileThemeElevationStyle;
    readonly selectedBubble: MobileThemeElevationStyle;
    readonly sliderThumb: MobileThemeElevationStyle;
    readonly tabBar: MobileThemeElevationStyle;
    readonly toast: MobileThemeElevationStyle;
    readonly toggleThumb: MobileThemeElevationStyle;
  };
  readonly gradients: {
    readonly appBackground: readonly [string, string];
    readonly authPrimaryAction: readonly [string, string];
    readonly authPrimaryActionMuted: readonly [string, string];
    readonly primaryAction: readonly [string, string];
    readonly softSurface: readonly [string, string];
  };
  readonly id: MobileThemeId;
  readonly interactive: {
    readonly disabled: string;
    readonly pressed: string;
  };
  /** Named non-scale layout measures used by semantic screen style trees. */
  readonly layout: typeof mobileLayoutMetrics;
  /** 10b full-screen image viewer. Stays dark in both themes so the photo leads. */
  readonly lightbox: {
    readonly backdrop: string;
    /** Top bar wash: opaque at the top edge, transparent where the photo starts. */
    readonly chromeGradient: readonly [string, string];
    /** Bottom bar wash: the same ramp, mirrored. */
    readonly chromeGradientBottom: readonly [string, string];
    readonly chromeText: string;
    readonly chromeTextMuted: string;
    readonly control: string;
    readonly controlBorder: string;
  };
  readonly media: {
    readonly border: string;
    readonly surface: string;
    readonly surfaceElevated: string;
    readonly text: string;
    readonly textMuted: string;
  };
  /** 10a `@username` mention chips and the row accent of a message that mentions you. */
  readonly mention: {
    readonly background: string;
    /** 1a/1c mention count-badge surface (rail @n, switcher @n, channel @n). */
    readonly badge: string;
    readonly selfBackground: string;
    readonly selfRowBackground: string;
    readonly selfRowStripe: string;
    readonly text: string;
  };
  /**
   * Messaging redesign (MSG-1a…1i). Its own surface stack in both themes, so
   * DM/channel/thread/long-press/appearance read this instead of the app-wide
   * `surface`/`text`/`status` groups.
   */
  readonly messaging: MobileMessagingPalette;
  /** 8a-8e message action surfaces: long-press overlay chrome + channel stream accents. */
  readonly messageMenu: {
    readonly addReactionBorder: string;
    readonly reactionDetailScrim: string;
    readonly rowHighlight: string;
    readonly scrim: string;
    readonly separator: string;
    readonly shadow: string;
    readonly unreadDivider: string;
    readonly unreadDividerLine: string;
  };
  /**
   * 11b quick profile card (handoff 1a/1b/1d, dark 1e). The card is its own
   * surface family: a brand banner that ignores the theme, three fixed badge
   * tints, and presence dots that need a warm idle and a hollow offline the
   * semantic `status` group does not carry.
   */
  readonly profileCard: {
    readonly badgeEarlyBorder: string;
    readonly badgeEarlyIcon: string;
    readonly badgeEarlySurface: string;
    readonly badgeInviterBorder: string;
    readonly badgeInviterIcon: string;
    readonly badgeInviterSurface: string;
    readonly badgeSupporterBorder: string;
    readonly badgeSupporterIcon: string;
    readonly badgeSupporterSurface: string;
    readonly bannerControl: string;
    /** The three-dot button while its menu is open (1b). */
    readonly bannerControlActive: string;
    readonly bannerControlText: string;
    /** Brand banner fallback; identical in both themes by design. */
    readonly bannerDefault: string;
    /** Non-friends never see a personal banner, so they get this neutral fill. */
    readonly bannerNeutral: string;
    readonly cardBorder: string;
    /** Drop-shadow colour; the full shadow lives in `elevation.profileCard`. */
    readonly cardShadow: string;
    readonly dashedBorder: string;
    readonly menuBorder: string;
    readonly menuIcon: string;
    readonly menuSeparator: string;
    readonly menuSurface: string;
    readonly mutualAvatarRing: string;
    readonly mutualBorder: string;
    readonly mutualSurface: string;
    readonly roleChipBorder: string;
    readonly roleChipSurface: string;
    readonly roleChipText: string;
    readonly scrim: string;
    readonly secondaryActionBorder: string;
    readonly secondaryActionIcon: string;
    readonly secondaryActionSurface: string;
    readonly statusDnd: string;
    readonly statusIdle: string;
    readonly statusOffline: string;
    readonly statusOnline: string;
    readonly viewProfileBorder: string;
    readonly viewProfileSurface: string;
    readonly viewProfileText: string;
  };
  /**
   * 11e profile sheets (handoff 2b note editor + 2c status picker). The status
   * tiles need a warm/neutral pair the semantic `status` group does not carry —
   * `idle` is a mood, not an alert, and the invisible ring is a disabled dot
   * rather than muted text — so they live here instead of bending `status`.
   */
  readonly profileSheet: {
    readonly check: string;
    readonly description: string;
    readonly divider: string;
    readonly handle: string;
    readonly hint: string;
    readonly noteFieldBorder: string;
    readonly noteFieldFocusBorder: string;
    /** Outer glow drawn as a same-radius ring behind the focused field. */
    readonly noteFieldFocusRing: string;
    readonly noteFieldSurface: string;
    readonly saveAction: string;
    readonly saveActionDisabled: string;
    readonly selectedBorder: string;
    readonly selectedLabel: string;
    readonly selectedSurface: string;
    readonly statusDndIcon: string;
    readonly statusDndSurface: string;
    readonly statusIdleIcon: string;
    readonly statusIdleSurface: string;
    readonly statusInvisibleRing: string;
    readonly statusInvisibleSurface: string;
    readonly statusOnlineDot: string;
    readonly statusOnlineSurface: string;
  };
  readonly radii: typeof mobileRadii;
  /** 11f shared-media gallery: segment chips, grid tiles and the video badge. */
  readonly sharedMedia: {
    /** Pill behind a video's duration; stays ink in both themes, over the photo. */
    readonly durationBadge: string;
    readonly durationBadgeText: string;
    readonly tabActiveBorder: string;
    readonly tabActiveSurface: string;
    readonly tabActiveText: string;
    readonly tabBorder: string;
    readonly tabSurface: string;
    readonly tabText: string;
    /** Tile fill shown until a thumbnail loads, or when there is none. */
    readonly tileSurface: string;
  };
  readonly sizing: typeof mobileSizing;
  readonly spacing: typeof mobileSpacing;
  readonly status: {
    /** Accessible danger foreground on card surfaces; also used for non-text status accents. */
    readonly danger: string;
    /** Accessible filled danger action color; use with text.onPrimary. */
    readonly dangerAction: string;
    /** Accessible normal-text danger foreground on base and card surfaces. */
    readonly dangerOnBase: string;
    /** Canonical danger accent for icons and controls on inverse surfaces. */
    readonly dangerOnInverse: string;
    readonly dangerSoft: string;
    readonly info: string;
    readonly infoSoft: string;
    /** Primary foreground for semantic status bands. */
    readonly onStatus: string;
    /** Neutral status-chip surface for planned roadmap work. */
    readonly plannedSoft: string;
    /** Canonical pending friend-request pill accent (6A/6B "İstekler" badge). */
    readonly pendingBadge: string;
    /** Canonical success accent for icons, borders and decorative controls. */
    readonly success: string;
    /** Canonical success accent for icons and controls on inverse surfaces. */
    readonly successOnInverse: string;
    readonly successSoft: string;
    /** Exact handoff success foreground for compact metadata. */
    readonly visualText: string;
    /** Accessible success foreground for audited text contexts. */
    readonly successText: string;
    /** Exact handoff amber for compact create-option icons (1d category). */
    readonly visualWarning: string;
    readonly visualWarningSoft: string;
    readonly warning: string;
    readonly warningSoft: string;
  };
  readonly surface: {
    readonly base: string;
    readonly card: string;
    /**
     * Selected filter-chip backdrop (4c status row). Light is the handoff ink,
     * but ink on a dark theme lands within a hair of `card` and the chip stops
     * looking selected at all, so dark gets the raised accent surface instead.
     */
    readonly chipSelected: string;
    readonly elevated: string;
    readonly inverse: string;
    readonly inverseControl: string;
    /**
     * Opaque-enough chip backdrop for controls layered on user imagery. A 12%
     * white wash (`inverseControl`) vanishes on a bright banner and takes its
     * white label with it, so overlay controls use this instead.
     */
    readonly imageScrim: string;
    readonly overlay: string;
    readonly rail: string;
    readonly scrim: string;
    readonly soft: string;
    /** Canonical full-screen active voice room surface. */
    readonly voiceRoom: string;
    /** Canonical active voice room participant-card surface. */
    readonly voiceRoomParticipant: string;
    /** Canonical active voice room invite-card surface. */
    readonly voiceRoomInvite: string;
    /** Canonical active voice room invite-card border. */
    readonly voiceRoomInviteBorder: string;
    /** Canonical active voice room control surface. */
    readonly voiceRoomControl: string;
    /** Full-bleed backdrop behind a video call while it is still ringing (7b). */
    readonly voiceRoomVideo: string;
    /** Glass dock and chips layered over the video-call backdrop (7b). */
    readonly voiceRoomVideoGlass: string;
    /** Canonical active voice room control border. */
    readonly voiceRoomControlBorder: string;
  };
  readonly systemBars: {
    readonly androidNavigationBar: string;
    readonly statusBar: "dark" | "light";
  };
  /**
   * 3a-3c toast standard. Pinned literally in both themes because the handoff
   * gives the toast its own card colour; the component reads these and never
   * branches on `theme.dark` itself.
   */
  readonly toast: {
    readonly card: string;
    readonly cardBorder: string;
    readonly closeIcon: string;
    readonly subtitle: string;
    readonly timerTrack: string;
    readonly title: string;
    readonly variants: MobileToastVariantPalettes;
  };
  readonly text: {
    /** Reference-critical date-divider color; do not use for normal body text. */
    readonly dateSeparator: string;
    readonly inverse: string;
    /** Exact handoff faint foreground for compact labels and channel glyphs. */
    readonly visualFaint: string;
    /** Exact handoff placeholder foreground for compact search controls. */
    readonly visualPlaceholder: string;
    /** Exact handoff secondary foreground for compact metadata. */
    readonly visualSecondary: string;
    readonly muted: string;
    readonly onInverseMuted: string;
    readonly onInverse: string;
    readonly onPrimary: string;
    readonly placeholder: string;
    readonly primary: string;
    readonly secondary: string;
    readonly soft: string;
  };
  readonly typography: typeof mobileTypography;
  /**
   * 5a/5b active voice room. The room owns its own surface stack in both themes,
   * so it reads this group instead of `surface`/`text`/`status` — those still
   * dress the direct-call screens, which the redesign leaves alone.
   */
  readonly voiceRoom: {
    readonly accent: string;
    readonly avatarSurface: string;
    readonly avatarText: string;
    readonly border: string;
    readonly card: string;
    readonly control: string;
    readonly controlBorder: string;
    readonly danger: string;
    /** Mute state fill behind the microphone control. */
    readonly dangerSoft: string;
    /** The dock hairline runs a shade darker than a card border on dark. */
    readonly dockBorder: string;
    readonly screen: string;
    readonly success: string;
    /** Halo ring around the connected dot. */
    readonly successHalo: string;
    readonly text: string;
    readonly textFaint: string;
    readonly textSecondary: string;
    readonly toggleKnob: string;
    readonly toggleTrackOff: string;
    /** Reconnecting amber. */
    readonly warning: string;
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }

  return value;
}

export const lightTheme = deepFreeze({
  accent: lightThemeAccent,
  authFeature: {
    community: redesignAuthLight.featureCommunity,
    encryption: redesignAuthLight.featureEncryption,
    fileShare: redesignAuthLight.featureFileShare,
    realtime: redesignAuthLight.featureRealtime,
    voice: redesignAuthLight.featureVoice,
  },
  authLanguage: {
    backdrop: redesignLight.languageBackdrop,
    closeSurface: redesignLight.languageClose,
    deviceSurface: redesignLight.languageDevice,
    handle: redesignLight.languageHandle,
    radio: redesignLight.languageRadio,
    selectedBorder: redesignLight.primary,
    selectedSurface: redesignLight.lavender,
  },
  authProfile: {
    corporate: {
      badgeBorder: redesignAuthLight.profileCorporateBorder,
      badgeSoft: redesignAuthLight.profileCorporateSoft,
      badgeText: redesignAuthLight.profileCorporateFg,
      icon: redesignAuthLight.profileCorporateFg,
      iconSoft: redesignAuthLight.profileCorporateSoft,
    },
    gamer: {
      badgeBorder: redesignAuthLight.profileGamerBorder,
      badgeSoft: redesignAuthLight.profileGamerSoft,
      badgeText: redesignAuthLight.profileGamerFg,
      icon: redesignAuthLight.profileGamerFg,
      iconSoft: redesignAuthLight.profileGamerSoft,
    },
    personal: {
      badgeBorder: lightThemeAccent.softBorder,
      badgeSoft: lightThemeAccent.soft,
      badgeText: lightThemeAccent.strong,
      icon: lightThemeAccent.default,
      iconSoft: lightThemeAccent.soft,
    },
  },
  avatarTints: redesignAccessibleAvatarTintsLight,
  border: {
    default: redesignLight.hairline,
    focus: redesignLight.primary,
    focusRing: redesignLight.focusRing,
    imageScrim: MOBILE_IMAGE_SCRIM_BORDER,
    onSurfaceRing: mobilePalette.neutral.white,
    subtle: redesignLight.border,
    tabBarTop: redesignLight.tabBarBorder,
  },
  control: {
    chevron: redesignLight.controlChevron,
    dashedBorder: redesignLight.controlDashedBorder,
    separatorDot: redesignLight.controlSeparatorDot,
    trackOff: redesignLight.languageHandle,
    trackThumb: mobilePalette.neutral.white,
  },
  dark: false,
  elevation: {
    authBrandMark: {
      elevation: 8,
      shadowColor: "#4360FF",
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 34,
    },
    authPrimaryAction: {
      elevation: 10,
      shadowColor: redesignLight.primary,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.32,
      shadowRadius: 24,
    },
    /** Handoff 1a: `0 24px 60px rgba(20,23,42,.35)`. */
    profileCard: {
      elevation: 24,
      shadowColor: redesignProfileLight.cardShadow,
      shadowOffset: { height: 24, width: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 60,
    },
    bottomSheet: {
      elevation: 12,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: -12, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 40,
    },
    dangerAction: {
      elevation: 8,
      shadowColor: redesignLight.canonicalDanger,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
    },
    headerCard: {
      elevation: 2,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
    },
    /** §0.3: `0 18px 46px rgba(20,23,42,.32)`. */
    actionMenu: {
      elevation: 18,
      shadowColor: MESSAGING_OVERLAY_SHADOW,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: 0.32,
      shadowRadius: 46,
    },
    /** §0.3: `0 1px 2px rgba(30,34,53,.07)`. */
    messageBubbleIn: {
      elevation: 1,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.07,
      shadowRadius: 2,
    },
    /** §0.3: `0 3px 10px rgba(79,70,229,.18)`. */
    messageBubbleOut: {
      elevation: 3,
      shadowColor: redesignMessagingLight.accent,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
    },
    /** §1.4: `0 1px 3px rgba(30,34,53,.12)`. */
    reactionChip: {
      elevation: 1,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 3,
    },
    /** §0.3: `0 14px 34px rgba(20,23,42,.30)`. */
    reactionStrip: {
      elevation: 14,
      shadowColor: MESSAGING_OVERLAY_SHADOW,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 34,
    },
    /** §0.3: `0 2px 5px rgba(30,34,53,.07)`. */
    segmentActive: {
      elevation: 2,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: 0.07,
      shadowRadius: 5,
    },
    /** §0.3: `0 18px 44px rgba(20,23,42,.34)`. */
    selectedBubble: {
      elevation: 18,
      shadowColor: MESSAGING_OVERLAY_SHADOW,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: 0.34,
      shadowRadius: 44,
    },
    /** §0.3: `0 3px 8px rgba(30,34,53,.18)`. */
    sliderThumb: {
      elevation: 3,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
    },
    /** §0.3: `0 1px 3px rgba(30,34,53,.20)`. */
    toggleThumb: {
      elevation: 1,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
    },
    miniVoiceBar: {
      elevation: 10,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
    },
    primaryAction: {
      elevation: 6,
      shadowColor: redesignLight.primary,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
    },
    tabBar: {
      elevation: 6,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: -6, width: 0 },
      shadowOpacity: 0.06,
      shadowRadius: 22,
    },
    /** Handoff 3b: `0 16px 40px rgba(30,34,53,.16)` (the 2px companion cannot stack in RN). */
    toast: {
      elevation: 16,
      shadowColor: redesignLight.inkSurface,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 40,
    },
  },
  gradients: {
    appBackground: [redesignLight.bg, redesignLight.lavender],
    authPrimaryAction: [redesignAuthLight.gradientFrom, redesignAuthLight.gradientTo],
    authPrimaryActionMuted: [
      redesignAuthLight.gradientMutedFrom,
      redesignAuthLight.gradientMutedTo,
    ],
    primaryAction: [redesignLight.primary, redesignLight.primaryStrong],
    softSurface: [redesignLight.card, redesignLight.lavender],
  },
  id: "light",
  interactive: {
    disabled: mobilePalette.overlay.disabledLight,
    pressed: mobilePalette.overlay.pressedLight,
  },
  layout: mobileLayoutMetrics,
  lightbox: lightboxChrome,
  media: {
    border: mobilePalette.neutral[700],
    surface: mobilePalette.neutral[950],
    surfaceElevated: mobilePalette.neutral[900],
    text: mobilePalette.neutral[50],
    textMuted: mobilePalette.neutral[300],
  },
  mention: {
    background: redesignLight.lavender,
    badge: redesignLight.canonicalMentionBadge,
    selfBackground: redesignLight.lavenderBorder,
    selfRowBackground: "#EEF0FE99",
    selfRowStripe: redesignLight.primary,
    text: redesignLight.primaryStrong,
  },
  messaging: redesignMessagingLight,
  messageMenu: {
    addReactionBorder: "#C9CDE4",
    reactionDetailScrim: "rgba(20,23,42,.4)",
    rowHighlight: "#EEF0FE66",
    scrim: "rgba(20,23,42,.44)",
    separator: "#EEF0F7",
    shadow: "#14172A",
    unreadDivider: "#E5484D",
    unreadDividerLine: "#E5484D55",
  },
  profileCard: redesignProfileLight,
  profileSheet: {
    check: redesignLight.primary,
    description: redesignLight.canonicalTextFaint,
    divider: redesignLight.hairline,
    handle: redesignLight.languageHandle,
    hint: redesignLight.canonicalPlaceholder,
    noteFieldBorder: redesignLight.border,
    noteFieldFocusBorder: redesignLight.primary,
    noteFieldFocusRing: redesignLight.noteFocusRing,
    noteFieldSurface: redesignLight.bg,
    saveAction: redesignLight.primary,
    saveActionDisabled: redesignLight.canonicalPlaceholder,
    selectedBorder: redesignLight.lavenderBorder,
    selectedLabel: redesignLight.primaryStrong,
    selectedSurface: redesignLight.lavender,
    statusDndIcon: redesignLight.canonicalDanger,
    statusDndSurface: redesignLight.dangerSurface,
    statusIdleIcon: redesignLight.idleText,
    statusIdleSurface: redesignLight.idleSurface,
    statusInvisibleRing: redesignLight.canonicalTextFaint,
    statusInvisibleSurface: redesignLight.hairline,
    statusOnlineDot: redesignLight.success,
    statusOnlineSurface: redesignLight.successSurface,
  },
  radii: mobileRadii,
  sharedMedia: {
    durationBadge: "rgba(30,34,53,.75)",
    durationBadgeText: mobilePalette.neutral.white,
    // 2d draws the active chip as ink on the page background. The dark theme
    // cannot repeat that — ink is the dark card colour — so it uses the same
    // selected-surface pair the rest of the dark set uses for a chosen row.
    tabActiveBorder: redesignLight.inkSurface,
    tabActiveSurface: redesignLight.inkSurface,
    tabActiveText: mobilePalette.neutral.white,
    tabBorder: redesignLight.border,
    tabSurface: redesignLight.card,
    tabText: redesignLight.canonicalTextSecondary,
    tileSurface: redesignLight.lavender,
  },
  sizing: mobileSizing,
  spacing: mobileSpacing,
  status: {
    danger: redesignLight.danger,
    dangerAction: redesignLight.danger,
    dangerOnBase: redesignLight.dangerOnBase,
    dangerOnInverse: redesignLight.canonicalDanger,
    dangerSoft: redesignLight.dangerSurface,
    info: mobilePalette.status.info,
    infoSoft: mobilePalette.status.infoSoft,
    onStatus: redesignLight.text,
    plannedSoft: redesignLight.plannedSurface,
    pendingBadge: redesignLight.pendingBadge,
    success: redesignLight.success,
    successOnInverse: redesignDark.success,
    successSoft: redesignLight.successSurface,
    visualText: redesignLight.canonicalSuccessText,
    successText: redesignLight.successText,
    visualWarning: redesignLight.canonicalWarning,
    visualWarningSoft: redesignLight.canonicalWarningSurface,
    warning: mobilePalette.status.warning,
    warningSoft: mobilePalette.status.warningSoft,
  },
  surface: {
    base: redesignLight.bg,
    card: redesignLight.card,
    chipSelected: redesignLight.inkSurface,
    elevated: redesignLight.card,
    inverse: redesignLight.inkSurface,
    inverseControl: "rgba(255,255,255,.12)",
    imageScrim: MOBILE_IMAGE_SCRIM_SURFACE,
    overlay: mobilePalette.neutral[100],
    rail: redesignLight.lavender,
    scrim: redesignDark.sheetOverlay,
    soft: redesignLight.bg,
    voiceRoom: redesignLight.bg,
    voiceRoomControl: redesignLight.voiceRoomControl,
    voiceRoomVideo: redesignLight.voiceRoomVideo,
    voiceRoomVideoGlass: redesignLight.voiceRoomVideoGlass,
    voiceRoomControlBorder: redesignLight.voiceRoomControlBorder,
    voiceRoomInvite: redesignLight.voiceRoomInvite,
    voiceRoomInviteBorder: redesignLight.voiceRoomInviteBorder,
    voiceRoomParticipant: redesignLight.voiceRoomParticipant,
  },
  systemBars: {
    androidNavigationBar: redesignLight.bg,
    statusBar: "dark",
  },
  toast: {
    card: redesignToastLight.card,
    cardBorder: redesignToastLight.cardBorder,
    closeIcon: redesignToastLight.closeIcon,
    subtitle: redesignToastLight.subtitle,
    timerTrack: redesignToastLight.timerTrack,
    title: redesignToastLight.title,
    variants: createToastVariantPalettes(redesignToastLight),
  },
  text: {
    dateSeparator: redesignLight.canonicalTextFaint,
    inverse: mobilePalette.neutral.white,
    visualFaint: redesignLight.canonicalTextFaint,
    visualPlaceholder: redesignLight.canonicalPlaceholder,
    visualSecondary: redesignLight.canonicalTextSecondary,
    muted: redesignLight.textFaint,
    onInverseMuted: "#9BA1C7",
    onInverse: mobilePalette.neutral.white,
    onPrimary: mobilePalette.neutral.white,
    placeholder: redesignLight.placeholder,
    primary: redesignLight.text,
    secondary: redesignLight.textSecondary,
    soft: redesignLight.textFaint,
  },
  typography: mobileTypography,
  voiceRoom: redesignVoiceRoomLight,
} satisfies MobileTheme);

export const darkTheme = deepFreeze({
  accent: darkThemeAccent,
  authFeature: {
    community: redesignAuthDark.featureCommunity,
    encryption: redesignAuthDark.featureEncryption,
    fileShare: redesignAuthDark.featureFileShare,
    realtime: redesignAuthDark.featureRealtime,
    voice: redesignAuthDark.featureVoice,
  },
  authLanguage: {
    backdrop: redesignDark.languageBackdrop,
    closeSurface: redesignDark.languageClose,
    deviceSurface: redesignDark.languageDevice,
    handle: redesignDark.languageHandle,
    radio: redesignDark.languageRadio,
    selectedBorder: redesignDark.primary,
    selectedSurface: redesignDark.selectedSurface,
  },
  authProfile: {
    corporate: {
      badgeBorder: redesignAuthDark.profileCorporateBorder,
      badgeSoft: redesignAuthDark.profileCorporateSoft,
      badgeText: redesignAuthDark.profileCorporateFg,
      icon: redesignAuthDark.profileCorporateFg,
      iconSoft: redesignAuthDark.profileCorporateSoft,
    },
    gamer: {
      badgeBorder: redesignAuthDark.profileGamerBorder,
      badgeSoft: redesignAuthDark.profileGamerSoft,
      badgeText: redesignAuthDark.profileGamerFg,
      icon: redesignAuthDark.profileGamerFg,
      iconSoft: redesignAuthDark.profileGamerSoft,
    },
    personal: {
      badgeBorder: darkThemeAccent.softBorder,
      badgeSoft: darkThemeAccent.soft,
      badgeText: darkThemeAccent.strong,
      icon: darkThemeAccent.default,
      iconSoft: darkThemeAccent.soft,
    },
  },
  avatarTints: redesignAvatarTintsDark,
  border: {
    default: redesignDark.hairline,
    focus: redesignDark.primary,
    focusRing: redesignDark.focusRing,
    imageScrim: MOBILE_IMAGE_SCRIM_BORDER,
    onSurfaceRing: redesignDark.card,
    subtle: redesignDark.border,
    tabBarTop: redesignDark.border,
  },
  control: {
    chevron: redesignDark.controlChevron,
    dashedBorder: redesignDark.controlDashedBorder,
    separatorDot: redesignDark.controlSeparatorDot,
    trackOff: redesignDark.languageHandle,
    trackThumb: mobilePalette.neutral.white,
  },
  dark: true,
  elevation: {
    authBrandMark: {
      ...lightTheme.elevation.authBrandMark,
    },
    authPrimaryAction: {
      ...lightTheme.elevation.authPrimaryAction,
    },
    /** Handoff 1e: `0 24px 60px rgba(0,0,0,.5)`. */
    profileCard: {
      elevation: 24,
      shadowColor: redesignProfileDark.cardShadow,
      shadowOffset: { height: 24, width: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 60,
    },
    bottomSheet: {
      elevation: 0,
      shadowColor: redesignDark.bg,
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    dangerAction: {
      ...lightTheme.elevation.dangerAction,
    },
    headerCard: {
      elevation: 0,
      shadowColor: redesignDark.bg,
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    // Overlay shadows keep §0.3's geometry over black ink; every raised
    // messaging *surface* flattens, which is what 1h draws.
    actionMenu: {
      ...lightTheme.elevation.actionMenu,
      shadowColor: "#000000",
    },
    messageBubbleIn: MESSAGING_FLAT_ELEVATION,
    messageBubbleOut: MESSAGING_FLAT_ELEVATION,
    reactionChip: MESSAGING_FLAT_ELEVATION,
    reactionStrip: {
      ...lightTheme.elevation.reactionStrip,
      shadowColor: "#000000",
    },
    segmentActive: MESSAGING_FLAT_ELEVATION,
    selectedBubble: {
      ...lightTheme.elevation.selectedBubble,
      shadowColor: "#000000",
    },
    sliderThumb: MESSAGING_FLAT_ELEVATION,
    toggleThumb: MESSAGING_FLAT_ELEVATION,
    miniVoiceBar: {
      ...lightTheme.elevation.miniVoiceBar,
    },
    primaryAction: {
      elevation: 6,
      shadowColor: redesignDark.primary,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
    },
    tabBar: {
      elevation: 6,
      shadowColor: "#000000",
      shadowOffset: { height: -6, width: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 22,
    },
    /** Handoff 3c: `0 16px 40px rgba(0,0,0,.45)`. */
    toast: {
      elevation: 16,
      shadowColor: "#000000",
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 40,
    },
  },
  gradients: {
    appBackground: [redesignDark.bg, redesignDark.card],
    authPrimaryAction: [redesignAuthDark.gradientFrom, redesignAuthDark.gradientTo],
    authPrimaryActionMuted: [redesignAuthDark.gradientMutedFrom, redesignAuthDark.gradientMutedTo],
    primaryAction: [redesignDark.primaryWithWhiteText, redesignDark.primaryWithWhiteText],
    softSurface: [redesignDark.card, redesignDark.selectedSurface],
  },
  id: "dark",
  interactive: {
    disabled: mobilePalette.overlay.disabledDark,
    pressed: mobilePalette.overlay.pressedDark,
  },
  layout: mobileLayoutMetrics,
  lightbox: lightboxChrome,
  media: {
    border: mobilePalette.neutral[700],
    surface: mobilePalette.neutral[950],
    surfaceElevated: mobilePalette.neutral[900],
    text: mobilePalette.neutral[50],
    textMuted: mobilePalette.neutral[300],
  },
  mention: {
    background: redesignDark.selectedSurface,
    badge: redesignDark.canonicalMentionBadge,
    selfBackground: redesignDark.selectedBorder,
    selfRowBackground: "#2A2D5599",
    selfRowStripe: redesignDark.primary,
    text: redesignDark.accentText,
  },
  messaging: redesignMessagingDark,
  messageMenu: {
    addReactionBorder: redesignDark.border,
    reactionDetailScrim: redesignDark.sheetOverlay,
    rowHighlight: "#2A2D5566",
    scrim: redesignDark.sheetOverlay,
    separator: redesignDark.hairline,
    shadow: "#000000",
    unreadDivider: "#E5484D",
    unreadDividerLine: "#E5484D55",
  },
  profileCard: redesignProfileDark,
  profileSheet: {
    check: redesignDark.accentText,
    description: redesignDark.canonicalTextFaint,
    divider: redesignDark.hairline,
    handle: redesignDark.languageHandle,
    hint: redesignDark.canonicalTextFaint,
    noteFieldBorder: redesignDark.border,
    noteFieldFocusBorder: redesignDark.primary,
    noteFieldFocusRing: redesignDark.noteFocusRing,
    noteFieldSurface: redesignDark.innerSurface,
    saveAction: redesignDark.accentText,
    saveActionDisabled: redesignDark.canonicalTextFaint,
    selectedBorder: redesignDark.selectedBorder,
    selectedLabel: redesignDark.accentText,
    selectedSurface: redesignDark.selectedSurface,
    statusDndIcon: redesignDark.dangerOnBase,
    statusDndSurface: redesignDark.dangerSurface,
    statusIdleIcon: redesignDark.idleText,
    statusIdleSurface: redesignDark.idleSurface,
    statusInvisibleRing: redesignDark.canonicalTextFaint,
    statusInvisibleSurface: redesignDark.hairline,
    statusOnlineDot: redesignDark.success,
    statusOnlineSurface: redesignDark.successSurface,
  },
  radii: mobileRadii,
  sharedMedia: {
    durationBadge: "rgba(30,34,53,.75)",
    durationBadgeText: mobilePalette.neutral.white,
    tabActiveBorder: redesignDark.selectedBorder,
    tabActiveSurface: redesignDark.selectedSurface,
    tabActiveText: mobilePalette.neutral.white,
    tabBorder: redesignDark.border,
    tabSurface: redesignDark.card,
    tabText: redesignDark.textSecondary,
    tileSurface: redesignDark.hairline,
  },
  sizing: mobileSizing,
  spacing: mobileSpacing,
  status: {
    danger: redesignDark.danger,
    dangerAction: redesignDark.dangerAction,
    dangerOnBase: redesignDark.dangerOnBase,
    dangerOnInverse: redesignLight.canonicalDanger,
    dangerSoft: redesignDark.dangerSurface,
    info: mobilePalette.status.infoDark,
    infoSoft: mobilePalette.status.infoSoftDark,
    onStatus: redesignDark.text,
    plannedSoft: redesignDark.plannedSurface,
    pendingBadge: redesignDark.pendingBadge,
    success: redesignDark.success,
    successOnInverse: redesignDark.success,
    successSoft: redesignDark.successSurface,
    visualText: redesignDark.success,
    successText: redesignDark.success,
    visualWarning: redesignDark.warning,
    visualWarningSoft: redesignDark.warningSurface,
    warning: redesignDark.warning,
    warningSoft: redesignDark.warningSurface,
  },
  surface: {
    base: redesignDark.bg,
    card: redesignDark.card,
    chipSelected: redesignDark.selectedSurface,
    elevated: redesignDark.card,
    inverse: redesignLight.inkSurface,
    inverseControl: "rgba(255,255,255,.12)",
    imageScrim: MOBILE_IMAGE_SCRIM_SURFACE,
    overlay: redesignDark.hairline,
    rail: redesignDark.card,
    scrim: redesignDark.sheetOverlay,
    soft: redesignDark.hairline,
    voiceRoom: redesignDark.voiceRoom,
    voiceRoomControl: redesignDark.voiceRoomControl,
    voiceRoomVideo: redesignDark.voiceRoomVideo,
    voiceRoomVideoGlass: redesignDark.voiceRoomVideoGlass,
    voiceRoomControlBorder: redesignDark.voiceRoomControlBorder,
    voiceRoomInvite: redesignDark.voiceRoomInvite,
    voiceRoomInviteBorder: redesignDark.voiceRoomInviteBorder,
    voiceRoomParticipant: redesignDark.voiceRoomParticipant,
  },
  systemBars: {
    androidNavigationBar: redesignDark.bg,
    statusBar: "light",
  },
  toast: {
    card: redesignToastDark.card,
    cardBorder: redesignToastDark.cardBorder,
    closeIcon: redesignToastDark.closeIcon,
    subtitle: redesignToastDark.subtitle,
    timerTrack: redesignToastDark.timerTrack,
    title: redesignToastDark.title,
    variants: createToastVariantPalettes(redesignToastDark),
  },
  text: {
    dateSeparator: redesignDark.canonicalTextFaint,
    inverse: mobilePalette.neutral.white,
    visualFaint: redesignDark.canonicalTextFaint,
    visualPlaceholder: redesignDark.canonicalTextFaint,
    visualSecondary: redesignDark.textSecondary,
    muted: redesignDark.textFaint,
    onInverseMuted: "#9BA1C7",
    onInverse: mobilePalette.neutral.white,
    onPrimary: mobilePalette.neutral.white,
    placeholder: redesignDark.textFaint,
    primary: redesignDark.text,
    secondary: redesignDark.textSecondary,
    soft: redesignDark.textFaint,
  },
  typography: mobileTypography,
  voiceRoom: redesignVoiceRoomDark,
} satisfies MobileTheme);

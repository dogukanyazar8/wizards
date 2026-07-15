import {
  mobilePalette,
  redesignAccessibleAvatarTintsLight,
  redesignAvatarTintsDark,
  redesignAuthDark,
  redesignAuthLight,
  redesignDark,
  redesignLight,
} from "./palette";
import {
  mobileLayoutMetrics,
  mobileRadii,
  mobileSizing,
  mobileSpacing,
  mobileTypography,
} from "./tokens";

export type MobileThemeId = "dark" | "light";

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

export type MobileAvatarTints = readonly [MobileAvatarTint, ...MobileAvatarTint[]];

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
} as const;

const darkThemeAccent = {
  action: redesignDark.primaryWithWhiteText,
  default: redesignDark.primary,
  soft: redesignDark.selectedSurface,
  softBorder: redesignDark.selectedBorder,
  strong: redesignDark.accentText,
} as const;

export interface MobileTheme {
  readonly accent: {
    /** Accessible filled-action color; use with text.onPrimary. */
    readonly action: string;
    /** Canonical brand accent for non-text controls and decorative use. */
    readonly default: string;
    readonly soft: string;
    readonly softBorder: string;
    /** Accessible accent foreground for normal-size text. */
    readonly strong: string;
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
  readonly border: {
    readonly default: string;
    readonly focus: string;
    /** Translucent external focus ring for auth text fields. */
    readonly focusRing: string;
    /** Surface-matched ring for non-text controls layered on a card. */
    readonly onSurfaceRing: string;
    readonly subtle: string;
  };
  readonly dark: boolean;
  readonly elevation: {
    readonly authBrandMark: MobileThemeElevationStyle;
    readonly authPrimaryAction: MobileThemeElevationStyle;
    readonly bottomSheet: MobileThemeElevationStyle;
    readonly dangerAction: MobileThemeElevationStyle;
    readonly headerCard: MobileThemeElevationStyle;
    readonly miniVoiceBar: MobileThemeElevationStyle;
    readonly primaryAction: MobileThemeElevationStyle;
    readonly tabBar: MobileThemeElevationStyle;
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
  readonly media: {
    readonly border: string;
    readonly surface: string;
    readonly surfaceElevated: string;
    readonly text: string;
    readonly textMuted: string;
  };
  readonly radii: typeof mobileRadii;
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
    /** Canonical success accent for icons, borders and decorative controls. */
    readonly success: string;
    /** Canonical success accent for icons and controls on inverse surfaces. */
    readonly successOnInverse: string;
    readonly successSoft: string;
    /** Accessible success foreground for audited text contexts. */
    readonly successText: string;
    readonly warning: string;
    readonly warningSoft: string;
  };
  readonly surface: {
    readonly base: string;
    readonly card: string;
    readonly elevated: string;
    readonly inverse: string;
    readonly inverseControl: string;
    readonly overlay: string;
    readonly rail: string;
    readonly scrim: string;
    readonly soft: string;
  };
  readonly systemBars: {
    readonly androidNavigationBar: string;
    readonly statusBar: "dark" | "light";
  };
  readonly text: {
    /** Reference-critical date-divider color; do not use for normal body text. */
    readonly dateSeparator: string;
    readonly inverse: string;
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
    onSurfaceRing: mobilePalette.neutral.white,
    subtle: redesignLight.border,
  },
  dark: false,
  elevation: {
    authBrandMark: {
      elevation: 8,
      shadowColor: redesignLight.primary,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
    },
    authPrimaryAction: {
      elevation: 10,
      shadowColor: redesignLight.primary,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.32,
      shadowRadius: 24,
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
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
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
  media: {
    border: mobilePalette.neutral[700],
    surface: mobilePalette.neutral[950],
    surfaceElevated: mobilePalette.neutral[900],
    text: mobilePalette.neutral[50],
    textMuted: mobilePalette.neutral[300],
  },
  radii: mobileRadii,
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
    success: redesignLight.success,
    successOnInverse: redesignDark.success,
    successSoft: redesignLight.successSurface,
    successText: redesignLight.successText,
    warning: mobilePalette.status.warning,
    warningSoft: mobilePalette.status.warningSoft,
  },
  surface: {
    base: redesignLight.bg,
    card: redesignLight.card,
    elevated: redesignLight.card,
    inverse: redesignLight.inkSurface,
    inverseControl: "rgba(255,255,255,.12)",
    overlay: mobilePalette.neutral[100],
    rail: redesignLight.lavender,
    scrim: redesignDark.sheetOverlay,
    soft: redesignLight.bg,
  },
  systemBars: {
    androidNavigationBar: redesignLight.bg,
    statusBar: "dark",
  },
  text: {
    dateSeparator: redesignLight.canonicalTextFaint,
    inverse: mobilePalette.neutral.white,
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
    onSurfaceRing: redesignDark.card,
    subtle: redesignDark.border,
  },
  dark: true,
  elevation: {
    authBrandMark: {
      ...lightTheme.elevation.authBrandMark,
    },
    authPrimaryAction: {
      ...lightTheme.elevation.authPrimaryAction,
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
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 24,
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
  media: {
    border: mobilePalette.neutral[700],
    surface: mobilePalette.neutral[950],
    surfaceElevated: mobilePalette.neutral[900],
    text: mobilePalette.neutral[50],
    textMuted: mobilePalette.neutral[300],
  },
  radii: mobileRadii,
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
    success: redesignDark.success,
    successOnInverse: redesignDark.success,
    successSoft: redesignDark.successSurface,
    successText: redesignDark.success,
    warning: redesignDark.warning,
    warningSoft: redesignDark.warningSurface,
  },
  surface: {
    base: redesignDark.bg,
    card: redesignDark.card,
    elevated: redesignDark.card,
    inverse: redesignLight.inkSurface,
    inverseControl: "rgba(255,255,255,.12)",
    overlay: redesignDark.hairline,
    rail: redesignDark.card,
    scrim: redesignDark.sheetOverlay,
    soft: redesignDark.hairline,
  },
  systemBars: {
    androidNavigationBar: redesignDark.bg,
    statusBar: "light",
  },
  text: {
    dateSeparator: redesignDark.canonicalTextFaint,
    inverse: mobilePalette.neutral.white,
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
} satisfies MobileTheme);

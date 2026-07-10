import {
  mobileRadii,
  mobileSizing,
  mobileSpacing,
  mobileTypography,
} from "./tokens";
import { mobilePalette } from "./palette";

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

export interface MobileTheme {
  readonly accent: {
    readonly default: string;
    readonly soft: string;
    readonly strong: string;
  };
  readonly border: {
    readonly default: string;
    readonly focus: string;
    readonly subtle: string;
  };
  readonly dark: boolean;
  readonly elevation: {
    readonly card: MobileThemeElevationStyle;
    readonly floating: MobileThemeElevationStyle;
    readonly soft: MobileThemeElevationStyle;
  };
  readonly gradients: {
    readonly appBackground: readonly [string, string];
    readonly primaryAction: readonly [string, string];
    readonly softSurface: readonly [string, string];
  };
  readonly id: MobileThemeId;
  readonly interactive: {
    readonly disabled: string;
    readonly pressed: string;
  };
  readonly radii: typeof mobileRadii;
  readonly sizing: typeof mobileSizing;
  readonly spacing: typeof mobileSpacing;
  readonly status: {
    readonly danger: string;
    readonly dangerSoft: string;
    readonly info: string;
    readonly success: string;
    readonly warning: string;
  };
  readonly surface: {
    readonly base: string;
    readonly card: string;
    readonly elevated: string;
    readonly overlay: string;
    readonly rail: string;
    readonly soft: string;
  };
  readonly systemBars: {
    readonly androidNavigationBar: string;
    readonly statusBar: "dark" | "light";
  };
  readonly text: {
    readonly inverse: string;
    readonly muted: string;
    readonly onPrimary: string;
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
  accent: {
    default: mobilePalette.indigo[600],
    soft: mobilePalette.indigo[50],
    strong: mobilePalette.indigo[700],
  },
  border: {
    default: mobilePalette.neutral[500],
    focus: mobilePalette.indigo[500],
    subtle: mobilePalette.neutral[300],
  },
  dark: false,
  elevation: {
    card: {
      elevation: 3,
      shadowColor: mobilePalette.neutral[900],
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
    },
    floating: {
      elevation: 10,
      shadowColor: mobilePalette.neutral[900],
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
    },
    soft: {
      elevation: 4,
      shadowColor: mobilePalette.indigo[600],
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
    },
  },
  gradients: {
    appBackground: [mobilePalette.neutral[50], mobilePalette.indigo[50]],
    primaryAction: [mobilePalette.indigo[600], mobilePalette.violet[600]],
    softSurface: [mobilePalette.neutral.white, mobilePalette.violet[50]],
  },
  id: "light",
  interactive: {
    disabled: mobilePalette.overlay.disabledLight,
    pressed: mobilePalette.overlay.pressedLight,
  },
  radii: mobileRadii,
  sizing: mobileSizing,
  spacing: mobileSpacing,
  status: {
    danger: mobilePalette.status.danger,
    dangerSoft: mobilePalette.status.dangerSoft,
    info: mobilePalette.status.info,
    success: mobilePalette.status.success,
    warning: mobilePalette.status.warning,
  },
  surface: {
    base: mobilePalette.neutral[50],
    card: mobilePalette.neutral.white,
    elevated: mobilePalette.neutral.white,
    overlay: mobilePalette.neutral[100],
    rail: mobilePalette.indigo[50],
    soft: mobilePalette.neutral[100],
  },
  systemBars: {
    androidNavigationBar: mobilePalette.neutral[50],
    statusBar: "dark",
  },
  text: {
    inverse: mobilePalette.neutral.white,
    muted: mobilePalette.neutral[600],
    onPrimary: mobilePalette.neutral.white,
    primary: mobilePalette.neutral[900],
    secondary: mobilePalette.neutral[600],
    soft: mobilePalette.neutral[500],
  },
  typography: mobileTypography,
} satisfies MobileTheme);

export const darkTheme = deepFreeze({
  accent: {
    default: mobilePalette.indigo[400],
    soft: mobilePalette.violet[900],
    strong: mobilePalette.indigo[300],
  },
  border: {
    default: mobilePalette.neutral[500],
    focus: mobilePalette.indigo[400],
    subtle: mobilePalette.neutral[700],
  },
  dark: true,
  elevation: {
    card: {
      elevation: 0,
      shadowColor: mobilePalette.neutral[950],
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    floating: {
      elevation: 0,
      shadowColor: mobilePalette.neutral[950],
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    soft: {
      elevation: 0,
      shadowColor: mobilePalette.neutral[950],
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
  },
  gradients: {
    appBackground: [mobilePalette.neutral[950], mobilePalette.neutral[900]],
    primaryAction: [mobilePalette.indigo[400], mobilePalette.violet[400]],
    softSurface: [mobilePalette.neutral[850], mobilePalette.violet[900]],
  },
  id: "dark",
  interactive: {
    disabled: mobilePalette.overlay.disabledDark,
    pressed: mobilePalette.overlay.pressedDark,
  },
  radii: mobileRadii,
  sizing: mobileSizing,
  spacing: mobileSpacing,
  status: {
    danger: mobilePalette.status.dangerDark,
    dangerSoft: mobilePalette.status.dangerSoftDark,
    info: mobilePalette.status.infoDark,
    success: mobilePalette.status.successDark,
    warning: mobilePalette.status.warningDark,
  },
  surface: {
    base: mobilePalette.neutral[950],
    card: mobilePalette.neutral[900],
    elevated: mobilePalette.neutral[850],
    overlay: mobilePalette.neutral[800],
    rail: mobilePalette.neutral[900],
    soft: mobilePalette.neutral[800],
  },
  systemBars: {
    androidNavigationBar: mobilePalette.neutral[950],
    statusBar: "light",
  },
  text: {
    inverse: mobilePalette.neutral[950],
    muted: mobilePalette.neutral[300],
    onPrimary: mobilePalette.neutral[900],
    primary: mobilePalette.neutral[50],
    secondary: mobilePalette.neutral[200],
    soft: mobilePalette.neutral[400],
  },
  typography: mobileTypography,
} satisfies MobileTheme);

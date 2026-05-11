export interface DotGridThemeValues {
  baseAlpha: number;
  dotColors: number[][];
  glowAlpha: number;
  glowBlurMult: number;
  lineOpacity: number;
  lineRadius: number;
  spotBoost: number;
  spotRadiusBoost: number;
  spotlightRadius: number;
  waveAlpha: number;
}

export const DARK_DOT_GRID_THEME: DotGridThemeValues = {
  baseAlpha: 0.06,
  dotColors: [
    [79, 70, 229],
    [124, 58, 237],
    [129, 140, 248],
    [6, 182, 212],
    [52, 211, 153],
    [244, 114, 182],
  ],
  glowAlpha: 0.5,
  glowBlurMult: 12,
  lineOpacity: 0.35,
  lineRadius: 80,
  spotBoost: 0.8,
  spotRadiusBoost: 6,
  spotlightRadius: 170,
  waveAlpha: 0.12,
};

export const LIGHT_DOT_GRID_THEME: DotGridThemeValues = {
  baseAlpha: 0.1,
  dotColors: [
    [79, 70, 229],
    [124, 58, 237],
    [99, 102, 241],
    [6, 182, 212],
    [16, 185, 129],
    [219, 39, 119],
  ],
  glowAlpha: 0.35,
  glowBlurMult: 8,
  lineOpacity: 0.22,
  lineRadius: 70,
  spotBoost: 0.6,
  spotRadiusBoost: 5,
  spotlightRadius: 150,
  waveAlpha: 0.18,
};

export function cloneDotGridTheme(theme: DotGridThemeValues): DotGridThemeValues {
  return {
    ...theme,
    dotColors: theme.dotColors.map((color) => [...color]),
  };
}

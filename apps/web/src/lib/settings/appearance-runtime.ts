import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";
import { applyTextScaleToDocument, type TextScaleRoot } from "./text-scale";
import { applyMessageFontToDocument, MESSAGE_FONT_OPTIONS } from "@/lib/message-fonts";
import { applyMessageAppearance } from "@/lib/messages/appearance";
import {
  clampChannelSidebarWidth,
  clampMainPanelWidth,
  clampServerRailIconSize,
  clampServerRailWidth,
  MAX_MAIN_PANEL_WIDTH,
  MIN_MAIN_PANEL_WIDTH,
} from "@/lib/appearance";
import type { SettingsPatch } from "./use-setting-value";

export function resetAppearanceLayout(store: {
  setValue(key: string, value: number | boolean): void;
}): void {
  for (const [key, value] of Object.entries({ y1: 74, y2: 44, y3: 252, y4: 100, y5: true })) {
    store.setValue(key, value);
  }
}

export const APPEARANCE_SERVER_ROWS = {
  m1: "messageFont",
  m2: "messageSizePx",
  m3: "interfaceDensity",
  m4: "messageDisplayCompact",
  v1: "inlineAttachmentMedia",
  v2: "linkPreviews",
  v3: "renderEmbeds",
  v4: "renderReactions",
  reduceMotion: "reduceMotion",
  x2: "highContrast",
  x3: "strongFocusRings",
  x4: "uiTextScale",
  y1: "serverRailWidth",
  y2: "serverIconSize",
  y3: "channelSidebarWidth",
  y4: "mainContentWidth",
  y5: "showMemberPanelByDefault",
} as const;

export function mainPanelPercentToWidth(percent: number): number {
  const ratio = (Math.min(100, Math.max(70, percent)) - 70) / 30;
  return clampMainPanelWidth(
    Math.round(MIN_MAIN_PANEL_WIDTH + ratio * (MAX_MAIN_PANEL_WIDTH - MIN_MAIN_PANEL_WIDTH)),
  );
}

export function mainPanelWidthToPercent(width: number): number {
  const ratio =
    (clampMainPanelWidth(width) - MIN_MAIN_PANEL_WIDTH) /
    (MAX_MAIN_PANEL_WIDTH - MIN_MAIN_PANEL_WIDTH);
  return Math.round(70 + ratio * 30);
}

/** Same projection for immediate rendering and the persisted PATCH. */
export function appearancePatchToSettings(patch: SettingsPatch): Partial<UserLayoutSettings> {
  const result: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = APPEARANCE_SERVER_ROWS[key as keyof typeof APPEARANCE_SERVER_ROWS];
    if (!field) throw new Error(`SETTINGS_WRITE_UNSUPPORTED:${key}`);
    switch (key) {
      case "m1":
        result[field] = MESSAGE_FONT_OPTIONS[Number(value)]?.id ?? MESSAGE_FONT_OPTIONS[0]!.id;
        break;
      case "m3":
        result[field] = Number(value) === 1 ? "COMPACT" : "COMFORTABLE";
        break;
      case "y1":
        result[field] = clampServerRailWidth(Number(value));
        break;
      case "y2":
        result[field] = clampServerRailIconSize(Number(value));
        break;
      case "y3":
        result[field] = clampChannelSidebarWidth(Number(value));
        break;
      case "y4":
        result[field] = Math.min(100, Math.max(70, Math.round(Number(value))));
        break;
      default:
        result[field] = value;
    }
  }
  return result;
}

export type AppearanceDocumentRoot = TextScaleRoot & {
  readonly style: { fontSize: string; setProperty?: (name: string, value: string) => void };
};
export const REDUCE_MOTION_ATTRIBUTE = "data-reduce-motion";
export const HIGH_CONTRAST_ATTRIBUTE = "data-high-contrast";
export const FOCUS_RINGS_ATTRIBUTE = "data-strong-focus";

export function applyAppearanceDocumentEffects(
  patch: SettingsPatch,
  root: AppearanceDocumentRoot,
  stepPx: number,
): void {
  if (patch.m1 !== undefined) {
    const font = MESSAGE_FONT_OPTIONS[Number(patch.m1)]?.id;
    if (font) applyMessageFontToDocument(font);
  }
  if (patch.x4 !== undefined) applyTextScaleToDocument(root, Number(patch.x4), stepPx);
  if (patch.reduceMotion !== undefined)
    root.setAttribute(REDUCE_MOTION_ATTRIBUTE, patch.reduceMotion ? "true" : "false");
  if (patch.x2 !== undefined)
    root.setAttribute(HIGH_CONTRAST_ATTRIBUTE, patch.x2 ? "true" : "false");
  if (patch.x3 !== undefined) root.setAttribute(FOCUS_RINGS_ATTRIBUTE, patch.x3 ? "true" : "false");
}

export function applyPersistedAppearanceDocument(
  settings: UserLayoutSettings,
  root: HTMLElement,
  stepPx: number,
): void {
  applyMessageAppearance(root, settings);
  applyAppearanceDocumentEffects(
    {
      x4: settings.uiTextScale,
      x2: settings.highContrast,
      x3: settings.strongFocusRings,
      reduceMotion: settings.reduceMotion,
    },
    root,
    stepPx,
  );
}

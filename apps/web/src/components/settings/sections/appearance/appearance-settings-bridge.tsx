"use client";

import React, { useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  useReportSettingsStore,
  useSettingsLadderOverrides,
} from "@/components/settings/settings-ladder";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  useSettingsRowRuntimeState,
  type SettingsPatch,
  type SettingsRowRuntime,
} from "@/lib/settings/use-setting-value";
import { APPEARANCE_UNAVAILABLE_ROWS } from "@/lib/settings/availability";
import {
  applyTextScaleToDocument,
  DEFAULT_TEXT_SCALE_PERCENT,
  type TextScaleRoot,
} from "@/lib/settings/text-scale";
import { selectUiScale } from "@/lib/home/scale";
import { fetchLayoutSettings, patchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";
import {
  applyMessageFontToDocument,
  MESSAGE_FONT_OPTIONS,
  normalizeMessageFontId,
} from "@/lib/message-fonts";
import {
  clampChannelSidebarWidth,
  clampMainPanelWidth,
  clampServerRailIconSize,
  clampServerRailWidth,
  MAX_MAIN_PANEL_WIDTH,
  MIN_MAIN_PANEL_WIDTH,
} from "@/lib/appearance";
import { useAppStore } from "@/lib/store";

/**
 * Görünüm bölümünün **taşıma yolu** — Ş6 §2.1'in `write` dikişi.
 *
 * Üç hedef var ve her satır tam olarak birine gider:
 *
 * 1. **Sunucu** (`PATCH /api/v1/users/me/settings`) — cihazlar arası taşınması gereken dört alan:
 *    `messageFont`, `interfaceDensity`, `serverRailWidth`, `channelSidebarWidth`. Bugünkü
 *    `PatchSettingsSchema` tam olarak bunları kabul ediyor; şemaya olmayan alan **göndermiyoruz**.
 * 2. **Uygulama kutusu** (`useAppStore`, persist) — kabuğun ölçüleri: ray ikonu, ana içerik
 *    genişliği, üye paneli.
 * 3. **Belge** — tema dışındaki görsel etkiler: mesaj fontu değişkeni, yazı boyutu çarpanı,
 *    hareket ve kontrast nitelikleri.
 *
 * Kalıcı alanı olup gerçek consumer'ı bulunmayan satırlar `APPEARANCE_UNAVAILABLE_ROWS` ile
 * etkileşime kapanır. Veritabanına yazmak tek başına işlev sayılmaz.
 */

/**
 * Sunucuya giden satırlar — `PatchSettingsSchema`'nın kabul ettiği alanlar.
 *
 * F2'den önce burada yalnız dört giriş vardı ve kalan yirmi bir kontrol yazma yolunda sessizce
 * düşüyordu; kutu yazmayı başarılı sayıp `Kaydedildi` gösteriyordu. Kolonların on dokuzu
 * `UserSettings`'te zaten mevcuttu — eksik olan tek şey PATCH şemasıydı.
 *
 * Değeri doğrudan geçen satırlar burada; dizinden değere çevrilmesi gerekenler (`m1`, `m3`,
 * `v6`) ve kabuğun kutusuna da yazılanlar (`y1`…`y5`) `writeAppearancePatch` içindeki kendi
 * dallarında durur.
 */
export const APPEARANCE_SERVER_ROWS = {
  m1: "messageFont",
  m2: "messageSizePx",
  m3: "interfaceDensity",
  m4: "messageDisplayCompact",
  v1: "inlineAttachmentMedia",
  v2: "linkPreviews",
  v3: "renderEmbeds",
  v4: "renderReactions",
  v5: "animateEmoji",
  v6: "animateStickers",
  v8: "enableTTS",
  reduceMotion: "reduceMotion",
  x2: "highContrast",
  x3: "strongFocusRings",
  x4: "uiTextScale",
  x6: "screenReaderDescriptions",
  x7: "followSystemA11y",
  n1: "appIcon",
  y1: "serverRailWidth",
  y2: "serverIconSize",
  y3: "channelSidebarWidth",
  y4: "mainContentWidth",
  y5: "showMemberPanelByDefault",
} as const;

/**
 * Kalıcılık tek başına işlev değildir. Bu tercihler veritabanına yazılıyor olsa da Web/Tauri
 * çalışma zamanında değerlerini okuyan bir mesaj/medya/TTS consumer'ı henüz yok. Kullanıcıya
 * başarılı kayıt gösterip görünür davranışı değiştirmemek yerine kontroller kapalıdır.
 */
/** `v6` — `AnimateStickers` enum'unun referanstaki sırası: Her zaman · Etkileşim · Asla. */
export const STICKER_ANIMATION_BY_INDEX = ["ALWAYS", "INTERACTION", "NEVER"] as const;

/** `n1` — uygulama simgesi kimlikleri, referanstaki sırayla (Whispr · Wave 5…0). */
export const APP_ICON_BY_INDEX = [
  "whispr",
  "wave-5",
  "wave-4",
  "wave-3",
  "wave-2",
  "wave-1",
  "wave-0",
] as const;

export type AppearanceAppSnapshot = {
  readonly channelSidebarWidth: number;
  readonly mainPanelWidth: number;
  readonly memberPanelCollapsed: boolean;
  readonly messageFont: string;
  readonly serverRailIconSize: number;
  readonly serverRailWidth: number;
};

/** `y4` yüzdesi ile piksel genişliği arasındaki **tek** dönüşüm. */
export function mainPanelPercentToWidth(percent: number): number {
  const span = MAX_MAIN_PANEL_WIDTH - MIN_MAIN_PANEL_WIDTH;
  const ratio = (Math.min(100, Math.max(70, percent)) - 70) / 30;

  return clampMainPanelWidth(Math.round(MIN_MAIN_PANEL_WIDTH + ratio * span));
}

export function mainPanelWidthToPercent(width: number): number {
  const span = MAX_MAIN_PANEL_WIDTH - MIN_MAIN_PANEL_WIDTH;
  const ratio = (clampMainPanelWidth(width) - MIN_MAIN_PANEL_WIDTH) / span;

  return Math.round(70 + ratio * 30);
}

export function readAppearanceSettingsValues(app: AppearanceAppSnapshot): SettingsPatch {
  return {
    m1: Math.max(
      0,
      MESSAGE_FONT_OPTIONS.findIndex(
        (option) => option.id === normalizeMessageFontId(app.messageFont),
      ),
    ),
    y1: app.serverRailWidth,
    y2: app.serverRailIconSize,
    y3: app.channelSidebarWidth,
    y4: mainPanelWidthToPercent(app.mainPanelWidth),
    y5: !app.memberPanelCollapsed,
  };
}

export type AppearanceDocumentRoot = TextScaleRoot & {
  setAttribute(name: string, value: string): void;
  readonly style: { fontSize: string; setProperty?: (name: string, value: string) => void };
};

/** Belge nitelikleri — CSS bunları okur; JavaScript ikinci bir yerde saklamaz. */
export const REDUCE_MOTION_ATTRIBUTE = "data-reduce-motion";
export const HIGH_CONTRAST_ATTRIBUTE = "data-high-contrast";
export const FOCUS_RINGS_ATTRIBUTE = "data-strong-focus";

/**
 * Yamanın belge tarafı.
 *
 * Saf: kök bir arayüz, ölçek adımı bir argüman. `x4` çarpanı `applyTextScaleToDocument` ile
 * yazılır ve ölçek adımının **üstüne** biner (Ş8 §B.9) — bu fonksiyon adım hesaplamaz, verileni
 * kullanır.
 */
export function applyAppearanceDocumentEffects(
  patch: SettingsPatch,
  root: AppearanceDocumentRoot,
  stepPx: number,
): void {
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case "m1": {
        const fontId = MESSAGE_FONT_OPTIONS[Number(value)]?.id;

        if (fontId) {
          applyMessageFontToDocument(fontId);
        }

        break;
      }

      case "x4":
        applyTextScaleToDocument(root, Number(value), stepPx);
        break;

      case "reduceMotion":
        root.setAttribute(REDUCE_MOTION_ATTRIBUTE, value ? "true" : "false");
        break;

      case "x2":
        root.setAttribute(HIGH_CONTRAST_ATTRIBUTE, value ? "true" : "false");
        break;

      case "x3":
        root.setAttribute(FOCUS_RINGS_ATTRIBUTE, value ? "true" : "false");
        break;

      default:
        break;
    }
  }
}

export type SystemAccessibilityPreferences = {
  readonly prefersContrast: boolean;
  readonly prefersReducedMotion: boolean;
};

/**
 * `Sistem erişilebilirlik tercihlerini takip et` (`x7`) açıkken sistem **kazanır**.
 *
 * Dönen sözlük satır anahtarına göre yazılır; boş dönerse kullanıcının seçimi geçerlidir.
 * Kilitleme kararı da buradan okunur: `x7` açıkken `x1`/`v7` ve `x2` satırları `disabled`.
 */
export function resolveSystemAccessibilityOverrides(
  followSystem: boolean,
  system: SystemAccessibilityPreferences,
): SettingsPatch {
  if (!followSystem) {
    return {};
  }

  return { reduceMotion: system.prefersReducedMotion, x2: system.prefersContrast };
}

export type AppearanceSettingsBridge = {
  readonly runtime: SettingsRowRuntime;
  readonly store: SettingsValueStore;
};

function readAppSnapshot(): AppearanceAppSnapshot {
  const state = useAppStore.getState();

  return {
    channelSidebarWidth: state.channelSidebarWidth,
    mainPanelWidth: state.mainPanelWidth,
    memberPanelCollapsed: state.memberPanelCollapsed,
    messageFont: state.messageFont,
    serverRailIconSize: state.serverRailIconSize,
    serverRailWidth: state.serverRailWidth,
  };
}

/** Yamayı üç hedefe dağıtır; hangi anahtarın nereye gittiğini **yalnız** bu fonksiyon bilir. */
async function writeAppearancePatch(patch: SettingsPatch): Promise<void> {
  const app = useAppStore.getState();
  const server: Record<string, boolean | number | string> = {};

  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case "m1": {
        const fontId = MESSAGE_FONT_OPTIONS[Number(value)]?.id;

        if (fontId) {
          app.setMessageFont(fontId);
          server[APPEARANCE_SERVER_ROWS.m1] = fontId;
        }

        break;
      }

      case "m3":
        server[APPEARANCE_SERVER_ROWS.m3] = Number(value) === 1 ? "COMPACT" : "COMFORTABLE";
        break;

      case "y1": {
        const width = clampServerRailWidth(Number(value));
        app.setServerRailWidth(width);
        server[APPEARANCE_SERVER_ROWS.y1] = width;
        break;
      }

      case "y2":
        app.setServerRailIconSize(clampServerRailIconSize(Number(value)));
        break;

      case "y3": {
        const width = clampChannelSidebarWidth(Number(value));
        app.setChannelSidebarWidth(width);
        server[APPEARANCE_SERVER_ROWS.y3] = width;
        break;
      }

      case "y4": {
        const percent = Math.min(100, Math.max(70, Math.round(Number(value))));
        app.setMainPanelWidth(mainPanelPercentToWidth(percent));
        server[APPEARANCE_SERVER_ROWS.y4] = percent;
        break;
      }

      case "y5":
        app.setMemberPanelCollapsed(!value);
        server[APPEARANCE_SERVER_ROWS.y5] = value === true;
        break;

      case "v6": {
        const mode = STICKER_ANIMATION_BY_INDEX[Number(value)];

        if (mode) {
          server[APPEARANCE_SERVER_ROWS.v6] = mode;
        }

        break;
      }

      case "n1": {
        const icon = APP_ICON_BY_INDEX[Number(value)];

        if (icon) {
          server[APPEARANCE_SERVER_ROWS.n1] = icon;
        }

        break;
      }

      // Kalan on bir satır değeri olduğu gibi taşır; dizin çevirisi yok.
      case "m2":
      case "m4":
      case "v1":
      case "v2":
      case "v3":
      case "v4":
      case "v5":
      case "v8":
      case "reduceMotion":
      case "x2":
      case "x3":
      case "x4":
      case "x6":
      case "x7":
        server[APPEARANCE_SERVER_ROWS[key]] = typeof value === "boolean" ? value : Number(value);
        break;

      default:
        // F2 — sessiz `break` yasak. Yazılmayan bir anahtarda kutu yazmayı başarılı sayar ve
        // başlık `Kaydedildi` çizer; sayfa yenilenince değer kaybolur (tuzak #14).
        throw new Error(`SETTINGS_WRITE_UNSUPPORTED:${key}`);
    }
  }

  if (Object.keys(server).length > 0) {
    await patchLayoutSettings(server);
  }
}

/**
 * Beş sekme **tek** kutuyu paylaşır.
 *
 * Sekme başına bir kutu kurmak ilk bakışta daha temiz görünüyor, ama `Yazı boyutu`'nu %130 yapıp
 * `Medya`ya geçen kullanıcı geri döndüğünde %100 bulurdu: kutu sökülür, değer ölür ve belge
 * etkisi de geri alınır. Kutu modül seviyesinde bir kez kuruluyor ve pencere kapansa da yaşıyor.
 *
 * Kutunun açılış değeri uygulama kutusundan gelir; sunucunun bildiği değerler
 * `applyRemote` ile üstüne yazılır (F2). Sayfa yenilendiğinde tercih artık kaybolmuyor.
 */
let sharedAppearanceStore: SettingsValueStore | null = null;

function getAppearanceStore(): SettingsValueStore {
  sharedAppearanceStore ??= new SettingsValueStore({
    values: readAppearanceSettingsValues(readAppSnapshot()),
    write: writeAppearancePatch,
  });

  return sharedAppearanceStore;
}

/**
 * Sunucu yanıtını satır değerlerine çevirir — F2.
 *
 * `readAppearanceSettingsValues` uygulama kutusunu okur ve kabuğun ölçülerini bilir; bu ikizi
 * `UserSettings` yanıtını okur ve kalan yirmi bir satırı doldurur. İkisi ayrı çünkü kaynakları
 * ayrı: biri yeniden yüklemede localStorage'dan, diğeri sunucudan gelir.
 */
export function readAppearanceServerValues(settings: UserLayoutSettings): SettingsPatch {
  const stickerIndex = STICKER_ANIMATION_BY_INDEX.indexOf(
    settings.animateStickers as (typeof STICKER_ANIMATION_BY_INDEX)[number],
  );
  const iconIndex = APP_ICON_BY_INDEX.indexOf(
    settings.appIcon as (typeof APP_ICON_BY_INDEX)[number],
  );

  return {
    m2: settings.messageSizePx,
    m4: settings.messageDisplayCompact,
    n1: iconIndex < 0 ? 0 : iconIndex,
    reduceMotion: settings.reduceMotion,
    v1: settings.inlineAttachmentMedia,
    v2: settings.linkPreviews,
    v3: settings.renderEmbeds,
    v4: settings.renderReactions,
    v5: settings.animateEmoji,
    v6: stickerIndex < 0 ? 1 : stickerIndex,
    v8: settings.enableTTS,
    x2: settings.highContrast,
    x3: settings.strongFocusRings,
    x4: settings.uiTextScale,
    x6: settings.screenReaderDescriptions,
    x7: settings.followSystemA11y,
    y2: settings.serverIconSize,
    y4: settings.mainContentWidth,
    y5: settings.showMemberPanelByDefault,
  };
}

export function useAppearanceSettingsBridge(
  overrides: Partial<SettingsRowRuntime> = {},
): AppearanceSettingsBridge {
  const store = useMemo(() => getAppearanceStore(), []);

  // F1 — kutunun durumu kabuğun başlığına ve kirli şeridine buradan gider.
  useReportSettingsStore(store);

  // F2 — sunucunun bildiği değerler kutuya iner. `applyRemote` uçuşta olan anahtarı atlar, yani
  // kullanıcının az önceki dokunuşu geri alınmaz.
  const layoutQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    staleTime: 60_000,
  });

  const layoutSettings = layoutQuery.data;

  useEffect(() => {
    if (!layoutSettings) return;

    store.applyRemote(readAppearanceServerValues(layoutSettings));
  }, [layoutSettings, store]);

  // Sökülürken bekleyen yama gönderilir; kutu **kapatılmaz** (sekme değişimi onu öldürmemeli).
  useEffect(() => () => store.flush(), [store]);

  // Belge etkileri kutunun **yanında** koşar: kutu değerin sahibidir, belge onun görünür yüzü.
  useEffect(() => {
    const root = document.documentElement;
    const step = selectUiScale({ height: window.innerHeight, width: window.innerWidth });

    const sync = () => {
      applyAppearanceDocumentEffects(
        {
          m1: Number(store.getValue("m1") ?? 0),
          reduceMotion: Boolean(store.getValue("reduceMotion")),
          x2: Boolean(store.getValue("x2")),
          x3: Boolean(store.getValue("x3")),
          x4: Number(store.getValue("x4") ?? DEFAULT_TEXT_SCALE_PERCENT),
        },
        root,
        step.rootFontSizePx,
      );
    };

    sync();

    return store.subscribe(sync);
  }, [store]);

  const ladder = useSettingsLadderOverrides();

  const runtime = useSettingsRowRuntimeState({
    ...ladder,
    ...overrides,
    disabledRows: { ...APPEARANCE_UNAVAILABLE_ROWS, ...overrides.disabledRows },
  });

  return { runtime, store };
}

export function AppearanceSettingsProvider({
  bridge,
  children,
}: {
  readonly bridge: AppearanceSettingsBridge;
  readonly children: ReactNode;
}) {
  return (
    <SettingsValueContext.Provider value={bridge.store}>
      <SettingsRowRuntimeContext.Provider value={bridge.runtime}>
        {children}
      </SettingsRowRuntimeContext.Provider>
    </SettingsValueContext.Provider>
  );
}

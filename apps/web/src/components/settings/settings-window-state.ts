/**
 * Ayarlar penceresinin **tek** indirgeyicisi — Ş5 §8, tuzak #12.
 *
 * Merdiven burada tanımlanır, çağrı yerlerinde tekrarlanmaz: aynı anda tek açılır menü, tek
 * riskli blok. Üç ayrı `useState` yazıldığında "biri açılırken diğeri kapanır" kuralı her
 * çağrı yerinde tekrar edilmek zorunda kalır ve bir yerde unutulur.
 *
 * Adres **sahiptir**, indirgeyici **aynadır**: bölüm ve sekme adres çubuğundan gelir
 * (`syncRoute`), indirgeyici tek başına adresin arkasından gitmez. `selectSection` ve
 * `selectTab` iyimser yazımlardır — çağıran aynı anda `router.push`/`replace` eder ve adres
 * geri dönerse `syncRoute` durumu düzeltir.
 *
 * Pencerenin **kapalı** olması burada bir durum değil: pencere bir rotadır. `Esc` merdiveninin
 * son basamağı bu yüzden `resolveSettingsEscape` ile dışarı bildirilir, indirgeyicide
 * temsil edilmez.
 */

import { SETTINGS_DIRTY_PROFILE_KEYS } from "@/lib/settings/metrics";
import {
  DEFAULT_SETTINGS_ROUTE,
  SETTINGS_TABS_BY_SECTION,
  type SettingsSection,
  type SettingsTab,
} from "@/lib/settings/navigation";
import type { SettingsRiskyBlockKey } from "@/lib/settings/tree";

/**
 * `idle` ilk boyadır: hiçbir tercih dokunulmamışken "Kaydedildi" yazmak yalan olurdu.
 * `saving → saved` geçişi **gerçek yanıt** üzerine kurulur; referanstaki 850 ms sabit gecikme
 * taklit edilmez (tuzak #14).
 */
export type SettingsSaveState = "error" | "idle" | "saved" | "saving";

export type SettingsWindowState = {
  readonly dirty: boolean;
  /** Aynı anda tek açılır menü. Değer satırın anahtarıdır (`nt3`, `ps1` …). */
  readonly openSelect: string | null;
  /** Aynı anda tek riskli blok (parola · 2FA · hesap silme). */
  readonly openRisky: SettingsRiskyBlockKey | null;
  readonly query: string;
  readonly save: SettingsSaveState;
  readonly section: SettingsSection;
  readonly tab: SettingsTab;
};

export function resolveSettingsNavigationMethod(mode: "modal" | "page"): "push" | "replace" {
  return mode === "modal" ? "replace" : "push";
}

export type SettingsWindowAction =
  | { readonly key: SettingsRiskyBlockKey; readonly type: "toggleRisky" }
  | { readonly key: string; readonly type: "toggleSelect" }
  | { readonly key: string; readonly type: "touch" }
  | { readonly query: string; readonly type: "search" }
  | { readonly save: SettingsSaveState; readonly type: "save" }
  | { readonly section: SettingsSection; readonly tab: SettingsTab; readonly type: "syncRoute" }
  | { readonly section: SettingsSection; readonly type: "selectSection" }
  | { readonly tab: SettingsTab; readonly type: "selectTab" }
  | { readonly type: "closeRisky" }
  | { readonly type: "closeSelect" }
  | { readonly type: "escape" }
  | { readonly type: "resetDirty" };

/** `Esc`'in kapatacağı basamak — menü, sonra riskli blok, sonra pencerenin kendisi. */
export type SettingsEscapeTarget = "risky" | "select" | "window";

const DIRTY_KEYS: ReadonlySet<string> = new Set(SETTINGS_DIRTY_PROFILE_KEYS);

/**
 * Sapma #5 — kirli alan listesi **açıkça** sayılır. Referansın `k.charAt(0) === 'p'` sezgisi
 * Ses işleme satırlarını (`p1`…`p9`) de profil sayıyor ve Ses ve Video sekmesinde kaydet
 * şeridi çıkarıyordu. Önek sezgisi kullanılmaz.
 */
export function isSettingsDirtyKey(key: string): boolean {
  return DIRTY_KEYS.has(key);
}

export function createSettingsWindowState(
  route: { section: SettingsSection; tab: SettingsTab } = DEFAULT_SETTINGS_ROUTE,
): SettingsWindowState {
  return {
    dirty: false,
    openRisky: null,
    openSelect: null,
    query: "",
    save: "idle",
    section: route.section,
    tab: route.tab,
  };
}

/**
 * `Esc` merdiveni. Pencere yalnız iki geçici katman da kapalıyken kapanır — açık bir menünün
 * üstünde `Esc`'e basan kullanıcı menüyü kapatmak ister, pencereyi değil.
 */
export function resolveSettingsEscape(state: SettingsWindowState): SettingsEscapeTarget {
  if (state.openSelect) return "select";
  if (state.openRisky) return "risky";

  return "window";
}

/** Bölüm değişiminde sekme bölümün **ilk** sekmesine döner (Ş5 §8). */
function firstTabOf(section: SettingsSection): SettingsTab {
  return SETTINGS_TABS_BY_SECTION[section][0];
}

export function settingsWindowReducer(
  state: SettingsWindowState,
  action: SettingsWindowAction,
): SettingsWindowState {
  switch (action.type) {
    case "syncRoute": {
      if (action.section === state.section && action.tab === state.tab) {
        return state;
      }

      // Adres dışarıdan da değişebilir (geri tuşu, paylaşılan bağlantı). Geçici katmanlar o
      // zaman da kapanmalı: geri tuşuyla gelen kullanıcı bir önceki sekmenin açık menüsünü
      // devralmamalı.
      return {
        ...state,
        openRisky: null,
        openSelect: null,
        section: action.section,
        tab: action.tab,
      };
    }

    case "selectSection": {
      if (action.section === state.section) {
        return { ...state, openRisky: null, openSelect: null };
      }

      return {
        ...state,
        openRisky: null,
        openSelect: null,
        section: action.section,
        tab: firstTabOf(action.section),
      };
    }

    case "selectTab": {
      if (action.tab === state.tab) {
        return { ...state, openRisky: null, openSelect: null };
      }

      return { ...state, openRisky: null, openSelect: null, tab: action.tab };
    }

    case "search": {
      if (action.query === state.query) return state;

      // Arama görünümü içeriğin yerine geçer; altındaki menü görünmez olurdu ama açık kalırdı.
      return { ...state, openSelect: null, query: action.query };
    }

    case "toggleSelect": {
      const next = state.openSelect === action.key ? null : action.key;

      return next === state.openSelect ? state : { ...state, openSelect: next };
    }

    case "closeSelect":
      return state.openSelect === null ? state : { ...state, openSelect: null };

    case "toggleRisky": {
      const next = state.openRisky === action.key ? null : action.key;

      if (next === state.openRisky) return state;

      // Riskli blok satırın içinde açılır ve düzeni büyütür; üstünde asılı kalan bir menü
      // artık başka bir satırın hizasında dururdu.
      return { ...state, openRisky: next, openSelect: null };
    }

    case "closeRisky":
      return state.openRisky === null ? state : { ...state, openRisky: null };

    case "escape": {
      const target = resolveSettingsEscape(state);

      if (target === "select") return { ...state, openSelect: null };
      if (target === "risky") return { ...state, openRisky: null };

      // Son basamak pencerenin kendisi; onu rota kapatır, indirgeyici değil.
      return state;
    }

    case "save":
      return action.save === state.save ? state : { ...state, save: action.save };

    case "touch":
      return !state.dirty && isSettingsDirtyKey(action.key) ? { ...state, dirty: true } : state;

    case "resetDirty":
      return state.dirty ? { ...state, dirty: false } : state;

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

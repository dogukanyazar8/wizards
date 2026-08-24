/**
 * Mesaj listesinin yoğunluk köprüsü ve ölçek adımı başına içerik yoğunluğu.
 *
 * İki ayrı eksen, iki ayrı kaynak — karıştırılmamalı:
 *
 *   1. **Yoğunluk tercihi** (`InterfaceDensity`, Kompakt / Rahat). Kullanıcının ayarı. SPEC'in
 *      `--m-pad` / `--m-gap` / `--act` değişkenlerini bu tercihten türetiriz; ikinci bir yoğunluk
 *      kaynağı üretmeyiz.
 *   2. **Ölçek adımı** (`UiScaleValue`, ×1 … ×2). Ekranın boyu. Artan yükseklik boşlukla değil
 *      **içerikle** dolar (SPEC-ANA-SAYFA §8.3): aynı kaynak daha fazla satır gösterir.
 *
 * `MESSAGES_DENSITY_BY_SCALE` sorgu `limit`'lerinin **tek kaynağıdır**. İstemcide ikinci bir
 * kırpma yapılmaz; veri yetmezse listenin kısmi hâli geçerlidir, boşluk doldurmak için sahte
 * satır üretilmez.
 */

import type { InterfaceDensity } from "@wizards/types";
import type { UiScaleValue } from "@/lib/home/scale";

/**
 * SPEC §1'in yoğunluk değişkenleri.
 *
 * `rowActionsAlwaysVisible` SPEC'teki `--act`'tir. İki yoğunlukta da `false`:
 * satır eylemleri yalnız hover'da ve klavye odağında görünür. Kompakt kipte
 * sabit şeritler komşu mesajların üstüne biniyordu; yoğunluk yalnız boşluğu
 * değiştirir, eylem görünürlüğünü değil.
 */
export interface MessageDensityVariables {
  /** `--m-pad` — mesaj satırının dikey iç boşluğu. */
  readonly rowPaddingY: number;
  /** `--m-gap` — iki mesaj arası boşluk. */
  readonly rowGap: number;
  /** `--act` — `1` her zaman görünür, `0` yalnız hover/odak. */
  readonly rowActionsAlwaysVisible: boolean;
}

const DENSITY_VARIABLES: Readonly<Record<InterfaceDensity, MessageDensityVariables>> =
  Object.freeze({
    COMFORTABLE: Object.freeze({ rowGap: 20, rowActionsAlwaysVisible: false, rowPaddingY: 10 }),
    COMPACT: Object.freeze({ rowGap: 11, rowActionsAlwaysVisible: false, rowPaddingY: 5 }),
  });

export function selectMessageDensityVariables(density: InterfaceDensity): MessageDensityVariables {
  return DENSITY_VARIABLES[density];
}

/**
 * Ölçek adımı başına görünen satır sayısı.
 *
 * `railRows` ve `friendRows` **kaydırmasız** görünen satır sayısıdır; iskelet de bu kadar satır
 * çizer. `messagePage` ve `searchResults` sorgu sayfası uzunluğudur.
 */
export interface MessagesDensity {
  /** Sohbet rayının iskeletindeki ve ilk ekranındaki satır sayısı. */
  readonly railRows: number;
  /** Arkadaşlar listesinin iskeletindeki satır sayısı. */
  readonly friendRows: number;
  /** Mesaj listesinin ilk sayfası. */
  readonly messagePage: number;
  /** Arama panelinin ilk sayfası. */
  readonly searchResults: number;
}

export const MESSAGES_DENSITY_BY_SCALE: Readonly<Record<UiScaleValue, MessagesDensity>> =
  Object.freeze({
    1: Object.freeze({ friendRows: 9, messagePage: 30, railRows: 9, searchResults: 3 }),
    1.15: Object.freeze({ friendRows: 11, messagePage: 30, railRows: 11, searchResults: 4 }),
    1.5: Object.freeze({ friendRows: 14, messagePage: 40, railRows: 14, searchResults: 6 }),
    2: Object.freeze({ friendRows: 19, messagePage: 50, railRows: 19, searchResults: 8 }),
  });

export function selectMessagesDensity(scale: UiScaleValue): MessagesDensity {
  return MESSAGES_DENSITY_BY_SCALE[scale];
}

import type { UiScaleValue } from "./scale";

/**
 * Ölçek adımı başına içerik yoğunluğu — SPEC-ANA-SAYFA §8.3, `05-faz4-anasayfa-izgara-kartlar.md` §6.
 *
 * Ekran büyüdükçe artan yükseklik boşlukla değil **içerikle** dolar: aynı kaynak daha fazla satır
 * gösterir. Bu tablo o sayıların **tek kaynağıdır** — sorgu `limit`'leri buradan okunur, istemcide
 * ikinci bir kırpma yapılmaz. Veri yetmezse kartın kısmi hâli geçerlidir; boşluk doldurmak için
 * sahte satır üretilmez.
 *
 * "Durumun" kartı tabloda yok: içeriği sabittir, artan alan çip ızgarası ile ilerleme çubuğu
 * arasındaki boşluğa gider (SPEC §8.3 son paragraf).
 */
export type HomeDensity = {
  /** "Yanıt bekliyor" istek satırı sayısı. */
  readonly awaiting: number;
  /** "Arkadaşlar" şeridindeki kart sayısı. */
  readonly friends: number;
  /** "Şu an canlı" oda kartı sayısı. */
  readonly live: number;
  /** "Kaldığın yer" satır sayısı. */
  readonly recent: number;
  /** "Sıradaki" kartının alt etkinlik listesi uzunluğu. */
  readonly upcoming: number;
};

export const HOME_DENSITY_BY_SCALE: Readonly<Record<UiScaleValue, HomeDensity>> = {
  1: { awaiting: 4, friends: 6, live: 2, recent: 4, upcoming: 3 },
  1.15: { awaiting: 5, friends: 7, live: 2, recent: 5, upcoming: 3 },
  1.5: { awaiting: 6, friends: 8, live: 3, recent: 6, upcoming: 4 },
  2: { awaiting: 7, friends: 10, live: 3, recent: 7, upcoming: 5 },
};

export function selectHomeDensity(scale: UiScaleValue): HomeDensity {
  return HOME_DENSITY_BY_SCALE[scale];
}

import { EVENTS_DENSITY } from "@/lib/events/metrics";
import type { UiScaleValue } from "@/lib/home/scale";

/**
 * Ölçek adımı başına içerik yoğunluğu — PROMPT §6, `lib/home/density.ts` dili.
 *
 * Ekran büyüdükçe artan yükseklik boşlukla değil **içerikle** dolar: aynı kaynak daha fazla
 * satır gösterir. Sayılar Ş0.3'te donan ölçü sözlüğünden (`EVENTS_DENSITY`) okunur; burada
 * ikinci bir tablo tutulsaydı ikisi bir gün ayrışırdı.
 *
 * `gridPageSize` **sorgunun** limitidir, istemcide ikinci bir kırpma değil. Veri yetmezse
 * ızgaranın kısmi hâli geçerlidir; boşluk doldurmak için sahte kart üretilmez.
 */
export type EventsDensity = {
  /** Sağ ajanda rayındaki "Bugün" satır sayısı. */
  readonly agendaRows: number;
  /** Aynı raydaki "Katılacağım" satır sayısı. */
  readonly goingRows: number;
  /** Bir ızgara sayfasının tavanı; `GET /api/v1/events` `limit` değeri. */
  readonly gridPageSize: number;
};

export const EVENTS_DENSITY_BY_SCALE: Readonly<Record<UiScaleValue, EventsDensity>> = {
  1: EVENTS_DENSITY[1],
  1.15: EVENTS_DENSITY[1.15],
  1.5: EVENTS_DENSITY[1.5],
  2: EVENTS_DENSITY[2],
};

export function selectEventsDensity(scale: UiScaleValue): EventsDensity {
  return EVENTS_DENSITY_BY_SCALE[scale];
}

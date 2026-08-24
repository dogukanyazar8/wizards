/**
 * Arama panelinin tarih aralığı — SPEC-MESAJLAR §6.2.
 *
 * Saf: `Date.now()` yok, `Intl` yok. Girdi iki `YYYY-MM-DD` dizesi (tarayıcının
 * `<input type="date">` alanının verdiği biçim), çıktı ucun beklediği iki ISO
 * damgası.
 *
 * **Gün sınırları burada genişletiliyor.** Kullanıcı `10 Ağustos – 10 Ağustos`
 * seçtiğinde o günün tamamını kastediyor; iki tarafı da gece yarısına
 * sabitlemek sıfır uzunlukta bir aralık verir ve arama hiçbir şey bulmaz.
 * Başlangıç günün başına, bitiş **ertesi günün** başına çekiliyor.
 *
 * Zaman dilimi bilinçli olarak **UTC**: uç `createdAt`'i UTC saklıyor ve
 * istemcinin yerel dilimine göre kaydırmak, iki farklı cihazda aynı aralığın
 * farklı sonuç vermesi demek olurdu. Kenar günlerde birkaç saatlik sapma,
 * "aynı bağlantı bende başka sonuç veriyor" şikâyetinden iyi.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DateFilterDraft = {
  from: string;
  to: string;
};

export type DateFilterRange = {
  from: string;
  to: string;
};

export function isValidDateInput(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(parsed)) {
    return false;
  }

  // `2026-02-31` deseni geçer ama gerçek bir gün değil; JS onu 3 Mart'a taşır.
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

/** İki uç da geçerli ve sıralıysa aralık; değilse `null`. */
export function toDateFilterRange(draft: DateFilterDraft): DateFilterRange | null {
  if (!isValidDateInput(draft.from) || !isValidDateInput(draft.to)) {
    return null;
  }

  const from = new Date(`${draft.from}T00:00:00.000Z`);
  const end = new Date(`${draft.to}T00:00:00.000Z`);

  if (end.getTime() < from.getTime()) {
    return null;
  }

  // Bitiş **ertesi günün** başı: seçilen gün aralığa dâhil.
  end.setUTCDate(end.getUTCDate() + 1);

  return { from: from.toISOString(), to: end.toISOString() };
}

/** Çipte görünen etiket. Aynı günse tek tarih yazılır, `10.08.2026 – 10.08.2026` değil. */
export function formatDateFilterLabel(draft: DateFilterDraft, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const from = formatter.format(new Date(`${draft.from}T00:00:00.000Z`));

  if (draft.from === draft.to) {
    return from;
  }

  return `${from} – ${formatter.format(new Date(`${draft.to}T00:00:00.000Z`))}`;
}

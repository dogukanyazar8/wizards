import type { AppNotification, AppNotificationGroup, NotifDayBucket } from "@wizards/types";

/**
 * Bildirimler + Ayarlar — Dalga 1 / Ş2 §2. Gün kovası.
 *
 * Kova **sunucuda**, izleyicinin saat diliminde hesaplanır ve istemci tekrar hesaplamaz
 * (00 tuzak #7). İkisi de yaparsa gece yarısına yakın bir bildirim iki gruba birden düşer:
 * sunucu `Dün` der, istemcinin saati başka bir bölgedeyse `Bugün` çizer.
 *
 * Modül **saf**: sistem saatine, sözlüğe ve React'e bağlı değil. `now` ile `timeZone` dışarıdan
 * geçer, etiket metin değil **enum** döner — sunucu Türkçe metin göndermez, `notif.panel.group.*`
 * anahtarını istemci çözer.
 */

const MILLISECONDS_PER_DAY = 86_400_000;

const civilDayFormatters = new Map<string, Intl.DateTimeFormat>();

function getCivilDayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = civilDayFormatters.get(timeZone);
  if (cached) {
    return cached;
  }

  let formatter: Intl.DateTimeFormat;
  try {
    // `en-CA` ISO sıralı `YYYY-MM-DD` üretir; ondan çıkarılan `Date.UTC` gün farkı sayılabilir.
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    });
  } catch {
    // Eski bir istemcinin ya da elle düzenlenmiş bir ayar satırının yazdığı bölge buraya düşer.
    // Atmak, bir ayar alanı yüzünden paneli boş bırakmak olurdu.
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
      year: "numeric",
    });
  }

  civilDayFormatters.set(timeZone, formatter);
  return formatter;
}

/** `at`in `timeZone`daki takvim gününü UTC gece yarısına sabitleyip döndürür. */
function civilDayIndex(at: Date, timeZone: string): number {
  const parts = getCivilDayFormatter(timeZone).formatToParts(at);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY;
}

export type NotifDayBucketOptions = {
  readonly now: Date;
  /** Izleyicinin IANA bölgesi — `resolveQuietHoursTimeZone` ile çözülmüş hâli. */
  readonly timeZone: string;
};

/**
 * §2 üç kova. Referans yalnız `Bugün` / `Dün` çiziyor; üçüncüsü K10'un getirdiği sonsuz
 * kaydırmada gerekiyor — `/inbox` silindiği için altı kayıttan eskisinin başka evi yok.
 *
 * Gelecekteki bir tarih (saat kayması, ileri yazılmış satır) `today` sayılır: bir bildirimi
 * `older` diye listenin dibine göndermek, onu görünmez yapmaktır.
 */
export function resolveNotifDayBucket(
  createdAt: Date,
  options: NotifDayBucketOptions,
): NotifDayBucket {
  const difference =
    civilDayIndex(options.now, options.timeZone) - civilDayIndex(createdAt, options.timeZone);

  if (difference <= 0) {
    return "today";
  }

  return difference === 1 ? "yesterday" : "older";
}

/** Kovaların çizim sırası; boş kova döndürülmez (panel ilk sayfada `older` yoksa çizmez). */
const BUCKET_ORDER: readonly NotifDayBucket[] = ["today", "yesterday", "older"];

/**
 * Sayfa satırlarını gün gruplarına böler. Giriş sırası korunur — sorgu zaten
 * `createdAt DESC, id DESC` sıralı geliyor ve grup içi sıra o sıradır.
 */
export function groupNotificationsByDay(
  notifications: readonly AppNotification[],
  options: NotifDayBucketOptions,
): AppNotificationGroup[] {
  const buckets = new Map<NotifDayBucket, AppNotification[]>();

  for (const notification of notifications) {
    const createdAt = new Date(notification.createdAt);
    // Ayrıştırılamayan bir damga `today`e düşer: satırı düşürmek, kullanıcının hiç görmediği
    // bir bildirimi sessizce yok saymak olurdu.
    const bucket = Number.isNaN(createdAt.getTime())
      ? "today"
      : resolveNotifDayBucket(createdAt, options);

    const existing = buckets.get(bucket);
    if (existing) {
      existing.push(notification);
    } else {
      buckets.set(bucket, [notification]);
    }
  }

  return BUCKET_ORDER.flatMap((label) => {
    const items = buckets.get(label);
    return items && items.length > 0 ? [{ items, label }] : [];
  });
}

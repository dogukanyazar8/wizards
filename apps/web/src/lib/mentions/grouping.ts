import type { Mention, MentionGrouping } from "@wizards/types";

import { MENTIONS_DM_SOURCE } from "@/lib/mentions/routes";

/**
 * Bahsedilmeler akışının gruplama katmanı — SPEC §5, kararlar K5 ve K7.
 *
 * Modül **saf**: sözlüğe, React'e ve sistem saatine bağlı değil. `now` ile `timeZone` dışarıdan
 * geçer, etiketler metin değil **anahtar** olarak döner. Üç sebebi var:
 *
 *   1. Eşikler izleyicinin takvim gününde hesaplanır. Istanbul'da 00:05'te gelen bir bahsetme
 *      UTC'de dünün son saatidir; UTC'de bölünen bir akış her gece üç saat boyunca `Dün`
 *      yazardı.
 *   2. Etiket üretmek sözlüğün işi. Burada `Bugün` yazmak, metni SPEC'in tek kaynağı olan
 *      `mentions.group.*` anahtarlarından koparırdı.
 *   3. Saf olduğu için testi gerçek bir saat dilimiyle koşulabiliyor.
 */

/** PROMPT §4 — liste bu sayıdan uzunsa pencereleme devreye girer. */
export const MENTIONS_VIRTUALIZE_THRESHOLD = 60;

/** K5 — `Sonra oku` grubunun kimliği; sunucu kimliğiyle çakışmasın diye tireli. */
export const READ_LATER_GROUP_ID = "read-later";

export type MentionTimeBucket = "today" | "yesterday" | "thisWeek" | "older";

/**
 * Grup etiketi ya sözlükten okunacak bir ön ayardır ya da kaynağın kendi adıdır. Sunucu adı
 * çevrilmez; ön ayar çevrilmeden yazılmaz.
 */
export type MentionGroupLabel =
  | { readonly kind: "preset"; readonly preset: MentionTimeBucket | "readLater" }
  | { readonly kind: "source"; readonly text: string };

export type MentionGroup = {
  readonly id: string;
  readonly items: readonly Mention[];
  readonly label: MentionGroupLabel;
};

export type MentionGroupingOptions = {
  /** `Direkt mesajlar` — sözlükten gelir, burada üretilmez. */
  readonly dmLabel: string;
  readonly grouping: MentionGrouping;
  readonly now: Date;
  /** Izleyicinin IANA saat dilimi (`UserSettings.timeZone`). */
  readonly timeZone: string;
};

const MILLISECONDS_PER_DAY = 86_400_000;
/** `Bu hafta` son yedi günün penceresi: bugün ve dün çıktıktan sonra kalan beş gün. */
const THIS_WEEK_MAX_DAY_OFFSET = 6;

const civilDayFormatters = new Map<string, Intl.DateTimeFormat>();

function getCivilDayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = civilDayFormatters.get(timeZone);
  if (cached) {
    return cached;
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    });
  } catch {
    // Eski bir istemcinin ya da elle düzenlenmiş bir satırın yazdığı saat dilimi buraya
    // düşer. Atmak, ekranı bir ayar alanı yüzünden boş bırakmak olurdu.
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
      year: "numeric",
    });
    civilDayFormatters.set(timeZone, formatter);
    return formatter;
  }

  civilDayFormatters.set(timeZone, formatter);
  return formatter;
}

/**
 * Takvim gününün sıra numarası. İki damganın **kaç gece** ile ayrıldığını saatten bağımsız
 * verir; saat farkı çıkarmak yaz saati geçişinde bir günü 23 ya da 25 saat yapar ve eşik kayar.
 */
function civilDayIndex(at: Date, timeZone: string): number {
  const parts = getCivilDayFormatter(timeZone).formatToParts(at);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  return Math.round(Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY);
}

/**
 * SPEC §5 zaman grupları.
 *
 * `Bu hafta` takvim haftası değil, **son yedi gün**. Takvim haftası pazartesi sabahı bir
 * önceki günü `Daha eski` grubuna atardı; kullanıcı için dün hâlâ bu haftadır.
 */
export function resolveMentionTimeBucket(
  createdAt: string,
  now: Date,
  timeZone: string,
): MentionTimeBucket {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) {
    return "older";
  }

  const offset = civilDayIndex(now, timeZone) - civilDayIndex(at, timeZone);

  // Saat kayması bir kartı yarına atabilir; onu `Daha eski` grubunun dibine gömmek yerine
  // bugünde tutuyoruz.
  if (offset <= 0) {
    return "today";
  }

  if (offset === 1) {
    return "yesterday";
  }

  return offset <= THIS_WEEK_MAX_DAY_OFFSET ? "thisWeek" : "older";
}

const TIME_BUCKET_ORDER: readonly MentionTimeBucket[] = ["today", "yesterday", "thisWeek", "older"];

function sourceKeyOf(mention: Mention): string {
  return mention.source.type === "channel" ? mention.source.serverId : MENTIONS_DM_SOURCE;
}

function sourceLabelOf(mention: Mention, dmLabel: string): string {
  return mention.source.type === "channel" ? mention.source.serverName : dmLabel;
}

/**
 * SPEC §5 — akışın grupları. **Boş grup üretilmez**: bir başlığın altında hiçbir kart yoksa
 * o başlık bir bilgi değil, bir boşluktur.
 *
 * K5: `Sonra oku` grubu her zaman en üstte ve kendi grubunda durur; kart ikinci kez zaman ya da
 * kaynak grubunda çizilmez — aynı bahsetmenin iki kez görünmesi, iki bahsetme geldiği anlamına
 * gelirdi.
 */
export function groupMentions(
  mentions: readonly Mention[],
  options: MentionGroupingOptions,
): MentionGroup[] {
  const readLater = mentions.filter((mention) => mention.readLater);
  const rest = mentions.filter((mention) => !mention.readLater);
  const groups: MentionGroup[] = [];

  if (readLater.length > 0) {
    groups.push({
      id: READ_LATER_GROUP_ID,
      items: readLater,
      label: { kind: "preset", preset: "readLater" },
    });
  }

  if (options.grouping === "source") {
    groups.push(...groupBySource(rest, options.dmLabel));
    return groups;
  }

  const buckets = new Map<MentionTimeBucket, Mention[]>();

  for (const mention of rest) {
    const bucket = resolveMentionTimeBucket(mention.createdAt, options.now, options.timeZone);
    const existing = buckets.get(bucket);

    if (existing) {
      existing.push(mention);
    } else {
      buckets.set(bucket, [mention]);
    }
  }

  for (const bucket of TIME_BUCKET_ORDER) {
    const items = buckets.get(bucket);

    if (items && items.length > 0) {
      groups.push({ id: bucket, items, label: { kind: "preset", preset: bucket } });
    }
  }

  return groups;
}

/**
 * Kaynak grupları — sıra akıştaki **en yeni** bahsetmeye göre azalan, `Direkt mesajlar` her
 * zaman en sonda (SPEC §5).
 *
 * DM'in sabit yeri bir tercih değil bir okuma kolaylığı: kullanıcı sunucularını gözüyle takip
 * ediyor ve DM kutusunun yeri her yenilemede değişirse liste okunamaz hâle gelir.
 */
function groupBySource(mentions: readonly Mention[], dmLabel: string): MentionGroup[] {
  const buckets = new Map<string, { items: Mention[]; label: string; newest: number }>();

  for (const mention of mentions) {
    const key = sourceKeyOf(mention);
    const occurredAt = new Date(mention.createdAt).getTime();
    const existing = buckets.get(key);

    if (existing) {
      existing.items.push(mention);
      if (Number.isFinite(occurredAt) && occurredAt > existing.newest) {
        existing.newest = occurredAt;
      }
      continue;
    }

    buckets.set(key, {
      items: [mention],
      label: sourceLabelOf(mention, dmLabel),
      newest: Number.isFinite(occurredAt) ? occurredAt : 0,
    });
  }

  return [...buckets.entries()]
    .sort(([leftKey, left], [rightKey, right]) => {
      if (leftKey === MENTIONS_DM_SOURCE) {
        return rightKey === MENTIONS_DM_SOURCE ? 0 : 1;
      }

      if (rightKey === MENTIONS_DM_SOURCE) {
        return -1;
      }

      // Eşitlikte ad kırar: aynı veri her yüklemede aynı sırayı vermeli.
      return right.newest === left.newest
        ? left.label.localeCompare(right.label)
        : right.newest - left.newest;
    })
    .map(([key, bucket]) => ({
      id: key,
      items: bucket.items,
      label: { kind: "source", text: bucket.label } as const,
    }));
}

export type MentionFeedRow =
  | { readonly type: "group"; readonly group: MentionGroup; readonly key: string }
  | {
      readonly type: "mention";
      readonly groupId: string;
      readonly key: string;
      /** Grubun son kartı: alttaki boşluk grup arası boşluğu da taşır. */
      readonly lastInGroup: boolean;
      readonly mention: Mention;
    };

/**
 * PROMPT §4 — grup başlıkları düz listeye çevrilir.
 *
 * Sanallaştırma iç içe listelerde ölçemez: dış liste alt listenin yüksekliğini bilmez, grup
 * başlığı yapışkan olamaz ve kaydırma çubuğu her ölçümde zıplar. Tek düz liste bunların
 * hepsini ortadan kaldırır ve sanallaştırma açılıp kapandığında **aynı** satır dizisi çizilir.
 */
export function flattenMentionGroups(groups: readonly MentionGroup[]): MentionFeedRow[] {
  const rows: MentionFeedRow[] = [];

  for (const group of groups) {
    rows.push({ group, key: `group:${group.id}`, type: "group" });

    group.items.forEach((mention, index) => {
      rows.push({
        groupId: group.id,
        // Aynı bahsetme iki grupta çizilmez ama kimliğin grup adıyla birleşmesi, ileride
        // bir kartın iki yerde görünmesi hâlinde sanal listeyi anahtar çakışmasından korur.
        key: `${group.id}:${mention.id}`,
        lastInGroup: index === group.items.length - 1,
        mention,
        type: "mention",
      });
    });
  }

  return rows;
}

/** Klavye imlecinin gezindiği sıra — ekrandaki sıranın aynısı (PROMPT §5). */
export function listMentionIds(groups: readonly MentionGroup[]): string[] {
  return groups.flatMap((group) => group.items.map((mention) => mention.id));
}

/**
 * `mention:new` ile gelen kart bu görünüme ait mi?
 *
 * Süzgeç normalde **sunucuda** koşuyor; bu fonksiyon yalnız canlı olayın yerel olarak
 * eklenip eklenmeyeceğine karar verir. Eklenmezse sayaçlar yine güncellenir, liste bir
 * sonraki çekmede doğruyu gösterir — yani yanlış tarafa düşmenin bedeli gecikme, yanlış
 * içerik değil.
 *
 * **Arama açıkken hiçbir kart eklenmez.** Eşleşme sunucudaki `ILIKE` ile kuruluyor ve metin,
 * kullanıcı adı, kanal ve sunucu adını kapsıyor; bunu istemcide taklit etmek, aramayla ilgisi
 * olmayan bir kartı sonuç listesine sokmanın en kısa yolu.
 */
export function matchesMentionRoute(
  mention: Mention,
  route: { filter: string; query: string | null; source: string | null },
): boolean {
  if (route.query) {
    return false;
  }

  if (route.source) {
    const key = sourceKeyOf(mention);
    if (key !== route.source) {
      return false;
    }
  }

  switch (route.filter) {
    case "unread":
      return mention.unread;
    case "role":
      // `Rol · @herkes` tek sekme, iki tür (SPEC §4).
      return mention.kind === "role" || mention.kind === "everyone";
    case "dm":
      return mention.source.type === "dm";
    case "me":
      return mention.kind === "me";
    case "thread":
      return mention.kind === "thread";
    default:
      return true;
  }
}

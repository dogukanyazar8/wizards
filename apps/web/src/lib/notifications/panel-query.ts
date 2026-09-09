import { Prisma } from "@wizards/db";
import type { NotificationType } from "@wizards/db";
import { NotifKindSchema, type NotifKind, type NotifPanelTab } from "@wizards/types";

/**
 * Bildirimler + Ayarlar — Dalga 1 / Ş2. 400 px panelin **tek** sorgu katmanı.
 *
 * Panelin dört sekmesi `Notification.type` enum'undan **sunucuda** türer; istemci enum bilmez
 * (03 §1). Bunun bedeli, aynı kararın iki yerde yaşamasıdır: sayfa satırlarını süzen SQL ve
 * satırı `AppNotification`a çeviren TypeScript. İkisi ayrışırsa sekme pili bir sayı, listenin
 * kendisi başka bir sayı gösterir ve hangisinin yalan söylediği ekrandan anlaşılmaz.
 *
 * Bu yüzden karar **tek bir CASE ifadesinde** yazılıdır (`NOTIF_PANEL_BUCKET_SQL`) ve
 * `resolveNotifPanelBucket` onun satır satır ikizidir. `panel-query.test.ts` aynı örnekleri
 * ikisinden de geçirip eşitliği kilitler.
 */

/**
 * Kova, SPEC §7'nin dört `NotifKind` değerinden bir fazlasını taşır: `other`.
 *
 * `DM` üç dar sekmenin hiçbirine düşmez (03 §1) ama SPEC'te karşılığı olan bir `kind` de yok.
 * `system` demek onu Sistem sekmesine sokardı; `mention` demek Bahsedilmeler sekmesine.
 * Beşinci kova ikisini de yapmadan satırı yalnız `Tümü`de bırakır.
 */
export type NotifPanelBucket = NotifKind | "other";

export type NotifPanelMetadata = Record<string, unknown> | null;

/** `metadata.kind` yazan taraf yoksa da bu liste sabit kalır; bilinmeyen değer yok sayılır. */
const KIND_OVERRIDES = new Map<string, NotifKind>([
  ["mention", "mention"],
  ["reply", "reply"],
  // Yazan taraf thread yanıtına `thread` diyor, sözleşme `reply`. Eşleme burada bitiyor ki
  // dışarıya tek kelime çıksın.
  ["thread", "reply"],
  ["event", "event"],
  ["system", "system"],
]);

/** Sistem sekmesinin kapsadığı iki kova (referans `nCounts.system` ile birebir). */
const SYSTEM_TAB_BUCKETS: readonly NotifPanelBucket[] = ["system", "event"];

function readMetadataString(metadata: NotifPanelMetadata, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Satırın kovası. Sıra **anlamlıdır** ve `NOTIF_PANEL_BUCKET_SQL` ile aynıdır:
 *
 * 1. `DM` her zaman `other` — hiçbir metadata bunu değiştiremez. Kural bir varsayım değil,
 *    03 §1'in yazılı sözleşmesi; onu bir JSON alanının insafına bırakmak, yanlış yazılmış tek
 *    satırın DM'leri Bahsedilmeler sekmesine doldurması demekti.
 * 2. Tanınan bir `metadata.kind` varsa o kazanır (ileriye dönük kapı).
 * 3. Yoksa tür ve bugün **gerçekten yazılan** metadata karar verir.
 *
 * (3) bu şeridin kayda geçen sapmasıdır: 03 §1 `replies` dalını `MENTION` + `metadata.kind`
 * üzerine kuruyor, ama üründe thread yanıtı `type = SYSTEM` + `metadata.parentMessageId`
 * olarak yazılıyor (`message-notification-service.ts:707`, tip yorumu bunu açıkça söylüyor) ve
 * `metadata.kind` hiçbir yerde yazılmıyor. Prompt'un harfi uygulansaydı `Yanıtlar` sekmesi
 * daima boş kalır, her thread yanıtı `Sistem`e düşerdi.
 */
export function resolveNotifPanelBucket(
  type: NotificationType,
  metadata: NotifPanelMetadata,
): NotifPanelBucket {
  if (type === "DM") {
    return "other";
  }

  const override = KIND_OVERRIDES.get(readMetadataString(metadata, "kind") ?? "");
  if (override) {
    return override;
  }

  if (type === "MENTION") {
    // 03 §1: yazan taraf alanı doldurmuyorsa `mention` varsayılır. Testle kilitli.
    return "mention";
  }

  if (type === "SYSTEM") {
    if (
      readMetadataString(metadata, "parentMessageId") ??
      readMetadataString(metadata, "threadReplyPreview")
    ) {
      return "reply";
    }

    // `events/notifications.ts:16` ayrımı `metadata.eventId` ile yapıyor ve bu şerit şemayı
    // sahiplenmiyor; aynı alan burada da okunur.
    if (readMetadataString(metadata, "eventId")) {
      return "event";
    }
  }

  return "system";
}

/**
 * Kova → SPEC §7 `kind`. `other` dışarı sızmaz: sözleşmede dört değer var ve DM satırı da bir
 * ikon çizmek zorunda. En yakın sunum kovası `system` (referansın `S` ikonu).
 */
export function toNotifKind(bucket: NotifPanelBucket): NotifKind {
  return bucket === "other" ? "system" : bucket;
}

/** Sekme üyeliği. Kovadan türer; `kind`ten **değil** — `other` ile `system` aynı `kind`i taşır. */
export function matchesNotifPanelTab(tab: NotifPanelTab, bucket: NotifPanelBucket): boolean {
  switch (tab) {
    case "all":
      return true;
    case "mentions":
      return bucket === "mention";
    case "replies":
      return bucket === "reply";
    case "system":
      return SYSTEM_TAB_BUCKETS.includes(bucket);
  }
}

/**
 * `resolveNotifPanelBucket`in SQL ikizi. Dallar aynı sırada, aynı alanları okur.
 *
 * `->>` kullanılıyor, `?` değil: `?` PostgreSQL'in JSONB "anahtar var mı" operatörü ama aynı
 * karakter sürücünün parametre yer tutucusu. Metin olarak okuyup `IS NOT NULL` sormak aynı
 * cevabı verir ve hazırlanmış deyimi bozmaz.
 */
export const NOTIF_PANEL_BUCKET_SQL = Prisma.sql`
  CASE
    WHEN "type" = 'DM' THEN 'other'
    WHEN "metadata"->>'kind' = 'mention' THEN 'mention'
    WHEN "metadata"->>'kind' IN ('reply', 'thread') THEN 'reply'
    WHEN "metadata"->>'kind' = 'event' THEN 'event'
    WHEN "metadata"->>'kind' = 'system' THEN 'system'
    WHEN "type" = 'MENTION' THEN 'mention'
    WHEN "type" = 'SYSTEM'
      AND ("metadata"->>'parentMessageId' IS NOT NULL OR "metadata"->>'threadReplyPreview' IS NOT NULL)
      THEN 'reply'
    WHEN "type" = 'SYSTEM' AND "metadata"->>'eventId' IS NOT NULL THEN 'event'
    ELSE 'system'
  END
`;

/** Sekme süzgecinin SQL karşılığı. `all` süzgeç değil, süzgeç yokluğudur. */
export function buildNotifPanelTabFilter(tab: NotifPanelTab): Prisma.Sql | null {
  switch (tab) {
    case "all":
      return null;
    case "mentions":
      return Prisma.sql`(${NOTIF_PANEL_BUCKET_SQL}) = 'mention'`;
    case "replies":
      return Prisma.sql`(${NOTIF_PANEL_BUCKET_SQL}) = 'reply'`;
    case "system":
      return Prisma.sql`(${NOTIF_PANEL_BUCKET_SQL}) IN ('system', 'event')`;
  }
}

// ---------------------------------------------------------------------------
// İmleç
// ---------------------------------------------------------------------------

/**
 * `(createdAt, id)` keyset, `DESC`. Ofset değil: panel sonsuz kaydırıyor ve arada gelen tek
 * bir bildirim, ofsetli bir sayfalamada bir satırı iki kez gösterirdi.
 */
export type NotifPanelCursor = {
  readonly createdAt: Date;
  readonly id: string;
};

export function encodeNotifPanelCursor(cursor: NotifPanelCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function decodeNotifPanelCursor(raw: string | null | undefined): NotifPanelCursor | null {
  if (!raw) {
    return null;
  }

  const [iso, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const id = rest.join("|");
  if (!iso || !id) {
    return null;
  }

  const createdAt = new Date(iso);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
}

// ---------------------------------------------------------------------------
// Sorgular
// ---------------------------------------------------------------------------

/** Sayfa satırının ham hâli — DTO'ya çevrilmeden. */
export type NotifPanelRow = {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly read: boolean;
  readonly createdAt: Date;
  readonly metadata: unknown;
};

export type NotifPanelPageQuery = {
  readonly cursor: NotifPanelCursor | null;
  /** Kaç satır **isteniyor**; sorgu bir fazlasını çeker ki sonraki sayfa var mı bilinsin. */
  readonly limit: number;
  readonly tab: NotifPanelTab;
  readonly userId: string;
};

export function buildNotifPanelPageQuery(query: NotifPanelPageQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`"userId" = ${query.userId}`];

  const tabFilter = buildNotifPanelTabFilter(query.tab);
  if (tabFilter) {
    conditions.push(tabFilter);
  }

  if (query.cursor) {
    conditions.push(
      Prisma.sql`("createdAt" < ${query.cursor.createdAt} OR ("createdAt" = ${query.cursor.createdAt} AND "id" < ${query.cursor.id}))`,
    );
  }

  return Prisma.sql`
    SELECT "id", "type", "title", "body", "read", "createdAt", "metadata"
    FROM "Notification"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT ${query.limit + 1}
  `;
}

export type NotifUnreadCountsRow = {
  readonly all: number;
  readonly mentions: number;
  readonly replies: number;
  readonly system: number;
};

/**
 * Dörtlü sayaç **tek geçişte**. `WHERE "userId" = $1 AND "read" = false` tam olarak
 * `@@index([userId, read, createdAt])`in ön ekidir; dört ayrı `COUNT` dört ayrı tarama olurdu.
 *
 * `::int` şart: `COUNT` PostgreSQL'de `bigint` döner ve Prisma onu `BigInt` olarak taşır —
 * `JSON.stringify` o değerde patlar.
 */
export function buildNotifUnreadCountsQuery(userId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COUNT(*)::int AS "all",
      COUNT(*) FILTER (WHERE (${NOTIF_PANEL_BUCKET_SQL}) = 'mention')::int AS "mentions",
      COUNT(*) FILTER (WHERE (${NOTIF_PANEL_BUCKET_SQL}) = 'reply')::int AS "replies",
      COUNT(*) FILTER (WHERE (${NOTIF_PANEL_BUCKET_SQL}) IN ('system', 'event'))::int AS "system"
    FROM "Notification"
    WHERE "userId" = ${userId} AND "read" = false
  `;
}

/** Sayaçların sıfır hâli — kullanıcının hiç okunmamışı yokken satır dönmeyen sürücüler için. */
export const EMPTY_NOTIF_UNREAD_COUNTS: NotifUnreadCountsRow = {
  all: 0,
  mentions: 0,
  replies: 0,
  system: 0,
};

/** Şemanın kabul ettiği `kind` değerleri; testler ve tip daralması için tek liste. */
export const NOTIF_KINDS = NotifKindSchema.options;

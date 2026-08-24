import { Prisma } from "@wizards/db";
import type { EventMineFilter, EventTab, EventTimeFilter } from "@wizards/types";

/**
 * Etkinlikler — Dalga 1 / Ş1. Ekranın ana kolonunu besleyen **tek** sorgu ailesi.
 *
 * Akış iki kaynaktan doluyor ve ikisi tek sıralı sayfa hâlinde okunuyor:
 *
 * | Dal      | Kapsam                                              | İndeks                                |
 * | -------- | --------------------------------------------------- | ------------------------------------- |
 * | `member` | `serverId IN (izleyicinin üye olduğu sunucular)`     | `[serverId, status, scheduledStartAt]` |
 * | `public` | `isPublic = TRUE` — üyelik aranmaz (K3)              | `[isPublic, status, scheduledStartAt]` |
 *
 * Dört kural bu dosyada, iki dalda tekrar edilmesin diye:
 *
 * 1. **Görünürlük sorgunun kendi süzgecidir**, sonucuna uygulanan bir kontrol değil
 *    (`home/events-service.ts` kuralı). Okuyamadığı bir etkinlik, sorgunun kurulduğu kümede
 *    **yok**.
 * 2. **`UNION`, `UNION ALL` değil** (tuzak #6). Üye olunan sunucunun herkese açık etkinliği iki
 *    dala birden düşer; `ALL` onu kartta iki kez çizerdi. Tekilleştirme ancak iki dalın satırı
 *    **birebir aynı** olduğunda çalışır — bu yüzden `viewerIsMember` bile dala göre sabit
 *    yazılmaz, iki dalda da aynı ifadeden türetilir.
 * 3. **Sayaçlar filtresizdir** (tuzak #3). `time/serverId/mine/q` sayaç sorgusuna hiç girmez;
 *    girseydi bir filtre açıkken bütün sekmeler `0` görünür ve tıklanamaz sanılırdı.
 * 4. **Zaman penceresi UTC anlarıyla sınırlanır.** Gün kararı izleyicinin saat dilimindedir
 *    (tuzak #7) ama sınır SQL'de `AT TIME ZONE` ile hesaplansaydı `scheduledStartAt` üzerindeki
 *    indeks kullanılamaz ve 30 günlük pencere seq scan'e düşerdi. Bölge hesabı burada, JavaScript
 *    tarafında yapılır; sorguya iki `timestamp` parametresi olarak iner.
 *
 * Sayfa **iki** sorgu eder: bu birleşik sorgu, sonra sayfadaki etkinliklerin katılımcı
 * önizlemesi için tek bir `ROW_NUMBER()` taraması. Önizlemeyi dalın `SELECT`ine korelasyonlu alt
 * sorgu olarak koymak, `LIMIT` uygulanmadan **önce** eşleşen her satır için çalışması demekti.
 */

export const EVENTS_ATTENDEE_PREVIEW_LIMIT = 3;

/** Karar K7 / SPEC §3.5 alt notu: "Geçmiş etkinlikler 30 gün arşivde tutulur". */
export const EVENTS_PAST_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Saat dilimi (tuzak #7)
// ---------------------------------------------------------------------------

/**
 * `instant`ın `timeZone`daki UTC farkı, milisaniye.
 *
 * `Intl` üzerinden okunuyor çünkü fark sabit değil: yaz saati uygulayan bir bölgede aynı takvim
 * günü yılın iki yarısında iki farklı ana karşılık gelir.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );

  return asIfUtc - instant.getTime();
}

/** `YYYY-MM-DD` — bir anın **izleyicinin** takvimindeki günü. */
export function zonedCalendarDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}

/**
 * Bir takvim gününün `timeZone`daki ilk anı.
 *
 * İki geçiş var: ilk tahmin günün **kendi** farkını bilmediği için hedefin karşı tarafındaki
 * farkı kullanır; ikinci geçiş tahmini kendi farkıyla düzeltir. Yaz saatine geçiş gecesi tek
 * geçişle bir saat kayardı.
 */
export function zonedDayStart(date: string, timeZone: string): Date {
  const naive = Date.parse(`${date}T00:00:00.000Z`);

  if (Number.isNaN(naive)) {
    throw new TypeError(`Not a calendar date: ${date}`);
  }

  const firstGuess = naive - zoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - zoneOffsetMs(new Date(firstGuess), timeZone));
}

/**
 * Takvim günü aritmetiği — saat dilimi **girmez**. Bir haftayı 7×24 saat eklemek yaz saatine
 * geçen bir haftada bir saat kaydırır; gün sayısı bir takvim işlemidir.
 */
export function addZonedDays(date: string, days: number): string {
  const shifted = new Date(Date.parse(`${date}T00:00:00.000Z`) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** İzleyicinin takvimindeki ayın ilk günü. */
function zonedMonthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function nextZonedMonthStart(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

// ---------------------------------------------------------------------------
// İmleç
// ---------------------------------------------------------------------------

export type EventsOrderDirection = "asc" | "desc";

/**
 * `time='past'` listeyi tersine çevirir: arşiv en yenisinden okunur. Yön **imlecin içinde**
 * taşınır, çünkü `EventsListResponse` sözleşmesi Dalga 0'da donduruldu ve içinde yön alanı yok;
 * istemcinin yön kuralını kendi tarafında tekrar etmesi de aynı kuralın iki yerde yaşaması
 * demekti (bir gün ayrışır).
 */
export function resolveEventsOrderDirection(
  time: EventTimeFilter | null | undefined,
): EventsOrderDirection {
  return time === "past" ? "desc" : "asc";
}

export type EventsCursor = {
  readonly direction: EventsOrderDirection;
  readonly id: string;
  readonly startAt: Date;
};

export function encodeEventsCursor(cursor: EventsCursor): string {
  return Buffer.from(
    `${cursor.direction}|${cursor.startAt.toISOString()}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

export function decodeEventsCursor(raw: string | null | undefined): EventsCursor | null {
  if (!raw) {
    return null;
  }

  const [direction, iso, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const id = rest.join("|");

  if ((direction !== "asc" && direction !== "desc") || !iso || !id) {
    return null;
  }

  const startAt = new Date(iso);
  return Number.isNaN(startAt.getTime()) ? null : { direction, id, startAt };
}

// ---------------------------------------------------------------------------
// Arama
// ---------------------------------------------------------------------------

/**
 * `ILIKE` kalıbı. `%` ve `_` kullanıcı metninde **veri**dir; kaçırılmazsa `%` yazan biri bütün
 * satırları eşleştirir ve arama sessizce filtresiz kalır.
 */
export function toEventsSearchPattern(query: string): string {
  const escaped = query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  return `%${escaped}%`;
}

// ---------------------------------------------------------------------------
// Kapsam
// ---------------------------------------------------------------------------

export type EventsBranch = "member" | "public";

export type EventsQueryScope = {
  readonly mine: EventMineFilter | null;
  readonly now: Date;
  readonly query: string | null;
  /** Kaynak (sunucu) süzgeci; seçim yoksa `null`. */
  readonly serverId: string | null;
  readonly tab: EventTab;
  readonly time: EventTimeFilter | null;
  /** `resolveAccountTimeZone` ile çözülmüş IANA bölgesi. */
  readonly timeZone: string;
  readonly userId: string;
  readonly viewerServerIds: readonly string[];
  /** Görünen haftanın pazartesisi, `YYYY-MM-DD`; yoksa "bu hafta". */
  readonly weekStart: string | null;
};

/**
 * Hangi dalların **kurulacağı**. Bir dalı kurup sonucunu elemek yerine hiç kurmamak, filtre
 * daraldıkça sorgunun da daralması demek.
 *
 * Herkese açık dal her zaman kurulur: üyeliğe bağlı olmayan tek kaynak odur ve hiç sunucusu
 * olmayan bir izleyici de topluluk etkinliklerini görür.
 */
export function selectEventsBranches(scope: EventsQueryScope): readonly EventsBranch[] {
  const hasMemberScope =
    scope.viewerServerIds.length > 0 &&
    (!scope.serverId || scope.viewerServerIds.includes(scope.serverId));

  return hasMemberScope ? ["member", "public"] : ["public"];
}

// ---------------------------------------------------------------------------
// Ortak süzgeç parçaları
// ---------------------------------------------------------------------------

/**
 * `viewerIsMember` **iki dalda da aynı ifadeden** gelir. `member` dalına `TRUE`, `public` dalına
 * `FALSE` yazmak aynı etkinliği iki farklı satır yapardı ve `UNION` onları tekilleştiremezdi —
 * tuzak #6 tam olarak burada patlıyor.
 */
function memberExpression(scope: EventsQueryScope): Prisma.Sql {
  return scope.viewerServerIds.length === 0
    ? Prisma.sql`FALSE`
    : Prisma.sql`(e."serverId" IN (${Prisma.join([...scope.viewerServerIds])}))`;
}

function branchScope(branch: EventsBranch, scope: EventsQueryScope): Prisma.Sql {
  return branch === "member"
    ? Prisma.sql`e."serverId" IN (${Prisma.join([...scope.viewerServerIds])})`
    : Prisma.sql`e."isPublic" = TRUE`;
}

/**
 * Varsayılan küme `SCHEDULED` + `ACTIVE`. `CANCELLED` hiçbir dalda listelenmez; `COMPLETED`
 * yalnız arşiv dalına girer.
 */
function statusFilter(scope: EventsQueryScope): Prisma.Sql {
  if (scope.tab === "upcoming") {
    return Prisma.sql`AND e."status" = 'SCHEDULED'`;
  }

  if (scope.tab === "live") {
    return Prisma.sql`AND e."status" = 'ACTIVE'`;
  }

  return scope.time === "past"
    ? Prisma.sql`AND e."status" IN ('SCHEDULED', 'ACTIVE', 'COMPLETED')`
    : Prisma.sql`AND e."status" IN ('SCHEDULED', 'ACTIVE')`;
}

const BASE_STATUS_FILTER = Prisma.sql`AND e."status" IN ('SCHEDULED', 'ACTIVE')`;

export type EventsTimeRange = {
  readonly from: Date | null;
  readonly to: Date | null;
};

/**
 * Zaman süzgecinin UTC karşılığı. Gün sınırları izleyicinin saat diliminde çözülür ama sorguya
 * **an** olarak iner; `AT TIME ZONE` ile yazılmış bir sınır indeksi kullanılamaz hâle getirirdi.
 */
export function resolveEventsTimeRange(scope: EventsQueryScope): EventsTimeRange {
  const today = zonedCalendarDate(scope.now, scope.timeZone);

  switch (scope.time) {
    case "today":
      return {
        from: zonedDayStart(today, scope.timeZone),
        to: zonedDayStart(addZonedDays(today, 1), scope.timeZone),
      };

    case "week": {
      const start = scope.weekStart ?? today;
      return {
        from: zonedDayStart(start, scope.timeZone),
        to: zonedDayStart(addZonedDays(start, 7), scope.timeZone),
      };
    }

    case "month": {
      const anchor = scope.weekStart ?? today;
      return {
        from: zonedDayStart(zonedMonthStart(anchor), scope.timeZone),
        to: zonedDayStart(nextZonedMonthStart(anchor), scope.timeZone),
      };
    }

    case "past":
      return {
        from: new Date(scope.now.getTime() - EVENTS_PAST_WINDOW_DAYS * MS_PER_DAY),
        to: scope.now,
      };

    default:
      return { from: null, to: null };
  }
}

function rangeFilter(range: EventsTimeRange): Prisma.Sql {
  const lower = range.from ? Prisma.sql`AND e."scheduledStartAt" >= ${range.from}` : Prisma.empty;
  const upper = range.to ? Prisma.sql`AND e."scheduledStartAt" < ${range.to}` : Prisma.empty;

  return Prisma.sql`${lower} ${upper}`;
}

function sourceFilter(scope: EventsQueryScope): Prisma.Sql {
  return scope.serverId ? Prisma.sql`AND e."serverId" = ${scope.serverId}` : Prisma.empty;
}

/** `tab=going` ve `mine=going|maybe` aynı satırı okur; `mine=host` sahiplik süzgecidir. */
function rsvpFilter(scope: EventsQueryScope): Prisma.Sql {
  const fragments: Prisma.Sql[] = [];

  if (scope.tab === "going") {
    fragments.push(Prisma.sql`AND i."status" = 'GOING'`);
  }

  if (scope.mine === "going") {
    fragments.push(Prisma.sql`AND i."status" = 'GOING'`);
  }

  if (scope.mine === "maybe") {
    fragments.push(Prisma.sql`AND i."status" = 'MAYBE'`);
  }

  if (scope.mine === "host") {
    fragments.push(Prisma.sql`AND e."creatorId" = ${scope.userId}`);
  }

  return fragments.length === 0 ? Prisma.empty : Prisma.join(fragments, " ");
}

/** Arama **sunucudadır**: başlık, sunucu adı ve kanal adı tek `ILIKE` kümesinde. */
function searchFilter(pattern: string | null): Prisma.Sql {
  if (!pattern) {
    return Prisma.empty;
  }

  return Prisma.sql`AND (
    e."name" ILIKE ${pattern}
    OR s."name" ILIKE ${pattern}
    OR COALESCE(c."name", '') ILIKE ${pattern}
    OR COALESCE(e."externalLocation", '') ILIKE ${pattern}
  )`;
}

/**
 * Anahtar demeti karşılaştırması `ORDER BY` ile birebir aynı sırayı okur ve **dalın içinde**
 * durur: dışarıya taşınsaydı her dal bütün geçmişini okuyup sonra kırpardı.
 */
function cursorFilter(cursor: EventsCursor | null): Prisma.Sql {
  if (!cursor) {
    return Prisma.empty;
  }

  return cursor.direction === "desc"
    ? Prisma.sql`AND (e."scheduledStartAt", e."id") < (${cursor.startAt}, ${cursor.id})`
    : Prisma.sql`AND (e."scheduledStartAt", e."id") > (${cursor.startAt}, ${cursor.id})`;
}

const VIEWER_JOINS = (userId: string): Prisma.Sql => Prisma.sql`
  LEFT JOIN "ScheduledEventInterest" i ON i."eventId" = e."id" AND i."userId" = ${userId}
  LEFT JOIN "ScheduledEventReminder" rm ON rm."eventId" = e."id" AND rm."userId" = ${userId}
`;

// ---------------------------------------------------------------------------
// Sayfa dalı
// ---------------------------------------------------------------------------

export type EventsQueryRow = {
  channelId: string | null;
  channelName: string | null;
  channelType: string | null;
  description: string;
  endsAt: Date | null;
  externalLocation: string | null;
  goingCount: number;
  hostAvatarUrl: string | null;
  hostDisplayName: string | null;
  hostId: string;
  hostUsername: string;
  id: string;
  isPublic: boolean;
  kind: string;
  maybeCount: number;
  recurrenceRule: string | null;
  reminderEnabled: boolean | null;
  reminderMinutesBefore: number | null;
  rsvp: string | null;
  serverId: string;
  serverName: string;
  startsAt: Date;
  status: string;
  title: string;
  viewerIsMember: boolean;
};

function pageBranch(
  branch: EventsBranch,
  scope: EventsQueryScope,
  cursor: EventsCursor | null,
  range: EventsTimeRange,
  pattern: string | null,
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      e."id" AS "id",
      e."name" AS "title",
      e."kind" AS "kind",
      e."serverId" AS "serverId",
      s."name" AS "serverName",
      e."channelId" AS "channelId",
      c."name" AS "channelName",
      c."type"::text AS "channelType",
      e."externalLocation" AS "externalLocation",
      e."isPublic" AS "isPublic",
      ${memberExpression(scope)} AS "viewerIsMember",
      e."scheduledStartAt" AS "startsAt",
      e."scheduledEndAt" AS "endsAt",
      e."status"::text AS "status",
      e."interestedCount" AS "goingCount",
      e."maybeCount" AS "maybeCount",
      e."recurrenceRule" AS "recurrenceRule",
      COALESCE(e."description", '') AS "description",
      e."creatorId" AS "hostId",
      h."username" AS "hostUsername",
      h."displayName" AS "hostDisplayName",
      h."avatarUrl" AS "hostAvatarUrl",
      i."status"::text AS "rsvp",
      rm."enabled" AS "reminderEnabled",
      rm."minutesBefore" AS "reminderMinutesBefore"
    FROM "ScheduledEvent" e
    INNER JOIN "Server" s ON s."id" = e."serverId"
    INNER JOIN "User" h ON h."id" = e."creatorId"
    LEFT JOIN "Channel" c ON c."id" = e."channelId"
    ${VIEWER_JOINS(scope.userId)}
    WHERE ${branchScope(branch, scope)}
      ${statusFilter(scope)}
      ${rangeFilter(range)}
      ${sourceFilter(scope)}
      ${rsvpFilter(scope)}
      ${searchFilter(pattern)}
      ${cursorFilter(cursor)}
  `;
}

/**
 * İki dal, tek `UNION`. `Prisma.join(..., " UNION ")` — `UNION ALL` değil (tuzak #6).
 */
export function buildEventsUnion(
  scope: EventsQueryScope,
  cursor: EventsCursor | null = null,
): Prisma.Sql {
  const range = resolveEventsTimeRange(scope);
  const pattern = scope.query ? toEventsSearchPattern(scope.query) : null;

  return Prisma.join(
    selectEventsBranches(scope).map((branch) => pageBranch(branch, scope, cursor, range, pattern)),
    " UNION ",
  );
}

export function buildEventsPageQuery(
  scope: EventsQueryScope,
  cursor: EventsCursor | null,
  limit: number,
): Prisma.Sql {
  const union = buildEventsUnion(scope, cursor);

  // Sıra sözleşmesi tek yerde: imleç yönü ile `ORDER BY` aynı satırdan okunur.
  return resolveEventsOrderDirection(scope.time) === "desc"
    ? Prisma.sql`
        SELECT * FROM (${union}) events
        ORDER BY "startsAt" DESC, "id" DESC
        LIMIT ${limit + 1}
      `
    : Prisma.sql`
        SELECT * FROM (${union}) events
        ORDER BY "startsAt" ASC, "id" ASC
        LIMIT ${limit + 1}
      `;
}

// ---------------------------------------------------------------------------
// Sayaçlar — filtresiz (tuzak #3)
// ---------------------------------------------------------------------------

export type EventsCountsRow = {
  all: number;
  going: number;
  live: number;
  nextStartsAt: Date | null;
  upcoming: number;
};

export const EMPTY_EVENTS_COUNTS_ROW: EventsCountsRow = {
  all: 0,
  going: 0,
  live: 0,
  nextStartsAt: null,
  upcoming: 0,
};

function countsBranch(branch: EventsBranch, scope: EventsQueryScope): Prisma.Sql {
  return Prisma.sql`
    SELECT
      e."id" AS "id",
      e."status"::text AS "status",
      e."scheduledStartAt" AS "startsAt",
      i."status"::text AS "rsvp"
    FROM "ScheduledEvent" e
    LEFT JOIN "ScheduledEventInterest" i ON i."eventId" = e."id" AND i."userId" = ${scope.userId}
    WHERE ${branchScope(branch, scope)}
      ${BASE_STATUS_FILTER}
  `;
}

/**
 * Dört sayı, canlı bayrağı ve sıradaki saat **tek** taramadan.
 *
 * Sekme pilleri, başlık alt satırı, sağ ray ve gezinme paneli ipucu aynı nesneden okur (SPEC §8
 * son satırı); ikinci bir toplama yazılırsa ikisi bir gün ayrışır.
 */
export function buildEventsCountsQuery(scope: EventsQueryScope): Prisma.Sql {
  const union = Prisma.join(
    selectEventsBranches(scope).map((branch) => countsBranch(branch, scope)),
    " UNION ",
  );

  return Prisma.sql`
    WITH events AS (${union})
    SELECT
      COUNT(*)::int AS "all",
      COUNT(*) FILTER (WHERE "status" = 'SCHEDULED')::int AS "upcoming",
      COUNT(*) FILTER (WHERE "status" = 'ACTIVE')::int AS "live",
      COUNT(*) FILTER (WHERE "rsvp" = 'GOING')::int AS "going",
      MIN("startsAt") FILTER (WHERE "status" = 'SCHEDULED' AND "startsAt" >= ${scope.now})
        AS "nextStartsAt"
    FROM events
  `;
}

// ---------------------------------------------------------------------------
// Hafta noktaları
// ---------------------------------------------------------------------------

export type EventsWeekRow = {
  count: number;
  date: string;
  firstStartAt: Date;
  kind: string;
};

function weekBranch(
  branch: EventsBranch,
  scope: EventsQueryScope,
  range: { readonly from: Date; readonly to: Date },
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      e."id" AS "id",
      e."kind"::text AS "kind",
      e."scheduledStartAt" AS "startsAt"
    FROM "ScheduledEvent" e
    WHERE ${branchScope(branch, scope)}
      ${BASE_STATUS_FILTER}
      AND e."scheduledStartAt" >= ${range.from}
      AND e."scheduledStartAt" < ${range.to}
  `;
}

/**
 * Hafta şeridi bir **gezinme aracıdır**, sonucun özeti değil: listenin `tab`, `serverId`, `mine`
 * ve `q` süzgeçleri buraya girmez. Aksi hâlde bir filtre açıkken şerit boşalır ve kullanıcı o
 * günlerde hiç etkinlik olmadığını sanar.
 *
 * Gruplama SQL'de: yedi günlük pencerede kaç satır olduğu izleyicinin sunucu sayısına bağlıdır
 * ve hepsini tel üzerinden çekip JavaScript'te saymak, şeridin maliyetini akışın maliyetinden
 * büyütebilirdi. `date` izleyicinin saat diliminde üretilir (tuzak #7).
 */
export function buildEventsWeekQuery(
  scope: EventsQueryScope,
  range: { readonly from: Date; readonly to: Date },
): Prisma.Sql {
  const union = Prisma.join(
    selectEventsBranches(scope).map((branch) => weekBranch(branch, scope, range)),
    " UNION ",
  );

  return Prisma.sql`
    WITH events AS (${union})
    SELECT
      to_char(("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}, 'YYYY-MM-DD') AS "date",
      "kind" AS "kind",
      MIN("startsAt") AS "firstStartAt",
      COUNT(*)::int AS "count"
    FROM events
    GROUP BY 1, 2
  `;
}

// ---------------------------------------------------------------------------
// Katılımcı önizlemesi
// ---------------------------------------------------------------------------

export type EventsAttendeeRow = {
  avatarUrl: string | null;
  displayName: string | null;
  eventId: string;
  id: string;
  username: string;
};

/**
 * Sayfadaki her etkinliğin ilk üç `GOING` yanıtı, **tek** taramada. Sunucu sahibi burada
 * ayrıcalıklı değil: tasarımda düzenleyen ayrı satırda yazıyor ve önizleme katılanların
 * sırasını gösteriyor.
 */
export function buildEventsAttendeePreviewQuery(eventIds: readonly string[]): Prisma.Sql | null {
  if (eventIds.length === 0) {
    return null;
  }

  return Prisma.sql`
    SELECT ranked."eventId", u."id", u."username", u."displayName", u."avatarUrl"
    FROM (
      SELECT
        i."eventId",
        i."userId",
        ROW_NUMBER() OVER (
          PARTITION BY i."eventId" ORDER BY i."createdAt" ASC, i."id" ASC
        ) AS rn
      FROM "ScheduledEventInterest" i
      WHERE i."eventId" IN (${Prisma.join([...eventIds])})
        AND i."status" = 'GOING'
    ) ranked
    INNER JOIN "User" u ON u."id" = ranked."userId"
    WHERE ranked.rn <= ${EVENTS_ATTENDEE_PREVIEW_LIMIT}
  `;
}

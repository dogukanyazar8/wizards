import { hashIdentityId } from "./server-identity";

/**
 * Ana Sayfa 1a — ekranın saf sunum mantığı (`05-faz4-anasayfa-izgara-kartlar.md`).
 *
 * Buradaki her fonksiyon React'tan bağımsızdır ve saati parametre alır: "şimdi"yi kendi okuyan bir
 * fonksiyon test edilemez (00-ortak-baglam §5.4). Sunucu yalnız ISO damga gönderir (Faz 3 §2);
 * göreli metin, gün etiketi ve durum cümlesi burada üretilir.
 *
 * Faz 7: metinler **sözlükte**. Buradaki fonksiyonlar artık dize değil `HomeCopy` döner —
 * bir anahtar ve gerekiyorsa değerleri. Çeviri React katmanında (`resolveHomeCopy`) yapılır:
 * saf katmanın locale'e ya da render sırasına bağımlılığı yok, ve testler metnin kendisini değil
 * **hangi cümlenin seçildiğini** doğruluyor.
 */

export type HomePresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

export type HomeCopyValues = Readonly<Record<string, number | string>>;

/**
 * Ekrana çıkacak bir cümlenin tanımı — `08-faz7` §1.
 *
 * `key === null` olan tek durum kullanıcının **kendi yazdığı** metindir (`customStatus`, kanal
 * konusu): onun bir çevirisi yoktur ve olmamalıdır.
 */
export type HomeCopy = {
  readonly key: string | null;
  /** Yalnız `key === null` iken dolu. */
  readonly text?: string;
  readonly values?: HomeCopyValues;
};

export type HomeTranslate = (key: string, values?: Record<string, number | string>) => string;

export function resolveHomeCopy(copy: HomeCopy, t: HomeTranslate): string {
  if (copy.key === null) {
    return copy.text ?? "";
  }

  return t(copy.key, copy.values ? { ...copy.values } : undefined);
}

/** Sözlüğe taşınmış presence etiketleri (§1.1) — nokta, çip ve durum cümlesi aynı dördü okur. */
export const HOME_PRESENCE_LABEL_KEY: Record<HomePresenceStatus, string> = {
  DND: "home.presence.dnd",
  IDLE: "home.presence.idle",
  OFFLINE: "home.friends.offline",
  ONLINE: "home.presence.online",
};

export type GreetingKey = "afternoon" | "evening" | "morning" | "night";

const HOURS_PER_DAY = 24;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Selamlama dilimi — SPEC §2.3. Dört dilim yirmi dört saati boşluksuz böler:
 * gece 23–04 · sabah 05–11 · öğleden sonra 12–17 · akşam 18–22.
 *
 * Ölçülemeyen ya da aralık dışı saat gece dilimine düşer; ekran hiçbir durumda selamlamasız kalmaz.
 */
export function getGreetingKey(hour: number): GreetingKey {
  const normalized = Number.isFinite(hour)
    ? ((Math.floor(hour) % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY
    : 0;

  if (normalized >= 5 && normalized <= 11) {
    return "morning";
  }

  if (normalized >= 12 && normalized <= 17) {
    return "afternoon";
  }

  if (normalized >= 18 && normalized <= 22) {
    return "evening";
  }

  return "night";
}

/** §1.1 — dört dilimin sözlük anahtarı. Selamlama metni yalnız burada adlandırılır. */
export const HOME_GREETING_KEY: Record<GreetingKey, string> = {
  afternoon: "home.greeting.afternoon",
  evening: "home.greeting.evening",
  morning: "home.greeting.morning",
  night: "home.greeting.night",
};

/**
 * Selamlamanın **adsız** hâli — özet gelmeden ad bilinmiyor ve ekranda `{name}` görünemez.
 *
 * Şablonun ad parçası düşürülür; ikinci bir sözlük anahtarı doğmaz ve SPEC metni tek yerde kalır.
 * Ad geldiğinde bu fonksiyon hiç çağrılmaz.
 */
export function stripGreetingName(greeting: string): string {
  return greeting.replace(/[,،]?\s*\{name\}\s*$/u, "").trim();
}

/* --------------------------------------------------------------- takvim günü */

/**
 * Bir anın **takvim gününü** okurun saat diliminde sayıya çevirir. Elapsed saatten türetilen bir
 * "dün" gece yarısında yalan söyler; gün farkı bu sayıların farkıdır.
 *
 * `en-CA` seçilmesinin tek nedeni `YYYY-MM-DD` üretmesi; okura hiçbir metin bu yerelden gitmez.
 */
export function toCalendarDayNumber(value: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(value);
  const [year, month, day] = parts.split("-").map(Number);

  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / MS_PER_DAY;
}

export function parseInstant(value: string): Date | null {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* --------------------------------------------------------- arkadaş durum metni */

export type FriendVoiceRoom = {
  readonly channelName: string;
  readonly serverName: string;
};

export type FriendStatusInput = {
  readonly customStatus: string | null;
  readonly lastSeenAt: string | null;
  readonly status: HomePresenceStatus;
  readonly voiceRoom: FriendVoiceRoom | null;
};

export type FriendStatusSource =
  | { readonly kind: "custom"; readonly text: string }
  | { readonly kind: "dnd" }
  | { readonly kind: "idle"; readonly minutes: number }
  | { readonly kind: "presence"; readonly presence: HomePresenceStatus }
  | { readonly kind: "voice"; readonly roomName: string };

/**
 * Karar #5'in öncelik sırası, tek karar noktası:
 * sesli oda > DND > boşta süresi > `customStatus` > presence etiketi.
 *
 * Sıra buradadır ve testlidir; metin üretimi (`deriveFriendStatusText`) yalnız bu sonucu çevirir.
 */
export function selectFriendStatusSource(input: FriendStatusInput, now: Date): FriendStatusSource {
  if (input.voiceRoom) {
    return { kind: "voice", roomName: input.voiceRoom.channelName };
  }

  if (input.status === "DND") {
    return { kind: "dnd" };
  }

  if (input.status === "IDLE" && input.lastSeenAt) {
    const lastSeen = parseInstant(input.lastSeenAt);

    if (lastSeen) {
      // Otuz saniyelik bir boşluk "0 dk boşta" değil, bir dakikadır.
      const minutes = Math.max(1, Math.floor((now.getTime() - lastSeen.getTime()) / MS_PER_MINUTE));

      return { kind: "idle", minutes };
    }
  }

  const customStatus = input.customStatus?.trim() ?? "";

  if (customStatus.length > 0) {
    return { kind: "custom", text: customStatus };
  }

  return { kind: "presence", presence: input.status };
}

export function deriveFriendStatusText(input: FriendStatusInput, now: Date): HomeCopy {
  const source = selectFriendStatusSource(input, now);

  switch (source.kind) {
    // §1.4 — ek uyumu için kural yazılmaz; sözlükteki kesme işareti yeterli.
    case "voice":
      return { key: "home.friends.inRoom", values: { room: source.roomName } };
    case "dnd":
      return { key: HOME_PRESENCE_LABEL_KEY.DND };
    case "idle":
      return { key: "home.friends.idleFor", values: { minutes: source.minutes } };
    // Kullanıcının kendi cümlesi; çevrilmez.
    case "custom":
      return { key: null, text: source.text };
    default:
      return { key: HOME_PRESENCE_LABEL_KEY[source.presence] };
  }
}

/* ------------------------------------------------------------- oda açıklaması */

export type RoomCaptionInput = {
  readonly caption: string;
  readonly participantCount: number;
  readonly participants: readonly { readonly displayName: string }[];
};

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName.trim();
}

/**
 * Oda kartının alt açıklaması (Faz 3 §6.5 kararı).
 *
 * Sunucu yalnız kanal konusunu (`caption`) gönderiyor; tasarımın cümlesi ("… ve n kişi burada")
 * katılımcı listesinden burada kurulur. `caption` **yedektir**: yalnız türetilecek katılımcı yokken
 * çizilir. `participantCount` gerçek toplamdır, listedeki dört kişiyle sınırlı değildir.
 */
export function deriveRoomCaption(room: RoomCaptionInput): HomeCopy {
  const leader = room.participants[0];

  if (!leader || room.participantCount <= 0) {
    // Kanalın konusu; sunucudan gelen serbest metin, çevrilmez.
    return { key: null, text: room.caption };
  }

  if (room.participantCount === 1) {
    return { key: "home.live.caption.alone", values: { name: firstName(leader.displayName) } };
  }

  return {
    key: "home.live.caption.withOthers",
    values: { count: room.participantCount - 1, name: firstName(leader.displayName) },
  };
}

/**
 * Odada şu an kim konuşuyor — SPEC §3.2.
 *
 * Sunucu ses seviyesi saklamaz (`speaker` her zaman `null` gelir, Faz 3 §C.1); konuşan
 * `voice:audio-level:update` olaylarından türer. Eşiğin altındaki gürültü konuşma sayılmaz:
 * altında kalırsa satır ve dalga formu gizlenir ve yerine katılımcı özeti çıkar.
 *
 * Sunucu bir gün seviyeyi göndermeye başlarsa `speaker` alanı kazanır — yerel ölçüm yedektir.
 */
export const HOME_SPEAKING_LEVEL_THRESHOLD = 0.08;

export type RoomSpeakerCandidate = {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly id: string;
};

export type RoomSpeaker<TActor extends RoomSpeakerCandidate> = {
  readonly actor: TActor;
  readonly level: number;
};

export function selectRoomSpeaker<TActor extends RoomSpeakerCandidate>(
  room: {
    readonly participants: readonly TActor[];
    readonly speaker: (TActor & { level: number }) | null;
  },
  audioLevels: Readonly<Record<string, number>>,
): RoomSpeaker<TActor> | null {
  if (room.speaker) {
    return { actor: room.speaker, level: room.speaker.level };
  }

  let loudest: RoomSpeaker<TActor> | null = null;

  for (const participant of room.participants) {
    const level = audioLevels[participant.id] ?? 0;

    if (level >= HOME_SPEAKING_LEVEL_THRESHOLD && (!loudest || level > loudest.level)) {
      loudest = { actor: participant, level };
    }
  }

  return loudest;
}

/* -------------------------------------------------------------------- zaman */

/** Faz 6'nın gün başlıkları ve "Sıradaki" kartının gün etiketi aynı iki anahtarı okur. */
export const DAY_TODAY_KEY = "home.upNext.today";
export const DAY_TOMORROW_KEY = "home.upNext.tomorrow";

/**
 * "Sıradaki" kartının 9.5px gün etiketi — SPEC §3.5. Bugün/yarın adlandırılır, gerisi kısa gün
 * adıdır. Geçmiş bir etkinlik de kısa gün adı alır: "bugün" yalnız gerçekten bugün demektir.
 */
export function getEventDayLabel(
  startAt: string,
  now: Date,
  locale: string,
  timeZone?: string,
): HomeCopy {
  const start = parseInstant(startAt);

  if (!start) {
    return { key: null, text: "" };
  }

  const dayDifference = toCalendarDayNumber(start, timeZone) - toCalendarDayNumber(now, timeZone);

  if (dayDifference === 0) {
    return { key: DAY_TODAY_KEY };
  }

  if (dayDifference === 1) {
    return { key: DAY_TOMORROW_KEY };
  }

  // Gün adı `Intl`den gelir; sözlükte yedi gün adı tutmak ikinci bir doğruluk kaynağı olurdu.
  return {
    key: null,
    text: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(start),
  };
}

/** Kalan dakika — aşağı yuvarlanır, geçmiş bir etkinlikte sıfırdır ("−3 dk kaldı" yazılmaz). */
export function getMinutesUntil(startAt: string, now: Date): number {
  const start = parseInstant(startAt);

  if (!start) {
    return 0;
  }

  return Math.max(0, Math.floor((start.getTime() - now.getTime()) / MS_PER_MINUTE));
}

export function formatEventClock(startAt: string, locale: string, timeZone?: string): string {
  const start = parseInstant(startAt);

  if (!start) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(start);
}

/**
 * Satır sağındaki göreli zaman — SPEC §3.1/§3.3 ("2 dk", "18 dk", "1 sa", "dün", "2 gün").
 *
 * Yirmi dört saatin altı saatle, üstü **takvim günüyle** ölçülür: 26 saat önce her zaman "dün"dür,
 * 3 saat önce gece yarısını geçmiş olsa bile "3 sa"dır.
 *
 * Anahtarlar: `home.time.now|minutes|hours|yesterday|days|weeks|months`.
 */
export function formatRelativeTime(value: string, now: Date, timeZone?: string): HomeCopy {
  const instant = parseInstant(value);

  if (!instant) {
    return { key: null, text: "" };
  }

  const elapsed = now.getTime() - instant.getTime();

  if (elapsed < MS_PER_MINUTE) {
    return { key: "home.time.now" };
  }

  if (elapsed < MS_PER_HOUR) {
    return { key: "home.time.minutes", values: { count: Math.floor(elapsed / MS_PER_MINUTE) } };
  }

  if (elapsed < MS_PER_DAY) {
    return { key: "home.time.hours", values: { count: Math.floor(elapsed / MS_PER_HOUR) } };
  }

  const days = toCalendarDayNumber(now, timeZone) - toCalendarDayNumber(instant, timeZone);

  if (days <= 1) {
    return { key: "home.time.yesterday" };
  }

  if (days < 7) {
    return { key: "home.time.days", values: { count: days } };
  }

  if (days < 28) {
    return { key: "home.time.weeks", values: { count: Math.floor(days / 7) } };
  }

  return { key: "home.time.months", values: { count: Math.floor(days / 30) } };
}

/** Üst çubuğun tarihi — SPEC §2.3 ("18 Ağustos Pazartesi"), okurun yerelinde. */
export function formatHeaderDate(value: string, locale: string, timeZone?: string): string {
  const instant = parseInstant(value);

  if (!instant) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    weekday: "long",
    ...(timeZone ? { timeZone } : {}),
  }).format(instant);
}

/* ------------------------------------------------------------- ikon karesi */

export type IconSquareAccent = {
  readonly background: string;
  readonly color: string;
};

/**
 * "Kaldığın yer" satırındaki 38×38 ikon karesinin tint'i — SPEC §3.1.
 *
 * Tasarımdaki `primary → success → warning` sırası **örnek veridir**; ürün sabit atama yapmaz, tint
 * kanal/sunucu kimliğinden türer. Havuz yalnız mevcut token'lardan oluşur ve opaklıklar tasarımın
 * kendi değerleridir (primary 0.12, diğerleri 0.14).
 *
 * `server-identity.ts`'in havuzundan ayrıdır: orada `--primary` bilerek dışarıda (dolu primary
 * zemin aktif sunucunun işareti), burada tasarımın ilk satırı zaten primary.
 */
const ICON_SQUARE_ACCENTS: readonly IconSquareAccent[] = [
  { background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" },
  { background: "hsl(var(--success) / 0.14)", color: "hsl(var(--success))" },
  { background: "hsl(var(--warning) / 0.14)", color: "hsl(var(--warning))" },
];

export function getIconSquareAccent(identityId: string): IconSquareAccent {
  return ICON_SQUARE_ACCENTS[hashIdentityId(identityId) % ICON_SQUARE_ACCENTS.length]!;
}

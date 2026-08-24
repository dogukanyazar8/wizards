import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interpolateMessage, resolveMessageTemplate } from "@/lib/locale/core";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

import {
  deriveFriendStatusText as deriveFriendStatusCopy,
  deriveRoomCaption as deriveRoomCaptionCopy,
  formatEventClock,
  formatHeaderDate,
  formatRelativeTime as formatRelativeTimeCopy,
  getEventDayLabel as getEventDayLabelCopy,
  getGreetingKey,
  getIconSquareAccent,
  getMinutesUntil,
  resolveHomeCopy,
  selectFriendStatusSource,
  selectRoomSpeaker,
  stripGreetingName,
  type FriendStatusInput,
  type HomeCopy,
  type RoomCaptionInput,
} from "./presentation";

/** Testler sabit bir saat diliminde koşar; makinenin yereli sonucu kaydırmasın. */
const TZ = "UTC";

/**
 * Faz 7: saf katman artık anahtar döndürüyor. Testler yine **SPEC metnini** doğruluyor, çünkü
 * çeviri gerçek `tr.ts` sözlüğüyle yapılıyor: hem seçilen anahtar hem de o anahtarın Türkçe
 * karşılığı aynı iddianın içinde kalıyor.
 */
const translate = (key: string, values?: Record<string, number | string>) =>
  interpolateMessage(resolveMessageTemplate(TR_MESSAGES, key, values), values);

const text = (copy: HomeCopy) => resolveHomeCopy(copy, translate);

const deriveFriendStatusText = (input: FriendStatusInput, now: Date) =>
  text(deriveFriendStatusCopy(input, now));
const deriveRoomCaption = (room: RoomCaptionInput) => text(deriveRoomCaptionCopy(room));
const getEventDayLabel = (startAt: string, now: Date, locale: string, timeZone?: string) =>
  text(getEventDayLabelCopy(startAt, now, locale, timeZone));
const formatRelativeTime = (value: string, now: Date, timeZone?: string) =>
  text(formatRelativeTimeCopy(value, now, timeZone));

function iso(value: string): string {
  return new Date(value).toISOString();
}

describe("getGreetingKey — SPEC §2.3 selamlaması", () => {
  it("dört dilimin sınırlarını sabitler", () => {
    assert.equal(getGreetingKey(5), "morning");
    assert.equal(getGreetingKey(11), "morning");
    assert.equal(getGreetingKey(12), "afternoon");
    assert.equal(getGreetingKey(17), "afternoon");
    assert.equal(getGreetingKey(18), "evening");
    assert.equal(getGreetingKey(22), "evening");
    assert.equal(getGreetingKey(23), "night");
    assert.equal(getGreetingKey(0), "night");
    assert.equal(getGreetingKey(4), "night");
  });

  it("yirmi dört saatin tamamını kapsar, boşluk bırakmaz", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      assert.ok(
        ["afternoon", "evening", "morning", "night"].includes(getGreetingKey(hour)),
        `saat ${hour}`,
      );
    }
  });

  it("aralık dışı ve ölçülemeyen saati güvenli bir dilime düşürür", () => {
    assert.equal(getGreetingKey(24), "night");
    assert.equal(getGreetingKey(-1), "night");
    assert.equal(getGreetingKey(19.9), "evening");
    assert.equal(getGreetingKey(Number.NaN), "night");
  });
});

describe("deriveFriendStatusText — karar #5 öncelik sırası", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");
  const room = { channelName: "live-room", serverName: "Whispr Topluluğu" };

  it("sesli oda her şeyin önündedir", () => {
    const source = selectFriendStatusSource(
      {
        customStatus: "Figma'da",
        lastSeenAt: iso("2026-08-19T11:00:00.000Z"),
        status: "DND",
        voiceRoom: room,
      },
      now,
    );

    assert.deepEqual(source, { kind: "voice", roomName: "live-room" });
  });

  it("DND, boşta süresinin ve customStatus'un önündedir", () => {
    const source = selectFriendStatusSource(
      {
        customStatus: "Figma'da",
        lastSeenAt: iso("2026-08-19T11:00:00.000Z"),
        status: "DND",
        voiceRoom: null,
      },
      now,
    );

    assert.deepEqual(source, { kind: "dnd" });
  });

  it("boşta süresi customStatus'un önündedir", () => {
    const source = selectFriendStatusSource(
      {
        customStatus: "Figma'da",
        lastSeenAt: iso("2026-08-19T11:48:00.000Z"),
        status: "IDLE",
        voiceRoom: null,
      },
      now,
    );

    assert.deepEqual(source, { kind: "idle", minutes: 12 });
  });

  it("boşta ama son görülme yoksa customStatus'a düşer", () => {
    const source = selectFriendStatusSource(
      { customStatus: "Figma'da", lastSeenAt: null, status: "IDLE", voiceRoom: null },
      now,
    );

    assert.deepEqual(source, { kind: "custom", text: "Figma'da" });
  });

  it("customStatus presence etiketinin önündedir", () => {
    const source = selectFriendStatusSource(
      { customStatus: "Figma'da", lastSeenAt: null, status: "ONLINE", voiceRoom: null },
      now,
    );

    assert.deepEqual(source, { kind: "custom", text: "Figma'da" });
  });

  it("hiçbiri yoksa presence etiketi kalır", () => {
    const source = selectFriendStatusSource(
      { customStatus: "   ", lastSeenAt: null, status: "OFFLINE", voiceRoom: null },
      now,
    );

    assert.deepEqual(source, { kind: "presence", presence: "OFFLINE" });
  });

  it("beş kaynağın tamamı metne çevrilir", () => {
    assert.equal(
      deriveFriendStatusText(
        { customStatus: null, lastSeenAt: null, status: "ONLINE", voiceRoom: room },
        now,
      ),
      "live-room'da",
    );
    assert.equal(
      deriveFriendStatusText(
        { customStatus: null, lastSeenAt: null, status: "DND", voiceRoom: null },
        now,
      ),
      "Rahatsız etmeyin",
    );
    assert.equal(
      deriveFriendStatusText(
        {
          customStatus: null,
          lastSeenAt: iso("2026-08-19T11:48:00.000Z"),
          status: "IDLE",
          voiceRoom: null,
        },
        now,
      ),
      "12 dk boşta",
    );
    assert.equal(
      deriveFriendStatusText(
        { customStatus: "Valorant oynuyor", lastSeenAt: null, status: "ONLINE", voiceRoom: null },
        now,
      ),
      "Valorant oynuyor",
    );
    assert.equal(
      deriveFriendStatusText(
        { customStatus: null, lastSeenAt: null, status: "ONLINE", voiceRoom: null },
        now,
      ),
      "Çevrimiçi",
    );
  });

  it("bir dakikadan kısa boşta süresini sıfır yazmaz", () => {
    assert.equal(
      deriveFriendStatusText(
        {
          customStatus: null,
          lastSeenAt: iso("2026-08-19T11:59:40.000Z"),
          status: "IDLE",
          voiceRoom: null,
        },
        now,
      ),
      "1 dk boşta",
    );
  });
});

describe("deriveRoomCaption — Faz 3 §6.5 kararı", () => {
  it("katılımcılardan cümleyi kurar", () => {
    assert.equal(
      deriveRoomCaption({
        caption: "kanal konusu",
        participantCount: 1,
        participants: [{ displayName: "Selin Aksoy" }],
      }),
      "Selin burada",
    );
    assert.equal(
      deriveRoomCaption({
        caption: "",
        participantCount: 4,
        participants: [{ displayName: "Selin Aksoy" }, { displayName: "Mert Kaya" }],
      }),
      "Selin ve 3 kişi burada",
    );
  });

  it("türetecek veri yoksa sunucunun `caption` alanına düşer", () => {
    assert.equal(
      deriveRoomCaption({ caption: "Valorant gecesi", participantCount: 0, participants: [] }),
      "Valorant gecesi",
    );
    assert.equal(deriveRoomCaption({ caption: "", participantCount: 0, participants: [] }), "");
  });

  it("katılımcı sayısı listeden büyükken gerçek toplamı kullanır", () => {
    assert.equal(
      deriveRoomCaption({
        caption: "",
        participantCount: 12,
        participants: [
          { displayName: "Can Eren" },
          { displayName: "Alice Nowak" },
          { displayName: "Zeynep Arı" },
          { displayName: "Emre Şahin" },
        ],
      }),
      "Can ve 11 kişi burada",
    );
  });
});

describe("getEventDayLabel — SPEC §3.5 gün etiketi", () => {
  const now = new Date("2026-08-19T09:00:00.000Z");

  it("bugünü ve yarını adlandırır", () => {
    assert.equal(getEventDayLabel(iso("2026-08-19T21:30:00.000Z"), now, "tr", TZ), "bugün");
    assert.equal(getEventDayLabel(iso("2026-08-20T10:30:00.000Z"), now, "tr", TZ), "yarın");
  });

  it("ikinci günden sonra kısa gün adına geçer", () => {
    // 2026-08-22 cumartesi.
    assert.equal(getEventDayLabel(iso("2026-08-22T19:00:00.000Z"), now, "tr", TZ), "Cmt");
  });

  it('geçmiş bir gün de kısa gün adı alır, "bugün" demez', () => {
    assert.equal(getEventDayLabel(iso("2026-08-18T19:00:00.000Z"), now, "tr", TZ), "Sal");
  });

  it("takvim gününü saat farkından değil, saat diliminden okur", () => {
    // 23:30 UTC ile 00:30 UTC bir saat arayla iki ayrı takvim gününde.
    const late = new Date("2026-08-19T23:30:00.000Z");
    assert.equal(getEventDayLabel(iso("2026-08-20T00:30:00.000Z"), late, "tr", TZ), "yarın");
  });
});

describe("getMinutesUntil ve formatEventClock", () => {
  it("kalan dakikayı aşağı yuvarlar ve negatifi sıfırlar", () => {
    const now = new Date("2026-08-19T14:20:00.000Z");

    assert.equal(getMinutesUntil(iso("2026-08-19T15:00:00.000Z"), now), 40);
    assert.equal(getMinutesUntil(iso("2026-08-19T14:20:30.000Z"), now), 0);
    assert.equal(getMinutesUntil(iso("2026-08-19T13:00:00.000Z"), now), 0);
  });

  it("saati 24 saatlik biçimde yazar", () => {
    assert.equal(formatEventClock(iso("2026-08-19T15:00:00.000Z"), "tr", TZ), "15:00");
    assert.equal(formatEventClock(iso("2026-08-19T21:30:00.000Z"), "tr", TZ), "21:30");
  });
});

describe("formatRelativeTime — SPEC §3.1/§3.3 zaman kolonu", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");

  it("tasarımdaki beş biçimi üretir", () => {
    assert.equal(formatRelativeTime(iso("2026-08-19T11:58:00.000Z"), now, TZ), "2 dk");
    assert.equal(formatRelativeTime(iso("2026-08-19T11:42:00.000Z"), now, TZ), "18 dk");
    assert.equal(formatRelativeTime(iso("2026-08-19T11:00:00.000Z"), now, TZ), "1 sa");
    assert.equal(formatRelativeTime(iso("2026-08-18T10:00:00.000Z"), now, TZ), "dün");
    assert.equal(formatRelativeTime(iso("2026-08-17T10:00:00.000Z"), now, TZ), "2 gün");
  });

  it('bir dakikanın altını "şimdi" der ve geleceği geçmişe çevirmez', () => {
    assert.equal(formatRelativeTime(iso("2026-08-19T11:59:40.000Z"), now, TZ), "şimdi");
    assert.equal(formatRelativeTime(iso("2026-08-19T12:05:00.000Z"), now, TZ), "şimdi");
  });

  it("hafta ve ay eşiklerini geçer", () => {
    assert.equal(formatRelativeTime(iso("2026-08-05T12:00:00.000Z"), now, TZ), "2 hf");
    assert.equal(formatRelativeTime(iso("2026-06-19T12:00:00.000Z"), now, TZ), "2 ay");
  });

  it("yirmi dört saatin altı saat, üstü takvim günüdür", () => {
    // 12,5 saat önce: hâlâ saat.
    assert.equal(formatRelativeTime(iso("2026-08-18T23:30:00.000Z"), now, TZ), "12 sa");
    // Gece yarısını geçmiş üç saat: takvim günü değişse de saat.
    assert.equal(
      formatRelativeTime(iso("2026-08-18T23:00:00.000Z"), new Date("2026-08-19T02:00:00.000Z"), TZ),
      "3 sa",
    );
  });
});

describe("formatHeaderDate — SPEC §2.3 alt satırı", () => {
  it("gün, ay ve gün adını okurun yerelinde yazar", () => {
    assert.equal(
      formatHeaderDate(iso("2026-08-17T09:00:00.000Z"), "tr", TZ),
      "17 Ağustos Pazartesi",
    );
  });

  it('ölçülemeyen damgada boş dize döner, "Invalid Date" yazmaz', () => {
    assert.equal(formatHeaderDate("bozuk", "tr", TZ), "");
  });
});

describe("getIconSquareAccent — kimlikten türeyen tint", () => {
  it("aynı kimlik her zaman aynı tint'i verir", () => {
    assert.deepEqual(getIconSquareAccent("channel-1"), getIconSquareAccent("channel-1"));
  });

  it("yalnız mevcut token'ları kullanır, yeni renk üretmez", () => {
    const seen = new Set<string>();

    for (let index = 0; index < 400; index += 1) {
      const accent = getIconSquareAccent(`channel-${index}`);
      seen.add(accent.color);

      assert.match(accent.background, /^hsl\(var\(--(primary|success|warning)\) \/ 0\.1[24]\)$/);
      assert.match(accent.color, /^hsl\(var\(--(primary|success|warning)\)\)$/);
    }

    assert.equal(seen.size, 3);
  });

  it("boş kimlikte de bir tint döner", () => {
    assert.ok(getIconSquareAccent("").color.startsWith("hsl(var(--"));
  });
});

describe("selectRoomSpeaker — SPEC §3.2 konuşan satırı", () => {
  const actor = (id: string) => ({
    avatarUrl: null,
    displayName: id,
    id,
    presence: "ONLINE" as const,
  });

  it("eşiği geçen en yüksek seviyeyi seçer", () => {
    const speaker = selectRoomSpeaker(
      { participants: [actor("a"), actor("b"), actor("c")], speaker: null },
      { a: 0.2, b: 0.7, c: 0.4 },
    );

    assert.equal(speaker?.actor.id, "b");
    assert.equal(speaker?.level, 0.7);
  });

  it("eşiğin altındaki gürültüyü konuşma saymaz", () => {
    assert.equal(
      selectRoomSpeaker({ participants: [actor("a")], speaker: null }, { a: 0.02 }),
      null,
    );
  });

  it("hiç ses olayı gelmediyse konuşan yoktur", () => {
    assert.equal(selectRoomSpeaker({ participants: [actor("a")], speaker: null }, {}), null);
  });

  it("sunucu bir gün konuşanı gönderirse yerel ölçümü ezer", () => {
    const speaker = selectRoomSpeaker(
      { participants: [actor("a")], speaker: { ...actor("z"), level: 0.5 } },
      { a: 0.9 },
    );

    assert.equal(speaker?.actor.id, "z");
  });
});

describe("stripGreetingName — ad gelmeden selamlama", () => {
  it("şablonun ad parçasını düşürür", () => {
    assert.equal(stripGreetingName(TR_MESSAGES["home.greeting.morning"]), "Günaydın");
    assert.equal(stripGreetingName(TR_MESSAGES["home.greeting.evening"]), "İyi akşamlar");
  });

  it("ad zaten yerine konmuşsa metne dokunmaz", () => {
    assert.equal(stripGreetingName("İyi akşamlar, Doğukan"), "İyi akşamlar, Doğukan");
  });
});

describe("saf katmanın seçtiği anahtarlar", () => {
  it("sözlükte var olmayan bir anahtar seçmez", () => {
    const copies: HomeCopy[] = [
      deriveFriendStatusCopy(
        { customStatus: null, lastSeenAt: null, status: "DND", voiceRoom: null },
        new Date("2026-08-19T12:00:00.000Z"),
      ),
      deriveRoomCaptionCopy({
        caption: "",
        participantCount: 3,
        participants: [{ displayName: "Selin" }],
      }),
      getEventDayLabelCopy(
        "2026-08-19T21:30:00.000Z",
        new Date("2026-08-19T12:00:00.000Z"),
        "tr",
        TZ,
      ),
      formatRelativeTimeCopy("2026-08-19T11:58:00.000Z", new Date("2026-08-19T12:00:00.000Z"), TZ),
    ];

    for (const copy of copies) {
      if (copy.key !== null) {
        assert.ok(copy.key in TR_MESSAGES, copy.key);
      }
    }
  });

  it("kullanıcının kendi metnini anahtara çevirmez", () => {
    const copy = deriveFriendStatusCopy(
      { customStatus: "Valorant oynuyor", lastSeenAt: null, status: "ONLINE", voiceRoom: null },
      new Date("2026-08-19T12:00:00.000Z"),
    );

    assert.deepEqual(copy, { key: null, text: "Valorant oynuyor" });
  });
});

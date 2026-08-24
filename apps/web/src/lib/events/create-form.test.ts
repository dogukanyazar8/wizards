import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreateEventInputSchema, type EventKind } from "@wizards/types";

import {
  EVENT_CREATE_DEFAULT_DURATION,
  EVENT_CREATE_DURATIONS,
  EVENT_CREATE_KINDS,
  EVENT_CREATE_KIND_CHANNEL_TYPES,
  EVENT_CREATE_TITLE_MAX,
  EVENT_EXTERNAL_LOCATION_MAX,
  buildCreateEventInput,
  canListEventInDiscover,
  createEventFormInitialState,
  eventCreateDefaultStart,
  eventCreateFormReducer,
  eventKindAcceptsChannel,
  eventPlaceServerInitials,
  isValidEventExternalLocation,
  parseLocalDateTimeValue,
  selectEventPlaceChannels,
  selectEventPlaceServers,
  toLocalDateTimeValue,
  validateEventCreateForm,
  withEventServerType,
  type EventCreateFormState,
  type EventPlaceChannel,
  type EventPlaceServer,
} from "@/lib/events/create-form";
import { EVENT_KIND_CHANNEL_TYPES } from "@/lib/events/mutations";

/**
 * Ş8 — oluştur modalının **saf** form modeli.
 *
 * Modal yalnız çizer; "tür değişince uyumsuz kanal temizlenir" (K10) gibi kurallar burada
 * yaşıyor ve React'sız sınanıyor. Bir kuralın testi bir tıklama dizisine bağlı olsaydı, o kural
 * ancak bir tarayıcıda kanıtlanabilirdi.
 */

const COMMUNITY: EventPlaceServer = {
  iconUrl: null,
  id: "s1",
  name: "Whispr Topluluğu",
  shortName: "W",
  type: "COMMUNITY",
};

const PERSONAL: EventPlaceServer = {
  iconUrl: null,
  id: "s2",
  name: "Product Team",
  shortName: null,
  type: "PERSONAL",
};

const TEXT: EventPlaceChannel = { id: "c-text", name: "genel", type: "TEXT" };
const VOICE: EventPlaceChannel = { id: "c-voice", name: "sesli oda", type: "VOICE" };
const STAGE: EventPlaceChannel = { id: "c-stage", name: "sahne", type: "STAGE" };

const NOW = new Date("2026-08-27T09:12:00.000Z");

function initial(overrides: Partial<EventCreateFormState> = {}): EventCreateFormState {
  return { ...createEventFormInitialState({ now: NOW }), ...overrides };
}

describe("events create-form — tür ↔ kanal sözleşmesi (K10)", () => {
  it("istemci haritası sunucunun haritasıyla birebir aynı", () => {
    // İki harita ayrışırsa modal geçerli bir kanalı gizler ya da geçersiz bir kanalla 422 alır.
    // `mutations.ts` tarayıcı paketine alınamaz (Prisma + outbox zinciri), o yüzden kopya burada
    // duruyor ve bu test onu kilitliyor.
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(EVENT_CREATE_KIND_CHANNEL_TYPES).map(([kind, types]) => [kind, [...types]]),
      ),
      Object.fromEntries(
        Object.entries(EVENT_KIND_CHANNEL_TYPES).map(([kind, types]) => [kind, [...types]]),
      ),
    );
  });

  it("altı türün altısı da bir kural taşır", () => {
    assert.deepEqual(
      [...EVENT_CREATE_KINDS],
      ["voice", "meeting", "game", "live", "community", "workshop"],
    );

    for (const kind of EVENT_CREATE_KINDS) {
      assert.ok(EVENT_CREATE_KIND_CHANNEL_TYPES[kind].length > 0, `${kind} kuralsız`);
    }
  });

  it("`eventKindAcceptsChannel` altı türü ayrı ayrı süzer", () => {
    const expected: Record<EventKind, readonly string[]> = {
      community: ["STAGE"],
      game: ["VOICE"],
      live: ["STAGE"],
      meeting: ["TEXT", "VOICE"],
      voice: ["VOICE"],
      workshop: ["TEXT", "VOICE"],
    };

    for (const kind of EVENT_CREATE_KINDS) {
      for (const type of ["TEXT", "VOICE", "STAGE"] as const) {
        assert.equal(
          eventKindAcceptsChannel(kind, type),
          expected[kind].includes(type),
          `${kind} - ${type}`,
        );
      }
    }
  });

  it("`selectEventPlaceChannels` listeyi türe göre süzer", () => {
    const channels = [TEXT, VOICE, STAGE];

    assert.deepEqual(selectEventPlaceChannels(channels, "voice"), [VOICE]);
    assert.deepEqual(selectEventPlaceChannels(channels, "game"), [VOICE]);
    assert.deepEqual(selectEventPlaceChannels(channels, "live"), [STAGE]);
    assert.deepEqual(selectEventPlaceChannels(channels, "community"), [STAGE]);
    assert.deepEqual(selectEventPlaceChannels(channels, "meeting"), [TEXT, VOICE]);
    assert.deepEqual(selectEventPlaceChannels(channels, "workshop"), [TEXT, VOICE]);
  });
});

describe("events create-form — başlangıç durumu", () => {
  it("tasarımın varsayılanları: ilk tür, 45 dk, kanal kipi", () => {
    const state = createEventFormInitialState({ now: NOW });

    assert.equal(state.kind, "voice");
    assert.equal(state.duration, EVENT_CREATE_DEFAULT_DURATION);
    assert.equal(EVENT_CREATE_DEFAULT_DURATION, 45);
    assert.deepEqual([...EVENT_CREATE_DURATIONS], [30, 45, 60]);
    assert.equal(state.placeMode, "channel");
    assert.equal(state.channel, null);
    assert.equal(state.channelCleared, false);
    assert.equal(state.title, "");
    assert.equal(state.externalLocation, "");
  });

  it("`Topluluk keşfetinde listele` kapalı doğar", () => {
    // Referans mock'ta `pub: true`; ürün varsayılanı kapalı: açık doğan bir anahtar, kullanıcı
    // hiç dokunmadan etkinliği keşfete yazardı.
    assert.equal(createEventFormInitialState({ now: NOW }).isPublic, false);
  });

  it("varsayılan saat en az yarım saat ileride ve yarım saat sınırında", () => {
    assert.equal(
      eventCreateDefaultStart(new Date("2026-08-27T09:12:00.000Z")).toISOString(),
      "2026-08-27T10:00:00.000Z",
    );
    assert.equal(
      eventCreateDefaultStart(new Date("2026-08-27T09:31:00.000Z")).toISOString(),
      "2026-08-27T10:30:00.000Z",
    );
    // Tam sınırda duran bir "şimdi" de ileri atlar: aynı dakikaya etkinlik kurulmaz.
    assert.equal(
      eventCreateDefaultStart(new Date("2026-08-27T09:00:00.000Z")).toISOString(),
      "2026-08-27T09:30:00.000Z",
    );
  });

  it("verilen sunucu başlangıçta seçili gelir", () => {
    assert.deepEqual(
      createEventFormInitialState({ now: NOW, server: COMMUNITY }).server,
      COMMUNITY,
    );
  });
});

describe("events create-form — tür değişimi kanalı temizler (K10)", () => {
  it("uyumsuz kanal temizlenir ve uyarı doğar", () => {
    const next = eventCreateFormReducer(initial({ channel: VOICE, server: COMMUNITY }), {
      kind: "live",
      type: "setKind",
    });

    assert.equal(next.kind, "live");
    assert.equal(next.channel, null);
    assert.equal(next.channelCleared, true);
  });

  it("uyumlu kanal kalır ve uyarı çıkmaz", () => {
    const next = eventCreateFormReducer(initial({ channel: VOICE, server: COMMUNITY }), {
      kind: "game",
      type: "setKind",
    });

    assert.deepEqual(next.channel, VOICE);
    assert.equal(next.channelCleared, false);
  });

  it("uyarı bir sonraki kanal seçiminde kapanır", () => {
    const cleared = eventCreateFormReducer(initial({ channel: VOICE, server: COMMUNITY }), {
      kind: "live",
      type: "setKind",
    });

    assert.equal(cleared.channelCleared, true);
    assert.equal(
      eventCreateFormReducer(cleared, { channel: STAGE, type: "selectChannel" }).channelCleared,
      false,
    );
  });

  it("harici kipte tür değişimi uyarı üretmez", () => {
    const next = eventCreateFormReducer(
      initial({
        externalLocation: "https://meet.example.com/a",
        placeMode: "external",
        server: COMMUNITY,
      }),
      { kind: "live", type: "setKind" },
    );

    assert.equal(next.channelCleared, false);
    assert.equal(next.externalLocation, "https://meet.example.com/a");
  });
});

describe("events create-form — yer seçimi", () => {
  it("başka sunucu seçmek kanalı düşürür", () => {
    const next = eventCreateFormReducer(initial({ channel: VOICE, server: COMMUNITY }), {
      server: PERSONAL,
      type: "selectServer",
    });

    assert.equal(next.channel, null);
    assert.deepEqual(next.server, PERSONAL);
  });

  it("aynı sunucunun zenginleşmesi kanalı düşürmez", () => {
    // Sunucu listesi `type` taşımıyor; tip yalnız detay yanıtında geliyor. Aynı kimlikle gelen
    // ikinci `selectServer` bir zenginleşmedir, yeni bir seçim değil.
    const thin: EventPlaceServer = { ...COMMUNITY, type: null };
    const next = eventCreateFormReducer(initial({ channel: VOICE, server: thin }), {
      server: COMMUNITY,
      type: "selectServer",
    });

    assert.deepEqual(next.channel, VOICE);
    assert.equal(next.server?.type, "COMMUNITY");
  });

  it("harici bağlantı kipi kanalı düşürür, kanal seçimi harici bağlantıyı düşürür", () => {
    const external = eventCreateFormReducer(initial({ channel: VOICE, server: COMMUNITY }), {
      type: "selectExternal",
    });

    assert.equal(external.placeMode, "external");
    assert.equal(external.channel, null);

    const back = eventCreateFormReducer(
      { ...external, externalLocation: "https://example.com" },
      { channel: VOICE, type: "selectChannel" },
    );

    assert.equal(back.placeMode, "channel");
    assert.equal(back.externalLocation, "");
  });

  it("`selectEventPlaceServers` yalnız yönetebildiğin sunucuları bırakır", () => {
    const servers = selectEventPlaceServers([
      { accessLevel: "OWNER", iconUrl: null, id: "a", name: "A", shortName: "A" },
      { accessLevel: "ADMIN", iconUrl: "https://cdn/i.png", id: "b", name: "B", shortName: null },
      { accessLevel: "MEMBER", iconUrl: null, id: "c", name: "C", shortName: null },
    ]);

    assert.deepEqual(
      servers.map((server) => server.id),
      ["a", "b"],
    );
    assert.equal(servers[0]?.type, null);
  });

  it("sunucu tile'ı kısa addan, yoksa adın ilk harfinden gelir", () => {
    assert.equal(eventPlaceServerInitials(COMMUNITY), "W");
    assert.equal(eventPlaceServerInitials(PERSONAL), "P");
    assert.equal(eventPlaceServerInitials({ ...PERSONAL, shortName: "tk" }), "TK");
  });
});

describe("events create-form — herkese açıklık (K3)", () => {
  it("yalnız COMMUNITY sunucuda etkin", () => {
    assert.equal(canListEventInDiscover(COMMUNITY), true);
    assert.equal(canListEventInDiscover(PERSONAL), false);
    assert.equal(canListEventInDiscover(null), false);
    // Tipi henüz bilinmeyen sunucuda da kapalı: bilinmeyeni "açılabilir" saymak, PERSONAL bir
    // sunucuda anahtarı bir an için etkin gösterirdi.
    assert.equal(canListEventInDiscover({ ...COMMUNITY, type: null }), false);
  });

  it("PERSONAL sunucuda anahtar yazılamaz", () => {
    assert.equal(
      eventCreateFormReducer(initial({ server: PERSONAL }), { type: "setPublic", value: true })
        .isPublic,
      false,
    );
  });

  it("COMMUNITY sunucuda anahtar yazılır", () => {
    assert.equal(
      eventCreateFormReducer(initial({ server: COMMUNITY }), { type: "setPublic", value: true })
        .isPublic,
      true,
    );
  });

  it("sunucu tipi sonradan öğrenilince durum türetilir", () => {
    const thin = initial({ isPublic: true, server: { ...COMMUNITY, type: null } });

    assert.equal(withEventServerType(thin, "COMMUNITY").server?.type, "COMMUNITY");
    assert.equal(withEventServerType(thin, "COMMUNITY").isPublic, true);
    // PERSONAL öğrenildiğinde açık kalan anahtar kapanır: sunucu keşfete yazmayı reddederdi.
    assert.equal(withEventServerType(thin, "PERSONAL").isPublic, false);
    // Bilgi yoksa durum **aynı nesne** kalır; gereksiz render tetiklenmez.
    assert.equal(withEventServerType(thin, null), thin);
    const empty = initial();

    assert.equal(withEventServerType(empty, "COMMUNITY"), empty);
  });

  it("sunucu COMMUNITY olmayanla değişince açık anahtar kapanır", () => {
    const open = eventCreateFormReducer(initial({ server: COMMUNITY }), {
      type: "setPublic",
      value: true,
    });

    assert.equal(
      eventCreateFormReducer(open, { server: PERSONAL, type: "selectServer" }).isPublic,
      false,
    );
  });
});

describe("events create-form — yerel tarih-saat", () => {
  it("boş ve bozuk değer `null`", () => {
    assert.equal(parseLocalDateTimeValue(""), null);
    assert.equal(parseLocalDateTimeValue("yarın"), null);
    assert.equal(parseLocalDateTimeValue("2026-13-45T99:99"), null);
  });

  it("gidiş dönüş aynı anı verir", () => {
    const value = toLocalDateTimeValue(new Date("2026-08-27T12:00:00.000Z"));
    const iso = parseLocalDateTimeValue(value);

    assert.ok(iso);
    assert.equal(new Date(iso).getTime(), new Date("2026-08-27T12:00:00.000Z").getTime());
  });

  it("üretilen ISO sözleşmenin `offset` kuralına uyar", () => {
    const iso = parseLocalDateTimeValue(toLocalDateTimeValue(new Date("2026-09-01T18:30:00.000Z")));

    assert.ok(iso);
    assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/u);
  });
});

describe("events create-form — harici bağlantı", () => {
  it("yalnız http/https kabul edilir", () => {
    assert.equal(isValidEventExternalLocation("https://meet.example.com/oda"), true);
    assert.equal(isValidEventExternalLocation("http://example.com"), true);
    assert.equal(isValidEventExternalLocation("javascript:alert(1)"), false);
    assert.equal(isValidEventExternalLocation("meet.example.com"), false);
    assert.equal(isValidEventExternalLocation(""), false);
  });

  it("255 karakter sınırı sözleşmeyle aynı", () => {
    assert.equal(EVENT_EXTERNAL_LOCATION_MAX, 255);

    assert.equal(
      isValidEventExternalLocation(
        `https://example.com/${"a".repeat(EVENT_EXTERNAL_LOCATION_MAX)}`,
      ),
      false,
    );
  });
});

describe("events create-form — doğrulama ve `CreateEventInput`", () => {
  const ready = (): EventCreateFormState =>
    initial({ channel: VOICE, server: COMMUNITY, title: "Tasarım Kritiği" });

  it("eksik başlık, yer ve sunucu ayrı ayrı raporlanır", () => {
    const result = validateEventCreateForm(initial());

    assert.equal(result.ok, false);
    assert.deepEqual([...result.errors].sort(), ["place", "server", "title"]);
  });

  it("120 karakterden uzun başlık reddedilir", () => {
    assert.equal(EVENT_CREATE_TITLE_MAX, 120);

    const result = validateEventCreateForm({
      ...ready(),
      title: "x".repeat(EVENT_CREATE_TITLE_MAX + 1),
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["title"]);
  });

  it("yalnız boşluk taşıyan başlık boş sayılır", () => {
    const result = validateEventCreateForm({ ...ready(), title: "   " });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["title"]);
  });

  it("geçersiz harici bağlantı reddedilir", () => {
    const result = validateEventCreateForm({
      ...ready(),
      channel: null,
      externalLocation: "meet.example.com",
      placeMode: "external",
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["externalLocation"]);
  });

  it("bozuk tarih-saat reddedilir", () => {
    const result = validateEventCreateForm({ ...ready(), startsAtLocal: "" });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["startsAt"]);
  });

  it("türe uymayan kanal seçiliyse yer hatası verir", () => {
    // Kural bir kez daha kapıda duruyor: kanal listesi süzülü olsa bile, tür değişimini izleyen
    // bir yarış kalırsa 422 kullanıcıya değil, forma çarpar.
    const result = validateEventCreateForm({ ...ready(), kind: "live" });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["place"]);
  });

  it("geçerli form sözleşmeye uyan bir girdi üretir", () => {
    const result = validateEventCreateForm(ready());

    assert.ok(result.ok);
    assert.deepEqual(CreateEventInputSchema.parse(result.input), result.input);
    assert.equal(result.input.channelId, VOICE.id);
    assert.equal(result.input.serverId, COMMUNITY.id);
    assert.equal(result.input.durationMinutes, 45);
    assert.equal(result.input.kind, "voice");
    assert.equal(result.input.title, "Tasarım Kritiği");
    assert.equal(result.input.isPublic, false);
    assert.equal("externalLocation" in result.input, false);
  });

  it("harici kipte `channelId` hiç gönderilmez", () => {
    const input = buildCreateEventInput({
      ...ready(),
      channel: null,
      externalLocation: "https://meet.example.com/oda",
      placeMode: "external",
    });

    assert.ok(input);
    assert.equal("channelId" in input, false);
    assert.equal(input.externalLocation, "https://meet.example.com/oda");
    // K10 — ikisi birlikte gitseydi şema zaten reddederdi; burada hiç üretilmiyor.
    assert.deepEqual(CreateEventInputSchema.parse(input), input);
  });

  it("geçersiz formda girdi üretilmez", () => {
    assert.equal(buildCreateEventInput(initial()), null);
  });
});

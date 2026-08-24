import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventKind } from "@wizards/types";

import { EventPlacePicker } from "@/components/events/event-place-picker";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import {
  createEventFormInitialState,
  type EventCreateFormState,
  type EventPlaceChannel,
  type EventPlaceServer,
} from "@/lib/events/create-form";

/**
 * Ş8 — yer seçici (K10).
 *
 * Kanal listesi **türe göre** süzülür. Süzgeç modalda değil `create-form.ts`te yaşıyor; buradaki
 * testler onun çizime bağlandığını kanıtlıyor: metin kanalına konmuş bir canlı yayın
 * `Yayına katıl` butonunu anlamsız yapar ve sunucudan 422 döner.
 */

const MESSAGES = getMessagesForLocale("tr");

/** `noUncheckedIndexedAccess`: sözlükten okunan her anahtar `string | undefined`. */
const copy = (key: string): string => MESSAGES[key] ?? "";

const COMMUNITY: EventPlaceServer = {
  iconUrl: null,
  id: "s1",
  name: "Whispr Topluluğu",
  shortName: "W",
  type: "COMMUNITY",
};

const OTHER: EventPlaceServer = {
  iconUrl: null,
  id: "s2",
  name: "Oyun Kulübü",
  shortName: null,
  type: "PERSONAL",
};

const CHANNELS: readonly EventPlaceChannel[] = [
  { id: "c-text", name: "tasarım-kritiği", type: "TEXT" },
  { id: "c-voice", name: "sesli oda", type: "VOICE" },
  { id: "c-stage", name: "sahne", type: "STAGE" },
];

function state(overrides: Partial<EventCreateFormState> = {}): EventCreateFormState {
  return {
    ...createEventFormInitialState({
      now: new Date("2026-08-27T09:00:00.000Z"),
      server: COMMUNITY,
    }),
    ...overrides,
  };
}

function render(props: Partial<React.ComponentProps<typeof EventPlacePicker>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <EventPlacePicker
        channels={CHANNELS}
        dispatch={() => {}}
        onToggle={() => {}}
        open
        servers={[COMMUNITY, OTHER]}
        state={state()}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("events place picker — kanal listesi türe göre süzülür (K10)", () => {
  const expected: Record<EventKind, readonly string[]> = {
    community: ["sahne"],
    game: ["sesli oda"],
    live: ["sahne"],
    meeting: ["tasarım-kritiği", "sesli oda"],
    voice: ["sesli oda"],
    workshop: ["tasarım-kritiği", "sesli oda"],
  };

  for (const kind of Object.keys(expected) as EventKind[]) {
    it(`${kind} yalnız kendi kanallarını gösterir`, () => {
      const markup = render({ state: state({ kind }) });
      const listed = CHANNELS.filter((channel) =>
        markup.includes(`data-testid="events-place-channel-${channel.id}"`),
      ).map((channel) => channel.name);

      assert.deepEqual(listed, expected[kind]);
    });
  }

  it("uygun kanal yoksa liste yerine gerekçe yazar", () => {
    const markup = render({
      channels: [{ id: "c-text", name: "tasarım-kritiği", type: "TEXT" }],
      state: state({ kind: "live" }),
    });

    assert.ok(markup.includes(copy("events.create.placeEmpty")));
    assert.equal(markup.includes('data-testid="events-place-channel-c-text"'), false);
  });
});

describe("events place picker — harici bağlantı", () => {
  it("kanal listesinin yanında her zaman bir harici seçenek var", () => {
    assert.ok(render().includes('data-testid="events-place-external"'));
  });

  it("harici kipte kanal listesi yerine URL alanı gelir", () => {
    const markup = render({ state: state({ placeMode: "external" }) });

    assert.ok(markup.includes('data-testid="events-place-external-input"'));
    assert.equal(markup.includes('data-testid="events-place-channel-c-voice"'), false);
  });

  it("geçersiz URL gerekçesiyle reddedilir", () => {
    const markup = render({
      state: state({ externalLocation: "meet.example.com", placeMode: "external" }),
    });

    assert.ok(markup.includes(copy("events.create.externalInvalid")));
  });

  it("geçerli URL uyarı üretmez", () => {
    const markup = render({
      state: state({ externalLocation: "https://meet.example.com/oda", placeMode: "external" }),
    });

    assert.equal(markup.includes(copy("events.create.externalInvalid")), false);
  });

  it("boş URL alanı henüz hata değildir", () => {
    const markup = render({ state: state({ externalLocation: "", placeMode: "external" }) });

    assert.equal(markup.includes(copy("events.create.externalInvalid")), false);
  });
});

describe("events place picker — alan", () => {
  it("seçili yer `{sunucu} › {kanal}` olarak yazılır", () => {
    const markup = render({
      state: state({ channel: { id: "c-voice", name: "sesli oda", type: "VOICE" } }),
    });

    assert.ok(markup.includes("Whispr Topluluğu › sesli oda"));
  });

  it("yer seçilmemişken yer tutucu yazar", () => {
    assert.ok(
      render({ state: state({ server: null }) }).includes(copy("events.create.placePlaceholder")),
    );
  });

  it("tür değişimi kanalı temizlediyse uyarı çıkar", () => {
    const markup = render({ state: state({ channelCleared: true }) });

    assert.ok(markup.includes(copy("events.create.channelCleared")));
    assert.match(markup, /role="status"/u);
  });

  it("uyarı yalnız temizlik olduğunda çıkar", () => {
    assert.equal(render().includes(copy("events.create.channelCleared")), false);
  });

  it("sunucu listesi verilen sunucuları ve tile harflerini taşır", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="events-place-server-s1"'));
    assert.ok(markup.includes('data-testid="events-place-server-s2"'));
    assert.ok(markup.includes(">W<"));
    assert.ok(markup.includes(">O<"));
  });

  it("açılır kapanır bir alan: `aria-expanded` durumu söyler", () => {
    assert.match(render(), /aria-expanded="true"/u);
    assert.match(render({ open: false }), /aria-expanded="false"/u);
    assert.equal(render({ open: false }).includes('data-testid="events-place-server-s1"'), false);
  });

  it("ölçüler sözlükten: çıplak px sınıfı yok", () => {
    assert.equal(/-\[-?\d+(\.\d+)?px\]/u.test(render()), false);
  });
});

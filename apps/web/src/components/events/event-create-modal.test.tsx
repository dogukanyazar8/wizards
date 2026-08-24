import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatEventDateTimeValue } from "@/components/events/event-datetime-field";
import {
  EVENT_CREATE_MODAL_CARD_CLASS,
  EVENT_CREATE_MODAL_CARD_STYLE,
  EVENT_CREATE_MODAL_OVERLAY_CLASS,
  EventCreateForm,
} from "@/components/events/event-create-modal";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";
import {
  createEventFormInitialState,
  type EventCreateFormState,
  type EventPlaceChannel,
  type EventPlaceServer,
} from "@/lib/events/create-form";

/**
 * Ş8 — oluştur modalı (SPEC §6).
 *
 * Çizim testleri `EventCreateForm`u doğrudan sürüyor: `Modal` gövdeye portallanıyor ve `document`
 * olmayan bir ortamda `null` döndürüyor, yani kabuğun içinden hiçbir şey doğrulanamazdı.
 *
 * **Modalda tekrar alanı yoktur** (K6) — alt metnin kendisi bunu söylüyor ve test "Tekrar"
 * sözcüğünün ekranda tam bir kez geçtiğini sayıyor.
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

const PERSONAL: EventPlaceServer = { ...COMMUNITY, id: "s2", name: "Product", type: "PERSONAL" };

const CHANNELS: readonly EventPlaceChannel[] = [
  { id: "c-voice", name: "sesli oda", type: "VOICE" },
];

function state(overrides: Partial<EventCreateFormState> = {}): EventCreateFormState {
  return {
    ...createEventFormInitialState({
      now: new Date("2026-08-27T09:00:00.000Z"),
      server: COMMUNITY,
    }),
    startsAtLocal: "2026-08-27T15:00",
    ...overrides,
  };
}

function render(props: Partial<React.ComponentProps<typeof EventCreateForm>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <EventCreateForm
        channels={CHANNELS}
        dispatch={() => {}}
        errors={[]}
        onCancel={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
        onTogglePlace={() => {}}
        placeOpen={false}
        saveError={null}
        servers={[COMMUNITY, PERSONAL]}
        state={state()}
        submitting={false}
        {...props}
      />
    </LocaleProvider>,
  );
}

function buttonMarkup(markup: string, testId: string): string {
  const at = markup.indexOf(`data-testid="${testId}"`);

  return markup.slice(markup.lastIndexOf("<button", at), markup.indexOf("</button>", at));
}

describe("events create modal — kabuk", () => {
  it("kart 560 px ve 22 yarıçap", () => {
    assert.equal(EVENT_CREATE_MODAL_CARD_STYLE.width, pxToRem(EVENTS_METRICS.createModal.width));
    assert.equal(EVENT_CREATE_MODAL_CARD_STYLE.width, "35rem");
    assert.equal(EVENT_CREATE_MODAL_CARD_STYLE.borderRadius, "1.375rem");
  });

  it("kabuğun sınıfı sözlükle aynı sayıyı yazar", () => {
    // `Modal` yalnız `className` alıyor ve Tailwind dinamik sınıf derlemiyor; sınıftaki sayı bu
    // yüzden elle yazılmak zorunda. Bu iddia onu sözlüğe bağlar: biri değişirse test kırılır.
    assert.ok(
      EVENT_CREATE_MODAL_CARD_CLASS.includes(`max-w-[${EVENT_CREATE_MODAL_CARD_STYLE.width}]`),
    );
    assert.ok(
      EVENT_CREATE_MODAL_CARD_CLASS.includes(
        `rounded-[${EVENT_CREATE_MODAL_CARD_STYLE.borderRadius}]`,
      ),
    );
    // Örtü: `--backdrop/.62` + 40 px iç boşluk (SPEC §6).
    assert.ok(EVENT_CREATE_MODAL_OVERLAY_CLASS.includes("hsl(var(--backdrop)/0.62)"));
    assert.ok(
      EVENT_CREATE_MODAL_OVERLAY_CLASS.includes(
        `p-${EVENTS_METRICS.createModal.overlayPadding / 4}`,
      ),
    );
  });

  it("başlık, alt metin ve kapat düğmesi SPEC ile birebir", () => {
    const markup = render();

    assert.ok(markup.includes("Etkinlik oluştur"));
    assert.ok(markup.includes("Sunucu üyelerine bildirim gider, katılım yanıtları sayılır"));
    assert.ok(markup.includes(`aria-label="${copy("events.create.close")}"`));
  });

  it("alt metin SPEC ile birebir ve modalda tekrar alanı yok (K6)", () => {
    const markup = render();

    assert.ok(markup.includes("Tekrar eden etkinlikler oluşturulduktan sonra ayarlanır"));
    assert.equal(markup.match(/Tekrar/gu)?.length, 1, "`Tekrar` yalnız alt metinde geçmeli");
    assert.equal(/tekrar|recurrence|rrule/iu.test(markup.replace(/Tekrar eden[^<]*/u, "")), false);
  });
});

describe("events create modal — tür ızgarası", () => {
  it("altı seçenek üç kolonda", () => {
    const markup = render();

    for (const kind of ["voice", "meeting", "game", "live", "community", "workshop"]) {
      assert.ok(markup.includes(`data-testid="events-kind-${kind}"`), `${kind} yok`);
    }

    assert.ok(
      markup.includes(
        `grid-template-columns:repeat(${EVENTS_METRICS.createModal.kindColumns}, 1fr)`,
      ),
    );
    assert.match(markup, /role="radiogroup"/u);
  });

  it("seçili kutu `--primary/.1` zemin ve `--primary/.45` kenar taşır", () => {
    const selected = buttonMarkup(render({ state: state({ kind: "game" }) }), "events-kind-game");

    assert.ok(selected.includes("hsl(var(--primary)/0.1)"));
    assert.ok(selected.includes("hsl(var(--primary)/0.45)"));
    assert.ok(selected.includes('aria-checked="true"'));
  });

  it("tür pili metnini de taşır: renk tek başına anlam taşımaz", () => {
    const markup = render();

    for (const label of ["Sesli buluşma", "Toplantı", "Oyun gecesi", "Canlı yayın", "Atölye"]) {
      assert.ok(markup.includes(label), `${label} yok`);
    }
  });
});

describe("events create modal — alanlar", () => {
  it("başlık alanı SPEC'in yer tutucusunu taşır", () => {
    assert.ok(render().includes(`placeholder="${copy("events.create.titlePlaceholder")}"`));
  });

  it("tarih-saat alanı değerin kendisini yazar", () => {
    assert.equal(formatEventDateTimeValue("2026-08-27T15:00", "tr"), "27 Ağustos · 15:00");
    assert.ok(render().includes("27 Ağustos · 15:00"));
  });

  it("süre segmenti üç seçenek ve seçili olan `--primary` zemin", () => {
    const markup = render();

    for (const duration of [30, 45, 60]) {
      assert.ok(markup.includes(`data-testid="events-duration-${duration}"`));
    }

    const selected = buttonMarkup(markup, "events-duration-45");

    assert.ok(selected.includes("hsl(var(--primary))"));
    assert.ok(selected.includes('aria-checked="true"'));
    assert.ok(markup.includes(copy("events.create.duration.60")));
  });

  it("yer alanı seçiciyi taşır", () => {
    assert.ok(render().includes('data-testid="events-place-trigger"'));
  });
});

describe("events create modal — `Topluluk keşfetinde listele` (K3)", () => {
  it("topuz kapalıyken 3, açıkken 21 px", () => {
    assert.ok(render().includes(`left:${pxToRem(3)}`));
    assert.ok(render({ state: state({ isPublic: true }) }).includes(`left:${pxToRem(21)}`));
  });

  it("yalnız COMMUNITY sunucuda etkin", () => {
    const community = render();
    const personal = render({ state: state({ server: PERSONAL }) });

    assert.equal(/data-testid="events-create-public"[^>]*disabled/u.test(community), false);
    assert.match(personal, /data-testid="events-create-public"[^>]*disabled/u);
    assert.ok(personal.includes(copy("events.create.publicDisabled")));
    assert.equal(community.includes(copy("events.create.publicDisabled")), false);
  });

  it("anahtar başlığı ve alt metni SPEC ile birebir", () => {
    const markup = render();

    assert.ok(markup.includes("Topluluk keşfetinde listele"));
    assert.ok(markup.includes("Sunucu dışındaki kullanıcılar da görebilir ve katılabilir"));
  });
});

describe("events create modal — gönderim", () => {
  it("gönderim sırasında `Oluştur` pasif", () => {
    assert.match(render({ submitting: true }), /data-testid="events-create-submit"[^>]*disabled/u);
    assert.equal(/data-testid="events-create-submit"[^>]*disabled/u.test(render()), false);
  });

  it("yönetilebilir sunucu yoksa gönderim kapalı ve gerekçe yazılı", () => {
    const markup = render({ servers: [], state: state({ server: null }) });

    assert.ok(markup.includes(copy("events.create.noServers")));
    assert.match(markup, /data-testid="events-create-submit"[^>]*disabled/u);
  });

  it("doğrulama hataları alanın yanında yazılır", () => {
    const markup = render({ errors: ["title", "place"] });

    assert.ok(markup.includes(copy("events.create.titleInvalid")));
    assert.ok(markup.includes(copy("events.create.placeInvalid")));
    assert.equal(render().includes(copy("events.create.titleInvalid")), false);
  });

  it("sunucu hatası satır içinde kalır", () => {
    assert.ok(
      render({ saveError: copy("events.create.error") }).includes("Etkinlik oluşturulamadı"),
    );
  });

  it("İptal ve Oluştur SPEC metinleriyle", () => {
    const markup = render();

    assert.ok(markup.includes("İptal"));
    assert.ok(markup.includes("Oluştur"));
  });
});

describe("events create modal — ölçü kaynağı", () => {
  it("çıplak px sınıfı yok", () => {
    assert.equal(/-\[-?\d+(\.\d+)?px\]/u.test(render()), false);
  });
});

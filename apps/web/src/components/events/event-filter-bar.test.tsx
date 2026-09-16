import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EventFilterBar, buildEventFilterChips } from "@/components/events/event-filter-bar";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş8 — filtre şeridi (SPEC §3.3).
 *
 * Şerit **yalnız aktif filtre varken** çizilir ve çip sırası tasarımın sırasıdır. Sıra bir
 * süsleme değil: `Tümünü temizle`nin ne yaptığı ancak çipler eksenleriyle aynı düzende
 * durduğunda okunur.
 */

const MESSAGES = getMessagesForLocale("tr");

/** `noUncheckedIndexedAccess`: sözlükten okunan her anahtar `string | undefined`. */
const copy = (key: string): string => MESSAGES[key] ?? "";

const EMPTY = { mine: null, query: null, source: null, time: null } as const;

function render(props: Partial<React.ComponentProps<typeof EventFilterBar>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <EventFilterBar
        onClearAll={() => {}}
        onRemove={() => {}}
        state={{ ...EMPTY, time: "today" }}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("events filter bar — çip kaynakları", () => {
  it("seçilen tarihi yerelleştirir ve kaldırılabilir bir filtre olarak gösterir", () => {
    const markup = render({ state: { ...EMPTY, date: "2026-09-18" } });
    assert.ok(markup.includes("18 Eylül 2026"));
    assert.ok(
      markup.includes(
        `aria-label="${copy("events.filters.remove").replace("{label}", "18 Eylül 2026")}"`,
      ),
    );
    assert.equal(buildEventFilterChips({ ...EMPTY, date: "2026-09-18" })[0]?.axis, "date");
  });

  it("aktif filtre yokken çip üretilmez", () => {
    assert.deepEqual(buildEventFilterChips(EMPTY), []);
  });

  it("çip sırası zaman → kaynak → katılım → arama", () => {
    const chips = buildEventFilterChips({
      mine: "going",
      query: "oyun",
      source: { id: "s1", name: "Oyun Kulübü" },
      time: "week",
    });

    assert.deepEqual(
      chips.map((chip) => chip.axis),
      ["time", "source", "mine", "query"],
    );
    assert.deepEqual(
      chips.map((chip) => chip.key),
      ["events.filters.time.week", null, "events.filters.mine.going", "events.filters.query"],
    );
  });

  it("kaynak çipi sunucunun kendi adını taşır, bir sözlük anahtarını değil", () => {
    const [chip] = buildEventFilterChips({ ...EMPTY, source: { id: "s1", name: "Oyun Kulübü" } });

    assert.equal(chip?.key, null);
    assert.equal(chip?.text, "Oyun Kulübü");
  });

  it("arama çipi tırnaklı", () => {
    const [chip] = buildEventFilterChips({ ...EMPTY, query: "oyun" });

    assert.equal(chip?.key, "events.filters.query");
    assert.deepEqual(chip?.params, { query: "oyun" });
    assert.equal(copy("events.filters.query"), "“{query}”");
  });

  it("dört zaman ve üç katılım değeri kendi anahtarını taşır", () => {
    for (const time of ["today", "week", "month", "past"] as const) {
      assert.equal(
        buildEventFilterChips({ ...EMPTY, time })[0]?.key,
        `events.filters.time.${time}`,
      );
    }

    for (const mine of ["going", "maybe", "host"] as const) {
      assert.equal(
        buildEventFilterChips({ ...EMPTY, mine })[0]?.key,
        `events.filters.mine.${mine}`,
      );
    }
  });

  it("sekme çip üretmez", () => {
    // Sekme başlıkta zaten görünür; iki yerde göstermek `Tümünü temizle`nin ne yapacağını
    // belirsizleştirirdi. Kurgu: yalnız `tab` seçili, başka eksen yok.
    assert.deepEqual(buildEventFilterChips({ ...EMPTY }), []);
  });
});

describe("events filter bar — çizim", () => {
  it("aktif filtre yokken hiç render edilmez", () => {
    assert.equal(render({ state: EMPTY }), "");
  });

  it("şerit bir bölge ve adı var", () => {
    const markup = render();

    assert.match(markup, /role="region"/u);
    assert.ok(markup.includes(`aria-label="${copy("events.a11y.filterBar")}"`));
    assert.ok(markup.includes(copy("events.filters.label")));
  });

  it("her kaldır düğmesi gerçek bir buton ve kendi ekseninin adını taşır", () => {
    const markup = render({
      state: {
        mine: "going",
        query: "oyun",
        source: { id: "s1", name: "Oyun Kulübü" },
        time: "today",
      },
    });

    for (const label of ["Bugün", "Oyun Kulübü", "Katılacağım", "“oyun”"]) {
      assert.ok(
        markup.includes(`aria-label="${copy("events.filters.remove").replace("{label}", label)}"`),
        `kaldır etiketi yok: ${label}`,
      );
    }

    assert.equal(markup.match(/<button/gu)?.length, 5, "dört kaldır + bir Tümünü temizle");
  });

  it("`Tümünü temizle` çizilir", () => {
    assert.ok(render().includes(copy("events.filters.clearAll")));
  });

  it("ölçüler sözlükten: çıplak px sınıfı yok", () => {
    assert.equal(/-\[-?\d+(\.\d+)?px\]/u.test(render()), false);
  });
});

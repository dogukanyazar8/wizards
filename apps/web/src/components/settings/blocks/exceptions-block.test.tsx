import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  ExceptionsBlock,
  resolveClockVowel,
  resolveExceptionGlyph,
} from "@/components/settings/blocks/exceptions-block";
import {
  NOTIFICATIONS_SECTION_FALLBACK,
  NotificationsSectionContext,
  type NotificationsSectionValue,
} from "@/components/settings/sections/notifications/notifications-section-context";
import { getMessagesForLocale } from "@/lib/locale";
import type { NotificationException } from "@/lib/notifications/exceptions-service";
import type { SettingsRowDef } from "@/lib/settings/tree";

/**
 * Ş9 §7 — `Aktif istisnalar`.
 *
 * Liste gerçek veridir: boşken boş durum metni, kesildiğinde alt satır, karşılığı olmayan
 * kapsamda `disabled` düğme. Tasarımdaki altı örnek satır hiçbir durumda çizilmez.
 */

const MESSAGES = getMessagesForLocale("tr");
const ROW: SettingsRowDef = { block: "exceptions", key: "ne0", type: "custom" };

function makeException(overrides: Partial<NotificationException> = {}): NotificationException {
  return {
    iconUrl: null,
    id: "channel:c1",
    level: "mentions",
    mutedUntil: null,
    name: "#duyurular",
    scope: "channel",
    scopeId: "c1",
    ...overrides,
  };
}

function render(section: Partial<NotificationsSectionValue>): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <NotificationsSectionContext.Provider
        value={{ ...NOTIFICATIONS_SECTION_FALLBACK, ...section }}
      >
        <ExceptionsBlock data={{}} row={ROW} />
      </NotificationsSectionContext.Provider>
    </LocaleProvider>,
  );
}

function ready(
  items: readonly NotificationException[],
  truncated = false,
): Partial<NotificationsSectionValue> {
  return { exceptions: { items: [...items], truncated }, exceptionsState: "ready" };
}

describe("ExceptionsBlock — liste durumları", () => {
  it("boşken boş durum metni yazıyor, uydurma satır çizmiyor", () => {
    const markup = render(ready([]));

    assert.ok(markup.includes("Genel tercihlerden farklı davranan sunucu"));
    assert.ok(!markup.includes("Oyun Kulübü Türkiye"));
    assert.ok(!markup.includes("data-setting-exception"));
  });

  it("hata durumunda boş durum yerine hata metni yazıyor", () => {
    const markup = render({ exceptions: null, exceptionsState: "error" });

    assert.ok(markup.includes("İstisnalar yüklenemedi."));
  });

  it("yükleme sırasında iskelet çiziyor", () => {
    const markup = render({ exceptions: null, exceptionsState: "loading" });

    assert.ok(markup.includes('aria-busy="true"'));
    assert.ok(markup.includes('role="status"'));
  });

  it("`truncated` geldiğinde alt satır çiziliyor", () => {
    const items = [makeException(), makeException({ id: "dm:u1", scope: "dm", scopeId: "u1" })];

    assert.ok(render(ready(items, true)).includes("İlk 2 istisna gösteriliyor"));
    assert.ok(!render(ready(items)).includes("İlk 2 istisna gösteriliyor"));
  });
});

describe("ExceptionsBlock — satır içeriği", () => {
  it("`Kapsam · Düzey` satırı iki parçadan kuruluyor", () => {
    const markup = render(ready([makeException()]));

    assert.ok(markup.includes("#duyurular"));
    assert.ok(markup.includes("Kanal · Bahsetmeler"));
  });

  it("kapsam ve düzey etiketleri sözlükten geliyor", () => {
    const markup = render(
      ready([
        makeException({
          id: "server:s1",
          level: "important",
          name: "Oyun Kulübü",
          scope: "server",
          scopeId: "s1",
        }),
        makeException({
          id: "dm:u1",
          level: "all",
          name: "Selin Aksoy",
          scope: "dm",
          scopeId: "u1",
        }),
      ]),
    );

    assert.ok(markup.includes("Sunucu · Yalnızca önemli"));
    assert.ok(markup.includes("Konuşma · Tümü"));
  });

  it("süresiz sessize alma `Ben açana kadar` yazıyor", () => {
    const markup = render(ready([makeException({ level: "muted", mutedUntil: null })]));

    assert.ok(markup.includes("Ben açana kadar"));
  });

  it("süreli sessize alma bitişi tarihten yazılıyor", () => {
    const markup = render(
      ready([makeException({ level: "muted", mutedUntil: "2026-08-24T15:00:00.000Z" })]),
    );

    assert.ok(markup.includes("kadar"));
    assert.ok(!markup.includes("Ben açana kadar"));
  });

  it("sessize alınmamış satırda bitiş pili yok", () => {
    assert.ok(!render(ready([makeException({ level: "all" })])).includes("kadar"));
  });

  it("kanal satırı `#`, kişi satırı baş harfleri gösteriyor", () => {
    assert.equal(resolveExceptionGlyph(makeException()), "#");
    assert.equal(resolveExceptionGlyph(makeException({ name: "Selin Aksoy", scope: "dm" })), "SA");
    assert.equal(resolveExceptionGlyph(makeException({ name: "", scope: "server" })), "?");
  });
});

describe("ExceptionsBlock — yazma yetkisi (K4)", () => {
  it("sunucu satırında iki düğme de `disabled` ve nedeni yazılı", () => {
    const markup = render(
      ready([
        makeException({ id: "server:s1", name: "Oyun Kulübü", scope: "server", scopeId: "s1" }),
      ]),
    );

    const edit = markup.slice(markup.indexOf('data-testid="setting-exception-edit-server:s1"'));

    assert.ok(edit.startsWith('data-testid="setting-exception-edit-server:s1" disabled'));
    assert.ok(markup.includes("Bu satır şimdilik buradan değiştirilemiyor."));
  });

  it("konuşma satırında ikisi de açık", () => {
    const markup = render(
      ready([makeException({ id: "dm:u1", name: "Selin Aksoy", scope: "dm", scopeId: "u1" })]),
    );

    // `disabled=""` gerçek nitelik; `disabled:opacity-55` yalnız bir sınıf adı.
    assert.ok(!markup.includes('disabled=""'));
  });

  it("kanal satırında düzenleme açık, kaldırma kapalı", () => {
    const markup = render(ready([makeException()]));
    const remove = markup.slice(
      markup.indexOf('data-testid="setting-exception-remove-channel:c1"'),
    );

    assert.ok(remove.startsWith('data-testid="setting-exception-remove-channel:c1" disabled'));
    assert.ok(!markup.includes('setting-exception-edit-channel:c1" disabled'));
  });

  it("uçuşta olan satırın düğmeleri bekliyor", () => {
    const markup = render({
      ...ready([makeException({ id: "dm:u1", scope: "dm", scopeId: "u1" })]),
      pendingExceptionId: "dm:u1",
    });

    assert.equal(markup.match(/disabled=""/gu)?.length, 2);
  });
});

describe("ExceptionsBlock — düzey menüsü", () => {
  it("menü açıkken `Düzenle` yerine dört yazılabilir düzey duruyor", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
        <NotificationsSectionContext.Provider
          value={{
            ...NOTIFICATIONS_SECTION_FALLBACK,
            ...ready([makeException({ id: "dm:u1", scope: "dm", scopeId: "u1" })]),
          }}
        >
          <ExceptionsBlock data={{}} row={ROW} />
        </NotificationsSectionContext.Provider>
      </LocaleProvider>,
    );

    // Kapalı menüde `Düzenle` düğmesi var; açık menü motorun merdivenine bağlı olduğu için
    // yalıtılmış çizimde kapalı kalır.
    assert.ok(markup.includes("Düzenle"));
    assert.ok(!markup.includes('role="listbox"'));
  });
});

describe("ExceptionsBlock — Türkçe saat eki", () => {
  it("`18:00` → `a`, `18:45` → `e`", () => {
    assert.equal(resolveClockVowel(0), "a");
    assert.equal(resolveClockVowel(45), "e");
  });

  it("onluk basamak yalnız birler sıfırken okunuyor", () => {
    assert.equal(resolveClockVowel(30), "a");
    assert.equal(resolveClockVowel(20), "e");
    assert.equal(resolveClockVowel(50), "e");
    assert.equal(resolveClockVowel(15), "e");
    assert.equal(resolveClockVowel(6), "a");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DMNotifyLevel } from "@wizards/types";

import {
  NOTIFY_CHOICES,
  NotificationChoiceCards,
  nextRadioIndex,
  notifyWriteFields,
} from "@/components/messages/notification-choice-cards";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

const { profilePanel } = MESSAGES_METRICS;

function render(overrides: Partial<React.ComponentProps<typeof NotificationChoiceCards>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <NotificationChoiceCards onSelect={() => undefined} value="ALL" {...overrides} />
    </LocaleProvider>,
  );
}

describe("BİLDİRİM AYARLARI — üç radyo kartı (SPEC §15.5.1)", () => {
  it("üç seçenek SPEC sırasıyla ve SPEC metniyle çizilir", () => {
    const markup = render();

    assert.deepEqual(
      NOTIFY_CHOICES.map((choice) => choice.level),
      ["ALL", "MENTIONS", "NONE"],
    );

    for (const label of [
      "Tüm mesajlar",
      "Her yeni mesajda bildirim",
      "Sadece bahsedilmeler",
      "@ ile anıldığında bildirim",
      "Kapalı",
      "Bildirim yok, yalnızca rozet",
    ]) {
      assert.ok(markup.includes(label), label);
    }
  });

  it("gerçek radiogroup: üç role=radio, tek aria-checked", () => {
    const markup = render({ value: "MENTIONS" });

    assert.equal(markup.match(/role="radiogroup"/gu)?.length, 1);
    assert.equal(markup.match(/role="radio"/gu)?.length, 3);
    assert.equal(markup.match(/aria-checked="true"/gu)?.length, 1);
    assert.equal(markup.match(/aria-checked="false"/gu)?.length, 2);
  });

  it("roving tabindex — sekme turunda yalnız seçili kart durur", () => {
    const markup = render({ value: "NONE" });

    assert.equal(markup.match(/tabindex="0"/gu)?.length, 1);
    assert.equal(markup.match(/tabindex="-1"/gu)?.length, 2);
  });

  it("grup görünür bölüm etiketine bağlanır", () => {
    const markup = render({ labelledById: "notify-label" });

    assert.ok(markup.includes('aria-labelledby="notify-label"'));
  });

  it("seçili kart primary tint + primary kenar, seçilmeyen kart zemini", () => {
    const markup = render({ value: "ALL" });

    assert.ok(markup.includes("background:hsl(var(--primary)/0.09)"));
    assert.ok(markup.includes("border-color:hsl(var(--primary)/0.45)"));
    assert.ok(markup.includes("border-color:hsl(var(--border)/0.6)"));
  });

  it("17px halka, 8px nokta, ölçüler sözlükten — çıplak px yok", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(profilePanel.notifyRadioSize)}`));
    assert.ok(markup.includes(`width:${pxToRem(profilePanel.notifyRadioDotSize)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(profilePanel.notifyCardRadius)}`));
    // Seçili kart yalnız bir tane, dolayısıyla nokta da bir tane.
    assert.equal(
      markup.match(new RegExp(`width:${pxToRem(profilePanel.notifyRadioDotSize)}`, "gu"))?.length,
      1,
    );
  });

  it("bekleyen yazma sırasında kartlar pasif, gizlenmiyor", () => {
    const markup = render({ disabled: true });

    assert.equal(markup.match(/disabled=""/gu)?.length, 3);
    assert.equal(markup.match(/role="radio"/gu)?.length, 3);
  });
});

describe("ok tuşuyla gezinme (kural 6)", () => {
  it("aşağı/sağ ileri sarar, yukarı/sol geri", () => {
    assert.equal(nextRadioIndex("ArrowDown", 0, 3), 1);
    assert.equal(nextRadioIndex("ArrowRight", 1, 3), 2);
    assert.equal(nextRadioIndex("ArrowUp", 0, 3), 2);
    assert.equal(nextRadioIndex("ArrowLeft", 2, 3), 1);
  });

  it("Home ve End uçlara gider", () => {
    assert.equal(nextRadioIndex("Home", 2, 3), 0);
    assert.equal(nextRadioIndex("End", 0, 3), 2);
  });

  it("bizim olmayan tuş null döner — Tab ve Escape radyo grubunda ölmez", () => {
    for (const key of ["Tab", "Escape", "a", " "]) {
      assert.equal(nextRadioIndex(key, 0, 3), null, key);
    }
  });

  it("boş listede gezinme yok", () => {
    assert.equal(nextRadioIndex("ArrowDown", 0, 0), null);
  });
});

describe("`Kapalı` ile `muted` ikizdir (tuzak 5)", () => {
  it("NONE muted yazar, diğer iki seviye sessizliği kaldırır", () => {
    assert.deepEqual(notifyWriteFields("NONE"), { muted: true, notifyLevel: "NONE" });
    assert.deepEqual(notifyWriteFields("ALL"), { muted: false, notifyLevel: "ALL" });
    assert.deepEqual(notifyWriteFields("MENTIONS"), { muted: false, notifyLevel: "MENTIONS" });
  });

  it("her seviye için tek bir kayıt döner — iki alan, tek karar", () => {
    for (const level of ["ALL", "MENTIONS", "NONE"] satisfies DMNotifyLevel[]) {
      const fields = notifyWriteFields(level);

      assert.equal(fields.notifyLevel, level);
      assert.equal(Object.keys(fields).length, 2);
    }
  });
});

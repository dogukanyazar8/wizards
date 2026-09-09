import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfilePanelTab } from "@wizards/types";

import {
  ProfilePanelTabs,
  nextProfileTabIndex,
  profilePanelTabsFor,
  profileTabButtonId,
} from "@/components/messages/profile-panel-tabs";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * SPEC-MESAJLAR §15.2 — sekme şeridi.
 *
 * Paket testleri jsdom'suz koşuyor, o yüzden klavye gezinmesi **kararı**
 * (`nextProfileTabIndex`) doğrudan sorgulanıyor; DOM'a yansıyan sözleşme
 * (`role`, `aria-*`, gezgin `tabIndex`, hover sınıfları) `renderToStaticMarkup`
 * çıktısından okunuyor. Gerçek tuş vuruşunun kanıtı e2e'nin işi.
 */

function render(overrides: Partial<React.ComponentProps<typeof ProfilePanelTabs>> = {}): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <ProfilePanelTabs
        bodyId="profile-body"
        onSelect={() => undefined}
        tab="genel"
        variant="group"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

function tabMarkup(markup: string, tab: ProfilePanelTab): string {
  const start = markup.indexOf(`data-testid="profile-panel-tab-${tab}"`);
  assert.notEqual(start, -1, `${tab} sekmesi çizilmemiş`);

  // Düğmenin kendi etiketi: geriye açılış `<` işaretine, ileriye kapanış `>`ine.
  const open = markup.lastIndexOf("<button", start);
  const close = markup.indexOf(">", start);

  return markup.slice(open, close + 1);
}

describe("profil paneli sekmeleri — hangi sekmeler (§15.2)", () => {
  it("DM üç sekme çizer, `uyeler` hiç yoktur", () => {
    assert.deepEqual(profilePanelTabsFor("dm"), ["genel", "medya", "ayarlar"]);

    const markup = render({ variant: "dm" });

    assert.match(markup, /data-testid="profile-panel-tab-genel"/u);
    assert.match(markup, /data-testid="profile-panel-tab-medya"/u);
    assert.match(markup, /data-testid="profile-panel-tab-ayarlar"/u);
    assert.doesNotMatch(markup, /data-testid="profile-panel-tab-uyeler"/u);
  });

  it("grup dört sekme çizer ve sıra SPEC'in sırasıdır", () => {
    assert.deepEqual(profilePanelTabsFor("group"), ["genel", "uyeler", "medya", "ayarlar"]);
    assert.match(render(), /data-testid="profile-panel-tab-uyeler"/u);
  });

  it("etiketler sözlükten gelir, JSX'e gömülmez", () => {
    const markup = render();

    for (const label of ["Genel", "Üyeler", "Medya", "Ayarlar"]) {
      assert.ok(markup.includes(label), `${label} etiketi yok`);
    }
  });
});

describe("profil paneli sekmeleri — seçili hâl (§15.2)", () => {
  /**
   * SPEC bunu ayrıca kabul kriterine koymuş: seçili sekmeye bir `hover:bg-*`
   * eklemek en kolay yapılan hata ve sonucu "hangi sekme açık" sorusunun fareyle
   * birlikte kaybolması.
   */
  it("seçili sekme hover'da zemin DEĞİŞTİRMEZ, yalnız parlar", () => {
    const selected = tabMarkup(render({ tab: "genel" }), "genel");

    assert.ok(selected.includes("bg-[hsl(var(--primary))]"));
    assert.ok(selected.includes("hover:[filter:brightness(var(--profile-tab-hover-brightness))]"));
    assert.ok(!selected.includes("hover:bg-"), "seçili sekmede hover zemini var");
  });

  it("parlaklık değeri sözlükten okunur, sınıfa gömülmez", () => {
    assert.match(tabMarkup(render(), "genel"), /--profile-tab-hover-brightness:1\.07/u);
  });

  it("seçili olmayan sekme hover'da zemin ve metin rengi değiştirir", () => {
    const idle = tabMarkup(render({ tab: "genel" }), "medya");

    assert.ok(idle.includes("bg-transparent"));
    assert.ok(idle.includes("hover:bg-[hsl(var(--surface-soft))]"));
    assert.ok(idle.includes("hover:text-[hsl(var(--foreground))]"));
  });

  it("ölçüler sözlükten: h31, radius 10, 600 12", () => {
    const selected = tabMarkup(render(), "genel");

    assert.ok(selected.includes("height:1.9375rem"));
    assert.ok(selected.includes("border-radius:0.625rem"));
    assert.ok(selected.includes("font-size:0.75rem"));
    assert.ok(selected.includes("font-weight:600"));
  });
});

describe("profil paneli sekmeleri — erişilebilirlik (kural 6)", () => {
  it("gerçek `tablist` / `tab` ve `aria-selected`", () => {
    const markup = render({ tab: "medya" });

    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-selected="true"[^>]*data-testid="profile-panel-tab-medya"/u);
    assert.ok(tabMarkup(markup, "genel").includes('aria-selected="false"'));
  });

  it("her sekme gövdeye `aria-controls` ile bağlı", () => {
    const markup = render({ bodyId: "profile-body" });

    for (const tab of profilePanelTabsFor("group")) {
      assert.ok(
        tabMarkup(markup, tab).includes('aria-controls="profile-body"'),
        `${tab} gövdeye bağlı değil`,
      );
    }
  });

  /**
   * Gezgin `tabIndex`: `Tab` şeride bir kez girer. Dördü de 0 olsaydı klavye
   * kullanıcısı gövdeye ulaşmak için dört kez daha `Tab`'a basardı.
   */
  it("yalnız seçili sekme `Tab` sırasında", () => {
    const markup = render({ tab: "ayarlar" });

    assert.ok(tabMarkup(markup, "ayarlar").includes('tabindex="0"'));
    for (const tab of ["genel", "uyeler", "medya"] as const) {
      assert.ok(tabMarkup(markup, tab).includes('tabindex="-1"'), `${tab} sırada kalmış`);
    }
  });

  it("şeridin ve düğmelerin kimlikleri kararlı", () => {
    assert.equal(profileTabButtonId("medya"), "profile-tab-medya");
    assert.ok(render().includes('id="profile-tab-medya"'));
  });

  it("şerit adsız kalmaz ve ad varyanta göre değişir", () => {
    assert.match(render({ variant: "dm" }), /role="tablist"/u);
    assert.ok(render({ variant: "dm" }).includes('aria-label="Kullanıcı profili"'));
    assert.ok(render({ variant: "group" }).includes('aria-label="Grup profili"'));
  });
});

describe("profil paneli sekmeleri — ok tuşları", () => {
  it("sağ ok ilerler ve son sekmede başa sarar", () => {
    assert.equal(nextProfileTabIndex("ArrowRight", 0, 4), 1);
    assert.equal(nextProfileTabIndex("ArrowRight", 3, 4), 0);
  });

  it("sol ok geriler ve ilk sekmede sona sarar", () => {
    assert.equal(nextProfileTabIndex("ArrowLeft", 1, 4), 0);
    assert.equal(nextProfileTabIndex("ArrowLeft", 0, 4), 3);
  });

  it("`Home` ve `End` uçlara gider", () => {
    assert.equal(nextProfileTabIndex("Home", 2, 4), 0);
    assert.equal(nextProfileTabIndex("End", 0, 4), 3);
  });

  /**
   * Şerit yatay. Yukarı/aşağı oklarını da yakalasaydı panelin kaydıran gövdesi
   * klavyeyle kaydırılamaz olurdu — şerit odaktayken her ok tuşu yutulurdu.
   */
  it("dikey oklar ve başka tuşlar şeride ait değildir", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Tab", "a"]) {
      assert.equal(nextProfileTabIndex(key, 1, 4), null, `${key} yutulmuş`);
    }
  });

  it("DM'in üç sekmesinde sarma üç üzerinden olur", () => {
    assert.equal(nextProfileTabIndex("ArrowRight", 2, 3), 0);
    assert.equal(nextProfileTabIndex("End", 0, 3), 2);
  });

  it("sekme yoksa karar da yoktur", () => {
    assert.equal(nextProfileTabIndex("ArrowRight", 0, 0), null);
  });
});

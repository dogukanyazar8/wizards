import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeFriendsTab } from "@wizards/types";

import { FriendsTabs } from "@/components/friends/friends-tabs";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function render(overrides: Partial<React.ComponentProps<typeof FriendsTabs>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <FriendsTabs active="all" onChange={() => undefined} pendingCount={0} {...overrides} />
    </LocaleProvider>,
  );
}

describe("arkadaş sekmeleri — dört sekme (karar #8)", () => {
  it("SPEC'in dört sekmesini çizer", () => {
    const markup = render();

    for (const label of ["Tümü", "Arkadaş ekle", "Bekleyen", "Engellenenler"]) {
      assert.ok(markup.includes(label), label);
    }
  });

  /**
   * Beşinci sekme aynı kişileri ikinci kez listelerdi; çevrimiçi/çevrimdışı
   * artık `Tümü` içinde iki bölüm.
   */
  it("Çevrimiçi sekmesi yok", () => {
    assert.doesNotMatch(render(), /data-testid="friends-tab-online"/);
  });

  it("eski ?dmTab=online bağlantısı Tümü'ye düşer", () => {
    assert.equal(normalizeFriendsTab("online"), "all");
  });
});

describe("arkadaş sekmeleri — erişilebilirlik", () => {
  it("gerçek bir tablist", () => {
    const markup = render();

    assert.match(markup, /role="tablist"/);
    assert.match(markup, /role="tab"/);
    assert.match(markup, /aria-selected="true"/);
  });

  it("her sekme kendi panelini işaret eder", () => {
    const markup = render();

    assert.match(markup, /id="friends-tab-all"/);
    assert.match(markup, /aria-controls="friends-panel-all"/);
  });

  /**
   * Roving tabindex: yalnız seçili sekme sekme turunda durur. Dört ayrı durak,
   * klavye kullanıcısını sekme grubunda dört kez durdururdu.
   */
  it("yalnız seçili sekme sekme turunda durur", () => {
    const markup = render();
    const zeroes = markup.match(/tabindex="0"/g) ?? [];
    const minusOnes = markup.match(/tabindex="-1"/g) ?? [];

    assert.equal(zeroes.length, 1);
    assert.equal(minusOnes.length, 3);
  });
});

describe("arkadaş sekmeleri — bekleyen sayacı", () => {
  it("sıfırken çizilmez", () => {
    assert.doesNotMatch(render(), /data-testid="friends-tab-pending-count"/);
  });

  it("sayı varken çizilir", () => {
    const markup = render({ pendingCount: 3 });

    assert.match(markup, /data-testid="friends-tab-pending-count"/);
    assert.ok(markup.includes(">3<"));
  });
});

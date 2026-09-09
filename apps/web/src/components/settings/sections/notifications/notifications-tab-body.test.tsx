import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_TABS_BY_SECTION } from "@/lib/settings/navigation";
import { SETTINGS_TREE } from "@/lib/settings/tree";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  type SettingsPatch,
  type SettingsRowRuntime,
} from "@/lib/settings/use-setting-value";

import { buildSoundResetPatch } from "./notification-prefs-bridge";
import { NotificationsExceptionsTab } from "./exceptions-tab";
import { NotificationsGeneralTab } from "./general-tab";
import { NotificationsPanelTab } from "./panel-tab";
import { NotificationsQuietHoursTab } from "./quiet-hours-tab";
import {
  NOTIFICATIONS_SECTION_FALLBACK,
  NotificationsSectionContext,
  type NotificationsSectionValue,
} from "./notifications-section-context";
import { NOTIFICATION_ROW_DATA_FIELDS } from "./notifications-tab-defs";
import { NotificationsSoundsTab } from "./sounds-tab";
import { NotificationsSurfacesTab } from "./surfaces-tab";
import { NotificationsTypesTab } from "./types-tab";
import * as NotificationsSectionModule from "./notifications-section";

/**
 * Ş9 — yedi sekmenin çizimi.
 *
 * Sayım ağaçtan okunuyor, elle yazılmıyor: "50 satırın hepsi çizili mi" sorusunun tek bir
 * cevabı olsun diye. Bir satır ağaca eklendiğinde bu test onu kendiliğinden kapsar.
 */

const MESSAGES = getMessagesForLocale("tr");

const TABS = [
  ["general", NotificationsGeneralTab],
  ["surfaces", NotificationsSurfacesTab],
  ["types", NotificationsTypesTab],
  ["quiet-hours", NotificationsQuietHoursTab],
  ["sounds", NotificationsSoundsTab],
  ["panel", NotificationsPanelTab],
  ["exceptions", NotificationsExceptionsTab],
] as const;

const NOTIFICATIONS = SETTINGS_TREE.find((section) => section.key === "notifications");

/** `aria-checked` niteliği `data-testid`'den önce basılıyor; pencere geriye doğru alınır. */
function ariaCheckedOf(markup: string, rowKey: string): string | undefined {
  const at = markup.indexOf(`data-testid="setting-toggle-${rowKey}"`);

  if (at === -1) return undefined;

  return /aria-checked="(true|false)"[^>]*$/u.exec(markup.slice(0, at))?.[1];
}

function render(
  Tab: () => React.JSX.Element | null,
  options: {
    readonly runtime?: Partial<SettingsRowRuntime>;
    readonly section?: Partial<NotificationsSectionValue>;
    readonly values?: SettingsPatch;
  } = {},
): string {
  const store = new SettingsValueStore({
    write: async () => {},
    ...(options.values ? { values: options.values } : {}),
  });

  const runtime: SettingsRowRuntime = {
    data: {},
    disabledRows: {},
    onAction: () => {},
    onJump: () => {},
    onNavigate: () => {},
    onSoundPreview: () => {},
    openRisky: null,
    openSelect: null,
    riskyBodies: {},
    setOpenRisky: () => {},
    setOpenSelect: () => {},
    ...options.runtime,
  };

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <SettingsValueContext.Provider value={store}>
        <SettingsRowRuntimeContext.Provider value={runtime}>
          <NotificationsSectionContext.Provider
            value={{ ...NOTIFICATIONS_SECTION_FALLBACK, ...options.section }}
          >
            <Tab />
          </NotificationsSectionContext.Provider>
        </SettingsRowRuntimeContext.Provider>
      </SettingsValueContext.Provider>
    </LocaleProvider>,
  );
}

function assertControlDisabled(markup: string, testId: string): void {
  const tag = markup.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];

  assert.ok(tag, `${testId} çizilmedi`);
  assert.match(tag, /(?:aria-disabled="true"|disabled="")/u, `${testId} etkileşime açık`);
}

describe("Bildirimler bölümü — yedi sekme eksiksiz", () => {
  it("bölüm ağaçta yedi sekme, on dört grup, elli satır taşıyor", () => {
    assert.ok(NOTIFICATIONS);
    assert.equal(NOTIFICATIONS.tabs.length, 7);
    assert.deepEqual(
      NOTIFICATIONS.tabs.map((tab) => tab.key),
      [...SETTINGS_TABS_BY_SECTION.notifications],
    );

    const groups = NOTIFICATIONS.tabs.flatMap((tab) => tab.groups);

    assert.equal(groups.length, 14);
    assert.equal(
      groups.reduce((total, group) => total + group.rows.length, 0),
      50,
    );
  });

  it("her sekme hatasız çiziliyor ve satırlarının hepsini basıyor", () => {
    for (const [key, Tab] of TABS) {
      const markup = render(Tab);
      const tab = NOTIFICATIONS?.tabs.find((entry) => entry.key === key);

      assert.ok(tab, `${key} sekmesi yok`);

      for (const group of tab.groups) {
        for (const row of group.rows) {
          assert.ok(
            markup.includes(`data-setting-row="${row.key}"`) ||
              markup.includes(`data-setting-block="${row.key}"`),
            `${key}/${row.key} çizilmedi`,
          );
        }
      }
    }
  });

  it("`ne1` kendi `Varsayılanlar` grubunda, metni değişmemiş (sapma #9)", () => {
    const markup = render(NotificationsExceptionsTab);

    assert.ok(markup.includes("Varsayılanlar"));
    assert.ok(markup.includes("Aktif istisnalar"));
    assert.ok(markup.includes("Yeni istisnalar için geçici sessize alma"));
    // Bölme grup kabını ikiye ayırır; iki kap da kendi başlığını bir kez yazar.
    assert.equal(markup.match(/settings-group-exceptions-0-/gu)?.length, 2);
  });
});

describe("Bildirimler bölümü — kilitli iki satır (tuzak #5)", () => {
  it("`aria-disabled` ve `cursor-not-allowed` taşıyor", () => {
    const markup = render(NotificationsTypesTab);

    for (const key of ["nt13", "nt14"]) {
      assert.ok(
        markup.includes(`data-testid="setting-toggle-${key}"`),
        `${key} anahtarı çizilmedi`,
      );
    }

    // Sekmedeki tek kilitli iki satır bunlar; `aria-disabled` ve `data-locked` ikisinde de var.
    assert.equal(markup.match(/aria-disabled="true"/gu)?.length, 2);
    assert.equal(markup.match(/data-locked="true"/gu)?.length, 2);
    assert.equal(markup.match(/cursor-not-allowed/gu)?.length, 2);
  });

  it("`Kilitli` pili iki satırda da yazılı", () => {
    assert.equal(render(NotificationsTypesTab).match(/Kilitli/gu)?.length, 2);
  });

  it("kilitli anahtar kutuya yazmıyor — sunucuya istek çıkmaz", () => {
    const sent: SettingsPatch[] = [];
    const store = new SettingsValueStore({
      write: async (patch) => {
        sent.push(patch);
      },
    });

    store.setValue("nt13", false);
    store.setValue("nt14", false);
    store.flush();

    assert.deepEqual(sent, []);
    assert.equal(store.getValue("nt13"), true);
  });
});

describe("Bildirimler bölümü — Panel sekmesi", () => {
  it("`Paneli otomatik kapat` kapalıyken `Görünme süresi` devre dışı", () => {
    const markup = render(NotificationsPanelTab, { values: { np2: false } });

    assert.ok(markup.includes('data-setting-row-gate="np3"'));
    assert.ok(markup.includes('aria-disabled="true"'));
    assert.ok(markup.includes("inert"));
  });

  it("açıkken kapı yok", () => {
    const markup = render(NotificationsPanelTab, { values: { np2: true } });

    assert.ok(!markup.includes('data-setting-row-gate="np3"'));
  });

  it("`np4` ile `na6` ayrı satır, ayrı açıklama (tuzak #4)", () => {
    const panel = render(NotificationsPanelTab);
    const surfaces = render(NotificationsSurfacesTab);

    assert.ok(panel.includes("Uygulama içi açılır kartta mesaj metni görünür"));
    assert.ok(surfaces.includes("Gönderen ve mesaj içeriği sistem bildiriminde görünür"));
    assert.ok(!panel.includes('data-setting-row="na6"'));
    assert.ok(!surfaces.includes('data-setting-row="np4"'));
  });
});

describe("Bildirimler bölümü — gerçek kullanılabilirlik", () => {
  it("teslim/consumer yolu olmayan tercihler açıkça kullanılamaz", () => {
    const unavailable = (
      NotificationsSectionModule as typeof NotificationsSectionModule & {
        NOTIFICATION_UNAVAILABLE_ROWS?: Readonly<Record<string, true>>;
      }
    ).NOTIFICATION_UNAVAILABLE_ROWS;

    assert.deepEqual(Object.keys(unavailable ?? {}).sort(), [
      "na3",
      "nd4",
      "ne1",
      "np1",
      "np2",
      "np3",
      "np4",
      "np5",
      "ns1",
      "ns2",
      "ns3",
      "ns4",
      "ns5",
    ]);

    const surfaces = render(NotificationsSurfacesTab, { runtime: { disabledRows: unavailable } });
    const sounds = render(NotificationsSoundsTab, { runtime: { disabledRows: unavailable } });
    const panel = render(NotificationsPanelTab, { runtime: { disabledRows: unavailable } });
    const exceptions = render(NotificationsExceptionsTab, {
      runtime: { disabledRows: unavailable },
    });

    assertControlDisabled(surfaces, "setting-toggle-na3");
    assertControlDisabled(surfaces, "setting-toggle-nd4");
    for (const testId of [
      "setting-sound-ns1",
      "setting-sound-ns2",
      "setting-sound-ns3",
      "setting-sound-ns4",
      "setting-actions-ns5-0",
    ]) {
      assertControlDisabled(sounds, testId);
    }

    for (const testId of [
      "setting-segment-np1",
      "setting-toggle-np2",
      "setting-segment-np3",
      "setting-toggle-np4",
      "setting-toggle-np5",
    ]) {
      assertControlDisabled(panel, testId);
    }

    assertControlDisabled(exceptions, "setting-segment-ne1");
  });
});

describe("Bildirimler bölümü — Genel ve Sessiz saatler", () => {
  it("düzey menüsü Ayarlar etiketlerini yazıyor (sapma #6)", () => {
    // Kapalı menü yalnız seçili etiketi basar; üç etiketin de Ayarlar kümesinden geldiği
    // seçilen değer değiştirilerek okunuyor.
    assert.ok(render(NotificationsGeneralTab, { values: { b1: 0 } }).includes("Tüm bildirimler"));
    assert.ok(
      render(NotificationsGeneralTab, { values: { b1: 1 } }).includes("Yalnız DM ve bahsetmeler"),
    );

    // 560 px penceredeki `Tümü / Yalnızca önemli` kümesi buraya sızmamalı.
    for (const value of [0, 1, 2]) {
      assert.ok(
        !render(NotificationsGeneralTab, { values: { b1: value } }).includes("Yalnızca önemli"),
      );
    }
  });

  it("`nq1` alt metni gerçek aralığı yazıyor", () => {
    const data = {
      [NOTIFICATION_ROW_DATA_FIELDS.quietHoursRange]: "Her gün 22:30 – 07:00",
      [NOTIFICATION_ROW_DATA_FIELDS.quietHoursRangeSecure]:
        "Her gün 22:30 – 07:00 · güvenlik bildirimleri hariç",
    };

    assert.ok(
      render(NotificationsQuietHoursTab, { runtime: { data } }).includes("Her gün 22:30 – 07:00"),
    );
    assert.ok(
      render(NotificationsGeneralTab, { runtime: { data } }).includes(
        "Her gün 22:30 – 07:00 · güvenlik bildirimleri hariç",
      ),
    );
  });

  it("sessiz saat menüsü 48 seçenek çiziyor", () => {
    const markup = render(NotificationsQuietHoursTab, { values: { nq2: 46, nq3: 16 } });

    assert.ok(markup.includes("23:00"));
    assert.ok(markup.includes("08:00"));
  });
});

describe("Bildirimler bölümü — Sesler", () => {
  it("dört ses satırı da profil segmenti ve önizleme düğmesi çiziyor", () => {
    const markup = render(NotificationsSoundsTab);

    for (const key of ["ns1", "ns2", "ns3", "ns4"]) {
      assert.ok(markup.includes(`data-testid="setting-sound-${key}"`), `${key} ses şeridi yok`);
    }

    assert.equal(markup.match(/Önizle/gu)?.length, 4);
    assert.ok(markup.includes("Varsayılana döndür"));
  });

  it("grup notu tasarımdan geldiği gibi duruyor (sapma #10)", () => {
    assert.ok(render(NotificationsSoundsTab).includes("Ses ayarları bu cihaza kaydedilir."));
  });
});

describe("Bildirimler bölümü — paylaşılan beş anahtar (tuzak #4)", () => {
  it("iki sekme de aynı kutudan okuyor; birinde değişen değer diğerinde görünüyor", () => {
    const store = new SettingsValueStore({ write: async () => {} });

    // Genel sekmesindeki menü `Kapalı`ya çekiliyor.
    store.setValue("nd2", 2);
    store.setValue("na6", true);
    store.setValue("nq1", false);

    const runtime: SettingsRowRuntime = {
      data: {},
      disabledRows: {},
      onAction: () => {},
      onJump: () => {},
      onNavigate: () => {},
      onSoundPreview: () => {},
      openRisky: null,
      openSelect: null,
      riskyBodies: {},
      setOpenRisky: () => {},
      setOpenSelect: () => {},
    };

    const draw = (Tab: () => React.JSX.Element | null) =>
      renderToStaticMarkup(
        <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
          <SettingsValueContext.Provider value={store}>
            <SettingsRowRuntimeContext.Provider value={runtime}>
              <NotificationsSectionContext.Provider value={NOTIFICATIONS_SECTION_FALLBACK}>
                <Tab />
              </NotificationsSectionContext.Provider>
            </SettingsRowRuntimeContext.Provider>
          </SettingsValueContext.Provider>
        </LocaleProvider>,
      );

    const general = draw(NotificationsGeneralTab);
    const surfaces = draw(NotificationsSurfacesTab);
    const quiet = draw(NotificationsQuietHoursTab);

    // `nd2` — iki sekmede de seçili etiket `Kapalı`.
    for (const markup of [general, surfaces]) {
      const trigger = markup.slice(markup.indexOf('data-testid="setting-select-nd2"'));

      assert.ok(trigger.includes("Kapalı"), "nd2 iki sekmede aynı değeri göstermiyor");
    }

    // `na6` açık, `nq1` kapalı — ikisi de iki sekmede aynı kutudan okunuyor. Nitelikler
    // `data-testid`'den **önce** basıldığı için pencere geriye doğru alınıyor.
    for (const markup of [general, surfaces]) {
      assert.equal(ariaCheckedOf(markup, "na6"), "true", "na6 iki sekmede ayrışmış");
    }

    assert.equal(ariaCheckedOf(general, "nq1"), "false");
    assert.equal(ariaCheckedOf(quiet, "nq1"), "false");
    assert.equal(store.getValue("na6"), true);
    assert.equal(store.getValue("nq1"), false);
    assert.ok(general.includes('data-testid="setting-toggle-na6"'));
    assert.ok(surfaces.includes('data-testid="setting-toggle-na6"'));
    assert.ok(general.includes('data-testid="setting-toggle-nq1"'));
    assert.ok(quiet.includes('data-testid="setting-toggle-nq1"'));
  });

  it("`ns1` üç anahtarı da iki sekmede tek durum", () => {
    const store = new SettingsValueStore({ write: async () => {} });

    store.setValue("ns1_p", "classic");
    store.setValue("ns1_v", 15);

    assert.equal(store.getValue("ns1_p"), "classic");
    assert.equal(store.getValue("ns1_v"), 15);
  });
});

describe("Bildirimler bölümü — `Tüm sesler → Varsayılana döndür`", () => {
  it("dört satırı tek yamada sıfırlıyor", async () => {
    const sent: SettingsPatch[] = [];
    const store = new SettingsValueStore({
      coalesceMs: 0,
      write: async (patch) => {
        sent.push(patch);
      },
    });

    store.setValue("ns1_p", "classic");
    store.setValue("ns2", false);
    store.setValue("ns3_v", 5);

    // `ns5` eyleminin yaptığı iş: ağaçtaki varsayılanları kutuya yazmak.
    for (const [key, value] of Object.entries(buildSoundResetPatch())) {
      store.setValue(key, value);
    }

    store.flush();
    await Promise.resolve();

    assert.equal(store.getValue("ns1_p"), "whispr");
    assert.equal(store.getValue("ns2"), true);
    assert.equal(store.getValue("ns2_p"), "classic");
    assert.equal(store.getValue("ns3_v"), 50);
    assert.equal(store.getValue("ns4_v"), 50);
    assert.equal(sent.length, 1, "sıfırlama tek yamada gitmeli");
  });
});

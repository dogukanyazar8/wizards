import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  NotificationPrefsDialog,
  QUIET_HOURS_HREF,
  SURFACES_HREF,
  notificationPermissionQueryKey,
} from "@/components/notifications/notification-prefs-dialog";
import {
  notificationPrefsFixture,
  notificationTypeSetFixture,
} from "@/components/notifications/notification-prefs-fixture";
import { getMessagesForLocale } from "@/lib/locale";
import { impliedTypeSet } from "@/lib/notifications/prefs-policy";
import type { NotifPanelSaveState } from "@/lib/notifications/panel-state";
import { notificationPrefsQueryKeys } from "@/lib/settings/notification-prefs-client";
import type { NotifPermission, NotificationPrefs } from "@wizards/types";

/**
 * Ş11 §B — 560 px bildirim ayarları penceresi.
 *
 * Kabul maddeleri burada sabitleniyor: izin verilmişse şerit **hiç render edilmez**,
 * `Yalnızca önemli` kartında `Önerilen` pili var, ayrıntıda sapma varken `Özel` pili çıkar ve
 * kayıt göstergesi üç durumu **gerçek** durum değeriyle yazar.
 */

const MESSAGES = getMessagesForLocale("tr");

type RenderOptions = {
  readonly permission?: NotifPermission | undefined;
  readonly prefs?: NotificationPrefs | null;
  readonly saveState?: NotifPanelSaveState;
};

function render(options: RenderOptions = {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  if (options.prefs !== null) {
    client.setQueryData(
      notificationPrefsQueryKeys.root,
      options.prefs ?? notificationPrefsFixture(),
    );
  }

  if (options.permission !== undefined) {
    client.setQueryData(notificationPermissionQueryKey, options.permission);
  }

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <QueryClientProvider client={client}>
        <NotificationPrefsDialog
          onClose={() => undefined}
          onSaveState={() => undefined}
          saveState={options.saveState ?? "idle"}
        />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("NotificationPrefsDialog — izin şeridi", () => {
  it("izin verilmişse şerit hiç render edilmez", () => {
    const markup = render({ permission: "granted" });

    assert.ok(!markup.includes('data-testid="notification-prefs-permission"'));
    assert.ok(!markup.includes("Sistem bildirimi izni"));
  });

  it("izin verilmemişse iki düğmeyle birlikte çizilir", () => {
    const markup = render({ permission: "denied" });

    assert.ok(markup.includes('data-testid="notification-prefs-permission"'));
    assert.ok(markup.includes("Sistem bildirimi izni"));
    assert.ok(markup.includes("İzin verilmedi"));
    assert.ok(markup.includes("İzin iste"));
    assert.ok(markup.includes("Sistem ayarlarını aç"));
    assert.ok(
      markup.includes(
        "Whispr kapalıyken veya arka plandayken bildirim almak için sistem izni gerekir.",
      ),
    );
  });

  it("`prompt` de şeridi gösterir — henüz sorulmamış izin de verilmiş değildir", () => {
    assert.ok(render({ permission: "prompt" }).includes("Sistem bildirimi izni"));
  });

  it("izin okunmadan şerit çizilmez — bir tur sonra kaybolacak uyarı yazılmaz", () => {
    assert.ok(!render().includes('data-testid="notification-prefs-permission"'));
  });
});

describe("NotificationPrefsDialog — bildirim düzeyi", () => {
  it("üç kartı tasarımın metinleriyle çizer", () => {
    const markup = render();

    assert.ok(markup.includes("Mesajlar, bahsetmeler, çağrılar ve diğer etkinlikler."));
    assert.ok(markup.includes("Doğrudan bahsetmeler, yanıtlar, çağrılar, güvenlik ve moderasyon."));
    assert.ok(
      markup.includes(
        "İsteğe bağlı açılır bildirimleri ve sesleri durdurur. Bildirim merkezi kayıt tutmaya devam eder.",
      ),
    );
  });

  it("`Yalnızca önemli` kartında `Önerilen` pili var", () => {
    const markup = render();
    const card = markup.split('data-testid="notification-prefs-level-important"')[1] ?? "";
    const nextCard = card.split('data-testid="notification-prefs-level-off"')[0] ?? "";

    assert.ok(nextCard.includes("Önerilen"));
    assert.equal(markup.split("Önerilen").length - 1, 1);
  });

  it("radyo grubu gerçek roller taşır ve seçili kart işaretli", () => {
    const markup = render({ prefs: notificationPrefsFixture({ level: "important" }) });

    assert.ok(markup.includes('role="radiogroup"'));
    assert.ok(markup.includes('role="radio"'));
    assert.match(
      markup,
      /aria-checked="true"[^>]*data-testid="notification-prefs-level-important"/u,
    );
  });

  it("ayrıntıda sapma yokken `Özel` pili çıkmaz", () => {
    const prefs = notificationPrefsFixture({
      level: "important",
      types: { ...notificationTypeSetFixture(false), ...impliedTypeSet("important") },
    });

    assert.ok(!render({ prefs }).includes('data-testid="notification-prefs-custom"'));
  });

  it("ayrıntıda sapma varken `Özel` pili çıkar", () => {
    const prefs = notificationPrefsFixture({
      level: "important",
      types: notificationTypeSetFixture(true),
    });

    const markup = render({ prefs });

    assert.ok(markup.includes('data-testid="notification-prefs-custom"'));
    assert.ok(markup.includes("Özel"));
  });
});

describe("NotificationPrefsDialog — hızlı tercihler", () => {
  it("üç satırı tasarımın metinleriyle çizer", () => {
    const markup = render();

    assert.ok(markup.includes("Bildirim sesi"));
    assert.ok(markup.includes("Yeni bildirim geldiğinde ses çal."));
    assert.ok(markup.includes("Mesaj önizlemelerini göster"));
    assert.ok(markup.includes("Gönderen ve mesaj içeriğini sistem bildiriminde göster."));
    assert.ok(markup.includes("Sessiz saatler"));
    assert.ok(markup.includes("Saatleri düzenle"));
  });

  it("sessiz saat alt metni gerçek tercihten interpolasyonla gelir", () => {
    const markup = render({
      prefs: notificationPrefsFixture({
        quietHours: {
          allowCalls: true,
          enabled: true,
          end: "07:30",
          start: "22:15",
          tz: "Europe/Istanbul",
        },
      }),
    });

    assert.ok(markup.includes("Her gün 22:15 – 07:30 arasında sessiz."));
    // Tasarımın örnek saatleri sabitlenmedi.
    assert.ok(!markup.includes("Her gün 23:00 – 08:00 arasında sessiz."));
  });

  it("anahtarlar tercihin gerçek değerini gösterir", () => {
    const markup = render({
      prefs: notificationPrefsFixture({
        systemPreview: false,
        sounds: {
          ...notificationPrefsFixture().sounds,
          notification: { enabled: true, profile: "whispr", volume: 70 },
        },
      }),
    });

    assert.match(
      markup,
      /aria-checked="true"[^>]*data-testid="notification-prefs-quick-sound-switch"/u,
    );
    assert.match(
      markup,
      /aria-checked="false"[^>]*data-testid="notification-prefs-quick-preview-switch"/u,
    );
  });

  it("anahtarlar gerçek `switch` — rol ve durum taşır", () => {
    const markup = render();

    assert.equal(markup.split('role="switch"').length - 1, 3);
  });

  it("tercih yüklenmeden anahtarlar devre dışı", () => {
    const markup = render({ prefs: null });

    assert.equal(markup.split('disabled=""').length - 1, 3);
  });
});

describe("NotificationPrefsDialog — kabuk ve alt şerit", () => {
  it("örtü kartın kardeşi ve kart `aria-modal`", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="notification-prefs-backdrop"'));
    assert.ok(markup.includes('aria-modal="true"'));
    // Örtü, kartı **içermez**: kartın içine tıklamak kapatmamalı.
    const backdropIndex = markup.indexOf('data-testid="notification-prefs-backdrop"');
    const cardIndex = markup.indexOf('data-testid="notification-prefs-dialog"');
    assert.ok(backdropIndex > 0 && cardIndex > backdropIndex);
    assert.ok(markup.includes("pointer-events:auto"));
  });

  it("`Tüm bildirim ayarları` Yüzeyler'e, `Saatleri düzenle` Sessiz saatler'e gider", () => {
    const markup = render();

    assert.equal(SURFACES_HREF, "/settings/notifications/surfaces");
    assert.equal(QUIET_HOURS_HREF, "/settings/notifications/quiet-hours");
    assert.match(
      markup,
      new RegExp(`data-testid="notification-prefs-open-all"[^>]*href="${SURFACES_HREF}"`, "u"),
    );
    assert.ok(markup.includes(`href="${QUIET_HOURS_HREF}"`));
  });

  it("kayıt göstergesi üç durumu gerçek durumdan yazar", () => {
    assert.match(render({ saveState: "saving" }), /data-save-state="saving"[^>]*>Kaydediliyor</u);
    assert.match(render({ saveState: "saved" }), /data-save-state="saved"[^>]*>Kaydedildi</u);
    assert.ok(render({ saveState: "error" }).includes("Kaydedilemedi · yeniden dene"));
  });

  it("`idle` hiçbir şey yazmaz — yapılmamış bir şeyi onaylamaz", () => {
    const markup = render({ saveState: "idle" });

    assert.match(markup, /data-save-state="idle"[^>]*><\/div>/u);
    assert.ok(!markup.includes("Kaydedildi"));
  });

  it("kayıt durumu `aria-live` taşır", () => {
    assert.ok(render({ saveState: "saving" }).includes('aria-live="polite"'));
  });

  it("başlık ve `Bitti` düğmesi tasarımın metinleriyle", () => {
    const markup = render();

    assert.ok(markup.includes("Ne zaman ve nasıl bildirim almak istediğini seç."));
    assert.ok(markup.includes("Bitti"));
  });
});

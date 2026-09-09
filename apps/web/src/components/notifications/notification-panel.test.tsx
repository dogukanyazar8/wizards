import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { SocketContext } from "@/components/providers/socket-provider";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { notificationPrefsFixture } from "@/components/notifications/notification-prefs-fixture";
import { getMessagesForLocale } from "@/lib/locale";
import { notificationsQueryKeys } from "@/lib/notifications/client";
import { EMPTY_NOTIF_COUNTS } from "@/lib/notifications/panel-state";
import type { NotificationPageDTO } from "@/lib/notifications/types";
import { notificationPrefsQueryKeys } from "@/lib/settings/notification-prefs-client";
import type {
  AppNotificationGroup,
  NotifPanelTab,
  NotifUnreadCounts,
  NotificationPrefs,
} from "@wizards/types";

/**
 * Ş11 §A — panelin kabuğu.
 *
 * Önbellek elle tohumlanıyor: `renderToStaticMarkup` efekt çalıştırmaz, `queryFn` hiç koşmaz.
 * Doğrulanan şey de zaten ağ değil, **hangi durumda hangi başlığın** çizildiği: kırmızı sayı
 * mı yoksa yeşil `Hepsi okundu` mu, sessiz saat satırı var mı yok mu.
 */

const MESSAGES = getMessagesForLocale("tr");

const FAKE_SOCKET = {
  connected: false,
  disconnect: () => undefined,
  emit: () => undefined,
  off: () => undefined,
  on: () => undefined,
} as never;

function group(read: boolean): AppNotificationGroup {
  return {
    items: [
      {
        body: "Sürüm notlarındaki ekran görselleri sizde mi kaldı?",
        createdAt: "2026-08-24T06:18:00.000Z",
        id: "n2",
        kind: "mention",
        read,
        title: "Mert Kaya @tasarım rolünü çağırdı · #sürüm-2-4",
      },
    ],
    label: "today",
  };
}

function page(overrides: Partial<NotificationPageDTO> = {}): NotificationPageDTO {
  return {
    counts: EMPTY_NOTIF_COUNTS,
    groups: [group(false)],
    nextCursor: null,
    tab: "all",
    ...overrides,
  };
}

type RenderOptions = {
  readonly counts?: Partial<NotifUnreadCounts>;
  readonly page?: NotificationPageDTO;
  readonly prefs?: NotificationPrefs | null;
  readonly tab?: NotifPanelTab;
};

function render(options: RenderOptions = {}): string {
  const tab = options.tab ?? "all";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  client.setQueryData(notificationsQueryKeys.counts, {
    ...EMPTY_NOTIF_COUNTS,
    ...options.counts,
  });
  client.setQueryData(notificationsQueryKeys.panel(tab), {
    pageParams: [undefined],
    pages: [options.page ?? page()],
  });

  if (options.prefs !== null) {
    client.setQueryData(
      notificationPrefsQueryKeys.root,
      options.prefs ?? notificationPrefsFixture(),
    );
  }

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <QueryClientProvider client={client}>
        <SocketContext.Provider value={FAKE_SOCKET}>
          <NotificationPanel
            onClose={() => undefined}
            onOpenPrefs={() => undefined}
            onSelectTab={() => undefined}
            tab={tab}
          />
        </SocketContext.Provider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("NotificationPanel — başlık", () => {
  it("okunmamış varken sayacı ve `Tümünü okundu işaretle`i çizer", () => {
    const markup = render({ counts: { all: 3 } });

    assert.match(markup, /data-testid="notification-panel-unread-count"[^>]*>3</u);
    assert.ok(markup.includes("Tümünü okundu işaretle"));
    assert.ok(!markup.includes('data-testid="notification-panel-all-read"'));
  });

  it("okunmamış kalmayınca yeşil `Hepsi okundu` göstergesine döner", () => {
    const markup = render({ counts: { all: 0 } });

    assert.ok(markup.includes('data-testid="notification-panel-all-read"'));
    assert.ok(markup.includes("Hepsi okundu"));
    assert.ok(!markup.includes("Tümünü okundu işaretle"));
  });

  it("kırmızı `0` pili hiçbir durumda görünmez", () => {
    const markup = render({ counts: { all: 0 } });

    assert.ok(!markup.includes('data-testid="notification-panel-unread-count"'));
  });

  it("dişli düğmesi var ve adlandırılmış", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="notification-panel-gear"'));
    assert.match(markup, /aria-label="Bildirim ayarları"/u);
  });

  it("panel dialog, liste list rolleri taşır", () => {
    const markup = render();

    assert.ok(markup.includes('role="dialog"'));
    assert.ok(markup.includes('role="list"'));
    assert.ok(markup.includes('role="listitem"'));
    assert.ok(markup.includes('role="tabpanel"'));
  });
});

describe("NotificationPanel — liste", () => {
  it("gün grubu etiketini i18n'den çizer, kovayı sunucudan alır", () => {
    const markup = render();

    assert.ok(markup.includes("Bugün"));
    assert.ok(!markup.includes("today"));
  });

  it("`Daha eski` kovası da çizilebilir", () => {
    const markup = render({ page: page({ groups: [{ ...group(false), label: "older" }] }) });

    assert.ok(markup.includes("Daha eski"));
  });

  it("hiç satır yokken boş durum metnini verir, uydurma satır çizmez", () => {
    const markup = render({ page: page({ groups: [] }) });

    assert.ok(markup.includes('data-testid="notification-panel-empty"'));
    assert.ok(markup.includes("Bu sekmede bekleyen bildirim yok."));
    assert.ok(!markup.includes('data-testid="notification-panel-row"'));
  });

  it("sonraki sayfa varken sentinel çizilir, yokken çizilmez", () => {
    assert.ok(
      render({ page: page({ nextCursor: "imlec" }) }).includes(
        'data-testid="notification-panel-sentinel"',
      ),
    );
    assert.ok(!render().includes('data-testid="notification-panel-sentinel"'));
  });
});

describe("NotificationPanel — alt şerit", () => {
  it("sessiz saat aralığını gerçek tercihten yazar", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="notification-panel-quiet-hours"'));
    assert.ok(markup.includes("Sessiz saatler 23:00 – 08:00"));
  });

  it("tercih kapalıyken sessiz saat satırı **yazılmaz**", () => {
    const markup = render({
      prefs: notificationPrefsFixture({
        quietHours: {
          allowCalls: true,
          enabled: false,
          end: "08:00",
          start: "23:00",
          tz: "Europe/Istanbul",
        },
      }),
    });

    assert.ok(!markup.includes('data-testid="notification-panel-quiet-hours"'));
    assert.ok(!markup.includes("Sessiz saatler"));
  });

  it("tercih daha yüklenmemişken de satır yazılmaz", () => {
    const markup = render({ prefs: null });

    assert.ok(!markup.includes('data-testid="notification-panel-quiet-hours"'));
  });

  it("`Tüm bildirimleri gör` `/mentions`e giden gerçek bir bağlantı", () => {
    const markup = render();

    assert.match(markup, /<a[^>]*data-testid="notification-panel-see-all"[^>]*href="\/mentions"/u);
    assert.ok(markup.includes("Tüm bildirimleri gör"));
  });
});

describe("NotificationPanel — sonsuz kaydırma", () => {
  /**
   * Prompt §A.4'ün tuzağı: `useInfiniteQuery`nin döndürdüğü nesne her render'da yenidir.
   * `[listQuery]` yazıldığında gözlemci her render'da sökülüp kurulur ve kurulduğu anda
   * sentinel görünürse **her render bir sayfa daha** çeker.
   *
   * Bu depoda DOM yok, yani gerçek bir istek sayacı e2e'nin işi. Burada kaynağın kendisi
   * denetleniyor: kesişim gözlemcisinin bağımlılık listesinde nesne yok.
   */
  it("gözlemci efektinin bağımlılıkları ilkel", () => {
    const source = readFileSync(new URL("./notification-panel.tsx", import.meta.url), "utf8");

    const observerIndex = source.indexOf("new IntersectionObserver");
    assert.ok(observerIndex > 0, "gözlemci bulunamadı");

    const deps = /\}, \[([^\]]*)\]\);/u.exec(source.slice(observerIndex))?.[1] ?? "";

    assert.deepEqual(
      deps
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      ["hasNextPage", "isFetchingNextPage", "rowCount"],
    );
    assert.ok(!deps.includes("listQuery"));
  });
});

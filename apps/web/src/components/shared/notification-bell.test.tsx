import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { SocketContext } from "@/components/providers/socket-provider";
import { NotificationBell } from "@/components/shared/notification-bell";
import { getMessagesForLocale } from "@/lib/locale";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import { notificationsQueryKeys } from "@/lib/notifications/client";
import { EMPTY_NOTIF_COUNTS } from "@/lib/notifications/panel-state";
import type { NotifUnreadCounts } from "@wizards/types";

/**
 * Ş11 — zil düğmesi.
 *
 * Düğmenin kendisi bu şeritte **değişmedi** ve testin işi bunu kanıtlamak: `badgeVariant`
 * ikisi de yerinde, nokta ölçüsünü hâlâ `HOME_METRICS.topBar`tan alıyor ve okunmamış yokken
 * ne rozet ne nokta çiziliyor (kırmızı `0` yasak).
 *
 * Panelin ve pencerenin **kapalı** olması da bir sözleşme: ilk boyada açık gelen bir popover
 * her sayfa yüklemesinde ekranı kaplardı.
 */

const MESSAGES = getMessagesForLocale("tr");

const FAKE_SOCKET = {
  connected: false,
  disconnect: () => undefined,
  emit: () => undefined,
  off: () => undefined,
  on: () => undefined,
} as never;

function render(
  counts: Partial<NotifUnreadCounts>,
  props: { badgeVariant?: "count" | "dot" } = {},
): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(notificationsQueryKeys.counts, { ...EMPTY_NOTIF_COUNTS, ...counts });

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <QueryClientProvider client={client}>
        <SocketContext.Provider value={FAKE_SOCKET}>
          <NotificationBell {...props} />
        </SocketContext.Provider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("NotificationBell — düğme", () => {
  it("düğme ve erişilebilir adı yerinde", () => {
    const markup = render({});

    assert.ok(markup.includes('data-testid="notification-bell-button"'));
    assert.match(markup, /aria-label="Bildirimler"/u);
    assert.ok(markup.includes('aria-haspopup="dialog"'));
    assert.ok(markup.includes('aria-expanded="false"'));
  });

  it("`dot` kipinde okunmamış varken 7 px nokta çizer", () => {
    const markup = render({ all: 3 }, { badgeVariant: "dot" });
    const { topBar } = HOME_METRICS;

    assert.ok(markup.includes('data-testid="notification-bell-dot"'));
    assert.ok(markup.includes(`width:${pxToRem(topBar.bellDotSize)}`));
    assert.ok(!markup.includes('data-testid="notification-bell-badge"'));
  });

  it("`count` kipinde sayıyı çizer", () => {
    const markup = render({ all: 3 });

    assert.match(markup, /data-testid="notification-bell-badge"[^>]*>3</u);
  });

  it("99'dan büyük sayı `99+` olur", () => {
    assert.ok(render({ all: 150 }).includes("99+"));
  });

  it("okunmamış yokken ne rozet ne nokta çizilir", () => {
    for (const variant of ["count", "dot"] as const) {
      const markup = render({ all: 0 }, { badgeVariant: variant });

      assert.ok(!markup.includes('data-testid="notification-bell-badge"'), variant);
      assert.ok(!markup.includes('data-testid="notification-bell-dot"'), variant);
      assert.ok(!markup.includes(">0<"), variant);
    }
  });
});

describe("NotificationBell — ilk boya", () => {
  it("panel ve pencere kapalı gelir", () => {
    const markup = render({ all: 3 });

    assert.ok(!markup.includes('data-testid="notification-panel"'));
    assert.ok(!markup.includes('data-testid="notification-prefs-overlay"'));
  });

  it("kapalıyken düğmede açık vurgusu yok", () => {
    const markup = render({ all: 3 });

    assert.ok(!markup.includes("data-open"));
    assert.ok(!markup.includes("hsl(var(--primary) / 0.14)"));
  });
});

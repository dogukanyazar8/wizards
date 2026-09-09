import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { NotificationPanelTabs } from "@/components/notifications/notification-panel-tabs";
import { getMessagesForLocale } from "@/lib/locale";
import { EMPTY_NOTIF_COUNTS } from "@/lib/notifications/panel-state";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import type { NotifPanelTab, NotifUnreadCounts } from "@wizards/types";

/**
 * Ş11 §A.3 — sekme şeridi.
 *
 * Kabul maddesi: sayaçlar **yalnız okunmamışı** sayar ve kırmızı `0` pili hiçbir durumda
 * görünmez. Bu depoda DOM yok, o yüzden tık ve `←/→` gezinmesi e2e'nin işi; burada sabitlenen
 * şey markup: hangi sekme seçili, hangi pil çizilmiş, hangi ölçü hangi kayıttan geliyor.
 */

const MESSAGES = getMessagesForLocale("tr");

function render(counts: Partial<NotifUnreadCounts>, tab: NotifPanelTab = "all"): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <NotificationPanelTabs
        counts={{ ...EMPTY_NOTIF_COUNTS, ...counts }}
        onSelect={() => undefined}
        panelId="panel"
        tab={tab}
      />
    </LocaleProvider>,
  );
}

describe("NotificationPanelTabs", () => {
  it("dört sekmeyi tasarımın metinleriyle çizer", () => {
    const markup = render({});

    for (const label of ["Tümü", "Bahsedilmeler", "Yanıtlar", "Sistem"]) {
      assert.ok(markup.includes(label), label);
    }
  });

  it("sayacı olan sekmede pil çizer", () => {
    const markup = render({ all: 3, mentions: 2, replies: 1 });

    assert.match(markup, /data-testid="notification-panel-tab-count-all"[^>]*>3</u);
    assert.match(markup, /data-testid="notification-panel-tab-count-mentions"[^>]*>2</u);
    assert.match(markup, /data-testid="notification-panel-tab-count-replies"[^>]*>1</u);
  });

  it("kırmızı `0` pili hiçbir durumda görünmez", () => {
    const markup = render({ all: 3, mentions: 2, replies: 1, system: 0 });

    assert.ok(!markup.includes('data-testid="notification-panel-tab-count-system"'));
  });

  it("hiç okunmamış yokken hiçbir sekmede pil yoktur", () => {
    const markup = render({});

    assert.ok(!markup.includes("notification-panel-tab-count-"));
  });

  it("sekme şeridi gerçek bir `tablist`", () => {
    const markup = render({ all: 1 });

    assert.ok(markup.includes('role="tablist"'));
    assert.ok(markup.includes('role="tab"'));
    assert.ok(markup.includes('aria-selected="true"'));
    assert.ok(markup.includes('aria-controls="panel"'));
    // Roving tabindex: yalnız seçili sekme sekme turunda.
    assert.equal(markup.split('tabindex="0"').length - 1, 1);
    assert.equal(markup.split('tabindex="-1"').length - 1, 3);
  });

  it("seçili sekme kimliği içerik alanına bağlanabilir", () => {
    const markup = render({}, "system");

    assert.ok(markup.includes('id="panel-tab-system"'));
  });

  it("ölçüleri sözlükten alır", () => {
    const markup = render({ all: 1 });
    const { tabs } = SETTINGS_METRICS.panel;

    assert.ok(markup.includes(`height:${pxToRem(tabs.tabHeight)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(tabs.tabRadius)}`));
    assert.ok(markup.includes(`font-size:${pxToRem(tabs.tabFontSize)}`));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { NotifSummaryBlock } from "@/components/settings/blocks/notif-summary-block";
import {
  NOTIFICATIONS_SECTION_FALLBACK,
  NotificationsSectionContext,
} from "@/components/settings/sections/notifications/notifications-section-context";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import type { NotificationSummaryCounts } from "@/components/settings/sections/notifications/notification-prefs-bridge";
import type { SettingsRowDef } from "@/lib/settings/tree";

/**
 * Ş9 §2 — `Şu anki durum`.
 *
 * Üç sayı gerçek veriden geliyor; tasarımdaki `9/15 · 2/4 · 6` örnek veridir ve burada
 * **sabitlenmediği** sınanıyor.
 */

const MESSAGES = getMessagesForLocale("tr");
const ROW: SettingsRowDef = { block: "notifSummary", key: "ns0", type: "custom" };

function render(summary: NotificationSummaryCounts | null): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <NotificationsSectionContext.Provider value={{ ...NOTIFICATIONS_SECTION_FALLBACK, summary }}>
        <NotifSummaryBlock data={{}} row={ROW} />
      </NotificationsSectionContext.Provider>
    </LocaleProvider>,
  );
}

const SUMMARY: NotificationSummaryCounts = {
  channelsOpen: 3,
  channelsTotal: 4,
  exceptions: 6,
  exceptionsTruncated: false,
  typesOpen: 11,
  typesTotal: 16,
};

describe("NotifSummaryBlock — üç sayı gerçek veriden", () => {
  it("oranları verilen sayımdan yazıyor", () => {
    const markup = render(SUMMARY);

    assert.ok(markup.includes("11/16"));
    assert.ok(markup.includes("3/4"));
    assert.ok(markup.includes(">6<"));
  });

  it("tasarımdaki örnek veriyi sabitlemiyor", () => {
    const markup = render(SUMMARY);

    assert.ok(!markup.includes("9/15"));
    assert.ok(!markup.includes("2/4"));
  });

  it("üç etiketi referanstan yazıyor", () => {
    const markup = render(SUMMARY);

    assert.ok(markup.includes("Açık bildirim türü"));
    assert.ok(markup.includes("Teslim kanalı"));
    assert.ok(markup.includes("Aktif istisna"));
  });

  it("liste kesildiğinde sayıyı `+` ile işaretliyor", () => {
    assert.ok(render({ ...SUMMARY, exceptions: 200, exceptionsTruncated: true }).includes("200+"));
  });

  it("veri gelmeden sıfır değil tire yazıyor", () => {
    const markup = render(null);

    assert.ok(markup.includes("—"));
    assert.ok(markup.includes('aria-busy="true"'));
    assert.ok(!markup.includes("0/16"));
  });
});

describe("NotifSummaryBlock — geometri sözlükten", () => {
  it("üç kolon ve hücre dolgusu ölçü sözlüğünden geliyor", () => {
    const { notifSummary } = SETTINGS_METRICS.blocks;
    const markup = render(SUMMARY);

    assert.ok(markup.includes(`repeat(${notifSummary.columns}, minmax(0, 1fr))`));
    assert.ok(
      markup.includes(
        `padding:${pxToRem(notifSummary.cellPaddingY)} ${pxToRem(notifSummary.cellPaddingX)}`,
      ),
    );
    assert.ok(markup.includes(`font-size:${pxToRem(notifSummary.valueFontSize)}`));
  });

  it("ilk hücrede sol ayırıcı yok, diğer ikisinde var", () => {
    assert.equal(render(SUMMARY).match(/border-left:/gu)?.length, 2);
  });

  it("renk token üzerinden geliyor", () => {
    const markup = render(SUMMARY);

    assert.ok(!/#[0-9a-fA-F]{3,8}/u.test(markup));
    assert.ok(markup.includes("hsl(var(--border)"));
  });
});

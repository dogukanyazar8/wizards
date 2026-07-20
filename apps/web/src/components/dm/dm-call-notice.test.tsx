import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DmCallNoticeBanner } from "@/components/dm/dm-call-notice";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function renderNotice(message: string | null) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DmCallNoticeBanner message={message} onDismiss={() => undefined} />
    </LocaleProvider>,
  );
}

describe("DM call notice", () => {
  it("stays out of the way while there is nothing to report", () => {
    assert.equal(renderNotice(null), "");
  });

  it("tells the caller why the call ended", () => {
    const markup = renderNotice("ogi_uat aramayı kabul etmedi.");

    assert.match(markup, /dm-call-notice/);
    assert.match(markup, /ogi_uat aramayı kabul etmedi\./);
    assert.match(markup, /dm-call-notice-dismiss/);
  });

  it("keeps the declined and unanswered copy in both locales", () => {
    for (const locale of ["tr", "en"] as const) {
      const messages: Record<string, string | undefined> = getMessagesForLocale(locale);
      assert.ok(messages["dm.call.declinedBy"]?.includes("{name}"));
      assert.ok(messages["dm.call.unansweredBy"]?.includes("{name}"));
    }
  });
});

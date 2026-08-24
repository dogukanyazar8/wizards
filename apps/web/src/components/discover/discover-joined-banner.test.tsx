import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DiscoverJoinedBanner } from "./discover-joined-banner";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function renderBanner(systemChannelId: string | null) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverJoinedBanner
        onDismiss={() => undefined}
        server={{ id: "server-1", name: "Startup Türkiye", systemChannelId }}
      />
    </LocaleProvider>,
  );
}

describe("DiscoverJoinedBanner", () => {
  it("announces the successful join as a polite status", () => {
    const html = renderBanner("welcome-1");

    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.ok(html.includes("Startup Türkiye sunucusuna katıldın"));
  });

  it("does not claim a welcome channel when systemChannelId is absent", () => {
    const html = renderBanner(null);

    assert.ok(html.includes("Sunucu rayına ve Sunucularım listesine eklendi"));
    assert.ok(!html.includes("hoş geldin kanalı açıldı"));
  });

  it("links the persistent banner to the joined server", () => {
    const html = renderBanner(null);

    assert.match(html, /href="\/channels\/server-1"/);
    assert.match(html, /data-testid="discover-joined-banner"/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverChannel, DiscoverChannelActivityLabel } from "@wizards/types";

import { DiscoverChannelRow } from "@/components/discover/discover-channel-row";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const noop = () => undefined;

function channel(activityLabel: DiscoverChannelActivityLabel): DiscoverChannel {
  return {
    activityLabel,
    dailyMessageCount: 340,
    id: `channel-${activityLabel}`,
    memberPreview: [
      { id: "u1", initials: "SA" },
      { id: "u2", initials: "MK" },
    ],
    name: "tasarım-kritiği",
    serverCategory: "destek",
    serverId: "server-1",
    serverName: "Whispr Topluluğu",
  };
}

function render(item: DiscoverChannel): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverChannelRow channel={item} onOpen={noop} onPreview={noop} />
    </LocaleProvider>,
  );
}

describe("DiscoverChannelRow", () => {
  const cases: ReadonlyArray<{
    label: DiscoverChannelActivityLabel;
    text: string;
    tone: string;
  }> = [
    { label: "official", text: "Resmî", tone: "primary" },
    { label: "live", text: "Canlı", tone: "danger" },
    { label: "busy", text: "Yoğun", tone: "primary" },
    { label: "open", text: "Açık", tone: "success" },
    { label: "new", text: "Yeni", tone: "warning" },
    { label: "weekly", text: "Haftalık", tone: "info" },
  ];

  for (const item of cases) {
    it(`${item.label} sınıfını ${item.text}/${item.tone} piliyle çizer`, () => {
      const markup = render(channel(item.label));

      assert.ok(markup.includes(item.text));
      assert.ok(markup.includes(`data-tone="${item.tone}"`));
    });
  }

  it("article kökü, tam satır düğmesi, Önizle düğmesi ve dekoratif avatar yığını çizer", () => {
    const markup = render(channel("busy"));

    assert.ok(markup.startsWith("<article"));
    assert.equal(markup.match(/type="button"/g)?.length, 2);
    assert.ok(markup.includes('aria-hidden="true"'));
    assert.ok(markup.includes("Whispr Topluluğu · 340 mesaj/gün"));
    assert.ok(!markup.includes("lucide-badge-check"));
  });

  it("render sırasında fetch çağırmaz", (context) => {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response();
    });

    render(channel("busy"));
    assert.equal(calls, 0);
  });
});

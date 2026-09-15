import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { ConnectionsBlock } from "@/components/settings/blocks/connections-block";
import { getMessagesForLocale } from "@/lib/locale";
import { STATIC_CONNECTIONS } from "@/lib/settings/security-client";
import type { SettingsRowDef } from "@/lib/settings/tree";

/** Ş7 §2 / K5 — dört satır çizilir, dördü de `disabled`, uydurma uç çağrısı yok. */

const MESSAGES = getMessagesForLocale("tr");
const ROW: SettingsRowDef = { block: "connections", key: "cn", type: "custom" };

const SOURCE = readFileSync(
  fileURLToPath(new URL("./connections-block.tsx", import.meta.url)),
  "utf8",
);

function render(): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <ConnectionsBlock data={{}} row={ROW} />
    </LocaleProvider>,
  );
}

describe("ConnectionsBlock — içerik", () => {
  it("GitHub · Spotify · Steam · Xbox satırlarının dördü de çiziliyor", () => {
    const markup = render();

    for (const service of ["github", "spotify", "steam", "xbox"]) {
      assert.ok(
        markup.includes(`data-testid="settings-connection-${service}"`),
        `${service} satırı yok`,
      );
    }
  });

  it("ikon zeminleri ton **token adı** taşıyor, renk değil", () => {
    const markup = render();

    assert.ok(markup.includes("hsl(var(--primary) / 0.14)"), "GitHub `--primary`");
    assert.ok(markup.includes("hsl(var(--success) / 0.14)"), "Spotify `--success`");
    assert.ok(markup.includes("hsl(var(--warning) / 0.14)"), "Steam `--warning`");
    assert.ok(markup.includes("hsl(var(--info) / 0.14)"), "Xbox `--info`");
  });
});

describe("ConnectionsBlock — K5", () => {
  it("labels unavailable connection actions as coming soon", () => {
    assert.equal((render().match(/>Yakında<\/button>/gu) ?? []).length, 4);
  });
  it("adapter dört servisi de `available: false` veriyor", () => {
    assert.deepEqual(
      STATIC_CONNECTIONS.map((connection) => connection.available),
      [false, false, false, false],
    );
  });

  it("dört düğme de `disabled`", () => {
    const markup = render();

    for (const service of ["github", "spotify", "steam", "xbox"]) {
      assert.match(
        markup,
        new RegExp(`settings-connection-${service}-action"[^>]*disabled`, "u"),
        `${service} düğmesi açık kalmış`,
      );
    }
  });

  it("`disabled` düğmenin gerekçesi metinle de yazılıyor", () => {
    assert.ok(render().includes("Bu servis henüz bağlanamıyor"));
  });

  it("uydurma endpoint çağrısı yok — dosyada adres geçmiyor", () => {
    assert.ok(!/["'`]\/api\//u.test(SOURCE), "blok kendi adresini bilmemeli");
    assert.ok(!SOURCE.includes("fetch("), "blok doğrudan `fetch` çağırmamalı");
  });
});

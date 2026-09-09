import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BADGE_CATALOG, BADGE_IDS, type OwnBadgesResponse } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  BadgeGridBlock,
  OwnBadgesProvider,
  badgeProgressText,
} from "@/components/settings/blocks/badge-grid-block";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import type { SettingsRowDef } from "@/lib/settings/tree";

/** Ş7 §5 — rozet ızgarası: gerçek sayaç, iskelet, **açıklama yok**. */

const MESSAGES: Record<string, string> = getMessagesForLocale("tr");
const ROW: SettingsRowDef = { block: "badges", key: "r1", type: "custom" };

const SOURCE = readFileSync(
  fileURLToPath(new URL("./badge-grid-block.tsx", import.meta.url)),
  "utf8",
);

const EARNED_IDS = ["staff", "verified", "earlyMember", "inviter", "contributor"] as const;

const RESPONSE: OwnBadgesResponse = {
  badges: EARNED_IDS.map((id) => ({
    earnedAt: "2026-01-01T00:00:00.000Z",
    id,
    tier: 1,
  })),
  progress: [],
} as unknown as OwnBadgesResponse;

function render(value: { data: OwnBadgesResponse | null; failed?: boolean }): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <OwnBadgesProvider value={{ data: value.data, failed: value.failed ?? false }}>
        <BadgeGridBlock data={{}} row={ROW} />
      </OwnBadgesProvider>
    </LocaleProvider>,
  );
}

describe("BadgeGridBlock — sayaç", () => {
  it("grup başlığı gerçek veriden üretiliyor, sabit değil", () => {
    const translate = (key: string, values?: Record<string, number | string>) =>
      (MESSAGES[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) =>
        String(values?.[name] ?? ""),
      );

    assert.equal(badgeProgressText(RESPONSE, translate), "5 / 16 rozet kazanıldı");
    assert.equal(badgeProgressText(null, translate), "0 / 16 rozet kazanıldı");
  });

  it("katalogda on altı rozet var", () => {
    assert.equal(BADGE_IDS.length, 16);
  });
});

describe("BadgeGridBlock — ızgara", () => {
  it("ağır blok ilk açılışta iskeletle geliyor", () => {
    const markup = render({ data: null });

    assert.ok(markup.includes('data-testid="settings-block-r1-skeleton"'));
    assert.ok(markup.includes('aria-busy="true"'));
  });

  it("beş kategori dört kolonlu ızgara çiziyor", () => {
    const markup = render({ data: RESPONSE });

    for (const family of ["identity", "contribution", "activity", "commerce", "event"]) {
      assert.ok(
        markup.includes(`data-testid="settings-badge-family-${family}"`),
        `${family} kategorisi yok`,
      );
    }

    assert.ok(
      markup.includes(
        `grid-template-columns:repeat(${SETTINGS_METRICS.blocks.badgeGrid.columns}, minmax(0, 1fr))`,
      ),
    );
  });

  it("on altı rozetin hepsi çiziliyor; kazanılan dolu, kilitli boş yıldız", () => {
    const markup = render({ data: RESPONSE });

    for (const id of BADGE_IDS) {
      assert.ok(markup.includes(`data-testid="settings-badge-${id}"`), `${id} çizilmemiş`);
    }

    assert.equal(
      (markup.match(/data-badge-earned="true"/gu) ?? []).length,
      EARNED_IDS.length,
      "kazanılan rozet sayısı veriden gelmeli",
    );
    assert.ok(markup.includes('fill="none"'), "kilitli rozet boş yıldız çizmeli");
    assert.ok(markup.includes('fill="currentColor"'), "kazanılan rozet dolu yıldız çizmeli");
  });

  it("rozet adları katalogdan; SPEC sırasıyla aynı", () => {
    const markup = render({ data: RESPONSE });

    for (const name of ["Ekip", "Doğrulanmış", "Erken üye", "Kıdemli", "Beta testçisi"]) {
      assert.ok(markup.includes(name), `${name} yok`);
    }
  });
});

describe("BadgeGridBlock — README notu", () => {
  it("hiçbir rozet açıklaması çizilmiyor", () => {
    const markup = render({ data: RESPONSE });

    for (const id of BADGE_IDS) {
      assert.ok(!markup.includes(BADGE_CATALOG[id].copy.tr.description), `${id} açıklaması sızmış`);
    }
  });

  it("`title` özniteliği de konmuyor", () => {
    assert.ok(!render({ data: RESPONSE }).includes("title="));
    assert.ok(!SOURCE.includes("copy[locale].description"));
  });
});

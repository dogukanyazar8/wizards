import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SecurityEventKindSchema, type SecurityEvent } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  SECURITY_EVENT_ROW_LIMIT,
  SecurityEventsBlock,
  formatSecurityEventTitle,
} from "@/components/settings/blocks/security-events-block";
import { getMessagesForLocale } from "@/lib/locale";
import type { SettingsRowDef } from "@/lib/settings/tree";

/** Ş7 §4 — güvenlik günlüğü satırı: metin sözlükten, renk tek başına anlam taşımaz. */

const MESSAGES: Record<string, string> = getMessagesForLocale("tr");
const ROW: SettingsRowDef = { block: "secEvents", key: "s3", type: "custom" };

const SOURCE = readFileSync(
  fileURLToPath(new URL("./security-events-block.tsx", import.meta.url)),
  "utf8",
);

const translate = (key: string) => MESSAGES[key] ?? key;

function event(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    createdAt: "2026-08-12T09:12:00.000Z",
    id: "event-1",
    kind: "loginNewDevice",
    location: "İstanbul",
    userAgent: "Chrome",
    ...overrides,
  };
}

describe("SecurityEventsBlock — metin", () => {
  it("sekiz türün de sözlük karşılığı var (sunucu Türkçe göndermiyor)", () => {
    for (const kind of SecurityEventKindSchema.options) {
      const key = `settings.block.secEvents.kind.${kind}`;

      assert.ok(MESSAGES[key], `${key} sözlükte yok`);
    }
  });

  it("başlık = tür · cihaz · konum", () => {
    assert.equal(
      formatSecurityEventTitle(event(), translate),
      "Yeni cihazdan giriş · Chrome · İstanbul",
    );
  });

  it("eksik alanlar ayırıcı bırakmıyor", () => {
    assert.equal(
      formatSecurityEventTitle(event({ location: null, userAgent: null }), translate),
      "Yeni cihazdan giriş",
    );
  });

  it("renk tek başına anlam taşımıyor: her tür bir cümle de yazıyor", () => {
    for (const kind of SecurityEventKindSchema.options) {
      assert.notEqual(formatSecurityEventTitle(event({ kind }), translate).length, 0);
    }
  });
});

describe("SecurityEventsBlock — çizim", () => {
  it("veri gelene kadar iskelet çiziyor", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
        <SecurityEventsBlock data={{}} row={ROW} />
      </LocaleProvider>,
    );

    assert.ok(markup.includes('data-testid="settings-block-s3-skeleton"'));
    assert.ok(markup.includes('aria-busy="true"'));
  });

  it("SPEC §5.1 — üç satır", () => {
    assert.equal(SECURITY_EVENT_ROW_LIMIT, 3);
  });

  it("veri `security-client` adapterinden geliyor, blok adres bilmiyor", () => {
    assert.ok(SOURCE.includes("fetchSecurityEvents"));
    assert.ok(!/["'`]\/api\//u.test(SOURCE));
  });
});

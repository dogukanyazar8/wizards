import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatAccountDate } from "@wizards/types";

import {
  ProfileRelationshipCard,
  formatRelationshipDuration,
  monthsBetween,
  type ProfileRelationshipCardProps,
} from "@/components/messages/profile-relationship-card";
import { AccountPreferenceProvider } from "@/components/providers/account-preference-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş6 · §15.3.3 — tarih kartı.
 *
 * İki kural bu dosyanın asıl konusu: **arkadaş değilse kart yok** (K7) ve **ortak sunucu
 * yoksa ikinci cümle düşer** (K6). Üçüncüsü tarihin nereden geldiği: `14 Şubat 2025` gibi
 * bir dize gömülmüş olsaydı, tarih biçimini `GG/AA/YYYY` yapmış bir kullanıcı panelde
 * başka bir biçim görürdü — testi iki farklı tercihle iki farklı çıktı bekleyerek soruyor.
 */

const TR = getMessagesForLocale("tr");
const SINCE = "2025-02-14T09:00:00.000Z";
const NOW = new Date("2026-08-27T12:00:00.000Z");

type Prefs = React.ComponentProps<typeof AccountPreferenceProvider>["preferences"];

const LOCALE_PREFS: Prefs = {
  dateFormat: "LOCALE",
  interfaceDensity: "COMFORTABLE",
  timeFormat: "H24",
  timeZone: "Europe/Istanbul",
};

function render(
  props: Partial<ProfileRelationshipCardProps> = {},
  preferences: Prefs = LOCALE_PREFS,
): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <AccountPreferenceProvider locale="tr" preferences={preferences}>
        <ProfileRelationshipCard
          facts={{
            durationMonths: 18,
            kind: "friendship",
            metViaServerName: "Whispr Topluluğu",
            since: SINCE,
          }}
          now={NOW}
          {...props}
        />
      </AccountPreferenceProvider>
    </LocaleProvider>,
  );
}

describe("ProfileRelationshipCard — DM kolu", () => {
  it("arkadaşlık cümlesi + tanışma cümlesi çizilir", () => {
    const markup = render();

    assert.ok(markup.includes("tarihinden beri arkadaşsınız"), markup);
    assert.ok(markup.includes("Whispr Topluluğu üzerinden tanıştınız · 1 yıl 6 ay"), markup);
  });

  /** K7 — arkadaş değilse kart hiç çizilmez; yerine boş bir satır konmaz. */
  it("arkadaş değilse kart hiç çizilmez", () => {
    assert.equal(render({ facts: null }), "");
  });

  /** K6 — ortak sunucu yoksa ikinci cümle düşer, tarih cümlesi kalır. */
  it("ortak sunucu yoksa yalnız tarih cümlesi kalır", () => {
    const markup = render({
      facts: { durationMonths: 18, kind: "friendship", metViaServerName: null, since: SINCE },
    });

    assert.ok(markup.includes('data-testid="profile-relationship-title"'), markup);
    assert.ok(!markup.includes('data-testid="profile-relationship-subtitle"'), markup);
    assert.ok(markup.includes("tarihinden beri arkadaşsınız"));
  });
});

describe("ProfileRelationshipCard — tarih istemcide biçimlenir", () => {
  it("tarih kullanıcının `dateFormat` tercihine göre çizilir", () => {
    const expected = formatAccountDate(SINCE, {
      dateFormat: "LOCALE",
      locale: "tr",
      timeZone: "Europe/Istanbul",
    });

    assert.ok(render().includes(expected), `beklenen: ${expected}`);
  });

  it("tercih değişince metin de değişir — sabit dize gömülmemiş", () => {
    const dmy = render({}, { ...LOCALE_PREFS, dateFormat: "DMY" });
    const locale = render();

    assert.notEqual(dmy, locale);
    assert.ok(
      dmy.includes(
        formatAccountDate(SINCE, {
          dateFormat: "DMY",
          locale: "tr",
          timeZone: "Europe/Istanbul",
        }),
      ),
      dmy,
    );
  });

  it("saat dilimi de tercihten okunur", () => {
    // 14 Şubat 09:00 UTC, Pasifik'te hâlâ 13 Şubat.
    const pacific = render({}, { ...LOCALE_PREFS, timeZone: "America/Los_Angeles" });

    assert.ok(
      pacific.includes(
        formatAccountDate(SINCE, {
          dateFormat: "LOCALE",
          locale: "tr",
          timeZone: "America/Los_Angeles",
        }),
      ),
      pacific,
    );
  });
});

describe("ProfileRelationshipCard — grup kolu", () => {
  it("kuruluş cümlesi + kurucu cümlesi çizilir", () => {
    const markup = render({
      facts: { createdAt: "2026-03-02T08:00:00.000Z", kind: "group", ownerName: "Doğukan Yazar" },
    });

    assert.ok(markup.includes("tarihinde kuruldu"), markup);
    assert.ok(markup.includes("Kurucu: Doğukan Yazar · 5 ay"), markup);
  });

  it("kurucu bilinmiyorsa ikinci cümle düşer", () => {
    const markup = render({
      facts: { createdAt: "2026-03-02T08:00:00.000Z", kind: "group", ownerName: null },
    });

    assert.ok(markup.includes("tarihinde kuruldu"));
    assert.ok(!markup.includes('data-testid="profile-relationship-subtitle"'));
  });
});

describe("ProfileRelationshipCard — süre metni", () => {
  /**
   * Türkçede sayıdan sonra çoğul eki yok (`1 yıl` / `2 yıl`), İngilizce karşılık kısaltmalı.
   * Yani iki anahtar iki **şekil** içindir; tek dal `years === 0`.
   */
  it("yıl + ay ve yalnız ay şekilleri", () => {
    const t = (key: string, values?: Record<string, number | string>) =>
      (TR[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(values?.[name] ?? ""));

    assert.equal(formatRelationshipDuration(18, t), "1 yıl 6 ay");
    assert.equal(formatRelationshipDuration(6, t), "6 ay");
    assert.equal(formatRelationshipDuration(1, t), "1 ay");
    assert.equal(formatRelationshipDuration(24, t), "2 yıl 0 ay");
  });

  it("tam ay farkı gün dolmadan sayılmaz", () => {
    assert.equal(monthsBetween(new Date("2026-03-02"), new Date("2026-03-30")), 0);
    assert.equal(monthsBetween(new Date("2026-03-02"), new Date("2026-04-02")), 1);
    assert.equal(monthsBetween(new Date("2026-03-02"), new Date("2026-04-01")), 0);
    assert.equal(monthsBetween(new Date("2025-02-14"), new Date("2026-08-27")), 18);
    // Gelecek bir tarih negatif süre üretmez.
    assert.equal(monthsBetween(new Date("2027-01-01"), new Date("2026-08-27")), 0);
  });
});

describe("ProfileRelationshipCard — iskelet ve hata", () => {
  it("yüklenirken kendi iskeletini çizer", () => {
    const markup = render({ loading: true });

    assert.ok(markup.includes('data-testid="profile-relationship-skeleton"'));
    assert.ok(markup.includes("animate-pulse"));
  });

  it("hata hâlinde tek satır muted metne iner", () => {
    const markup = render({ failed: true });

    assert.ok(markup.includes('data-testid="profile-relationship-error"'));
    assert.ok(!markup.includes('data-testid="profile-relationship-card"'));
  });
});

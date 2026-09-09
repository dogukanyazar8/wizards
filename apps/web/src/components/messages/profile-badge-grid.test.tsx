import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BADGE_CATALOG,
  BADGE_IDS,
  buildOwnBadgeEntries,
  type BadgeId,
  type EarnedBadge,
} from "@wizards/types";

import { ProfileBadgeGrid } from "@/components/messages/profile-badge-grid";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { BadgeCell } from "@/components/settings/blocks/badge-grid-block";
import { BADGE_LUCIDE_ICON } from "@/components/shared/profile-badge-chips";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * Ş6 · §15.3.2 — rozet ızgarası.
 *
 * Bu dosyanın asıl sorusu bir **karar**dır (K10): kart yeniden yazılmadı mı? Cevabı iki
 * katmanda arıyor — kaynakta Ayarlar bileşenini gerçekten içe aktarıyor mu, ve çizdiği
 * markup o bileşenin kendi çıktısıyla **birebir** aynı mı. İkincisi olmadan birincisi
 * "içe aktardım ama yanına kendi kartımı da çizdim"e izin verirdi.
 */

const TR = getMessagesForLocale("tr");
const SOURCE = readFileSync(
  fileURLToPath(new URL("./profile-badge-grid.tsx", import.meta.url)),
  "utf8",
);
/** Yorumsuz kaynak: "sabit yazılmadı" iddiası koda sorulur, yorumlara değil. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
const SPEC_BADGES: readonly BadgeId[] = [
  "verified",
  "earlyMember",
  "inviter",
  "ideaShipped",
  "contributor",
  "voice",
];

function badge(id: BadgeId, tier = 1): EarnedBadge {
  return { earnedAt: "2026-01-01T00:00:00.000Z", expiresAt: null, id, tier };
}

function render(props: Partial<React.ComponentProps<typeof ProfileBadgeGrid>> = {}): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <ProfileBadgeGrid badges={SPEC_BADGES.map((id) => badge(id))} {...props} />
    </LocaleProvider>,
  );
}

describe("ProfileBadgeGrid — sayaç", () => {
  it("payda katalog uzunluğundan okunuyor, `16` sabiti yazılmıyor", () => {
    const markup = render();

    assert.ok(markup.includes(`${SPEC_BADGES.length} / ${BADGE_IDS.length}`), markup);
    assert.ok(!CODE.includes("16"), "payda kaynakta sabit yazılmış");
  });

  /**
   * Katalog büyüdüğünde metnin kendiliğinden doğru kalması tuzak 11'in ta kendisi.
   * Sabit bir `16` yazılmış olsaydı bu iddia sessizce yanlışlaşırdı.
   */
  it("payda katalogla birlikte değişir", () => {
    assert.equal(BADGE_IDS.length, 16, "katalog on altı kayıt taşıyor");
    assert.ok(render().includes(`/ ${BADGE_IDS.length}`));
  });

  it("sayaç kazanılanı sayar, ızgaradaki satır sayısını değil", () => {
    // Aynı rozet iki kez gelirse sayaç `7 / 16` demez.
    const markup = render({
      badges: [...SPEC_BADGES.map((id) => badge(id)), badge("verified", 2)],
    });

    assert.ok(markup.includes(`${SPEC_BADGES.length} / ${BADGE_IDS.length}`), markup);
  });
});

describe("ProfileBadgeGrid — K10: kart Ayarlar bileşeninin kendisi", () => {
  it("kaynak Ayarlar bileşenini içe aktarıyor", () => {
    assert.match(
      SOURCE,
      /import \{ BadgeCell \} from "@\/components\/settings\/blocks\/badge-grid-block"/u,
    );
  });

  it("çizilen kart `BadgeCell`'in kendi çıktısı — kopya değil", () => {
    const entry = buildOwnBadgeEntries({ badges: [badge("verified")], progress: [] }).find(
      (row) => row.id === "verified",
    );
    assert.ok(entry);

    const cell = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        <BadgeCell
          description={BADGE_CATALOG.verified.copy.tr.description}
          entry={entry}
          icon={BADGE_LUCIDE_ICON.verified}
          locale="tr"
          testId="profile-badge-verified"
          variant="profile"
        />
      </LocaleProvider>,
    );

    assert.ok(render().includes(cell), "ızgara kartı kendi çiziyor");
  });

  it("karo 26px, ikon 13px — Ayarlar'ın 34px karosu değil", () => {
    const markup = render();
    const { profilePanel } = MESSAGES_METRICS;

    assert.ok(markup.includes(`width:${pxToRem(profilePanel.badgeTileSize)}`), markup);
    assert.ok(markup.includes(`width:${pxToRem(profilePanel.badgeIconSize)}`), markup);
  });

  it("iki kolon, gap 6", () => {
    const { profilePanel } = MESSAGES_METRICS;

    assert.ok(
      render().includes(
        `grid-template-columns:repeat(${profilePanel.badgeColumns}, minmax(0, 1fr))`,
      ),
    );
  });
});

describe("ProfileBadgeGrid — içerik", () => {
  it("yalnız kazanılanlar listeleniyor", () => {
    const markup = render({ badges: [badge("verified")] });

    assert.ok(markup.includes('data-testid="profile-badge-verified"'));
    for (const id of BADGE_IDS) {
      if (id === "verified") continue;
      assert.ok(!markup.includes(`data-testid="profile-badge-${id}"`), `${id} sızmış`);
    }
  });

  it("rozet adı ve açıklaması katalogdan gelir — sözlükten değil", () => {
    const markup = render({ badges: [badge("verified")] });

    assert.ok(markup.includes(BADGE_CATALOG.verified.copy.tr.name));
    assert.ok(markup.includes(BADGE_CATALOG.verified.copy.tr.description));
    assert.ok(!SOURCE.includes("messages.profile.badge."), "i18n'e rozet anahtarı eklenmiş");
  });

  /** `title` fare içindir; klavye ve ekran okuyucu kullanıcısı için metin DOM'da da olmalı. */
  it("açıklama `title` **ve** `sr-only` metin olarak veriliyor", () => {
    const markup = render({ badges: [badge("verified")] });
    const description = BADGE_CATALOG.verified.copy.tr.description;

    assert.ok(markup.includes(`title="${description}"`), markup);
    assert.ok(markup.includes(`<span class="sr-only">${description}</span>`), markup);
  });

  it("SPEC'in altı örneği katalog sırasıyla çizilir", () => {
    const markup = render();
    const positions = SPEC_BADGES.map((id) => markup.indexOf(`data-testid="profile-badge-${id}"`));

    assert.ok(
      positions.every((position) => position >= 0),
      "altı rozetin biri çizilmemiş",
    );
    assert.deepEqual(
      [...positions].sort((left, right) => left - right),
      positions,
    );
  });
});

describe("ProfileBadgeGrid — boş, yükleniyor, hata", () => {
  it("rozet yoksa bölüm hiç çizilmez", () => {
    assert.equal(render({ badges: [] }), "");
  });

  it("yüklenirken kendi iskeletini çizer, sayaç göstermez", () => {
    const markup = render({ loading: true });

    assert.ok(markup.includes('data-testid="profile-badges"'));
    assert.ok(markup.includes("animate-pulse"));
    assert.ok(!markup.includes(`/ ${BADGE_IDS.length}`), "veri yokken sayaç uyduruluyor");
  });

  it("hata hâlinde tek satır muted metne iner, başlık bırakmaz", () => {
    const markup = render({ failed: true });

    assert.ok(markup.includes('data-testid="profile-badges-error"'));
    assert.ok(markup.includes(TR["messages.profile.error.load"] ?? "—"));
    assert.ok(!markup.includes('data-testid="profile-badges"'));
  });
});

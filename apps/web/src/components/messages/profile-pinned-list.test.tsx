import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatAccountDate, type PinnedMessageDTO } from "@wizards/types";

import { ProfilePinnedList } from "@/components/messages/profile-pinned-list";
import { AccountPreferenceProvider } from "@/components/providers/account-preference-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş6 · §15.3.6 — sabitlenen mesajlar (grup).
 *
 * Kartın tıklanınca **mevcut** atlama yolunu kullanması ayrı bir iddia: yeni bir gezinme
 * icat edilmiş olsaydı aynı hedefe giden üçüncü bir yol ve üçüncü bir vurgulama süresi
 * doğardı. Kaynakta `jumpToMessageInDocument` aranıyor, çünkü davranışın kendisi `window`
 * ister ve sunucu render'ında sınanamaz.
 */

const TR = getMessagesForLocale("tr");
const SOURCE = readFileSync(
  fileURLToPath(new URL("./profile-pinned-list.tsx", import.meta.url)),
  "utf8",
);

function pin(overrides: Partial<PinnedMessageDTO> = {}): PinnedMessageDTO {
  return {
    authorName: "Doğukan Yazar",
    excerpt: "Yayın kontrol listesi burada",
    messageId: "m1",
    pinnedAt: "2026-08-12T14:00:00.000Z",
    removable: true,
    ...overrides,
  };
}

function render(props: Partial<React.ComponentProps<typeof ProfilePinnedList>> = {}): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <AccountPreferenceProvider
        locale="tr"
        preferences={{
          dateFormat: "LOCALE",
          interfaceDensity: "COMFORTABLE",
          timeFormat: "H24",
          timeZone: "Europe/Istanbul",
        }}
      >
        <ProfilePinnedList pins={[pin(), pin({ messageId: "m2" })]} {...props} />
      </AccountPreferenceProvider>
    </LocaleProvider>,
  );
}

describe("ProfilePinnedList — §15.3.6", () => {
  it("iki kart, yazar · tarih ve alıntı", () => {
    const markup = render();
    const date = formatAccountDate("2026-08-12T14:00:00.000Z", {
      dateFormat: "LOCALE",
      locale: "tr",
      timeZone: "Europe/Istanbul",
    });

    assert.equal((markup.match(/data-testid="profile-pinned-m/gu) ?? []).length, 2);
    assert.ok(markup.includes(`Doğukan Yazar · ${date}`), markup);
    assert.ok(markup.includes("Yayın kontrol listesi burada"));
  });

  it("başlık `SABİTLENEN MESAJLAR`, sayaç yok", () => {
    const markup = render();

    assert.ok(markup.includes("Sabitlenen mesajlar"), markup);
    assert.ok(markup.includes("uppercase"), markup);
  });

  it("raptiye warning tonunda", () => {
    assert.ok(render().includes("text-[hsl(var(--warning))]"));
  });

  it("kart gerçek bir düğme ve mesaja gider", () => {
    const jumped: string[] = [];
    renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        <ProfilePinnedList onJump={(id) => jumped.push(id)} pins={[pin()]} />
      </LocaleProvider>,
    );

    assert.match(render(), /<button[^>]*data-testid="profile-pinned-m1"[^>]*type="button"/u);
    assert.deepEqual(jumped, []);
  });

  /** Yeni gezinme icat edilmedi — `chat-area` ve `server-member-panel` ile aynı çağrı. */
  it("varsayılan atlama yolu mevcut yardımcıdır", () => {
    assert.match(
      SOURCE,
      /import \{ jumpToMessageInDocument \} from "@\/lib\/messages\/jump-to-message"/u,
    );
  });

  it("sabitlenen yoksa bölüm hiç çizilmez", () => {
    assert.equal(render({ pins: [] }), "");
  });

  it("yüklenirken iskelet, hatada tek satır muted metin", () => {
    assert.ok(render({ loading: true }).includes("animate-pulse"));

    const failed = render({ failed: true });
    assert.ok(failed.includes('data-testid="profile-pinned-error"'));
    assert.ok(!failed.includes('data-testid="profile-pinned"'));
  });
});

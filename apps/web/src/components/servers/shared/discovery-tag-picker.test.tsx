import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { DiscoveryTagPicker } from "@/components/servers/shared/discovery-tag-picker";
import { getMessagesForLocale } from "@/lib/locale";
import { DISCOVERY_TAG_GROUPS } from "@/lib/servers/discovery-tag-groups";

const MESSAGES = getMessagesForLocale("tr");

function renderPicker(): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <DiscoveryTagPicker onChange={() => {}} tags={[]} variant="create" />
    </LocaleProvider>,
  );
}

describe("DiscoveryTagPicker önerileri", () => {
  it("her grubun kod rozetini ve önerilen etiketlerini çizer", () => {
    const markup = renderPicker();

    for (const group of DISCOVERY_TAG_GROUPS) {
      /*
        SPEC-SUNUCU §8.2: "`ÖNERİLEN ETİKETLER` ve 5 grup — her grubun solunda `31×31
        radius 10` kod rozeti", ardından `OY · İŞ · ÇA · Kİ · DE` tablosu. Referans HTML
        rozeti iki yüzeyde de çiziyor: `Sunucu.dc.html:1029` (oluşturma penceresi, 29px) ve
        `:1352` (ayarlar bölümü, 31px), ikisi de kodun kendisini `{{ g.code }}` ile basıyor.
        Rozetin ölçüsü `lib/servers/parity.test.ts` ve `shared-parts.test.tsx` tarafından
        ayrıca kilitleniyor; burada denetlenen, kodun **metninin** çizilmesi.
      */
      assert.ok(markup.includes(`>${group.code}<`), `${group.code} kod rozeti çizilmeli`);

      for (const suggestion of group.suggestions) {
        const escapedLabel = suggestion.label.replaceAll("&", "&amp;");
        assert.ok(markup.includes(`>${escapedLabel}<`), `${suggestion.label} önerisi yok`);
      }
    }
  });

  it("kod rozeti süslemedir: grubun adını ekran okuyucuya `role=group` etiketi söyler", () => {
    const markup = renderPicker();

    for (const group of DISCOVERY_TAG_GROUPS) {
      assert.match(
        markup,
        new RegExp(`<span aria-hidden="true"[^>]*>${group.code}</span>`, "u"),
        `${group.code} rozeti ekran okuyucudan gizlenmeli`,
      );

      const groupLabel = MESSAGES[`server.discoveryTags.group.${group.id}`];
      assert.ok(groupLabel, `${group.id} grubunun ad anahtarı sözlükte yok`);
      assert.ok(
        markup.includes(`aria-label="${groupLabel}"`),
        `${group.id} grubu adını \`aria-label\` olarak taşımalı`,
      );
    }
  });
});

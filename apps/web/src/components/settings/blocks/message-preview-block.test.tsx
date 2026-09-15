import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { MessagePreviewBlock } from "@/components/settings/blocks/message-preview-block";
import { getMessagesForLocale } from "@/lib/locale";
import { getMessageFontFamily, MESSAGE_FONT_OPTIONS } from "@/lib/message-fonts";
import { pxToRem } from "@/lib/settings/metrics";
import {
  SettingsValueContext,
  SettingsValueStore,
  type SettingsPatch,
} from "@/lib/settings/use-setting-value";

/** Ş8 §B.6 — `m5`, canlı önizleme. */

function render(values: SettingsPatch) {
  const store = new SettingsValueStore({ values, write: async () => {} });

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SettingsValueContext.Provider value={store}>
        <MessagePreviewBlock data={{}} row={{ block: "msgPreview", key: "m5", type: "custom" }} />
      </SettingsValueContext.Provider>
    </LocaleProvider>,
  );
}

describe("MessagePreviewBlock", () => {
  it("updates spacing when interface density changes independently of compact messages", () => {
    const comfortable = render({ m3: 0, m4: false });
    const dense = render({ m3: 1, m4: false });
    assert.notEqual(comfortable, dense);
    assert.ok(dense.includes('data-density="compact"'));
    assert.ok(dense.includes('data-compact="false"'));
    const compactComfortable = render({ m3: 0, m4: true }).replace(/data-density="[^"]+"/u, "");
    const compactDense = render({ m3: 1, m4: true }).replace(/data-density="[^"]+"/u, "");
    assert.notEqual(compactComfortable, compactDense);
  });
  it("iki örnek mesaj referanstakiyle birebir", () => {
    const markup = render({});

    assert.ok(markup.includes("Selin Aksoy"));
    assert.ok(markup.includes("09:41"));
    assert.ok(markup.includes("Mert Kaya"));
    assert.ok(markup.includes("09:44"));
    assert.ok(
      markup.includes(
        "Kart yoğunluğu kararını bugünkü kritiğe alalım mı? Kompakt sürüm belirgin biçimde daha fazla satır gösteriyor.",
      ),
    );
  });

  it("font seçimi anında yansıyor ve ad bileşene gömülü değil", () => {
    for (const [index, option] of MESSAGE_FONT_OPTIONS.entries()) {
      const markup = render({ m1: index });

      assert.ok(markup.includes(`data-font="${option.id}"`), option.id);
      assert.ok(markup.includes(getMessageFontFamily(option.id)), option.id);
    }
  });

  it("boyut seçimi anında yansıyor", () => {
    for (const size of [12, 15, 22]) {
      const markup = render({ m2: size });

      assert.ok(markup.includes(`data-size="${size}"`));
      assert.ok(markup.includes(`font-size:${pxToRem(size)}`));
    }
  });

  it("kompakt seçimi satır yüksekliğini ve ad boyutunu değiştiriyor", () => {
    const cozy = render({ m4: false });
    const compact = render({ m4: true });

    assert.ok(cozy.includes('data-compact="false"'));
    assert.ok(compact.includes('data-compact="true"'));
    assert.ok(cozy.includes("line-height:1.55"));
    assert.ok(compact.includes("line-height:1.35"));
  });

  it("font adı dosyaya gömülmemiş", () => {
    const source = readFileSync(new URL("./message-preview-block.tsx", import.meta.url), "utf8");

    for (const name of ["Outfit", "Inter", "Raleway", "Open Sans"]) {
      assert.ok(!source.includes(`"${name}"`), name);
    }
  });
});

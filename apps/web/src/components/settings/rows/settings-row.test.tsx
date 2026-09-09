import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsRow } from "@/components/settings/rows/settings-row";
import { SettingsSearchHighlightProvider } from "@/components/settings/settings-search-highlight";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/**
 * Ş6 §2 — satır ve tek kontrol ekseni.
 *
 * Eksen bir hizalama değeriyle değil, **yapıyla** kuruluyor: kontrol yuvası satırın son
 * çocuğudur, büyümez (`shrink-0`) ve satır dolgusu her satırda aynıdır. Bu üçü tuttuğu sürece
 * 38 px anahtar ile 260 px input aynı sağ kenarda biter; testler de bu üçünü ölçüyor, ekran
 * görüntüsü karşılaştırmıyor.
 */

const { row } = SETTINGS_METRICS;

const SOURCE = readFileSync(fileURLToPath(new URL("./settings-row.tsx", import.meta.url)), "utf8");

function render(props: Partial<React.ComponentProps<typeof SettingsRow>> = {}) {
  return renderToStaticMarkup(
    <SettingsRow
      control={(ids) => (
        <button
          aria-describedby={ids.describedById}
          aria-labelledby={ids.labelledById}
          data-testid="control"
          type="button"
        >
          kontrol
        </button>
      )}
      description="Bahsetmelerde ve davet bağlantılarında kullanılır"
      rowKey="pu"
      title="Kullanıcı adı"
      {...props}
    />,
  );
}

describe("SettingsRow — yapı", () => {
  it('`role="group"` ve satır anahtarı taşıyor', () => {
    const markup = render();

    assert.ok(markup.includes('role="group"'));
    assert.ok(markup.includes('data-setting-row="pu"'));
  });

  it("başlık ve açıklama kimlik taşıyor, kontrol ikisine bağlanıyor", () => {
    const markup = render();
    const labelId = /id="([^"]+-label)"/u.exec(markup)?.[1];
    const descriptionId = /id="([^"]+-description)"/u.exec(markup)?.[1];

    assert.ok(labelId, "başlık kimliği yok");
    assert.ok(descriptionId, "açıklama kimliği yok");
    assert.ok(markup.includes(`aria-labelledby="${labelId}"`));
    assert.ok(markup.includes(`aria-describedby="${descriptionId}"`));
  });

  it("açıklaması olmayan satırda `aria-describedby` hiç çıkmıyor", () => {
    const markup = render({ description: undefined });

    assert.ok(!markup.includes("aria-describedby"));
  });

  it("açıklama kontrol yuvasının dışında, sol kolonda duruyor", () => {
    const markup = render();
    const controlSlot = markup.indexOf('data-setting-control="pu"');
    const description = markup.indexOf("Bahsetmelerde");

    assert.ok(description >= 0 && controlSlot >= 0);
    assert.ok(description < controlSlot, "açıklama kontrol yuvasından sonra çizilmiş");
  });

  it("açıklama 400 px ile sınırlı", () => {
    assert.ok(render().includes(`max-width:${pxToRem(row.subMaxWidth)}`));
  });
});

describe("SettingsRow — arama hedefi", () => {
  it("yalnız seçilen satıra geçici vurgu niteliği verir", () => {
    const markup = renderToStaticMarkup(
      <SettingsSearchHighlightProvider rowKey="pu">
        <SettingsRow rowKey="pu" title="Kullanıcı adı" />
        <SettingsRow rowKey="other" title="Diğer" />
      </SettingsSearchHighlightProvider>,
    );

    assert.equal(markup.match(/data-settings-search-highlight="true"/gu)?.length, 1);
    assert.match(markup, /data-setting-row="pu" data-settings-search-highlight="true"/u);
  });
});

describe("SettingsRow — tek kontrol ekseni", () => {
  it("kontrol yuvası büyümüyor ve sağa yaslı", () => {
    const markup = render();

    assert.match(markup, /class="flex shrink-0 items-center justify-end"/u);
  });

  it("satır dolgusu her satırda aynı sözlük değerinden geliyor", () => {
    const withToggle = render({ control: () => <span>a</span> });
    const withInput = render({ control: () => <span>bbbbbbbbbbbbbbbb</span> });
    const padding = `padding:${pxToRem(row.paddingY)} ${pxToRem(row.paddingX)}`;

    assert.ok(withToggle.includes(padding));
    assert.ok(withInput.includes(padding));
  });

  it("kontrolsüz satır yuva çizmiyor", () => {
    const markup = render({ control: undefined });

    assert.ok(!markup.includes("data-setting-control"));
  });
});

describe("SettingsRow — küçük ekran", () => {
  it("`<720px` kolonu CSS ile devriliyor, JavaScript ile değil (tuzak #10)", () => {
    const markup = render();

    assert.ok(markup.includes("flex-col"));
    assert.ok(markup.includes("min-[720px]:flex-row"));
    // Kırılım JavaScript'te seçilmiyor: bileşende görünüm alanı ölçen bir kanca yok.
    assert.ok(!SOURCE.includes("useSyncExternalStore"));
    assert.ok(!SOURCE.includes("innerWidth"));
    assert.ok(!SOURCE.includes("matchMedia"));
  });
});

describe("SettingsRow — pil ve ton", () => {
  it("pil tonunu token adından alıyor", () => {
    const markup = render({ badge: "Kilitli", badgeTone: "primary" });

    assert.ok(markup.includes("Kilitli"));
    assert.ok(markup.includes("hsl(var(--primary) / 0.14)"));
    assert.ok(markup.includes("color:hsl(var(--primary))"));
  });

  it("tonsuz pil nötr zemine düşüyor", () => {
    const markup = render({ badge: "Beta" });

    assert.ok(markup.includes("hsl(var(--surface-soft))"));
  });

  it("`danger` satır zeminini ve başlığını tehlike tonuna çekiyor", () => {
    const markup = render({ tone: "danger" });

    assert.ok(markup.includes("hsl(var(--danger) / 0.05)"));
    assert.ok(markup.includes("text-[var(--danger-readable)]"));
  });

  it("ton dosyada renk değeri olarak yazılmamış", () => {
    // Kalite çıtası: `PERMISSION_TONE.blocked = "--danger"`, `"hsl(352 84% 60%)"` değil.
    assert.ok(!/#[0-9a-f]{6}/iu.test(SOURCE));
    assert.ok(!/rgba?\(/u.test(SOURCE));
  });
});

describe("SettingsRow — ayırıcı", () => {
  it("ilk satırda üst kenar yok", () => {
    assert.ok(!render({ divider: false }).includes("border-top"));
  });

  it("sonraki satırlarda üst kenar sözlükten geliyor", () => {
    const markup = render({ divider: true });

    assert.ok(markup.includes(`hsl(var(--border) / ${row.dividerAlpha})`));
    assert.ok(markup.includes("border-top"));
  });
});

describe("SettingsRow — çok satırlı alan", () => {
  it("alan sol kolonda, kontrol yuvasında değil", () => {
    const markup = render({
      align: "start",
      control: undefined,
      field: () => <textarea data-testid="bio" />,
    });

    assert.ok(markup.includes('data-testid="bio"'));
    assert.ok(!markup.includes("data-setting-control"));
    assert.ok(markup.includes("min-[720px]:items-start"));
  });
});

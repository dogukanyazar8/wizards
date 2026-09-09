import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  SETTING_SOUND_PROFILES,
  SETTING_SOUND_VOLUME_STEP,
  SettingSoundRow,
} from "@/components/settings/rows/setting-sound-row";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — ses satırının ikinci sırası (`snd`). */

const { sound } = SETTINGS_METRICS.controls;

function render(props: Partial<React.ComponentProps<typeof SettingSoundRow>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SettingSoundRow
        onPreview={() => {}}
        onProfileChange={() => {}}
        onVolumeChange={() => {}}
        profile="whispr"
        testId="snd"
        volume={60}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("SettingSoundRow — üç kontrol", () => {
  const markup = render();

  it("profil segmenti, seviye rayı ve önizleme birlikte çiziliyor", () => {
    assert.ok(markup.includes("Whispr"));
    assert.ok(markup.includes("Klasik"));
    assert.ok(markup.includes("Seviye"));
    assert.ok(markup.includes("Önizle"));
  });

  it("iki profil ve iki kaynak aynı listeden", () => {
    assert.deepEqual([...SETTING_SOUND_PROFILES], ["whispr", "classic"]);
    assert.equal(markup.match(/role="radio"/gu)?.length, 2);
  });

  it("üç kontrol ayrı ayrı etiketli", () => {
    assert.ok(markup.includes('aria-label="Ses profili"'));
    assert.ok(markup.includes('role="slider"'));
    // Seviye rayı kendi etiketine bağlı, satır başlığına değil.
    const levelLabelId = /aria-labelledby="([^"]+-level)"/u.exec(markup)?.[1];
    assert.ok(levelLabelId);
    assert.ok(markup.includes(`id="${levelLabelId}"`));
  });

  it("seviye rayı birimli `aria-valuetext` taşıyor", () => {
    assert.ok(markup.includes('aria-valuenow="60"'));
    assert.ok(markup.includes('aria-valuetext="60%"'));
  });

  it("seçili profil `aria-checked` ve ters beyaz metin", () => {
    assert.equal(markup.match(/aria-checked="true"/gu)?.length, 1);
    assert.ok(markup.includes("color:#fff"));
  });

  it("`Klasik` seçiliyken işaret yer değiştiriyor", () => {
    const classic = render({ profile: "classic" });
    const whisprIndex = classic.indexOf("Whispr");
    const checkedIndex = classic.indexOf('aria-checked="true"');

    assert.ok(checkedIndex > whisprIndex);
  });
});

describe("SettingSoundRow — geometri ve adım", () => {
  it("şerit satırın altına, üst kenarla iniyor", () => {
    const markup = render();

    assert.ok(markup.includes(`margin-top:${pxToRem(sound.marginTop)}`));
    assert.ok(markup.includes(`padding-top:${pxToRem(sound.paddingTop)}`));
    assert.ok(markup.includes(`hsl(var(--border) / ${sound.borderTopAlpha})`));
  });

  it("22 px düğme, 26 px değer ve 28 px önizleme sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(sound.stepSize)}`));
    assert.ok(markup.includes(`width:${pxToRem(sound.valueWidth)}`));
    assert.ok(markup.includes(`height:${pxToRem(sound.previewHeight)}`));
  });

  it("seviye ondan ona geziyor", () => {
    assert.equal(SETTING_SOUND_VOLUME_STEP, 10);
  });

  it("dolgu yüzdeyle çiziliyor", () => {
    assert.ok(render({ volume: 80 }).includes("width:80%"));
  });
});

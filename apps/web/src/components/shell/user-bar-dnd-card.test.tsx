import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { UserBarDndCard } from "@/components/shell/user-bar-dnd-card";
import { getMessagesForLocale } from "@/lib/locale";
import { DND_DURATIONS } from "@/lib/presence/dnd";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";

/** Ş12 §2 — `Rahatsız Etmeyin` kartı. */

const TR = getMessagesForLocale("tr");
const NOOP = () => {};

function render(props: Partial<React.ComponentProps<typeof UserBarDndCard>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <UserBarDndCard
        active={false}
        duration={null}
        onSelectDuration={NOOP}
        onToggle={NOOP}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("UserBarDndCard — kapalı", () => {
  const markup = render();

  it("alt satır referans metnidir", () => {
    assert.ok(markup.includes("Bildirimler normal geliyor"));
    assert.ok(markup.includes("Rahatsız Etmeyin"));
  });

  it("anahtar `role=switch` + `aria-checked=false`", () => {
    assert.ok(markup.includes('role="switch"'));
    assert.ok(markup.includes('aria-checked="false"'));
  });

  it("kapalıyken süre çipleri çizilmez", () => {
    assert.ok(!markup.includes("user-menu-dnd-durations"));
    assert.ok(!markup.includes("Ben açana kadar"));
  });
});

describe("UserBarDndCard — açık", () => {
  const markup = render({ active: true, duration: "1h" });

  it("alt satır süreyi söyler", () => {
    assert.ok(markup.includes("Bildirimler durdu · 1 saat"));
    assert.ok(markup.includes('aria-checked="true"'));
  });

  it("dört çip, referansın sırasıyla", () => {
    for (const option of DND_DURATIONS) {
      assert.ok(
        markup.includes(`data-testid="user-menu-dnd-duration-${option}"`),
        `çip eksik: ${option}`,
      );
    }

    const positions = DND_DURATIONS.map((option) =>
      markup.indexOf(`data-testid="user-menu-dnd-duration-${option}"`),
    );

    assert.deepEqual(
      positions,
      [...positions].sort((left, right) => left - right),
    );
  });

  it("çip satırı sarmıyor; sığmayınca iç boşluk küçülüyor", () => {
    assert.ok(markup.includes("flex flex-nowrap"));
    assert.ok(!markup.includes("flex-wrap:wrap"));
    // Yazı boyutu sabit (11 px), esneyen şey `padding-inline`.
    assert.ok(
      markup.includes(`padding-inline:min(${SETTINGS_METRICS.userMenu.dnd.chipPaddingX / 16}rem`),
    );
  });

  it("seçili çip basılı olarak bildirilir", () => {
    const chip = markup.slice(markup.indexOf('data-testid="user-menu-dnd-duration-1h"') - 400);

    assert.ok(chip.includes('aria-pressed="true"'));
  });

  it("süresi çipe denk gelmeyen pencere genel metni gösterir", () => {
    const generic = render({ active: true, duration: null });

    assert.ok(generic.includes("Bildirimler durdu"));
    assert.ok(!generic.includes("Bildirimler durdu ·"));
  });
});

describe("UserBarDndCard — token hijyeni", () => {
  it("tasarımın beyaz topuzu dışında ham renk yok", () => {
    const markup = render({ active: true, duration: "8h" });
    const withoutKnob = markup.replaceAll("#fff", "");

    assert.doesNotMatch(withoutKnob, /#[0-9a-f]{3,8}\b/iu);
    assert.doesNotMatch(withoutKnob, /rgba?\(/u);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingToggle } from "@/components/settings/rows/setting-toggle";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — anahtar ve kilitli anahtar (tuzak #5). */

const { toggle } = SETTINGS_METRICS.controls;

function render(props: Partial<React.ComponentProps<typeof SettingToggle>> = {}) {
  return renderToStaticMarkup(
    <SettingToggle checked={false} onChange={() => {}} testId="tgl" {...props} />,
  );
}

describe("SettingToggle — anlam", () => {
  it('`role="switch"` ve `aria-checked` taşıyor', () => {
    assert.ok(render({ checked: true }).includes('role="switch"'));
    assert.ok(render({ checked: true }).includes('aria-checked="true"'));
    assert.ok(render({ checked: false }).includes('aria-checked="false"'));
  });

  it("gerçek `<button>` — `Space` ve `Enter` tarayıcıdan geliyor", () => {
    assert.ok(render().includes('type="button"'));
  });

  it("etiketi satırdan alıyor", () => {
    const markup = render({ describedById: "d1", labelledById: "l1" });

    assert.ok(markup.includes('aria-labelledby="l1"'));
    assert.ok(markup.includes('aria-describedby="d1"'));
  });
});

describe("SettingToggle — geometri", () => {
  it("38×22 ve 16 px topuz sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(toggle.width)}`));
    assert.ok(markup.includes(`height:${pxToRem(toggle.height)}`));
    assert.ok(markup.includes(`width:${pxToRem(toggle.knob)}`));
  });

  it("topuz açıkken sağa, kapalıyken sola oturuyor", () => {
    assert.ok(render({ checked: true }).includes(`left:${pxToRem(toggle.knobOnLeft)}`));
    assert.ok(render({ checked: false }).includes(`left:${pxToRem(toggle.knobInset)}`));
  });

  it("açık zemin birincil, kapalı zemin üçüncül yüzey", () => {
    assert.ok(render({ checked: true }).includes("bg-[hsl(var(--primary))]"));
    assert.ok(render({ checked: false }).includes("bg-[hsl(var(--surface-tertiary))]"));
  });
});

describe("SettingToggle — kilitli", () => {
  it("her zaman açık görünüyor ve `aria-disabled` taşıyor", () => {
    const markup = render({ checked: false, locked: true });

    assert.ok(markup.includes('aria-checked="true"'));
    assert.ok(markup.includes('aria-disabled="true"'));
    assert.ok(markup.includes("cursor-not-allowed"));
    assert.ok(markup.includes(`opacity:${toggle.lockedOpacity}`));
  });

  it("`disabled` niteliği **kullanılmıyor** — açıklama duyulabilir kalmalı", () => {
    const markup = render({ locked: true });

    assert.ok(!markup.includes('disabled=""'));
    assert.ok(markup.includes('data-locked="true"'));
  });

  it("kilitli veya kullanılamazken tıklama `onChange`'e ulaşmıyor", () => {
    let changes = 0;
    const onChange = () => {
      changes += 1;
    };

    const locked = SettingToggle({ checked: false, locked: true, onChange });
    const disabled = SettingToggle({ checked: false, disabled: true, onChange });

    locked.props.onClick();
    disabled.props.onClick();
    assert.equal(changes, 0);

    const enabled = SettingToggle({ checked: false, onChange });
    enabled.props.onClick();
    assert.equal(changes, 1);
  });

  it("açıklamaya bağlanıyor", () => {
    assert.ok(render({ describedById: "why", locked: true }).includes('aria-describedby="why"'));
  });
});

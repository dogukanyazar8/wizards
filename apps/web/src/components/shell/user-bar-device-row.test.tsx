import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { UserBarDeviceRow } from "@/components/shell/user-bar-device-row";
import type { AudioDeviceOption } from "@/hooks/use-audio-devices";
import { getMessagesForLocale } from "@/lib/locale";

/** Ş12 §3 — cihaz satırı. */

const TR = getMessagesForLocale("tr");
const NOOP = () => {};

const INPUT_DEVICES: AudioDeviceOption[] = [
  { deviceId: "default", groupId: "g0", kind: "audioinput", label: "Varsayılan - Yeti Nano" },
  { deviceId: "mic-1", groupId: "g1", kind: "audioinput", label: "MacBook Pro Mikrofonu" },
  { deviceId: "mic-2", groupId: "g2", kind: "audioinput", label: "AirPods Pro" },
];

function render(props: Partial<React.ComponentProps<typeof UserBarDeviceRow>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <UserBarDeviceRow
        devices={INPUT_DEVICES}
        kind="input"
        onSelect={NOOP}
        onToggle={NOOP}
        open={false}
        selectedDeviceId="mic-1"
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("UserBarDeviceRow — kapalı", () => {
  const markup = render();

  it("etiket ve seçili cihaz adı satırda", () => {
    assert.ok(markup.includes("Giriş cihazı"));
    assert.ok(markup.includes("MacBook Pro Mikrofonu"));
  });

  it("liste kapalıyken çizilmez ve `aria-expanded=false`", () => {
    assert.ok(markup.includes('aria-expanded="false"'));
    assert.ok(!markup.includes('role="listbox"'));
  });
});

describe("UserBarDeviceRow — açık", () => {
  const markup = render({ open: true });

  it("liste satırın altında, `role=listbox` + `option`", () => {
    assert.ok(markup.includes('role="listbox"'));
    assert.ok(markup.includes('role="option"'));
    assert.ok(markup.includes('data-testid="user-menu-device-input-list"'));
  });

  it("cihaz adları `enumerateDevices()` sonucundan gelir", () => {
    assert.ok(markup.includes("AirPods Pro"));
    // `default` sözde cihazı ses ayarlarıyla aynı sözlükten adlandırılır.
    assert.ok(!markup.includes("Varsayılan - Yeti Nano"));
  });

  it("seçili cihazda tik var", () => {
    const options = markup.split("<button").filter((chunk) => chunk.includes('role="option"'));
    const marked = options.filter((chunk) => chunk.includes('aria-selected="true"'));

    assert.equal(options.length, 3);
    assert.equal(marked.length, 1);
    assert.ok(marked[0]?.includes("<svg"));
    assert.ok(marked[0]?.includes("MacBook Pro Mikrofonu"));
  });

  it("çıkış satırı kendi metnini kullanır", () => {
    const output = render({ kind: "output", open: true, devices: [], selectedDeviceId: "default" });

    assert.ok(output.includes("Çıkış cihazı"));
    assert.ok(output.includes('data-testid="user-menu-device-output"'));
  });
});

describe("UserBarDeviceRow — desteklenmeyen eksen", () => {
  it("satır çizilir ama açılmaz; nedenini kendi değerinde söyler", () => {
    const markup = render({
      devices: [],
      disabled: true,
      disabledValue: "Bu tarayıcı hoparlörü doğrudan değiştiremiyor.",
      kind: "output",
      open: true,
      selectedDeviceId: "default",
    });

    assert.ok(markup.includes('data-testid="user-menu-device-output"'));
    assert.ok(markup.includes("disabled"));
    assert.ok(markup.includes("Bu tarayıcı hoparlörü doğrudan değiştiremiyor."));
    // `open` istense bile liste açılmaz.
    assert.ok(!markup.includes('role="listbox"'));
  });
});

describe("UserBarDeviceRow — token hijyeni", () => {
  it("ham renk yok", () => {
    const markup = render({ open: true });

    assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b/iu);
    assert.doesNotMatch(markup, /rgba?\(/u);
  });
});

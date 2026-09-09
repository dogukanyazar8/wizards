import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { SERVER_PERMISSION_GROUPS } from "@/lib/servers/permission-groups";
import { DiscoveryTagPicker } from "./discovery-tag-picker";
import { OptionChipGroup } from "./option-chip-group";
import { PermissionGroupCard } from "./permission-group-card";
import { ToggleRow } from "./toggle-row";

/**
 * Ş8'in dört paylaşılan parçası — ölçü, a11y rolü ve yetki kapısı.
 *
 * Test **ölçünün kendisini** değil, ölçünün sözlükten geldiğini doğrular: beklenen değerler
 * `SERVER_METRICS`'ten okunur. Sözlük ile referans HTML'in eşitliği `lib/servers/parity.test.ts`
 * işidir; burada aranan, bileşenin kendi sayısını yazmamış olması.
 */

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="en" initialMessages={EN_MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

describe("ToggleRow", () => {
  it("anahtarı `role=switch` + `aria-checked` ile çizer", () => {
    const html = render(
      <ToggleRow checked onChange={() => undefined} testId="row" title="GIF sending" />,
    );

    assert.match(html, /role="switch"/u);
    assert.match(html, /aria-checked="true"/u);
    assert.match(html, /data-testid="row"/u);
  });

  it("ölçüsünü sözlükten alır — 40×22 knob 16, kapalıyken knob 3'te", () => {
    const { toggleRow } = SERVER_METRICS;
    const html = render(
      <ToggleRow checked={false} onChange={() => undefined} title="GIF sending" />,
    );

    assert.ok(html.includes(`width:${pxToRem(toggleRow.switchWidth)}`));
    assert.ok(html.includes(`height:${pxToRem(toggleRow.switchHeight)}`));
    assert.ok(html.includes(`width:${pxToRem(toggleRow.switchKnobSize)}`));
    assert.ok(html.includes(`left:${pxToRem(toggleRow.switchKnobInset)}`));
  });

  it("açıkken knob'un yeri türetilir, sözlüğe ikinci kez yazılmaz", () => {
    const { toggleRow } = SERVER_METRICS;
    const expected = toggleRow.switchWidth - toggleRow.switchKnobSize - toggleRow.switchKnobInset;
    const html = render(<ToggleRow checked onChange={() => undefined} title="GIF sending" />);

    assert.ok(html.includes(`left:${pxToRem(expected)}`));
  });

  it("`compact` boyu §8.5'in 38×21 anahtarını verir", () => {
    const { toggleRow } = SERVER_METRICS;
    const html = render(
      <ToggleRow checked={false} onChange={() => undefined} size="compact" title="Speak" />,
    );

    assert.ok(html.includes(`width:${pxToRem(toggleRow.compactSwitchWidth)}`));
    assert.ok(html.includes(`height:${pxToRem(toggleRow.compactSwitchHeight)}`));
  });

  it("kapalı satır `disabled` değil `aria-disabled` olur ve nedenini yazar", () => {
    const html = render(
      <ToggleRow
        checked={false}
        disabled
        disabledReason="Make the server public first."
        onChange={() => undefined}
        title="List in Discover"
      />,
    );

    assert.match(html, /aria-disabled="true"/u);
    assert.match(html, /Make the server public first\./u);
    // `disabled` bir düğmeyi ekran okuyucunun gezinmesinden düşürürdü.
    assert.doesNotMatch(html, /<button[^>]*\sdisabled/u);
  });
});

describe("OptionChipGroup", () => {
  const options = [
    { label: "Off", value: "0" },
    { label: "5s", value: "5" },
  ] as const;

  it("radyo grubudur ve yalnız seçili çip sekme sırasındadır", () => {
    const html = render(
      <OptionChipGroup onChange={() => undefined} options={options} title="Slow mode" value="5" />,
    );

    assert.match(html, /role="radiogroup"/u);
    assert.equal(html.match(/role="radio"/gu)?.length, 2);
    assert.equal(html.match(/tabindex="-1"/gu)?.length, 1);
    assert.equal(html.match(/tabindex="0"/gu)?.length, 1);
  });

  it("başlıkta seçili değerin çipini yazar", () => {
    const html = render(
      <OptionChipGroup onChange={() => undefined} options={options} title="Slow mode" value="5" />,
    );

    // "5s" hem çipte hem başlıktaki primary çipte geçer.
    assert.equal(html.match(/>5s</gu)?.length, 2);
  });

  it("`valueLabel` başlıktaki çipi çipin etiketinden ayırır", () => {
    const html = render(
      <OptionChipGroup
        onChange={() => undefined}
        options={[{ label: "0", value: "0" }]}
        title="User limit"
        value="0"
        valueLabel="10 people (default)"
      />,
    );

    assert.match(html, />10 people \(default\)</u);
  });

  it("iki varyant iki ayrı sözlük bölümünden beslenir", () => {
    const { channelWizard, settingsSections } = SERVER_METRICS;
    const wizard = render(
      <OptionChipGroup onChange={() => undefined} options={options} title="Slow mode" value="0" />,
    );
    const settings = render(
      <OptionChipGroup
        onChange={() => undefined}
        options={options}
        title="Slow mode"
        value="0"
        variant="settings"
      />,
    );

    assert.ok(wizard.includes(`border-radius:${pxToRem(channelWizard.settingCardRadius)}`));
    assert.ok(settings.includes(`border-radius:${pxToRem(settingsSections.contentCardRadius)}`));
    assert.notEqual(channelWizard.settingCardRadius, settingsSections.contentCardRadius);
  });
});

describe("DiscoveryTagPicker", () => {
  it("tek bileşendir; iki varyant yalnız kart ve rozet boyunda ayrışır", () => {
    const { create, settings } = SERVER_METRICS.discoveryTagPicker;
    const settingsHtml = render(<DiscoveryTagPicker onChange={() => undefined} tags={[]} />);
    const createHtml = render(
      <DiscoveryTagPicker onChange={() => undefined} tags={[]} variant="create" />,
    );

    assert.ok(settingsHtml.includes(`width:${pxToRem(settings.suggestionCodeSize)}`));
    assert.ok(createHtml.includes(`width:${pxToRem(create.suggestionCodeSize)}`));
    assert.notEqual(settings.suggestionCodeSize, create.suggestionCodeSize);
  });

  it("seçili etiketleri çip olarak ve `Enter` alanını çizer", () => {
    const html = render(<DiscoveryTagPicker onChange={() => undefined} tags={["oyun"]} />);

    assert.match(html, /data-testid="server-tag-oyun"/u);
    assert.match(html, /data-testid="server-tag-input"/u);
    assert.match(html, /Type a tag, press Enter/u);
  });

  it("sayaç beşte warning'e döner", () => {
    const full = render(
      <DiscoveryTagPicker
        onChange={() => undefined}
        tags={["oyun", "turnuva", "espor", "is", "kariyer"]}
      />,
    );
    const empty = render(<DiscoveryTagPicker onChange={() => undefined} tags={[]} />);

    assert.match(full, /text-\[hsl\(var\(--warning\)\)\][^>]*>5\/5</u);
    assert.doesNotMatch(empty, /text-\[hsl\(var\(--warning\)\)\][^>]*>0\/5</u);
  });

  it("ayarlar varyantı bilgi kutusunu çizer, oluşturma varyantı çizmez", () => {
    const settingsHtml = render(<DiscoveryTagPicker onChange={() => undefined} tags={[]} />);
    const createHtml = render(
      <DiscoveryTagPicker onChange={() => undefined} tags={[]} variant="create" />,
    );

    assert.match(settingsHtml, /Once Discover listing is on/u);
    assert.doesNotMatch(createHtml, /Once Discover listing is on/u);
  });
});

describe("PermissionGroupCard", () => {
  const management = SERVER_PERMISSION_GROUPS.find((group) => group.id === "management")!;
  const general = SERVER_PERMISSION_GROUPS.find((group) => group.id === "general")!;

  it("`yalnızca sahip` satırını sahip dışına **hiç** çizmez", () => {
    const asOwner = render(
      <PermissionGroupCard
        group={management}
        isOwner
        onToggle={() => undefined}
        permissions={[]}
      />,
    );
    const asAdmin = render(
      <PermissionGroupCard
        group={management}
        isOwner={false}
        onToggle={() => undefined}
        permissions={[]}
      />,
    );

    assert.match(asOwner, /data-testid="permission-row-administrator"/u);
    assert.doesNotMatch(asAdmin, /data-testid="permission-row-administrator"/u);
    // Pasifleştirme yeterli değil: kapalı bir anahtar da yetkinin varlığını duyurur.
    assert.doesNotMatch(asAdmin, /owner only/iu);
  });

  it("başlıktaki sayacı sözleşmeden okur ve tamamı seçiliyken primary olur", () => {
    const partial = render(
      <PermissionGroupCard
        group={general}
        isOwner
        onToggle={() => undefined}
        permissions={["VIEW_CHANNEL"]}
      />,
    );
    const complete = render(
      <PermissionGroupCard
        group={general}
        isOwner
        onToggle={() => undefined}
        permissions={["VIEW_CHANNEL", "SEND_MESSAGES", "USE_GIFS", "ADD_REACTIONS"]}
      />,
    );

    // `Geçmişi oku` kapatılamaz ve her zaman sayılır: 1 seçili + 1 alwaysOn = 2/5.
    assert.match(partial, />2\/5</u);
    assert.match(complete, /text-\[hsl\(var\(--primary\)\)\][^>]*>5\/5</u);
  });

  it("kapatılamaz satırı `aria-disabled` yapar ve nedenini ekran okuyucuya verir", () => {
    const html = render(
      <PermissionGroupCard group={general} isOwner onToggle={() => undefined} permissions={[]} />,
    );

    assert.match(html, /data-testid="permission-row-readHistory"/u);
    assert.match(html, /This permission cannot be turned off/u);
  });

  it("yetki satırının anahtarı §8.5'in 38×21 boyudur", () => {
    const { toggleRow } = SERVER_METRICS;
    const html = render(
      <PermissionGroupCard group={general} isOwner onToggle={() => undefined} permissions={[]} />,
    );

    assert.ok(html.includes(`width:${pxToRem(toggleRow.compactSwitchWidth)}`));
    assert.ok(html.includes(`height:${pxToRem(toggleRow.compactSwitchHeight)}`));
  });

  it("başlık ayrı daraltma ve üç durumlu toplu seçim kontrolleri taşır", () => {
    const html = render(
      <PermissionGroupCard
        group={general}
        isOwner
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        permissions={["VIEW_CHANNEL"]}
      />,
    );

    assert.match(html, /data-testid="permission-group-general-collapse"/u);
    assert.match(html, /aria-expanded="true"/u);
    assert.match(html, /data-testid="permission-group-general-toggle-all"/u);
    assert.match(html, /role="checkbox"/u);
    assert.match(html, /aria-checked="mixed"/u);
  });

  it("salt okunur rolde toplu seçim pasiftir", () => {
    const html = render(
      <PermissionGroupCard
        group={general}
        isOwner
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        permissions={[]}
        readOnly
      />,
    );

    assert.match(html, /data-testid="permission-group-general-toggle-all"[^>]*disabled=""/u);
  });
});

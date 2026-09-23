import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";

import { MENTIONS_METRICS, SPEC_DEVIATIONS } from "./metrics";

const reference = readDesignReference("bahsedilmeler-paketi/referans/Bahsedilmeler.dc.html");

function assertReferenceContains(fragment: string): void {
  assert.ok(reference.includes(fragment), `Referans HTML parçası bulunamadı: ${fragment}`);
}

describe("mentions parity — ölçü sözlüğü ↔ referans HTML", () => {
  it("ana kolon genişliklerini aynı kaynaktan taşır", () => {
    assertReferenceContains(`width:${MENTIONS_METRICS.shell.railWidth}px;flex:none`);
    assertReferenceContains(`width:${MENTIONS_METRICS.shell.contextPanelWidth}px;flex:none`);
    assertReferenceContains(`width:${MENTIONS_METRICS.settingsModal.width}px;max-width:100%`);
  });

  it("ray, başlık ve sekme geometrisini korur", () => {
    const { feedHeader, sidebar } = MENTIONS_METRICS;

    assertReferenceContains(`font:700 ${sidebar.titleFontSize}px/1 var(--w-display)`);
    assertReferenceContains(
      `height:${sidebar.markAllHeight}px;border:0;border-radius:${sidebar.markAllRadius}px`,
    );
    assertReferenceContains(
      `height:${feedHeader.tabHeight}px;padding:0 ${feedHeader.tabPaddingX}px`,
    );
    assertReferenceContains(
      `width:${feedHeader.iconButtonSize}px;height:${feedHeader.iconButtonSize}px`,
    );
  });

  it("kart, menü ve yanıt kutusu geometrisini korur", () => {
    const { card, cardMenu, replyBox } = MENTIONS_METRICS;

    assertReferenceContains(
      `padding:${card.paddingTop}px ${card.paddingRight}px ${card.paddingBottom}px ${card.paddingLeft}px;border-radius:${card.radius}px`,
    );
    assertReferenceContains(
      `top:${card.stripeInset}px;bottom:${card.stripeInset}px;width:${card.stripeWidth}px`,
    );
    assertReferenceContains(`width:${cardMenu.width}px`);
    assertReferenceContains(
      `width:${replyBox.sendSize}px;height:${replyBox.sendSize}px;border:0;border-radius:${replyBox.sendRadius}px`,
    );
  });

  it("boş durum ve modalın temel ölçülerini korur", () => {
    const { emptyState, settingsModal } = MENTIONS_METRICS;

    assertReferenceContains(
      `width:${emptyState.iconBox}px;height:${emptyState.iconBox}px;border-radius:${emptyState.iconBoxRadius}px`,
    );
    assertReferenceContains(`text-align:center;max-width:${emptyState.bodyMaxWidth}px`);
    assertReferenceContains(
      `width:${settingsModal.switchWidth}px;height:${settingsModal.switchHeight}px;border:0;border-radius:999px`,
    );
  });

  it("kayıtlı SPEC sapmalarının HTML değerlerini gerçekten içerir", () => {
    assert.deepEqual(
      SPEC_DEVIATIONS.map(({ field, html }) => [field, html]),
      [
        ["sidebar.kindRowPillFontSize", 11],
        ["card.kindBadgeLetterSpacing", 0.02],
        ["emptyState.buttonPaddingX", 17],
      ],
    );
    assertReferenceContains("font:600 11px/1 var(--w-display);flex:none");
    assertReferenceContains("font:600 10px/1 var(--w-body);letter-spacing:.02em");
    assertReferenceContains("height:38px;padding:0 17px");
  });
});

describe("mentions parity — eski Ana Sayfa bahsetme hattı", () => {
  it("kaldırılmış servis ve sözleşmeleri geri getirmez", () => {
    const oldService = new URL("../home/mentions-service.ts", import.meta.url);
    const oldServiceTest = new URL("../home/mentions-service.test.ts", import.meta.url);
    const client = readFileSync(new URL("../home/client.ts", import.meta.url), "utf8");
    const types = readFileSync(new URL("../home/types.ts", import.meta.url), "utf8");

    assert.equal(existsSync(oldService), false);
    assert.equal(existsSync(oldServiceTest), false);
    assert.doesNotMatch(client, /fetchHomeMentions|homeQueryKeys[\s\S]*mentions:/u);
    assert.doesNotMatch(
      types,
      /MentionsResponseSchema|HomeMentionItemSchema|MentionsQuerySchema|MentionsFilterSchema/u,
    );
  });
});

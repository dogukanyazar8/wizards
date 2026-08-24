import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MentionSource } from "@wizards/types";

import { MentionCardMenu } from "@/components/mentions/mention-card-menu";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import type { MentionMenuDirection } from "@/lib/mentions/contracts";
import { MENTIONS_METRICS, pxToRem } from "@/lib/mentions/metrics";

/**
 * Ş6 — `⋯` menüsü (SPEC §5.1).
 *
 * Yön kartın kendi bilgisi değil: kart indeksini bilmez, akış bilir. Menü bu yüzden yönü bir
 * prop olarak alır ve testler onun **konuma** çevrildiğini doğrular — ilk iki kart aşağı,
 * sonrakiler yukarı açılır ve menü akışın dışına taşmaz.
 */

const { cardMenu } = MENTIONS_METRICS;

const CHANNEL_SOURCE: MentionSource = {
  channelId: "c1",
  channelName: "tasarım-kritiği",
  serverId: "s1",
  serverInitial: "W",
  serverName: "Whispr Topluluğu",
  type: "channel",
};

const DM_SOURCE: MentionSource = {
  conversationId: "conv-1",
  title: "Zeynep Arı",
  type: "dm",
};

function render(
  direction: MentionMenuDirection = "down",
  source: MentionSource = CHANNEL_SOURCE,
): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <MentionCardMenu
        direction={direction}
        labelledById="menu-button"
        onAction={() => {}}
        onClose={() => {}}
        source={source}
      />
    </LocaleProvider>,
  );
}

describe("MentionCardMenu — satırlar", () => {
  it("dört satır ve bir ayırıcı taşır", () => {
    const markup = render();

    assert.equal(markup.match(/role="menuitem"/g)?.length, 4);
    assert.equal(markup.match(/role="separator"/g)?.length, 1);
  });

  it("kanal kartında üçüncü satır kanalı sessize alır", () => {
    assert.ok(render().includes("tasarım-kritiği kanalını sessize al"));
  });

  it("DM kartında üçüncü satır sohbeti sessize alır", () => {
    const markup = render("down", DM_SOURCE);

    assert.ok(markup.includes("Bu sohbeti sessize al"));
    assert.ok(!markup.includes("kanalını sessize al"));
  });

  it("dört satırın metni de sözlükten gelir", () => {
    const markup = render();

    for (const label of [
      "Mesaj bağlantısını kopyala",
      "Sonra oku",
      "tasarım-kritiği kanalını sessize al",
      "Listeden kaldır",
    ]) {
      assert.ok(markup.includes(label), label);
    }
  });

  it("Listeden kaldır yıkıcı tonda", () => {
    assert.ok(render().includes("text-[hsl(var(--danger))]"));
  });
});

describe("MentionCardMenu — yön", () => {
  it("ilk iki kartta aşağı açılır", () => {
    const markup = render("down");

    assert.ok(markup.includes('data-direction="down"'));
    assert.ok(markup.includes(`top:${pxToRem(cardMenu.offset)}`));
    assert.ok(!markup.includes(`bottom:${pxToRem(cardMenu.offset)}`));
  });

  it("sonraki kartlarda yukarı açılır — menü akışın altından taşmaz", () => {
    const markup = render("up");

    assert.ok(markup.includes('data-direction="up"'));
    assert.ok(markup.includes(`bottom:${pxToRem(cardMenu.offset)}`));
    assert.ok(!markup.includes(`top:${pxToRem(cardMenu.offset)}`));
  });

  it("iki yönde de sağ kenara hizalanır ve kartın içinde durur", () => {
    for (const direction of ["down", "up"] as const) {
      const markup = render(direction);
      assert.ok(markup.includes("absolute right-0"), direction);
      assert.ok(markup.includes(`z-index:${cardMenu.zIndex}`), direction);
    }
  });
});

describe("MentionCardMenu — ölçü ve erişilebilirlik", () => {
  it("SPEC ölçülerini taşır: 218 genişlik, 14 yarıçap", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(cardMenu.width)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(cardMenu.radius)}`));
  });

  it("menü rolü ve tetikleyici bağı kurulu", () => {
    const markup = render();

    assert.ok(markup.includes('role="menu"'));
    assert.ok(markup.includes('aria-labelledby="menu-button"'));
  });

  it("sabit px ölçü yazmaz — hepsi rem", () => {
    const markup = render();
    const inlineStyles = markup.match(/style="[^"]*"/g)?.join(" ") ?? "";

    // `max(1px, …)` hairline'ın kendisidir; ölçeklenmemesi gereken tek değer odur.
    assert.ok(!/(?<!max\()\b\d+px\b/.test(inlineStyles.replaceAll("max(1px,", "max(HAIRLINE,")));
  });
});

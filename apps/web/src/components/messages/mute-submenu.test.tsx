import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CONVERSATION_MUTE_DURATIONS,
  MUTE_DURATION_LABEL_KEYS,
  MuteSubmenu,
  UNMUTE_REQUEST_BODY,
  muteRequestBody,
  muteRowKeyAction,
  muteSubmenuKeyAction,
  resolveMutePillDuration,
} from "@/components/messages/mute-submenu";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

const { moreMenu } = MESSAGES_METRICS;

const NOW = new Date("2026-08-27T12:00:00.000Z");

/**
 * Bir `data-testid` etrafındaki işaretleme parçası.
 *
 * Nitelik sırasına bağlı bir regex, `ContextMenuItem`in prop sırası değiştiği gün
 * sessizce yeşil kalırdı; parça almak sırayı sözleşmenin dışında tutuyor.
 */
function around(markup: string, testId: string): string {
  const index = markup.indexOf(`data-testid="${testId}"`);

  assert.notEqual(index, -1, `bulunamadı: ${testId}`);

  return markup.slice(Math.max(0, index - 300), index + 300);
}

function render(overrides: Partial<React.ComponentProps<typeof MuteSubmenu>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <MuteSubmenu
        id="mute-list"
        labelledById="mute-row"
        onClose={() => undefined}
        onSelect={() => undefined}
        open
        {...overrides}
      />
    </LocaleProvider>,
  );
}

/** `now`dan `minutes` dakika sonrası — okunaklı bir `mutedUntil`. */
function until(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60_000).toISOString();
}

describe("Sessize al alt menüsü — liste (SPEC §17)", () => {
  it("dört süreyi SPEC sırasıyla ve SPEC metniyle çizer", () => {
    const markup = render();

    assert.deepEqual(CONVERSATION_MUTE_DURATIONS, ["15m", "1h", "8h", "forever"]);

    for (const label of ["15 dakika", "1 saat", "8 saat", "Süresiz"]) {
      assert.ok(markup.includes(label), label);
    }

    assert.equal(markup.match(/role="menuitemradio"/g)?.length, 4);
  });

  it("kapalıyken hiç çizilmez", () => {
    assert.equal(render({ open: false }), "");
  });

  /**
   * Seçili satır yalnız renkle anlatılsaydı ekran okuyucu kullanıcısı hangi sürenin
   * yürürlükte olduğunu hiç öğrenemezdi.
   */
  it("yürürlükteki süre `aria-checked` taşır ve primary tinte geçer", () => {
    const markup = render({ value: "8h" });

    assert.ok(around(markup, "mute-submenu-8h").includes('aria-checked="true"'));
    assert.equal(markup.match(/aria-checked="true"/g)?.length, 1);
    assert.ok(markup.includes("hsl(var(--primary)/0.14)"));
  });

  it("girinti ve satır ölçüleri sözlükten gelir", () => {
    const markup = render();

    assert.ok(markup.includes(`${pxToRem(moreMenu.submenuIndent)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(moreMenu.submenuRowRadius)}`));
    assert.ok(markup.includes(`font-size:${pxToRem(moreMenu.submenuRowFontSize)}`));
  });

  it("her sürenin bir sözlük anahtarı var", () => {
    const dictionary = getMessagesForLocale("tr");

    for (const duration of CONVERSATION_MUTE_DURATIONS) {
      assert.ok(dictionary[MUTE_DURATION_LABEL_KEYS[duration]], duration);
    }
  });
});

describe("mute gövdesi (karar K8)", () => {
  it("süre seçimi `{ duration, muted: true }` gönderir", () => {
    assert.deepEqual(muteRequestBody("8h"), { duration: "8h", muted: true });
    assert.deepEqual(muteRequestBody("15m"), { duration: "15m", muted: true });
  });

  /** `Süresiz` de bir süre kaydıdır; gövdeden düşürülmez. */
  it('`Süresiz` `duration: "forever"` gönderir', () => {
    assert.deepEqual(muteRequestBody("forever"), { duration: "forever", muted: true });
  });

  it("pill `{ muted: false }` gönderir ve süre taşımaz", () => {
    assert.deepEqual({ ...UNMUTE_REQUEST_BODY }, { muted: false });
  });
});

describe("resolveMutePillDuration — pill ne yazar", () => {
  it("sessiz değilse pill yok", () => {
    assert.equal(resolveMutePillDuration({ muted: false, mutedUntil: null }, NOW), null);
    assert.equal(resolveMutePillDuration({ muted: false, mutedUntil: until(60) }, NOW), null);
  });

  /** Süresi dolmuş kayıt sessiz sayılmaz — `isMuteActive` tek karar noktası. */
  it("süresi dolmuşta pill yok", () => {
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(-1) }, NOW), null);
  });

  it("`mutedUntil: null` süresiz demektir", () => {
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: null }, NOW), "forever");
  });

  it("kalan süre en küçük yeterli basamağa oturur", () => {
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(480) }, NOW), "8h");
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(420) }, NOW), "8h");
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(60) }, NOW), "1h");
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(20) }, NOW), "1h");
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(15) }, NOW), "15m");
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(1) }, NOW), "15m");
  });

  /**
   * Merdivenin dışında kalan bir bitiş `Süresiz` diye okunmaz: bir bitişi var ve pill
   * bunu gizlerse kullanıcı sessizliğin kendiliğinden biteceğini hiç öğrenemez.
   */
  it("merdivenden uzun bir bitiş en uzun basamağa düşer", () => {
    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: until(5000) }, NOW), "8h");
  });

  it("`Date` ve ISO dize aynı sonucu verir", () => {
    const date = new Date(NOW.getTime() + 60 * 60_000);

    assert.equal(resolveMutePillDuration({ muted: true, mutedUntil: date }, NOW), "1h");
    assert.equal(
      resolveMutePillDuration({ muted: true, mutedUntil: date.toISOString() }, NOW),
      "1h",
    );
  });
});

describe("klavye sözleşmesi", () => {
  it("`ArrowRight` ve `Enter` alt menüyü açar", () => {
    assert.equal(muteRowKeyAction("ArrowRight"), "open");
    assert.equal(muteRowKeyAction("Enter"), "open");
    assert.equal(muteRowKeyAction("ArrowLeft"), null);
    assert.equal(muteRowKeyAction("Escape"), null);
    assert.equal(muteRowKeyAction("a"), null);
  });

  it("`ArrowLeft` ve `Esc` alt menüyü kapatır", () => {
    assert.equal(muteSubmenuKeyAction("ArrowLeft"), "close");
    assert.equal(muteSubmenuKeyAction("Escape"), "close");
    assert.equal(muteSubmenuKeyAction("ArrowRight"), null);
    assert.equal(muteSubmenuKeyAction("Enter"), null);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { ConversationToast } from "@wizards/types";

import {
  DEFAULT_CONVERSATION_TOAST_TIMERS,
  scheduleToastDismiss,
  type ConversationToastTimers,
} from "@/hooks/use-conversation-toast";
import { MESSAGES_METRICS } from "@/lib/messages/metrics";

const SOURCE = readFileSync(
  fileURLToPath(new URL("./use-conversation-toast.ts", import.meta.url)),
  "utf8",
);

/** Sahte saat: gerçek zamanlayıcı kurulmaz, yani bu süit hiçbir handle açık bırakmaz. */
function fakeTimers() {
  const scheduled: { callback: () => void; delayMs: number; handle: number }[] = [];
  const cleared: number[] = [];
  let nextHandle = 1;

  const timers: ConversationToastTimers = {
    clearTimer: (handle) => cleared.push(handle),
    startTimer: (callback, delayMs) => {
      const handle = nextHandle++;

      scheduled.push({ callback, delayMs, handle });

      return handle;
    },
  };

  return { cleared, scheduled, timers };
}

const TOAST: ConversationToast = { kind: "archived", tone: "success" };

describe("scheduleToastDismiss (karar K13)", () => {
  it("beş saniye sonra kapatır ve süre sözlükten gelir", () => {
    const { scheduled, timers } = fakeTimers();
    let dismissed = 0;

    scheduleToastDismiss(TOAST, () => (dismissed += 1), timers);

    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0]?.delayMs, MESSAGES_METRICS.toast.autoCloseMs);
    assert.equal(MESSAGES_METRICS.toast.autoCloseMs, 5000);
    assert.equal(dismissed, 0);

    scheduled[0]?.callback();

    assert.equal(dismissed, 1);
  });

  /** Sökülen bileşenin zamanlayıcısı kalırsa kapanmış bir şeridi kapatmaya çalışır. */
  it("temizleyici zamanlayıcıyı siler", () => {
    const { cleared, scheduled, timers } = fakeTimers();

    const cleanup = scheduleToastDismiss(TOAST, () => undefined, timers);

    cleanup();

    assert.deepEqual(cleared, [scheduled[0]?.handle]);
  });

  /**
   * Kayıt yokken zamanlayıcı kurmak, sonraki toast'ın ömrünü kısaltan bir sayaç
   * bırakırdı: beş saniye sonra tetiklenen `dismissToast` yeni şeridi düşürürdü.
   */
  it("kayıt yoksa zamanlayıcı kurulmaz", () => {
    const { cleared, scheduled, timers } = fakeTimers();

    scheduleToastDismiss(null, () => undefined, timers)();

    assert.equal(scheduled.length, 0);
    assert.equal(cleared.length, 0);
  });

  it("süre dışarıdan verilebilir", () => {
    const { scheduled, timers } = fakeTimers();

    scheduleToastDismiss(TOAST, () => undefined, timers, 120);

    assert.equal(scheduled[0]?.delayMs, 120);
  });
});

describe("gerçek zamanlayıcı süreci canlı tutmaz", () => {
  /**
   * Node'da askıda kalan bir `setTimeout` süreci ayakta tutar ve izole test koşusu
   * `--test-force-exit` olmadan hiç bitmez — Dalga 1'de `privacy-service.test.ts` tam
   * olarak bunu yaptı. Tarayıcıda `unref` yok ve kontrol sessizce atlanır.
   */
  it("`unref` varsa çağrılır", () => {
    let unreffed = false;
    const handle = DEFAULT_CONVERSATION_TOAST_TIMERS.startTimer(() => {
      unreffed = false;
    }, 60_000);

    const raw = handle as unknown as { unref?: () => void };

    // `unref` çağrılmışsa zamanlayıcı olay döngüsünü tutmuyordur; testin kendisi de
    // bu satırdan sonra zamanlayıcıyı temizleyerek bir iz bırakmaz.
    unreffed = typeof raw.unref === "function";
    DEFAULT_CONVERSATION_TOAST_TIMERS.clearTimer(handle);

    assert.equal(unreffed, true);
    assert.match(SOURCE, /"unref" in handle/);
  });
});

describe("useConversationToast — sözleşme", () => {
  /**
   * Bağımlılık kaydın **kendisi**: yalnız "toast var mı" olsaydı ikinci toast
   * birincinin artakalan süresini devralır ve beş saniyeden kısa yaşardı.
   */
  it("efekt toast kaydına bağlı ve temizleyici döndürüyor", () => {
    assert.match(
      SOURCE,
      /useEffect\(\(\) => scheduleToastDismiss\(toast, dismiss, timers\), \[dismiss, timers, toast\]\)/,
    );
  });

  it("reducer action'larını sarıyor, ikinci bir durum tutmuyor", () => {
    assert.match(SOURCE, /dispatch\(\{ type: "dismissToast" \}\)/);
    assert.match(SOURCE, /dispatch\(\{ toast: next, type: "showToast" \}\)/);
    assert.ok(!SOURCE.includes("useState"));
  });
});

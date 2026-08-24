import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  TOAST_ACTION_DURATION_MS,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
  ToastViewport,
  createToastEntry,
  dismissToast,
  enqueueToast,
  resolveToastDuration,
  tickToasts,
  visibleToasts,
  type ToastEntry,
} from "@/components/ui/toast";

/**
 * Ş8 — toast altyapısı (K11'in ön koşulu).
 *
 * Kuyruk kuralları saat okumadan test ediliyor: `tickToasts` süreyi bir **parametre** olarak
 * alıyor, `Date.now()` çağırmıyor. Bir geri alma penceresini gerçek saatle beklemek testi
 * yavaş değil kırılgan yapardı.
 */

function entry(id: string, overrides: Partial<ToastEntry> = {}): ToastEntry {
  return { ...createToastEntry(id, { message: `mesaj ${id}` }), ...overrides };
}

describe("toast — süre", () => {
  it("eylemsiz toast 5 saniye durur", () => {
    assert.equal(resolveToastDuration({ message: "x" }), TOAST_DEFAULT_DURATION_MS);
  });

  it("Geri al taşıyan toast 10 saniye durur — read-all penceresiyle aynı büyüklük", () => {
    assert.equal(
      resolveToastDuration({ action: { label: "Geri al", onAct: () => {} }, message: "x" }),
      TOAST_ACTION_DURATION_MS,
    );
  });

  it("çağıran açıkça süre verirse o kazanır", () => {
    assert.equal(resolveToastDuration({ durationMs: 1_500, message: "x" }), 1_500);
  });

  it("sıfır ya da negatif süre yok sayılır — süresiz toast kapanmayan toast demek", () => {
    assert.equal(resolveToastDuration({ durationMs: 0, message: "x" }), TOAST_DEFAULT_DURATION_MS);
    assert.equal(resolveToastDuration({ durationMs: -5, message: "x" }), TOAST_DEFAULT_DURATION_MS);
  });
});

describe("toast — kuyruk", () => {
  it("yeni toast sona eklenir; okunmakta olan aşağı itilmez", () => {
    const queue = enqueueToast([entry("a")], entry("b"));
    assert.deepEqual(
      queue.map((item) => item.id),
      ["a", "b"],
    );
  });

  it("aynı anda en çok üç toast görünür, fazlası kuyrukta bekler", () => {
    const queue = ["a", "b", "c", "d", "e"].map((id) => entry(id));

    assert.equal(TOAST_MAX_VISIBLE, 3);
    assert.deepEqual(
      visibleToasts(queue).map((item) => item.id),
      ["a", "b", "c"],
    );
  });

  it("kuyrukta bekleyen toast'ın sayacı işlemez — görünmeden süresini tüketemez", () => {
    const queue = ["a", "b", "c", "d"].map((id) => entry(id));
    const ticked = tickToasts(queue, 1_000);

    assert.equal(ticked[0]?.remainingMs, TOAST_DEFAULT_DURATION_MS - 1_000);
    assert.equal(ticked[3]?.remainingMs, TOAST_DEFAULT_DURATION_MS);
  });

  it("süresi dolan toast düşer ve arkadaki kuyruktan öne geçer", () => {
    const queue = ["a", "b", "c", "d"].map((id) =>
      id === "a" ? entry(id, { remainingMs: 200 }) : entry(id),
    );

    const ticked = tickToasts(queue, 250);

    assert.deepEqual(
      ticked.map((item) => item.id),
      ["b", "c", "d"],
    );
    assert.deepEqual(
      visibleToasts(ticked).map((item) => item.id),
      ["b", "c", "d"],
    );
  });

  it("duraklatılmışken hiçbir sayaç azalmaz ve dizi aynı kalır", () => {
    const queue = [entry("a")];
    const ticked = tickToasts(queue, 5_000, true);

    assert.equal(ticked, queue);
    assert.equal(ticked[0]?.remainingMs, TOAST_DEFAULT_DURATION_MS);
  });

  it("kapatma yalnız hedefi düşürür", () => {
    const queue = ["a", "b"].map((id) => entry(id));
    assert.deepEqual(
      dismissToast(queue, "a").map((item) => item.id),
      ["b"],
    );
  });
});

describe("toast — çizim", () => {
  const noop = () => {};

  function render(toasts: readonly ToastEntry[]) {
    return renderToStaticMarkup(
      <ToastViewport
        closeLabel="Kapat"
        onAct={noop}
        onDismiss={noop}
        onPauseChange={noop}
        toasts={toasts}
      />,
    );
  }

  it("varsayılan ton kibar okunur, danger kesintiye uğratır", () => {
    const markup = render([entry("a"), { ...entry("b"), tone: "danger" as const }]);

    assert.ok(markup.includes('aria-live="polite"'));
    assert.ok(markup.includes('aria-live="assertive"'));
    assert.ok(markup.includes('role="status"'));
  });

  it("dördüncü toast DOM'a hiç yazılmaz", () => {
    const markup = render(["a", "b", "c", "d"].map((id) => entry(id)));

    assert.ok(markup.includes("mesaj a"));
    assert.ok(markup.includes("mesaj c"));
    assert.ok(!markup.includes("mesaj d"));
  });

  it("Geri al düğmesi yalnız eylemli toast'ta çıkar", () => {
    const withAction = createToastEntry("a", {
      action: { label: "Geri al", onAct: noop },
      message: "okundu",
    });

    assert.ok(render([withAction]).includes("Geri al"));
    assert.ok(!render([entry("b")]).includes("Geri al"));
  });

  it("boş yığın erişilebilirlik ağacından çıkar", () => {
    assert.ok(render([]).includes('aria-hidden="true"'));
  });
});

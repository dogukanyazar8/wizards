import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DND_DURATIONS,
  DND_DURATION_MINUTES,
  buildDndPatch,
  clearDndPatch,
  isDndActive,
  isDndDuration,
  planDndWrite,
  resolveDndRestoreTo,
  resolveStatusMenuDndDuration,
  selectDndDuration,
  type DndRow,
} from "@/lib/presence/dnd";

/** Ş12 §2 — K8 süre sözleşmesi. */

const NOW = new Date("2026-08-24T20:00:00.000Z");

function row(overrides: Partial<DndRow> = {}): DndRow {
  return {
    status: "ONLINE",
    statusExpiresAt: null,
    statusFocusMinutes: null,
    statusRestoreTo: null,
    ...overrides,
  };
}

describe("DND süre çipleri", () => {
  it("dört çip, tasarımın sırasıyla", () => {
    assert.deepEqual([...DND_DURATIONS], ["30m", "1h", "8h", "until"]);
  });

  it("`Ben açana kadar` dakika taşımaz", () => {
    assert.equal(DND_DURATION_MINUTES["30m"], 30);
    assert.equal(DND_DURATION_MINUTES["1h"], 60);
    assert.equal(DND_DURATION_MINUTES["8h"], 480);
    assert.equal(DND_DURATION_MINUTES.until, null);
  });

  it("bilinmeyen değer çip değildir", () => {
    assert.ok(isDndDuration("8h"));
    assert.ok(!isDndDuration("25m"));
    assert.ok(!isDndDuration(30));
  });

  it("durum menüsünden DND seçilince varsayılan süre bir saattir", () => {
    assert.equal(resolveStatusMenuDndDuration("DND"), "1h");
    assert.equal(resolveStatusMenuDndDuration("ONLINE"), null);
    assert.equal(resolveStatusMenuDndDuration("IDLE"), null);
    assert.equal(resolveStatusMenuDndDuration("OFFLINE"), null);
  });
});

describe("buildDndPatch", () => {
  it("anahtar `status = DND` yazar", () => {
    assert.equal(buildDndPatch("30m", "ONLINE", NOW).status, "DND");
  });

  it("süre çipi `statusExpiresAt` kurar", () => {
    assert.equal(buildDndPatch("30m", "ONLINE", NOW).statusExpiresAt, "2026-08-24T20:30:00.000Z");
    assert.equal(buildDndPatch("1h", "ONLINE", NOW).statusExpiresAt, "2026-08-24T21:00:00.000Z");
    assert.equal(buildDndPatch("8h", "ONLINE", NOW).statusExpiresAt, "2026-08-25T04:00:00.000Z");
  });

  it("`Ben açana kadar` → `null`", () => {
    const patch = buildDndPatch("until", "IDLE", NOW);

    assert.equal(patch.statusExpiresAt, null);
    assert.equal(patch.statusFocusMinutes, null);
  });

  it("`statusRestoreTo` DND açılmadan önceki durumdur", () => {
    assert.equal(buildDndPatch("1h", "IDLE", NOW).statusRestoreTo, "IDLE");
    assert.equal(buildDndPatch("1h", "INVISIBLE", NOW).statusRestoreTo, "INVISIBLE");
  });

  it("DND açıkken süre değiştirmek `statusRestoreTo`'yu **ezmez**", () => {
    const live = row({
      status: "DND",
      statusExpiresAt: new Date("2026-08-24T20:30:00.000Z"),
      statusFocusMinutes: 30,
      statusRestoreTo: "IDLE",
    });

    assert.equal(buildDndPatch("8h", live, NOW).statusRestoreTo, "IDLE");
  });

  it("süresiz DND açıkken de ezmez — ölçüt `status`, bitiş anı değil", () => {
    const live = row({ status: "DND", statusRestoreTo: "INVISIBLE" });

    assert.equal(buildDndPatch("1h", live, NOW).statusRestoreTo, "INVISIBLE");
  });

  it("hedef asla `DND` olmaz", () => {
    assert.equal(buildDndPatch("1h", "DND", NOW).statusRestoreTo, "ONLINE");
    assert.equal(
      buildDndPatch("1h", row({ status: "DND", statusRestoreTo: "DND" }), NOW).statusRestoreTo,
      "ONLINE",
    );
  });
});

describe("clearDndPatch", () => {
  it("pencereyi kapatır ve hedefe döner", () => {
    assert.deepEqual(clearDndPatch("IDLE"), { status: "IDLE", statusExpiresAt: null });
  });

  it("hedef `DND` ise çevrimiçiye düşer", () => {
    assert.deepEqual(clearDndPatch("DND"), { status: "ONLINE", statusExpiresAt: null });
  });
});

describe("isDndActive / resolveDndRestoreTo", () => {
  it("süresiz DND de açıktır", () => {
    assert.ok(isDndActive(row({ status: "DND" })));
    assert.ok(!isDndActive(row({ status: "IDLE" })));
  });

  it("kapalıyken hedef şu anki durumdur", () => {
    assert.equal(resolveDndRestoreTo(row({ status: "INVISIBLE" })), "INVISIBLE");
  });

  it("açıkken saklanan hedef korunur, yoksa çevrimiçi", () => {
    assert.equal(
      resolveDndRestoreTo(row({ status: "DND", statusRestoreTo: "OFFLINE" })),
      "OFFLINE",
    );
    assert.equal(resolveDndRestoreTo(row({ status: "DND", statusRestoreTo: null })), "ONLINE");
  });
});

describe("selectDndDuration", () => {
  it("kapalıyken hiçbir çip seçili değil", () => {
    assert.equal(selectDndDuration(row()), null);
  });

  it("bitiş anı yoksa `Ben açana kadar`", () => {
    assert.equal(selectDndDuration(row({ status: "DND" })), "until");
  });

  it("kayıtlı dakika çipe eşlenir", () => {
    assert.equal(
      selectDndDuration(
        row({ status: "DND", statusExpiresAt: NOW.toISOString(), statusFocusMinutes: 480 }),
      ),
      "8h",
    );
  });

  it("çipe denk gelmeyen pencere (Odak'ın 25 dakikası) hiçbirini işaretlemez", () => {
    assert.equal(
      selectDndDuration(
        row({ status: "DND", statusExpiresAt: NOW.toISOString(), statusFocusMinutes: 25 }),
      ),
      null,
    );
  });
});

describe("planDndWrite", () => {
  it("kapalıdan açmak dört kolonu birden yazar", () => {
    const plan = planDndWrite({ duration: "1h", now: NOW, row: row({ status: "IDLE" }) });

    assert.ok(plan.changed);
    assert.equal(plan.data.status, "DND");
    assert.equal(plan.data.statusFocusMinutes, 60);
    assert.equal(plan.data.statusRestoreTo, "IDLE");
    assert.equal(plan.data.statusExpiresAt?.toISOString(), "2026-08-24T21:00:00.000Z");
  });

  it("aynı çipe ikinci kez basmak pencereyi uzatmaz", () => {
    const live = row({
      status: "DND",
      statusExpiresAt: new Date("2026-08-24T20:30:00.000Z"),
      statusFocusMinutes: 30,
      statusRestoreTo: "ONLINE",
    });
    const plan = planDndWrite({ duration: "30m", now: NOW, row: live });

    assert.equal(plan.changed, false);
    assert.equal(plan.data.statusExpiresAt?.toISOString(), "2026-08-24T20:30:00.000Z");
  });

  it("süre değiştirmek bitişi taşır, hedefi korur", () => {
    const live = row({
      status: "DND",
      statusExpiresAt: new Date("2026-08-24T20:30:00.000Z"),
      statusFocusMinutes: 30,
      statusRestoreTo: "IDLE",
    });
    const plan = planDndWrite({ duration: "8h", now: NOW, row: live });

    assert.ok(plan.changed);
    assert.equal(plan.data.statusRestoreTo, "IDLE");
    assert.equal(plan.data.statusExpiresAt?.toISOString(), "2026-08-25T04:00:00.000Z");
  });

  it("kapatmak hedefe döner ve üç kolonu temizler", () => {
    const live = row({
      status: "DND",
      statusExpiresAt: new Date("2026-08-24T20:30:00.000Z"),
      statusFocusMinutes: 30,
      statusRestoreTo: "INVISIBLE",
    });
    const plan = planDndWrite({ duration: null, now: NOW, row: live });

    assert.ok(plan.changed);
    assert.deepEqual(plan.data, {
      status: "INVISIBLE",
      statusExpiresAt: null,
      statusFocusMinutes: null,
      statusRestoreTo: null,
    });
  });

  it("zaten kapalıyken kapatmak hiçbir şey yazmaz", () => {
    const plan = planDndWrite({ duration: null, now: NOW, row: row({ status: "ONLINE" }) });

    assert.equal(plan.changed, false);
  });

  it("süresizden süreliye geçmek yazma üretir", () => {
    const live = row({ status: "DND", statusRestoreTo: "ONLINE" });
    const plan = planDndWrite({ duration: "30m", now: NOW, row: live });

    assert.ok(plan.changed);
    assert.equal(plan.data.statusExpiresAt?.toISOString(), "2026-08-24T20:30:00.000Z");
  });

  it("hiçbir dalda geri sayım tutulmaz — çıktı yalnız mutlak an", () => {
    const plan = planDndWrite({ duration: "8h", now: NOW, row: row() });

    assert.ok(plan.data.statusExpiresAt instanceof Date);
    assert.equal(Object.keys(plan.data).length, 4);
  });
});

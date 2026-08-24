import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getServerAccentStyle,
  getServerInitial,
  SERVER_ACCENT_TOKENS,
  selectServerAccent,
} from "@/lib/home/server-identity";

describe("selectServerAccent", () => {
  it("is deterministic for the same server id", () => {
    const first = selectServerAccent("server-42");
    const second = selectServerAccent("server-42");

    assert.equal(first, second);
  });

  it("only ever answers with a token from the approved set", () => {
    for (let index = 0; index < 500; index += 1) {
      assert.ok(SERVER_ACCENT_TOKENS.includes(selectServerAccent(`server-${index}`)));
    }
  });

  it("spreads ids across every token instead of collapsing to one", () => {
    const used = new Set(
      Array.from({ length: 200 }, (_value, index) => selectServerAccent(`server-${index}`)),
    );

    assert.equal(used.size, SERVER_ACCENT_TOKENS.length);
  });

  it("answers for an empty id without throwing", () => {
    assert.ok(SERVER_ACCENT_TOKENS.includes(selectServerAccent("")));
  });

  it("does not assign the active `primary` tint to an idle server", () => {
    // Aktif sunucu ikonu dolu `--primary`; havuzda da primary olsaydı pasif bir satır aktif gibi
    // görünürdü.
    assert.ok(!SERVER_ACCENT_TOKENS.includes("primary" as never));
  });
});

describe("getServerAccentStyle", () => {
  it("builds every colour from a token, never a literal", () => {
    for (const surface of ["panel", "rail"] as const) {
      for (let index = 0; index < 40; index += 1) {
        const style = getServerAccentStyle(`server-${index}`, surface);

        assert.match(style.background, /^hsl\(var\(--[a-z-]+\)(?: \/ 0\.\d+)?\)$/);
        assert.match(style.color, /^hsl\(var\(--[a-z-]+\)\)$/);
      }
    }
  });

  it("uses the panel tint one step stronger than the rail tint", () => {
    // SPEC §2.1 ray: warning/success 0.16, danger 0.14 · §2.2 panel: 0.18 / 0.16.
    const tintedSeed = Array.from({ length: 200 }, (_value, index) => `server-${index}`).find(
      (seed) => selectServerAccent(seed) !== "tertiary",
    );

    assert.ok(tintedSeed, "expected at least one id to land on a tinted token");

    const rail = getServerAccentStyle(tintedSeed, "rail");
    const panel = getServerAccentStyle(tintedSeed, "panel");

    assert.notEqual(rail.background, panel.background);
    assert.equal(rail.color, panel.color);
  });

  it("draws the neutral tint from the surface token, not an opacity", () => {
    const neutralSeed = Array.from({ length: 200 }, (_value, index) => `server-${index}`).find(
      (seed) => selectServerAccent(seed) === "tertiary",
    );

    assert.ok(neutralSeed, "expected at least one id to land on the neutral tint");

    const style = getServerAccentStyle(neutralSeed, "rail");

    assert.equal(style.background, "hsl(var(--surface-tertiary))");
    assert.equal(style.color, "hsl(var(--text-secondary))");
  });
});

describe("getServerInitial", () => {
  it("takes the first character of the short name when there is one", () => {
    assert.equal(getServerInitial({ name: "Whispr Topluluğu", shortName: "WT" }), "W");
  });

  it("falls back to the name", () => {
    assert.equal(getServerInitial({ name: "Oyun Kulübü", shortName: null }), "O");
  });

  it("keeps a Turkish initial whole", () => {
    assert.equal(getServerInitial({ name: "İstanbul", shortName: null }), "İ");
    assert.equal(getServerInitial({ name: "Ğeyik", shortName: "  " }), "Ğ");
  });

  it("answers for an empty name without throwing", () => {
    assert.equal(getServerInitial({ name: "   ", shortName: null }), "?");
  });
});

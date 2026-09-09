import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditSource,
  collectTokenAuditFiles,
  HOME_TOKEN_AUDIT_ALLOWLIST,
  HOME_TOKEN_AUDIT_SCOPE,
  readSourceForAudit,
} from "./token-audit";

function rules(source: string): string[] {
  return auditSource(source).map((violation) => violation.rule);
}

describe("token denetimi — renk kaçakları", () => {
  it("gömülü hex rengi yakalar", () => {
    assert.deepEqual(rules('const bg = "#fbbf24";'), ["hex-color"]);
    assert.deepEqual(rules('<div className="text-[#0f172a]" />'), ["hex-color"]);
    assert.deepEqual(rules('const short = "#fff";'), ["hex-color"]);
  });

  it("rgb / rgba / oklch fonksiyonlarını yakalar", () => {
    assert.deepEqual(rules("background: rgb(124 112 255)"), ["rgb-color"]);
    assert.deepEqual(rules("background: rgba(255,255,255,.95)"), ["rgb-color"]);
    assert.deepEqual(rules("color: oklch(0.6 0.2 250)"), ["oklch-color"]);
  });

  it("değişkensiz hsl'i yakalar, token'lı hsl'e dokunmaz", () => {
    assert.deepEqual(rules("color: hsl(235 86% 65%)"), ["hsl-literal"]);
    assert.deepEqual(rules("color: hsl(var(--primary))"), []);
    assert.deepEqual(rules("border-color: hsl(var(--border) / 0.5)"), []);
    assert.deepEqual(rules("background: hsl( var(--surface-card) )"), []);
  });

  it("izin listesindeki iki istisnayı ve iki swatch'ı geçirir", () => {
    assert.deepEqual(rules('<button className="bg-amber-400 text-slate-900">Takvim</button>'), []);
    assert.deepEqual(rules('const info = "hsl(199 89% 48%)";'), []);
    assert.deepEqual(rules('const accent = "hsl(291 64% 55%)";'), []);
  });

  it("izin listesi yalnız tam eşleşmeyi kapsar", () => {
    assert.deepEqual(rules('<div className="bg-amber-500" />'), ["tailwind-palette-color"]);
    assert.deepEqual(rules('<div className="text-slate-800" />'), ["tailwind-palette-color"]);
    assert.deepEqual(rules('const near = "hsl(199 89% 49%)";'), ["hsl-literal"]);
  });
});

describe("token denetimi — gömülü font adı", () => {
  it("onaylı ailelerin adının bileşene yazılmasını yakalar", () => {
    assert.deepEqual(rules('fontFamily: "Outfit, sans-serif"'), [
      "font-family",
      "embedded-font-name",
    ]);
    assert.deepEqual(rules('const stack = "Figtree";'), ["embedded-font-name"]);
  });

  it("değişkensiz font-family bildirimini yakalar", () => {
    assert.deepEqual(rules("font-family: system-ui"), ["font-family"]);
    assert.deepEqual(rules('fontFamily: "system-ui"'), ["font-family"]);
  });

  it("token üzerinden bağlanan fontu geçirir", () => {
    assert.deepEqual(rules("font-family: var(--font-display)"), []);
    assert.deepEqual(rules("fontFamily: var(--font-sans)"), []);
    assert.deepEqual(rules('<span className="font-display">Whispr</span>'), []);
  });
});

describe("token denetimi — raporlama", () => {
  it("sapan satır ve sütunu gösterir", () => {
    const violations = auditSource(["const a = 1;", 'const b = "#ff0000";'].join("\n"));

    assert.deepEqual(violations, [{ column: 12, line: 2, rule: "hex-color", snippet: "#ff0000" }]);
  });

  it("aynı dosyadaki her sapmayı ayrı ayrı bildirir", () => {
    assert.deepEqual(rules('a("#ff0000"); b("rgb(1 2 3)");'), ["hex-color", "rgb-color"]);
  });
});

describe("token denetimi — paket yüzeyleri", () => {
  it("kapsam §2'de sayılan yüzeylerle birebir aynıdır", () => {
    assert.deepEqual(
      [...HOME_TOKEN_AUDIT_SCOPE],
      [
        "app/(main)/events",
        "app/(main)/home",
        "app/(main)/mentions",
        "components/command",
        "components/home",
        "components/shell/app-nav-panel.tsx",
      ],
    );
  });

  it("izin listesi dokuz maddeden ibarettir", () => {
    assert.deepEqual(
      [...HOME_TOKEN_AUDIT_ALLOWLIST],
      [
        // İmleç SVG'lerinin renkleri: bir `data:` URI'sinin içinde `var()`
        // çözülmez, yani bu üçü token'a **taşınamaz**.
        "#312e81",
        "#6366f1",
        "#a5b4fc",
        "bg-amber-400",
        // Ş6 — tek dolaylılık: sabit `var(--font-display)`e çıkar (bkz. `token-audit.ts`).
        "fontFamily: DISPLAY_FONT",
        "hsl(199 89% 48%)",
        // Açık zeminli grup swatch'larının üzerine gelen koyu mürekkep (§7).
        "hsl(222 30% 14%)",
        "hsl(291 64% 55%)",
        "text-slate-900",
      ],
    );
  });

  it("kapsamdaki hiçbir dosya token sözleşmesinden sapmaz", () => {
    const offenders = collectTokenAuditFiles().flatMap((file) =>
      auditSource(readSourceForAudit(file)).map(
        (violation) =>
          `${file}:${violation.line}:${violation.column} ${violation.rule} — ${violation.snippet}`,
      ),
    );

    assert.deepEqual(offenders, []);
  });
});

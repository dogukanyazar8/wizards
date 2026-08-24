import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * "1a Komuta Merkezi" paketinin token sözleşmesi denetimi.
 *
 * Ekran yeni renk tanımlamaz: renkler her yerde `hsl(var(--token))`, tipografi
 * `var(--font-display)` / `var(--font-sans)` üzerinden gelir (SPEC §1). Bu modül sapmayı yakalar;
 * `token-audit.test.ts` hem kuralları hem de paketin gerçek yüzeylerini koşar.
 *
 * Kapsam bilerek dardır: uygulamanın mevcut 120 arbitrary-px dosyası ve eski yüzeyleri bu
 * sözleşmeye henüz göç etmedi, tümünü tarayan bir denetim ilk günden kırmızı kalır ve işe yaramaz.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const AUDITED_EXTENSIONS = [".ts", ".tsx"];

/** `01-faz0-sozlesme-parity-altyapisi.md` §2.1 — bu paketin yeni yüzeyleri. */
export const HOME_TOKEN_AUDIT_SCOPE = [
  "app/(main)/events",
  "app/(main)/home",
  "app/(main)/inbox",
  "app/(main)/mentions",
  "components/command",
  "components/home",
  "components/shell/app-nav-panel.tsx",
] as const;

/**
 * §2.3 — tam liste. `bg-amber-400` + `text-slate-900` Takvim butonunun onaylı istisnasıdır.
 *
 * Üç `hsl()` üçlüsü Mesajlar paketinin onaylı değişmezleridir ve `globals.css`'te karşılıkları
 * **yoktur**: `info` ve `accent` grup ikonu swatch'ları (SPEC-MESAJLAR §7) ile açık zeminli
 * swatch'ların üzerine gelen koyu mürekkep. Üçü de bir token uydurmak yerine tasarımın verdiği
 * sabit olarak duruyor; dördüncüsü eklenmeden önce bir token açılmalı.
 *
 * Dört onaltılık değer **imleç SVG'lerinindir** (`image-lightbox.tsx`). Bir `data:` URI'sinin
 * içindeki SVG'nin CSS bağlamı yoktur: `var(--primary)` orada çözülmez, ham metin olarak kalır
 * ve tarayıcı imleci hiç çizmez. Yani bunlar "token'a taşınmamış renk" değil, **taşınamayan**
 * renk. Beşincisi eklenmeden önce imleçlerin gerçekten SVG olarak kalması gerektiği sorulmalı.
 */
export const HOME_TOKEN_AUDIT_ALLOWLIST = [
  "#312e81",
  "#6366f1",
  "#a5b4fc",
  "bg-amber-400",
  "hsl(199 89% 48%)",
  "hsl(222 30% 14%)",
  "hsl(291 64% 55%)",
  "text-slate-900",
] as const;

export type TokenAuditRule =
  | "embedded-font-name"
  | "font-family"
  | "hex-color"
  | "hsl-literal"
  | "oklch-color"
  | "rgb-color"
  | "tailwind-palette-color";

export type TokenAuditViolation = {
  /** 1 tabanlı sütun. */
  column: number;
  /** 1 tabanlı satır. */
  line: number;
  rule: TokenAuditRule;
  snippet: string;
};

const TAILWIND_COLOR_UTILITIES = [
  "accent",
  "bg",
  "border",
  "caret",
  "decoration",
  "divide",
  "fill",
  "from",
  "outline",
  "placeholder",
  "ring",
  "shadow",
  "stroke",
  "text",
  "to",
  "via",
].join("|");

const TAILWIND_PALETTES = [
  "amber",
  "blue",
  "cyan",
  "emerald",
  "fuchsia",
  "gray",
  "green",
  "indigo",
  "lime",
  "neutral",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "slate",
  "stone",
  "teal",
  "violet",
  "yellow",
  "zinc",
].join("|");

const AUDIT_RULES: readonly { pattern: RegExp; rule: TokenAuditRule }[] = [
  {
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g,
    rule: "hex-color",
  },
  { pattern: /\brgba?\(/g, rule: "rgb-color" },
  // `hsl(var(--token))` ve `hsl(var(--token) / 0.5)` sözleşmenin kendisidir; değişkensiz hsl sapmadır.
  { pattern: /\bhsla?\((?!\s*var\()/g, rule: "hsl-literal" },
  { pattern: /\boklch\(/g, rule: "oklch-color" },
  {
    pattern: new RegExp(
      `\\b(?:${TAILWIND_COLOR_UTILITIES})-(?:${TAILWIND_PALETTES})-\\d{2,3}\\b`,
      "g",
    ),
    rule: "tailwind-palette-color",
  },
  { pattern: /\b(?:Figtree|Outfit)\b/g, rule: "embedded-font-name" },
  { pattern: /\b(?:font-family|fontFamily)\s*:(?!\s*var\()/g, rule: "font-family" },
];

/**
 * İzin listesindeki metinleri aynı uzunlukta bir dolguyla maskeler; satır ve sütun numaraları
 * bozulmadan kalsın diye uzunluk korunur.
 */
function maskAllowlisted(source: string): string {
  return HOME_TOKEN_AUDIT_ALLOWLIST.reduce(
    (masked, allowed) => masked.split(allowed).join("-".repeat(allowed.length)),
    source,
  );
}

function toLineAndColumn(source: string, index: number): { column: number; line: number } {
  const before = source.slice(0, index);
  const lastBreak = before.lastIndexOf("\n");

  return {
    column: index - lastBreak,
    line: before.split("\n").length,
  };
}

/** Tek bir dosyanın kaynağını denetler. Sapmalar kaynaktaki sıraya göre döner. */
export function auditSource(source: string): TokenAuditViolation[] {
  const masked = maskAllowlisted(source);
  const violations: (TokenAuditViolation & { index: number })[] = [];

  for (const { pattern, rule } of AUDIT_RULES) {
    for (const match of masked.matchAll(pattern)) {
      const index = match.index ?? 0;

      violations.push({
        ...toLineAndColumn(masked, index),
        index,
        rule,
        snippet: match[0],
      });
    }
  }

  return violations
    .sort((left, right) => left.index - right.index)
    .map(({ index: _index, ...violation }) => violation);
}

function collectFilesFrom(absolutePath: string): string[] {
  let stats;

  try {
    stats = statSync(absolutePath);
  } catch {
    // Yüzey henüz yazılmadı (Faz 2–6). Kapsam boşken denetim yeşil geçer.
    return [];
  }

  if (stats.isFile()) {
    return AUDITED_EXTENSIONS.some((extension) => absolutePath.endsWith(extension))
      ? [absolutePath]
      : [];
  }

  return readdirSync(absolutePath).flatMap((entry) => collectFilesFrom(join(absolutePath, entry)));
}

/** Kapsamdaki mevcut dosyaların `apps/web/src` göreli yolları. */
export function collectTokenAuditFiles(): string[] {
  return HOME_TOKEN_AUDIT_SCOPE.flatMap((entry) => collectFilesFrom(join(SRC_ROOT, entry)))
    .map((absolutePath) => relative(SRC_ROOT, absolutePath).split(sep).join("/"))
    .sort((left, right) => left.localeCompare(right));
}

export function readSourceForAudit(srcRelativePath: string): string {
  return readFileSync(join(SRC_ROOT, srcRelativePath), "utf8");
}

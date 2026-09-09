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
  "app/(main)/mentions",
  "components/command",
  "components/home",
  "components/shell/app-nav-panel.tsx",
] as const;

/**
 * Ş14 (SPEC-SUNUCU §12 / PROMPT "Ortak") — sunucu ekranı paketinin yüzeyleri.
 *
 * Kapsam `lib/servers` klasörünü **bütün olarak** almaz: `discovery-presentation.ts`,
 * `server-discovery-service.ts` ve `server-public-profile-service.ts` bu paketten önce yazıldı
 * ve Keşfet'e ait. Denetim yalnız paketin çizdiği yüzeyleri ve **ölçü sözlüğünü** kapsar;
 * sözlüğün renk taşımadığını `lib/servers/parity.test.ts` ayrıca kanıtlıyor.
 *
 * `components/servers/server-profile-card.tsx` de kapsam dışıdır — `/servers/[serverId]/about`
 * rotasının dosyası (00 §1 onu ayrı tutuyor).
 */
export const SERVER_TOKEN_AUDIT_SCOPE = [
  "components/chat/server-channel-header.tsx",
  "components/servers/modals",
  "components/servers/shared",
  "components/shell/channel-item.tsx",
  "components/shell/channel-search-popover.tsx",
  "components/shell/channel-sidebar.tsx",
  "components/shell/connected-voice-strip.tsx",
  "components/shell/server-member-panel.tsx",
  "components/shell/server-menu.tsx",
  "components/shell/server-settings",
  "components/shell/workspace-modals.tsx",
  "components/voice/server",
  "lib/servers/channel-access-count.ts",
  "lib/servers/channel-pins.ts",
  "lib/servers/metrics.ts",
  "lib/servers/shell-layout.ts",
  "lib/servers/voice-presentation.ts",
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
 *
 * `fontFamily: DISPLAY_FONT` (Ş6) listedeki tek **dolaylılıktır**, istisna değil: sabit
 * `components/servers/shared/typography.ts`te yaşıyor ve `var(--font-display), sans-serif`e
 * çıkıyor. Kural değerin token'a bağlı olup olmadığına bakar; on beş dosyada aynı metni tekrar
 * yazmak ilk yazım hatasında sessizce Figtree'ye düşerdi. Sabitin gerçekten bir token'a çıktığı
 * `lib/servers/token-audit.test.ts`te ayrıca kanıtlanıyor.
 */
export const HOME_TOKEN_AUDIT_ALLOWLIST = [
  "#312e81",
  "#6366f1",
  "#a5b4fc",
  "bg-amber-400",
  "fontFamily: DISPLAY_FONT",
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
  // Tırnak isteğe bağlıdır: `fontFamily: "var(--font-display)"` de sözleşmenin kendisidir.
  // Satır içi `style` nesnesinde değer bir **dizedir**; tırnağı saymayan bir kural token'a
  // bağlanmış her satırı sapma sayardı.
  //
  // Üç tırnak karakteri `"` `'` ``` olarak yazıldı, ham hâlleriyle değil:
  // `copy-audit.ts`in yorum maskeleyicisi bir mini-lexer ve **düzenli ifade değişmezini
  // tanımıyor**; ham bir tırnak orada bir dize açar ve dosyanın geri kalanındaki yorumlar
  // maskelenmeden kalır (denetim kendi yorumlarını sapma sanardı).
  {
    pattern: /\b(?:font-family|fontFamily)\s*:(?!\s*[\u0022\u0027\u0060]?\s*var\()/gu,
    rule: "font-family",
  },
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

/**
 * Kapsamdaki mevcut dosyaların `apps/web/src` göreli yolları.
 *
 * Kapsam parametreli: kurallar tek yerde yaşar, hangi yüzeylerin denetlendiği çağırana aittir
 * (`HOME_TOKEN_AUDIT_SCOPE` · `SERVER_TOKEN_AUDIT_SCOPE`). İki kapsamı tek listede birleştirmek
 * bir paketin kırmızısını diğerinin testine yazardı.
 */
export function collectTokenAuditFiles(
  scope: readonly string[] = HOME_TOKEN_AUDIT_SCOPE,
): string[] {
  return scope
    .flatMap((entry) => collectFilesFrom(join(SRC_ROOT, entry)))
    .map((absolutePath) => relative(SRC_ROOT, absolutePath).split(sep).join("/"))
    .sort((left, right) => left.localeCompare(right));
}

export function readSourceForAudit(srcRelativePath: string): string {
  return readFileSync(join(SRC_ROOT, srcRelativePath), "utf8");
}

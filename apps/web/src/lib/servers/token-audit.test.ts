import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import {
  auditSource,
  collectTokenAuditFiles,
  readSourceForAudit,
  SERVER_TOKEN_AUDIT_SCOPE,
} from "@/lib/home/token-audit";

/**
 * Sunucu ekranı paketinin token denetimi — PROMPT "Ortak" maddesi, 00 §2.7.
 *
 * Kural tek cümle: renk **yalnız** `hsl(var(--token))` / `hsl(var(--token)/alpha)`, tipografi
 * `var(--font-display)` / `var(--font-sans)`. Yeni hex, yeni `rgb()`, yeni tema sınıfı ve
 * bileşene gömülü font adı yok.
 *
 * Kuralların kendisi `lib/home/token-audit.ts`te ve `lib/home/token-audit.test.ts`te koşuyor;
 * bu dosya yalnız **kapsamı** ve bu paketin iki kasıtlı dolaylılığını taşıyor. İkinci bir kural
 * seti yazılmadı: iki denetim ayrışırsa hangisinin doğru olduğu sorusu cevapsız kalır.
 */

/**
 * Test dosyaları kapsam dışı: içlerinde `rgb(` ya da `#rrggbb` **aranıyor** (sızıntı olmadığını
 * kanıtlamak için) ve denetim aramayı sapma sanardı.
 */
const AUDITED = collectTokenAuditFiles(SERVER_TOKEN_AUDIT_SCOPE).filter(
  (file) => !/\.test\.tsx?$/u.test(file),
);

/**
 * Yorumlar taranmaz. `typography.ts` hangi tokenın hangi aileye karşılık geldiğini yazmak
 * zorunda ("`var(--w-display)` = Outfit"); bu bir sızıntı değil, dosyanın belgesi. Denetimin
 * hedefi **değer**, prose değil — aynı gerekçe `server-screen-copy.test.ts`te de yazılı.
 */
function stripComments(source: string): string {
  // Satır sayısı korunur: aksi hâlde sapmanın bildirdiği satır numarası dosyadakiyle tutmaz.
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, (block) => "\n".repeat((block.match(/\n/gu) ?? []).length))
    .replace(/^[ \t]*\/\/.*$/gmu, "");
}

/**
 * Paketin **tek** kasıtlı dolaylılığı: `fontFamily` bir sabitten geliyor, satır içi
 * `"var(--font-display), sans-serif"` metninden değil. Sabitin gerçekten bir tokena çıktığını
 * aşağıdaki test kanıtlıyor; on beş dosyada aynı metni tekrar yazmak ilk yazım hatasında
 * sessizce Figtree'ye düşerdi (`components/servers/shared/typography.ts` dosya başı notu).
 *
 * Maskeleme uzunluğu korur, böylece satır/sütun numaraları bozulmaz.
 */
const SCOPE_ALLOWLIST = ["fontFamily: DISPLAY_FONT"] as const;

function maskScopeAllowlist(source: string): string {
  return SCOPE_ALLOWLIST.reduce(
    (masked, allowed) => masked.split(allowed).join("-".repeat(allowed.length)),
    source,
  );
}

describe("sunucu ekranı token denetimi", () => {
  it("kapsam paketin yüzeylerini ve sözlüğünü sayar", () => {
    assert.deepEqual(
      [...SERVER_TOKEN_AUDIT_SCOPE],
      [
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
      ],
    );
  });

  it("kapsam gerçekten dosya topluyor", () => {
    // Bir yol yanlış yazılırsa `collectFilesFrom` sessizce boş döner ve denetim sahte yeşil
    // verir. Eşik bugünkü sayının altında: dosya eklemek testi kırmaz, kapsamı kaybetmek kırar.
    assert.ok(AUDITED.length >= 25, `kapsam daralmış: ${AUDITED.length} dosya`);
    assert.ok(AUDITED.includes("lib/servers/metrics.ts"));
    assert.ok(AUDITED.includes("components/shell/channel-sidebar.tsx"));
    assert.ok(AUDITED.includes("components/shell/server-settings/sections/roles-section.tsx"));
    // Ş6/Ş7 yüzeyleri de kapsamda.
    assert.ok(AUDITED.includes("components/chat/server-channel-header.tsx"));
    assert.ok(AUDITED.includes("components/voice/server/server-voice-surface.tsx"));
  });

  it("tek dolaylılık gerçekten bir tokena çıkıyor", () => {
    assert.match(DISPLAY_FONT, /^var\(--font-display\)/u);
    // Takip bir ölçü, renk değil; `metrics.ts` yazı ailesi taşımadığı için burada yaşıyor.
    assert.equal(DISPLAY_TRACKING, "-0.02em");
    assert.deepEqual([...SCOPE_ALLOWLIST], ["fontFamily: DISPLAY_FONT"]);
  });

  it("hiçbir dosya token sözleşmesinden sapmaz", () => {
    const offenders = AUDITED.flatMap((file) =>
      auditSource(maskScopeAllowlist(stripComments(readSourceForAudit(file)))).map(
        (violation) =>
          `${file}:${violation.line}:${violation.column} ${violation.rule} — ${violation.snippet}`,
      ),
    );

    assert.deepEqual(offenders, []);
  });

  it("maskeleme kuralı kapatmıyor", () => {
    // Dolaylılık yalnız `DISPLAY_FONT` içindir; başka bir sabit ya da satır içi metin geçmez.
    assert.deepEqual(
      auditSource(maskScopeAllowlist('fontFamily: "Outfit, sans-serif"')).map((v) => v.rule),
      ["font-family", "embedded-font-name"],
    );
    assert.deepEqual(
      auditSource(maskScopeAllowlist("fontFamily: SOME_OTHER_FONT")).map((v) => v.rule),
      ["font-family"],
    );
    assert.deepEqual(
      auditSource(maskScopeAllowlist('const c = "#ff0000";')).map((v) => v.rule),
      ["hex-color"],
    );
  });

  it("Keşfet'in kendi dosyaları kapsama sızmaz", () => {
    // `lib/servers` klasörü bu paketten önceki dosyaları da taşıyor; kapsam klasörü değil
    // **dosyaları** sayıyor. Karışırsa bu paketin denetimi başkasının borcuyla kırmızı olur.
    for (const foreign of [
      "lib/servers/discovery-presentation.ts",
      "lib/servers/server-discovery-service.ts",
      "lib/servers/server-public-profile-service.ts",
      "components/servers/server-profile-card.tsx",
    ]) {
      assert.ok(!AUDITED.includes(foreign), `kapsam dışı dosya denetime girdi: ${foreign}`);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditCopy,
  collectCopyAuditFiles,
  HOME_COPY_AUDIT_SCOPE,
  maskComments,
} from "./copy-audit";

import { readSourceForAudit } from "./token-audit";

function lines(source: string): number[] {
  return auditCopy(source).map((violation) => violation.line);
}

describe("metin denetimi — sabit Türkçe", () => {
  it("JSX metin düğümündeki Türkçeyi yakalar", () => {
    assert.deepEqual(lines('<button type="button">Katıl</button>'), [1]);
    assert.deepEqual(lines("<span>Tümünü gör</span>"), [1]);
  });

  it("dize ve şablon değişmezindeki Türkçeyi yakalar", () => {
    assert.deepEqual(lines('const label = "Rahatsız etmeyin";'), [1]);
    assert.deepEqual(lines("const label = `${count} oda açık`;"), [1]);
    assert.deepEqual(lines('<button aria-label="Önceki ay" />'), [1]);
  });

  it("yorumlardaki Türkçeyi saymaz", () => {
    assert.deepEqual(lines("// Bu satır Türkçedir ve ekrana çıkmaz."), []);
    assert.deepEqual(lines("/* Çok satırlı\n   açıklama */"), []);
    assert.deepEqual(lines("{/* i18n: `home.live.join` — Katıl */}"), []);
  });

  it("yorum içindeki Türkçe kod satırın geri kalanını gizlemez", () => {
    // Aynı satırda hem yorum hem sapma varsa sapma yine bildirilir.
    assert.deepEqual(lines('const label = "Katıl"; // düğmenin metni'), [1]);
  });

  it("dize içindeki `//` bir yorum başlangıcı değildir", () => {
    assert.deepEqual(lines('const href = "https://example.com/çay";'), [1]);
  });

  it("t() çağrısına taşınmış metni temiz sayar", () => {
    assert.deepEqual(lines('<button>{t("home.live.join")}</button>'), []);
    assert.deepEqual(lines('label={t("common.unreadMessages", { count })}'), []);
  });

  it("satır ve sütunu bildirir", () => {
    assert.deepEqual(auditCopy(["const a = 1;", 'const b = "Boşta";'].join("\n")), [
      { column: 14, line: 2, snippet: 'const b = "Boşta";' },
    ]);
  });
});

describe("maskComments", () => {
  it("satır ve sütun numaralarını korur", () => {
    const masked = maskComments("// yorum\nconst a = 1;");

    assert.equal(masked.split("\n").length, 2);
    assert.equal(masked.split("\n")[0]?.length, "// yorum".length);
    assert.equal(masked.split("\n")[1], "const a = 1;");
  });

  it("dizeleri olduğu gibi bırakır", () => {
    assert.equal(maskComments('const a = "/* değil */";'), 'const a = "/* değil */";');
  });
});

describe("metin denetimi — paket yüzeyleri", () => {
  it("kapsam paketin metin taşıyan dosyalarını sayar", () => {
    assert.deepEqual(
      [...HOME_COPY_AUDIT_SCOPE],
      [
        "app/(main)/events",
        "app/(main)/home",
        "app/(main)/inbox",
        "app/(main)/mentions",
        "components/command",
        "components/home",
        "components/screens",
        "components/shell/app-nav-panel.tsx",
        "lib/home",
      ],
    );
  });

  it("kapsam boş değildir", () => {
    assert.ok(collectCopyAuditFiles().length > 20);
  });

  it("kapsamdaki hiçbir dosyada sabit Türkçe metin kalmadı", () => {
    const offenders = collectCopyAuditFiles().flatMap((file) =>
      auditCopy(readSourceForAudit(file)).map(
        (violation) => `${file}:${violation.line}:${violation.column} — ${violation.snippet}`,
      ),
    );

    assert.deepEqual(offenders, []);
  });
});

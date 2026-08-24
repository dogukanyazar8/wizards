import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * "1a Komuta Merkezi" paketinin metin sözleşmesi denetimi — `08-faz7` §1.5.
 *
 * Kural tek cümle: **paketin dosyalarında sabit Türkçe metin kalmaz.** Ekrana çıkan her cümle
 * `tr.ts` / `en.ts` sözlüğünden gelir; kaynakta kalan Türkçe yalnız yorumlarda durur.
 *
 * Tarayıcı `token-audit.ts` ile aynı biçimde çalışır: kapsam dar (paketin kendi yüzeyleri),
 * çıktı satır/sütun taşır ve kaynaktaki sırayı korur. Fark, aradığı şeyin bir **karakter sınıfı**
 * olması: Türkçeye özgü harflerden biri yorum dışında görünüyorsa, o metin ya bir dize
 * değişmezidir ya bir JSX metin düğümüdür — ikisi de sözlüğe taşınmalıydı.
 *
 * Yorumlar bilerek elenir; bir yüzeyin *neden* öyle yazıldığını anlatan Türkçe açıklamalar bu
 * paketin sözleşmesinin parçasıdır ve ekrana çıkmaz.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const AUDITED_EXTENSIONS = [".ts", ".tsx"];

/** Türkçeye özgü harfler; `08-faz7` §1.5'in verdiği sınıf. */
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Ekrana **çıkmayan** Türkçe parçalar.
 *
 * Denetimin kuralı "sabit Türkçe metin kalmaz" ve o kural ekrana çıkan cümleler
 * için doğru. Ama bir ayrıştırıcının **kabul ettiği** kelimeler çıktı değil,
 * girdi dilbilgisidir: `Süre: 60 dakika` yazan bir kullanıcının metnini okuyan
 * desen, o kelimeleri tanımak zorunda ve sözlüğe taşınamaz — sözlük çeviriyi
 * değiştirdiğinde eski mesajlar okunamaz hâle gelirdi.
 *
 * Liste **kapalı** ve her girdi bir alıntıdır: yaklaşık eşleşme yok, yani bu
 * kapı yeni bir sabit metni içeri almaz. Şu an yalnız `parsePollBlock`'un
 * (`@deprecated`, SPEC §5.6) birim adları var; ayrıştırıcı kaldırıldığında liste
 * de boşalmalı.
 */
export const HOME_COPY_AUDIT_ALLOWLIST = [
  "(m|min|dk|dakika|h|hr|saat|d|day|gün|gun)",
  '["d", "day", "gün", "gun"]',
  "(?:Duration|Süre|Sure)",
] as const;

/** İzin verilen parçaları aynı uzunlukta boşlukla maskeler; sütun numaraları bozulmaz. */
function maskAllowlisted(source: string): string {
  return HOME_COPY_AUDIT_ALLOWLIST.reduce(
    (masked, allowed) => masked.split(allowed).join(" ".repeat(allowed.length)),
    source,
  );
}

/** §1.5 — paketin metin taşıyan yüzeyleri. Testler kapsam dışında: fikstür metni ekrana çıkmaz. */
export const HOME_COPY_AUDIT_SCOPE = [
  "app/(main)/events",
  "app/(main)/home",
  "app/(main)/inbox",
  "app/(main)/mentions",
  "components/command",
  "components/home",
  "components/screens",
  "components/shell/app-nav-panel.tsx",
  "lib/home",
] as const;

export type CopyAuditViolation = {
  /** 1 tabanlı sütun. */
  column: number;
  /** 1 tabanlı satır. */
  line: number;
  /** Sapmanın geçtiği satırın kırpılmış hâli — hangi cümle olduğu raporda görünsün diye. */
  snippet: string;
};

type ScanState = "block-comment" | "line-comment" | "normal";

/**
 * Yorumları aynı uzunlukta boşlukla maskeler; satır ve sütun numaraları bozulmadan kalır.
 *
 * Dize ve şablon değişmezleri **maskelenmez**: aranan şey tam olarak onların içindeki metin.
 * Dizeler yine de izlenir, çünkü içlerindeki `//` bir yorum başlangıcı değildir.
 */
export function maskComments(source: string): string {
  const output: string[] = [];
  let state: ScanState = "normal";
  let quote: string | null = null;
  let index = 0;

  const keep = (value: string) => output.push(value);
  const blank = (value: string) => keep(value.replace(/[^\n]/g, " "));

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        state = "normal";
        keep(char);
      } else {
        blank(char);
      }

      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "normal";
        blank("*/");
        index += 2;
        continue;
      }

      blank(char);
      index += 1;
      continue;
    }

    if (quote !== null) {
      keep(char);

      if (char === "\\") {
        const escaped = source[index + 1];
        if (escaped !== undefined) {
          keep(escaped);
        }
        index += 2;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      keep(char);
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      state = "line-comment";
      blank("//");
      index += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      state = "block-comment";
      blank("/*");
      index += 2;
      continue;
    }

    keep(char);
    index += 1;
  }

  return output.join("");
}

/** Tek bir dosyanın kaynağını denetler. Sapmalar kaynaktaki sıraya göre döner. */
export function auditCopy(source: string): CopyAuditViolation[] {
  const masked = maskAllowlisted(maskComments(source));
  const violations: CopyAuditViolation[] = [];

  masked.split("\n").forEach((line, lineIndex) => {
    const match = line.match(TURKISH_LETTERS);

    if (match?.index === undefined) {
      return;
    }

    violations.push({
      column: match.index + 1,
      line: lineIndex + 1,
      snippet: line.trim().slice(0, 120),
    });
  });

  return violations;
}

function collectFilesFrom(absolutePath: string): string[] {
  let stats;

  try {
    stats = statSync(absolutePath);
  } catch {
    return [];
  }

  if (stats.isFile()) {
    return AUDITED_EXTENSIONS.some((extension) => absolutePath.endsWith(extension))
      ? [absolutePath]
      : [];
  }

  return readdirSync(absolutePath).flatMap((entry) => collectFilesFrom(join(absolutePath, entry)));
}

/** Kapsamdaki dosyaların `apps/web/src` göreli yolları; testler elenir. */
export function collectCopyAuditFiles(): string[] {
  return (
    HOME_COPY_AUDIT_SCOPE.flatMap((entry) => collectFilesFrom(join(SRC_ROOT, entry)))
      .map((absolutePath) => relative(SRC_ROOT, absolutePath).split(sep).join("/"))
      .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
      .filter((path) => !path.endsWith("home-test-doubles.ts"))
      // Denetçinin kendisi kapsam dışıdır: aradığı karakter sınıfını taşımak zorunda.
      .filter((path) => path !== "lib/home/copy-audit.ts")
      .sort((left, right) => left.localeCompare(right))
  );
}

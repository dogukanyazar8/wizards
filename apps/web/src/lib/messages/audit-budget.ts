import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { auditCopy } from "@/lib/home/copy-audit";
import { auditSource } from "@/lib/home/token-audit";

/**
 * Mesajlar paketinin devraldığı token/metin borcunun **büyümeyen bütçesi**.
 *
 * Paket dört eski klasörü kapsamına alıyor (`components/chat`, `components/dm`,
 * `components/friends`, `lib/messages`). Bunların bir kısmı bugün sözleşmeden sapıyor ve
 * sapmalar tek seferde kapatılamaz: `components/chat`'teki sabit metinler önce i18n sözlüğünü
 * (Ş0.4), sonra bileşen sahibini (Ş5) bekler.
 *
 * Kapsamı `skip` etiketiyle geçmek işe yaramaz — `skip` hiçbir şeyi korumaz, yalnız sorunu
 * görünmez yapar. Bunun yerine **tavan** koyuyoruz: bugünkü sapma sayısı bütçedir ve
 * `audit-budget.test.ts` sayının artmadığını her koşuda doğrular. Yeni yazılan hiçbir satır
 * borca ekleyemez; borcu azaltan her düzeltme bütçeyi de düşürmek zorundadır (test fazlalığı da
 * yakalar), Dalga 3 hepsini sıfıra indirir ve kapsam kalıcı denetime taşınır.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const AUDITED_EXTENSIONS = [".ts", ".tsx"];

/** Mesajlar paketinin denetime aldığı yüzeyler. */
export const MESSAGES_AUDIT_SCOPE = [
  "components/chat",
  "components/dm",
  "components/friends",
  "components/messages",
  "lib/messages",
] as const;

export type MessagesAuditScope = (typeof MESSAGES_AUDIT_SCOPE)[number];

export interface AuditBudgetEntry {
  /** `auditSource` sapma sayısı (renk/font kaçakları). */
  readonly token: number;
  /** `auditCopy` sapma sayısı (kaynakta kalan Türkçe). */
  readonly copy: number;
}

/**
 * 2026-08-20 ölçümü. Her satırın **hikâyesi** yorumda: bir sayının neden sıfır olmadığını
 * bilmeyen sonraki okuyucu onu ya haksız yere kabullenir ya da boşuna kovalar.
 */
export const MESSAGES_AUDIT_BUDGET: Readonly<Record<MessagesAuditScope, AuditBudgetEntry>> =
  Object.freeze({
    /**
     * **Kapandı** (Dalga 3). Onyedi token borcu vardı: `text-slate-*` sınıfları
     * token'lara geçti, `message-attachments`'ın `rgba()` gradyanı
     * `hsl(var(--backdrop)/α)` oldu ve imleç SVG'lerinin dört onaltılık değeri
     * izin listesine **gerekçesiyle** yazıldı (bir `data:` URI'sinin içinde
     * `var()` çözülmez, yani taşınamaz).
     *
     * Üç metin borcu da kapandı: kod bloğu kopyala etiketleri sözlüğe taşındı,
     * markdown anket ayrıştırıcısının birim adları ise `copy-audit` izin
     * listesine girdi — onlar çıktı değil, ayrıştırıcının kabul ettiği girdi.
     */
    "components/chat": Object.freeze({ copy: 0, token: 0 }),
    /**
     * **Kapandı** (Dalga 3). `dm-sidebar` ölü kod olduğu için silindi;
     * `dm-conversation`'ın boşta noktası ham `hsl()` yerine `--warning`
     * token'ını okuyor (ham değer kullanıcının temasıyla değişmiyordu).
     */
    "components/dm": Object.freeze({ copy: 0, token: 0 }),
    /**
     * **Kapandı** (Ş3). Sekiz token borcu vardı: `friends-view`'ün emerald/amber
     * presence paleti (6) ve iki `hsl()` değişmezi. Görünüm SPEC'e göre yeniden
     * yazılınca palet token'lara geçti; `friend-card.tsx` ise okuyanı kalmadığı
     * için silindi (Ana Sayfa'nın şeridi kendi kartını çiziyor).
     */
    "components/friends": Object.freeze({ copy: 0, token: 0 }),
    /** Paketle birlikte doğan klasör; ilk günden temiz kalır. */
    "components/messages": Object.freeze({ copy: 0, token: 0 }),
    /** Paketle birlikte doğan klasör; ilk günden temiz kalır. */
    "lib/messages": Object.freeze({ copy: 0, token: 0 }),
  });

function collectFilesFrom(absolutePath: string): string[] {
  let stats;

  try {
    stats = statSync(absolutePath);
  } catch {
    // Yüzey henüz yazılmadı. Kapsam boşken sayım sıfırdır.
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
 * Kapsamdaki dosyalar. Testler elenir: fikstür metni ekrana çıkmaz ve fikstür rengi bir tasarım
 * kararı değildir. Denetim borcunu ölçen bu modül de kendi kapsamındadır ve kendini eler —
 * aradığı karakter sınıfını taşımak zorunda.
 */
export function collectMessagesAuditFiles(scope: MessagesAuditScope): string[] {
  return collectFilesFrom(join(SRC_ROOT, scope))
    .map((absolutePath) => relative(SRC_ROOT, absolutePath).split(sep).join("/"))
    .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
    .filter((path) => path !== "lib/messages/audit-budget.ts")
    .sort((left, right) => left.localeCompare(right));
}

export interface AuditBudgetMeasurement extends AuditBudgetEntry {
  /** Sapan satırlar, `path:line:column — snippet` biçiminde; rapora doğrudan yazılır. */
  readonly offenders: readonly string[];
}

export function measureMessagesAudit(scope: MessagesAuditScope): AuditBudgetMeasurement {
  const offenders: string[] = [];
  let token = 0;
  let copy = 0;

  for (const path of collectMessagesAuditFiles(scope)) {
    const source = readFileSync(join(SRC_ROOT, path), "utf8");

    for (const violation of auditSource(source)) {
      token += 1;
      offenders.push(
        `token ${path}:${violation.line}:${violation.column} ${violation.rule} — ${violation.snippet}`,
      );
    }

    for (const violation of auditCopy(source)) {
      copy += 1;
      offenders.push(`copy ${path}:${violation.line}:${violation.column} — ${violation.snippet}`);
    }
  }

  return { copy, offenders, token };
}

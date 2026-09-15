import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Referans tasarım ağacını okuyan tek yer.
 *
 * Parite kapılarının kullandığı referanslar sürüm kontrollü test verisidir. Böylece
 * yerel tasarım klasörü bulunmayan temiz CI checkout'ları aynı sözleşmeyi doğrular.
 */

/** `apps/web/src/lib/` → depo kökü. */
const REPO_ROOT = new URL("../../../../", import.meta.url);

const DESIGN_ROOT = new URL("apps/web/test-fixtures/design/", REPO_ROOT);

/**
 * Referans tasarım ağacından bir dosyayı okur. `relativePath` ağacın kökünden itibarendir,
 * ör. `"ayarlar-paketi/referans/Ayarlar-referans.dc.html"`.
 *
 * Dosya yoksa ham `ENOENT` yerine ne aradığını söyleyen bir hata fırlatır: parity kapısının
 * kırılması ile yerel kopyanın eksik olması ayırt edilebilir kalmalı.
 */
export function readDesignReference(relativePath: string): string {
  const url = new URL(relativePath, DESIGN_ROOT);

  try {
    return readFileSync(url, "utf8");
  } catch (cause) {
    throw new Error(
      `Referans tasarım dosyası okunamadı: ${relativePath}\n` +
        `Aranan yol: ${fileURLToPath(url)}\n` +
        "Sürüm kontrollü `apps/web/test-fixtures/design/` referansını kontrol edin.",
      { cause },
    );
  }
}

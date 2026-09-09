import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Referans tasarım ağacını okuyan tek yer.
 *
 * `design_handoff/` sürüm kontrolüne girmez (`.git/info/exclude`); yerel bir varlıktır ve
 * zaman zaman yeniden düzenlenir. Parity kapıları ağacı doğrudan okurken her dosya kendi
 * göreli yolunu taşıyordu; ağaç bir kez taşınınca sekiz test dosyası birden okunamaz hâle
 * geldi. Kök artık burada tanımlı: bir sonraki düzenlemede yalnız bu dosya güncellenir.
 */

/** `apps/web/src/lib/` → depo kökü. */
const REPO_ROOT = new URL("../../../../", import.meta.url);

const DESIGN_ROOT = new URL("design_handoff/app_new/", REPO_ROOT);

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
        "`design_handoff/` ağacı sürüm kontrolünde değildir; yerel kopya eksik ya da " +
        "taşınmışsa parity kapıları koşamaz.",
      { cause },
    );
  }
}

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Tailwind arbitrary px sayacı.
 *
 * Kök font boyutu adım adım büyüyünce (SPEC-ANA-SAYFA §8) `w-[272px]` / `text-[13px]` gibi çıplak
 * px değerleri büyümez — 4K'da ekran küçük kalır. Göç faz faz yapılır; bu script her fazın
 * raporuna yazılacak "kaç px kaldı" sayısını üretir.
 *
 * Faz 0 tabanı: 1208 değer / 120 dosya (2026-08-19, `uat`).
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scannedExtensions = [".ts", ".tsx"];

/** Tailwind sınıflarını tüketen kaynak ağaçları. Var olmayan kök sessizce atlanır. */
export const ARBITRARY_PX_ROOTS = [
  "apps/desktop/src",
  "apps/mobile/src",
  "apps/web/src",
  "packages/db/src",
  "packages/types/src",
  "packages/ui/src",
];

/** `docs/prompts/whispr-ana-sayfa-1a/01-faz0-sozlesme-parity-altyapisi.md` §3. */
export const ARBITRARY_PX_BASELINE = { files: 120, values: 1208 };

/**
 * Taban bu desenle ölçüldü: köşeli parantez içinde yalnız bir px uzunluğu. `[max(1px,0.0625rem)]`
 * hairline'ı ve `[17rem]` gibi ölçeklenen birimler kapsam dışıdır — onlar zaten hedef biçim.
 */
const arbitraryPxPattern = /\[\d+(?:\.\d+)?px\]/gu;

/** Negatif değerler tabanın dışında kaldı; kaybolmasınlar diye ayrı raporlanır. */
const negativeArbitraryPxPattern = /\[-\d+(?:\.\d+)?px\]/gu;

export function countArbitraryPx(source) {
  return {
    negatives: [...source.matchAll(negativeArbitraryPxPattern)].length,
    values: [...source.matchAll(arbitraryPxPattern)].length,
  };
}

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(path);
    }

    return entry.isFile() && scannedExtensions.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });
}

function collectRootFiles(root) {
  const absoluteRoot = join(repositoryRoot, root);

  try {
    if (!statSync(absoluteRoot).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  return collectFiles(absoluteRoot);
}

export function summarizeArbitraryPx(roots = ARBITRARY_PX_ROOTS) {
  const perFile = roots
    .flatMap((root) => collectRootFiles(root))
    .map((path) => ({
      ...countArbitraryPx(readFileSync(path, "utf8")),
      file: relative(repositoryRoot, path).split(sep).join("/"),
    }))
    .filter((entry) => entry.values > 0)
    .sort((left, right) => right.values - left.values || left.file.localeCompare(right.file));

  return {
    files: perFile.length,
    negatives: perFile.reduce((sum, entry) => sum + entry.negatives, 0),
    perFile,
    values: perFile.reduce((sum, entry) => sum + entry.values, 0),
  };
}

function formatDelta(current, baseline) {
  const delta = current - baseline;

  if (delta === 0) {
    return "taban";
  }

  return delta > 0 ? `taban +${delta}` : `taban ${delta}`;
}

function runCli() {
  const summary = summarizeArbitraryPx();
  const topCount = 10;

  console.info(
    `Arbitrary px: ${summary.values} değer / ${summary.files} dosya ` +
      `(Faz 0 tabanı ${ARBITRARY_PX_BASELINE.values} / ${ARBITRARY_PX_BASELINE.files} — ` +
      `${formatDelta(summary.values, ARBITRARY_PX_BASELINE.values)}, ` +
      `${formatDelta(summary.files, ARBITRARY_PX_BASELINE.files)})`,
  );
  console.info(`Negatif arbitrary px (taban dışı): ${summary.negatives}`);

  if (summary.perFile.length === 0) {
    return;
  }

  console.info(`\nEn yoğun ${Math.min(topCount, summary.perFile.length)} dosya:`);
  for (const entry of summary.perFile.slice(0, topCount)) {
    console.info(`  ${String(entry.values).padStart(4, " ")}  ${entry.file}`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runCli();
}

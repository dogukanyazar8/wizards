import assert from "node:assert/strict";
import { brotliDecompressSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const fontsDirectory = join(appDirectory, "fonts");
const layoutSource = readFileSync(join(appDirectory, "layout.tsx"), "utf8");

/** Uygulamanın vendor'ladığı her woff2 — bu liste dosya sisteminin sözleşmesi. */
const VENDORED_FONTS = [
  "dm-sans-latin.woff2",
  "figtree-latin.woff2",
  "inter-latin.woff2",
  "open-sans-latin.woff2",
  "outfit-latin.woff2",
  "raleway-latin.woff2",
] as const;

/**
 * CSS değişkeni → font dosyası. SPEC §1: gövde Figtree, display Outfit. Giriş fontu ve mesaj
 * fontu tercihleri bu pakete dahil değil, burada da sabitlenir ki kazara kaymasınlar.
 */
const FONT_BINDINGS = {
  "--font-auth-body": "dm-sans-latin.woff2",
  "--font-display": "outfit-latin.woff2",
  "--font-message-inter": "inter-latin.woff2",
  "--font-message-open-sans": "open-sans-latin.woff2",
  "--font-message-outfit": "outfit-latin.woff2",
  "--font-message-raleway": "raleway-latin.woff2",
  "--font-sans": "figtree-latin.woff2",
} as const;

/** Türkçe — ilk beşi Latin Extended-A, yani `latin` alt kümesinde **yok**. */
const TURKISH_CODEPOINTS = {
  Ğ: 0x011e,
  İ: 0x0130,
  Ş: 0x015e,
  ğ: 0x011f,
  ı: 0x0131,
  ş: 0x015f,
  Ç: 0x00c7,
  Ö: 0x00d6,
  Ü: 0x00dc,
  ç: 0x00e7,
  ö: 0x00f6,
  ü: 0x00fc,
} as const;

// --- woff2 → cmap ------------------------------------------------------------------------------
// Alt küme edilmiş bir dosya "latin" olarak indirilmişse ğ/Ğ/ş/Ş/İ taşımaz ve Türkçe metin sessizce
// sistem fontuna düşer. Gözle fark edilmesi zor, testle yakalanması kolay.

const WOFF2_KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
] as const;

function readUIntBase128(buffer: Buffer, offset: number): { cursor: number; value: number } {
  let value = 0;
  let cursor = offset;

  for (let index = 0; index < 5; index += 1) {
    const byte = buffer.readUInt8(cursor);
    cursor += 1;
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { cursor, value };
    }
  }

  throw new Error("malformed UIntBase128");
}

/** woff2 gövdesini açar ve `cmap` tablosunu döndürür. */
function readCmapTable(fontPath: string): Buffer {
  const file = readFileSync(fontPath);
  assert.equal(file.toString("ascii", 0, 4), "wOF2", `${fontPath} is not a woff2 file`);

  const numTables = file.readUInt16BE(12);
  let cursor = 48;
  const tables: Array<{ length: number; tag: string }> = [];

  for (let index = 0; index < numTables; index += 1) {
    const flags = file.readUInt8(cursor);
    cursor += 1;

    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    let tag: string;

    if (tagIndex === 0x3f) {
      tag = file.toString("ascii", cursor, cursor + 4);
      cursor += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[tagIndex] ?? "????";
    }

    const origLength = readUIntBase128(file, cursor);
    cursor = origLength.cursor;
    let streamLength = origLength.value;

    const transformed =
      tag === "glyf" || tag === "loca" ? transformVersion === 0 : transformVersion !== 0;

    if (transformed) {
      const transformLength = readUIntBase128(file, cursor);
      cursor = transformLength.cursor;
      streamLength = transformLength.value;
    }

    tables.push({ length: streamLength, tag });
  }

  const stream = brotliDecompressSync(file.subarray(cursor));
  let tableOffset = 0;

  for (const table of tables) {
    if (table.tag === "cmap") {
      return stream.subarray(tableOffset, tableOffset + table.length);
    }

    tableOffset += table.length;
  }

  throw new Error(`${fontPath} has no cmap table`);
}

function readGlyphId(cmap: Buffer, codepoint: number): number {
  const subtableCount = cmap.readUInt16BE(2);
  const subtableOffsets: number[] = [];

  for (let index = 0; index < subtableCount; index += 1) {
    subtableOffsets.push(cmap.readUInt32BE(4 + index * 8 + 4));
  }

  for (const offset of subtableOffsets) {
    const format = cmap.readUInt16BE(offset);

    if (format === 4) {
      const segCount = cmap.readUInt16BE(offset + 6) / 2;
      const endCodes = offset + 14;
      const startCodes = endCodes + segCount * 2 + 2;
      const idDeltas = startCodes + segCount * 2;
      const idRangeOffsets = idDeltas + segCount * 2;

      for (let segment = 0; segment < segCount; segment += 1) {
        const end = cmap.readUInt16BE(endCodes + segment * 2);
        if (codepoint > end) continue;

        const start = cmap.readUInt16BE(startCodes + segment * 2);
        if (codepoint < start) break;

        const delta = cmap.readInt16BE(idDeltas + segment * 2);
        const rangeOffset = cmap.readUInt16BE(idRangeOffsets + segment * 2);

        if (rangeOffset === 0) {
          return (codepoint + delta) & 0xffff;
        }

        const glyphIndex = cmap.readUInt16BE(
          idRangeOffsets + segment * 2 + rangeOffset + (codepoint - start) * 2,
        );
        return glyphIndex === 0 ? 0 : (glyphIndex + delta) & 0xffff;
      }

      continue;
    }

    if (format === 12) {
      const groupCount = cmap.readUInt32BE(offset + 12);

      for (let group = 0; group < groupCount; group += 1) {
        const record = offset + 16 + group * 12;
        const start = cmap.readUInt32BE(record);
        const end = cmap.readUInt32BE(record + 4);

        if (codepoint >= start && codepoint <= end) {
          return cmap.readUInt32BE(record + 8) + (codepoint - start);
        }
      }
    }
  }

  return 0;
}

function missingTurkishGlyphs(filename: string): string[] {
  const cmap = readCmapTable(join(fontsDirectory, filename));
  return Object.entries(TURKISH_CODEPOINTS)
    .filter(([, codepoint]) => readGlyphId(cmap, codepoint) === 0)
    .map(([character]) => character);
}

// --- sözleşme ----------------------------------------------------------------------------------

test("root layout uses repository-local fonts so production builds do not require network", () => {
  assert.doesNotMatch(layoutSource, /next\/font\/google/u);
  assert.match(layoutSource, /next\/font\/local/u);

  for (const filename of VENDORED_FONTS) {
    assert.ok(existsSync(join(fontsDirectory, filename)), `${filename} must be vendored`);
  }
});

test("every CSS font variable is bound to the expected family file", () => {
  const bindings = new Map<string, string>();

  for (const match of layoutSource.matchAll(
    /localFont\(\{\s*src:\s*"\.\/fonts\/([a-z0-9-]+\.woff2)",\s*variable:\s*"(--[a-z-]+)"/gu,
  )) {
    const [, filename, variable] = match;
    assert.ok(filename && variable);
    bindings.set(variable, filename);
  }

  assert.deepEqual(Object.fromEntries([...bindings].sort()), FONT_BINDINGS);
});

test("body and display variables carry the SPEC typography pair", () => {
  assert.equal(FONT_BINDINGS["--font-sans"], "figtree-latin.woff2");
  assert.equal(FONT_BINDINGS["--font-display"], "outfit-latin.woff2");
  // Gövde 900'e kadar bildirilir: mevcut ekranlarda font-black / font-weight: 800 kullanan
  // bildirimler var ve dar bir aralık onları sessizce 700'e indirirdi.
  assert.match(layoutSource, /variable:\s*"--font-sans",[\s\S]{0,240}?weight:\s*"400 900"/u);
  assert.match(layoutSource, /variable:\s*"--font-display",\s*weight:\s*"400 700"/u);
});

test("the retired families are gone from the layout and from disk", () => {
  for (const filename of ["plus-jakarta-sans-latin.woff2", "space-grotesk-latin.woff2"]) {
    assert.doesNotMatch(layoutSource, new RegExp(filename.replaceAll(".", "\\."), "u"));
    assert.equal(existsSync(join(fontsDirectory, filename)), false, `${filename} must be removed`);
  }
});

test("the OFL notice covers exactly the vendored families", () => {
  const license = readFileSync(join(fontsDirectory, "OFL.txt"), "utf8");

  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/u);
  assert.match(license, /The Figtree Project Authors/u);
  assert.doesNotMatch(license, /The Plus Jakarta Sans Project Authors/u);
  assert.doesNotMatch(license, /The Space Grotesk Project Authors/u);
});

test("every vendored font draws Turkish without falling back", () => {
  for (const filename of VENDORED_FONTS) {
    assert.deepEqual(
      missingTurkishGlyphs(filename),
      [],
      `${filename} must carry Latin Extended-A; a latin-only subset drops ğĞşŞİ`,
    );
  }
});

test("the cmap reader actually detects a missing glyph", () => {
  // Aksi halde yukarıdaki test her zaman yeşil kalır. Latin alt kümesi hiçbir CJK glifi taşımaz;
  // okuyucu bozulup her kod noktasına glif uydurursa bu satır kırmızıya döner.
  for (const filename of VENDORED_FONTS) {
    const cmap = readCmapTable(join(fontsDirectory, filename));
    assert.equal(readGlyphId(cmap, 0x4e2d), 0, `${filename} cannot contain 中`);
    assert.notEqual(readGlyphId(cmap, 0x011f), 0, `${filename} must contain ğ`);
  }
});

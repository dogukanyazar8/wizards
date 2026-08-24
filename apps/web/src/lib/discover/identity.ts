import type { ServerCategory } from "@wizards/db";
import type { DiscoverCategoryKey, DiscoverServerCategoryKey } from "@wizards/types";

/**
 * Keşfet'in kimlik türetmeleri — iki harfli tile metni ve kategori dönüşümü.
 *
 * İkisi de tek yerde durur çünkü ikisi de **sessizce yanlış olabilir**: `shortName` dört
 * karaktere kadar çıkar ama tasarım iki harf çizer (Tuzak 5), ve Türkçe büyük harf dönüşümü
 * varsayılan locale ile `istanbul → ISTANBUL` üretir. Her tüketicinin kendi `slice(0, 2)`
 * yazması, altı yerde altı farklı yanlış demekti.
 */

/** Türkçe büyük harf: `i → İ`, `ı → I`. Varsayılan locale ikisini de bozar. */
function toTurkishUpper(value: string): string {
  return value.toLocaleUpperCase("tr");
}

/**
 * Baş harf üretilirken noktalama sayılmaz: "Whispr (Resmî)" ilk harfi `W`, `(` değil.
 * Rakam sayılır — "8 Bit Kulüp" tile'ı `8B` olur.
 */
const NON_INITIAL_CHARACTERS = /[^\p{L}\p{N}]+/gu;

/** Kod noktası bazında ilk karakter — `"Ç"` gibi harfleri ikiye bölmemek için `[...word]`. */
function firstCharacter(word: string): string {
  return [...word][0] ?? "";
}

/**
 * Bağlaçlar baş harf üretmez. SPEC §9 dizinindeki `Yürüyüş ve Doğa` tasarımda `YD` çizilir,
 * `YV` değil; kural o satırdan okundu ve iki dilin yaygın bağlaçlarına genişletildi.
 *
 * Eleme yalnız **ilk kelimeden sonra** ve yalnız üç ve daha fazla kelimeli adlarda çalışır:
 * `Ve Yayınları` gibi bir ad ilk harfini kaybetmez, `Sınav ve Plan` iki kelimeye düşmez.
 */
const CONNECTOR_WORDS = new Set(["ve", "ile", "veya", "ya", "and", "or", "of", "the"]);

function initialsFromName(name: string): string {
  const words = name
    .split(/\s+/u)
    .map((word) => word.replace(NON_INITIAL_CHARACTERS, ""))
    .filter((word) => word.length > 0);

  const withoutConnectors =
    words.length >= 3
      ? words.filter(
          (word, index) => index === 0 || !CONNECTOR_WORDS.has(word.toLocaleLowerCase("tr")),
        )
      : words;

  const [first, second] = withoutConnectors.length >= 2 ? withoutConnectors : words;

  if (first === undefined) {
    return "";
  }

  if (second === undefined) {
    return [...first].slice(0, 2).join("");
  }

  return `${firstCharacter(first)}${firstCharacter(second)}`;
}

/**
 * SPEC tile metni iki harftir; `shortName` dört karaktere kadar çıkabilir ve `null` olabilir.
 *
 * Sıra: `shortName` varsa onun ilk iki karakteri, yoksa addaki ilk iki kelimenin baş harfleri,
 * tek kelimede ilk iki harf. Tek karakter kalırsa (tek harfli ad, `shortName = "W"`) harf
 * tekrarlanır — şema tam iki karakter ister ve boş bir tile'dan bir tekrar daha okunaklıdır.
 */
export function toDiscoverInitials(name: string, shortName: string | null): string {
  const fromShortName = (shortName ?? "").replace(NON_INITIAL_CHARACTERS, "");
  const source = fromShortName.length > 0 ? [...fromShortName].slice(0, 2).join("") : "";
  const initials = source.length > 0 ? source : initialsFromName(name);
  const upper = toTurkishUpper(initials);

  if (upper.length >= 2) {
    return [...upper].slice(0, 2).join("");
  }

  if (upper.length === 1) {
    return `${upper}${upper}`;
  }

  // Adı da kısa adı da harf taşımayan bir sunucu (yalnız emoji, yalnız noktalama) yine bir
  // tile çizer; `?` tasarımın "bilinmiyor" karşılığıdır ve şemanın iki karakterini doldurur.
  return "??";
}

const CATEGORY_KEY_BY_SERVER_CATEGORY: Readonly<Record<ServerCategory, DiscoverServerCategoryKey>> =
  {
    CALISMA: "calisma",
    DESTEK: "destek",
    IS: "is",
    KISISEL: "kisisel",
    OYUN: "oyun",
  };

const SERVER_CATEGORY_BY_KEY: Readonly<Record<DiscoverServerCategoryKey, ServerCategory>> = {
  calisma: "CALISMA",
  destek: "DESTEK",
  is: "IS",
  kisisel: "KISISEL",
  oyun: "OYUN",
};

/**
 * `ServerCategory → CategoryKey`. `null` kategori `"all"` **değildir**, `null`'dır: `"all"`
 * kullanıcının filtreyi kapattığını, `null` sunucunun sınıflandırılmadığını söyler. İkisi tek
 * değere indirgenirse sınıflandırılmamış sunucular kategori sayaçlarına sızar (Tuzak 4).
 */
export function toCategoryKey(category: ServerCategory | null): DiscoverServerCategoryKey | null {
  return category === null ? null : CATEGORY_KEY_BY_SERVER_CATEGORY[category];
}

/** `CategoryKey → ServerCategory`. `"all"` bir kolon değeri değildir, `null` döner. */
export function toServerCategory(key: DiscoverCategoryKey): ServerCategory | null {
  return key === "all" ? null : SERVER_CATEGORY_BY_KEY[key];
}

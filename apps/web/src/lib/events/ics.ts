/**
 * Etkinlikler Ş3 §5 — tek etkinlik `.ics` (RFC 5545).
 *
 * K7: harici takvim OAuth'u bu paketin dışında; `Takvime ekle` bir dosya indirir. Google,
 * Apple ve Outlook üçü de bu dosyayı açar ve hiçbir harici servise veri gitmez.
 *
 * Saf modül: veritabanı yok, `Date.now()` yok. `now` çağıranın elinden gelir ki `DTSTAMP`
 * testte sabitlenebilsin.
 */

/** RFC 5545 §3.1: bir içerik satırı **75 oktet**i aşamaz (CRLF hariç). */
export const ICS_LINE_OCTET_LIMIT = 75;

/** Devam satırının başındaki tek boşluk da bütçeye dâhildir. */
const ICS_CONTINUATION_PREFIX = " ";

const ICS_FILE_NAME_MAX_LENGTH = 60;

export type EventIcsInput = {
  readonly description: string;
  readonly durationMinutes: number | null;
  readonly endsAt: Date | null;
  readonly id: string;
  /** `<sunucu> › <kanal>` ya da harici bağlantı başlığı. */
  readonly location: string;
  readonly now: Date;
  readonly startsAt: Date;
  readonly title: string;
  /** Uygulama içi etkinlik bağlantısı. */
  readonly url: string;
};

/**
 * RFC 5545 §3.3.11. Sıra bağlayıcı: ters bölü **önce** kaçırılır, aksi hâlde `;` için
 * üretilen ters bölü ikinci turda tekrar kaçırılır ve `\\;` çıkar.
 */
export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\n");
}

/**
 * Satır katlama **oktet** üzerinden yapılır, karakter üzerinden değil: `ı`, `ğ`, `ş` UTF-8'de
 * iki oktet tutar, yani 75 karakterlik bir Türkçe başlık 100+ oktet olabilir ve karakter
 * sayan bir katlama sınırı aşar.
 *
 * Sınır çok oktetli bir karakterin ortasına düşerse karakter **bir sonraki** satıra iner;
 * ortasından bölünen bir karakter dosyayı bozar.
 */
export function foldIcsLine(line: string): string {
  const physicalLines: string[] = [];
  let current = "";
  let currentOctets = 0;
  let limit = ICS_LINE_OCTET_LIMIT;

  // Kod noktası üzerinden yürünür (`[...line]`): vekil çifti tek karakterdir ve bölünemez.
  for (const character of line) {
    const size = Buffer.byteLength(character, "utf8");

    if (currentOctets + size > limit) {
      physicalLines.push(current);
      current = ICS_CONTINUATION_PREFIX;
      currentOctets = ICS_CONTINUATION_PREFIX.length;
      limit = ICS_LINE_OCTET_LIMIT;
    }

    current += character;
    currentOctets += size;
  }

  physicalLines.push(current);

  return physicalLines.join("\r\n");
}

/** `YYYYMMDDTHHMMSSZ`. Sunucu her zaman UTC yazar; yerel saat istemcinin işi. */
function toIcsUtcTimestamp(value: Date): string {
  return `${value.toISOString().replaceAll(/[-:]/gu, "").slice(0, 15)}Z`;
}

function resolveEndsAt(input: EventIcsInput): Date | null {
  if (input.endsAt) {
    return input.endsAt;
  }

  return input.durationMinutes === null
    ? null
    : new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
}

const ASCII_FOLDING: Readonly<Record<string, string>> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

/**
 * `Content-Disposition` başlığındaki dosya adı. Türkçe harfler ASCII'ye indirgenir: başlık
 * satırı yalnız ASCII taşıyabilir ve `filename*` kodlamasını her indirici doğru okumuyor.
 */
export function buildEventIcsFileName(title: string, eventId: string): string {
  const slug = [...title]
    .map((character) => ASCII_FOLDING[character] ?? character)
    .join("")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, ICS_FILE_NAME_MAX_LENGTH)
    .replaceAll(/-+$/gu, "");

  return `${slug.length > 0 ? slug : eventId}.ics`;
}

export function buildEventIcs(input: EventIcsInput): string {
  const endsAt = resolveEndsAt(input);
  const description = input.description.trim();

  const contentLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Whispr//Events//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.id}@whispr`,
    `DTSTAMP:${toIcsUtcTimestamp(input.now)}`,
    `DTSTART:${toIcsUtcTimestamp(input.startsAt)}`,
    ...(endsAt ? [`DTEND:${toIcsUtcTimestamp(endsAt)}`] : []),
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(description.length > 0 ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    `LOCATION:${escapeIcsText(input.location)}`,
    // `URL` bir URI değeridir, metin değil: RFC 5545 §3.3.13 kaçış uygulamaz ve `,`
    // kaçırmak bağlantıyı bozar.
    `URL:${input.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // Sondaki CRLF de sözleşmenin parçası: son satırı sonlandırmayan dosyayı bazı okuyucular
  // eksik sayıyor.
  return `${contentLines.map(foldIcsLine).join("\r\n")}\r\n`;
}

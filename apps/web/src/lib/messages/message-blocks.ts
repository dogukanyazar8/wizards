/**
 * Mesaj gövdesinin **düz metin** çıkarımı — SPEC-MESAJLAR §11.
 *
 * Bu dosya bir markdown ayrıştırıcısı **değildir** ve olmaya çalışmaz. Gövdenin
 * kendisi `react-markdown` + `remark-gfm` ile çizilmeye devam ediyor; ikinci bir
 * ayrıştırıcı yazmak iki farklı doğruluk tanımı demek olurdu — biri linki
 * tanırken diğeri tanımaz, ve fark ancak kullanıcı şikâyet edince görünür.
 *
 * Buradaki işler yalnız **özet** üretenler: sabitlenen şeridin önizlemesi, yanıt
 * alıntısı, thread panelinin başlığı ve arama kartındaki eşleşme satırı. Hepsi
 * tek satırlık, işaretlemesiz metin ister.
 */

/** Gövdeyi bloklara ayırırken tanınan tek üç tür — SPEC §11'in sözleşmesi. */
export type MessageBlock =
  | { type: "text"; value: string }
  | { type: "inlineCode"; value: string }
  | { type: "codeBlock"; language: string | null; value: string };

/**
 * Kod çiti ve satır içi kod deseninde ters tırnak `\x60` ile yazılıyor, ham
 * karakterle değil.
 *
 * Sebep denetim aracı: `copy-audit` yorumları maskelerken kaynağı karakter
 * karakter tarıyor ve bir ters tırnağı şablon değişmezinin başlangıcı sanıyor.
 * Bir regex değişmezinde **tek** sayıda ters tırnak varsa tarayıcı dosyanın geri
 * kalanını dize sanır, yorumları maskelemeyi bırakır ve Türkçe açıklamaları
 * "sözlüğe taşınmamış metin" diye bildirir. Escape ile hiç ham ters tırnak
 * kalmıyor ve sorun kaynağında bitiyor.
 */
const FENCE_PATTERN = /\x60{3}([^\n\x60]*)\n?([\s\S]*?)\x60{3}/g;
const MENTION_PATTERN = /(?:^|[^\w\x60])@([a-zA-Z0-9_]{2,32})\b/g;
const INLINE_CODE_PATTERN = /\x60([^\x60\n]+)\x60/g;

/**
 * Gövdeyi metin / satır içi kod / kod bloğu parçalarına ayırır.
 *
 * Kod parçaları ayrı tutuluyor çünkü özet üretirken içlerindeki `*` ve `_`
 * işaretleri **kaldırılmamalıdır**: `a_b_c` bir değişken adıdır, italik değil.
 */
export function toMessageBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let cursor = 0;

  const pushInline = (value: string) => {
    if (value.length === 0) {
      return;
    }

    let inlineCursor = 0;

    for (const match of value.matchAll(INLINE_CODE_PATTERN)) {
      const index = match.index ?? 0;

      if (index > inlineCursor) {
        blocks.push({ type: "text", value: value.slice(inlineCursor, index) });
      }

      blocks.push({ type: "inlineCode", value: match[1] ?? "" });
      inlineCursor = index + match[0].length;
    }

    if (inlineCursor < value.length) {
      blocks.push({ type: "text", value: value.slice(inlineCursor) });
    }
  };

  for (const match of content.matchAll(FENCE_PATTERN)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      pushInline(content.slice(cursor, index));
    }

    const language = (match[1] ?? "").trim();

    blocks.push({
      language: language.length > 0 ? language : null,
      type: "codeBlock",
      value: match[2] ?? "",
    });
    cursor = index + match[0].length;
  }

  if (cursor < content.length) {
    pushInline(content.slice(cursor));
  }

  return blocks;
}

/**
 * Yalnız metin bloklarından işaretleme kaldırılır. Sıra önemli: bağlantı
 * etiketleri URL'lerden **önce** çözülür, yoksa `[a](b)` içindeki `b` de metne
 * karışır ve özet iki kez aynı şeyi söyler.
 */
function stripMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\+\+([^+]+)\+\+/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2");
}

/**
 * Özetlerde kullanılacak tek satırlık düz metin.
 *
 * Kod blokları **içerikleriyle** değil tek bir boşlukla temsil edilir; on satırlık
 * bir kod parçasının şeride sığdırılmış ilk satırı okura hiçbir şey anlatmaz ve
 * asıl mesajı kaydırıp görünmez yapardı.
 */
export function toPlainText(content: string): string {
  return toMessageBlocks(content)
    .map((block) => {
      if (block.type === "codeBlock") {
        return " ";
      }

      return block.type === "inlineCode" ? block.value : stripMarkdown(block.value);
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * `limit` **kod noktası** uzunluğunda özet.
 *
 * `String.length` UTF-16 kod birimi sayar: bir emoji iki, bazı işaretler daha
 * fazla. Kod birimiyle kesmek hem sayıyı yanıltır hem de bir çift emojinin
 * ortasından bölüp bozuk karakter bırakır.
 *
 * Kesme noktası son boşluğa çekilir — kelimenin ortasından kesilen bir özet
 * ("yoğunlu…") okunmaz. Boşluk yoksa (tek uzun kelime) sert kesilir, çünkü
 * alternatif özetin tamamen kaybolmasıdır.
 */
export function excerpt(content: string, limit: number): string {
  const plain = toPlainText(content);
  const points = Array.from(plain);

  if (limit <= 0) {
    return "";
  }

  if (points.length <= limit) {
    return plain;
  }

  const sliced = points.slice(0, limit).join("");
  const lastSpace = sliced.lastIndexOf(" ");
  const head = lastSpace > Math.floor(limit / 2) ? sliced.slice(0, lastSpace) : sliced;

  return `${head.trimEnd()}…`;
}

/**
 * Gövde bu kullanıcıyı bahsediyor mu — SPEC §5.4'ün kenar şeridi bunun sonucudur.
 *
 * Bahsetmeler gövdede ham `@kullanıcıadı` olarak durur; sunucu mesaj başına bir
 * `mentionsMe` alanı taşımıyor ve taşıması da bir sorgu daha demek. Karşılaştırma
 * kullanıcı adı alfabesiyle sınırlı (`a-zA-Z0-9_`), o yüzden Türkçe küçültme
 * tuzağı buraya girmez; yine de kullanıcı adları büyük/küçük harf duyarsız
 * eşleşir.
 *
 * Kod blokları hariç tutulur: bir kod örneğindeki `@ada` bir bahsetme değildir ve
 * ekranın kenarına şerit çekmesi okuyucuyu boşuna çağırırdı.
 *
 * `@everyone` / `@here` **kapsam dışıdır** — sunucu bunları ayrı bir bayrakla
 * (`mentionEveryone`) taşıyor ve burada tahmin edilmez.
 */
export function mentionsUser(content: string, username: string | null | undefined): boolean {
  const target = username?.trim().toLowerCase() ?? "";

  if (target.length === 0) {
    return false;
  }

  return toMessageBlocks(content).some((block) => {
    if (block.type !== "text") {
      return false;
    }

    return Array.from(block.value.matchAll(MENTION_PATTERN)).some(
      (match) => (match[1] ?? "").toLowerCase() === target,
    );
  });
}

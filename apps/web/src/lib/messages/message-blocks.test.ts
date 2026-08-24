import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { excerpt, toMessageBlocks, toPlainText } from "./message-blocks";

const NL = "\n";
const FENCE = "```";
const TICK = "`";

describe("toMessageBlocks", () => {
  it("kod bloğunu metinden ayırır ve dilini taşır", () => {
    const blocks = toMessageBlocks("bak:" + NL + FENCE + "ts" + NL + "const a = 1;" + NL + FENCE);

    assert.deepEqual(
      blocks.map((block) => block.type),
      ["text", "codeBlock"],
    );
    assert.equal(blocks[1]?.type === "codeBlock" ? blocks[1].language : null, "ts");
  });

  it("satır içi kodu ayrı blok yapar", () => {
    const blocks = toMessageBlocks("değer " + TICK + "a_b_c" + TICK + " olacak");

    assert.deepEqual(
      blocks.map((block) => block.type),
      ["text", "inlineCode", "text"],
    );
  });
});

describe("toPlainText", () => {
  it("işaretlemeyi kaldırır", () => {
    assert.equal(toPlainText("**kalın** ve _italik_ metin"), "kalın ve italik metin");
  });

  it("bağlantıda yalnız etiketi bırakır", () => {
    assert.equal(toPlainText("[Whispr](https://whispr.app) aç"), "Whispr aç");
  });

  /**
   * `a_b_c` bir değişken adıdır. Kod bloğu ayrı tutulmasaydı alt çizgiler italik
   * sanılır ve özet değişkeni "abc" diye yazardı.
   */
  it("kod içindeki alt çizgiye dokunmaz", () => {
    assert.equal(toPlainText("değer " + TICK + "a_b_c" + TICK), "değer a_b_c");
  });

  it("kod bloğunun gövdesini özete taşımaz", () => {
    const plain = toPlainText("bak:" + NL + FENCE + "ts" + NL + "const secret = 1;" + NL + FENCE);

    assert.equal(plain, "bak:");
  });

  it("satır sonlarını tek boşluğa indirir", () => {
    assert.equal(toPlainText("bir" + NL + NL + "iki"), "bir iki");
  });

  it("alıntı ve liste işaretlerini düşürür", () => {
    assert.equal(toPlainText("> alıntı" + NL + "- madde"), "alıntı madde");
  });
});

describe("excerpt", () => {
  it("sığan metni olduğu gibi verir", () => {
    assert.equal(excerpt("kısa metin", 40), "kısa metin");
  });

  it("kelime ortasından kesmez", () => {
    assert.equal(excerpt("yoğunluğu ölçmek gerekir", 14), "yoğunluğu…");
  });

  /**
   * Emoji UTF-16'da iki kod birimidir. `String.length` ile kesilseydi bu metin
   * 6 değil 4 karakter verir ve çiftin ortasından bölünürdü.
   */
  it("emojiyi kod noktası sayar ve ortasından bölmez", () => {
    const value = excerpt("🎉🎉🎉🎉🎉🎉🎉🎉", 4);

    assert.equal(Array.from(value).length, 5);
    assert.equal(value, "🎉🎉🎉🎉…");
  });

  /** Boşluksuz tek kelimede sert kesme, alternatifi özetin tamamen kaybolması. */
  it("boşluk yoksa sert keser", () => {
    assert.equal(excerpt("aaaaaaaaaaaaaaaaaaaa", 6), "aaaaaa…");
  });

  it("limit sıfırda boş döner", () => {
    assert.equal(excerpt("herhangi bir metin", 0), "");
  });
});

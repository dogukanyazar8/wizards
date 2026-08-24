import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMatchRanges } from "./match-ranges";

function highlighted(text: string, query: string): string[] {
  const characters = Array.from(text);

  return findMatchRanges(text, query).map((range) => characters.slice(range[0], range[1]).join(""));
}

describe("tam alt dize eşleşmesi", () => {
  it("kelimenin tam geçtiği yeri bulur", () => {
    assert.deepEqual(highlighted("Kart yoğunluk ayarı", "yoğunluk"), ["yoğunluk"]);
  });

  it("büyük/küçük harfe bakmaz", () => {
    assert.deepEqual(highlighted("KART Yoğunluk", "yoğunluk"), ["Yoğunluk"]);
  });

  it("her geçişi ayrı aralık verir", () => {
    assert.deepEqual(highlighted("kart kart", "kart"), ["kart", "kart"]);
  });

  it("aralıkları artan sırada döndürür", () => {
    const ranges = findMatchRanges("bir kart iki kart", "kart");

    assert.deepEqual(ranges, [
      [4, 8],
      [13, 17],
    ]);
  });
});

describe("kod noktası aralıkları", () => {
  /**
   * `yoğunluğu` dokuz karakter, on bir bayt. Bayt aralığı vurguyu harfin
   * ortasından keserdi.
   */
  it("çok baytlı Türkçe harflerde kaymaz", () => {
    const text = "Özellikle kart yoğunluğu kısmına bakmanı istiyorum.";
    const [range] = findMatchRanges(text, "yoğunluğu");

    assert.ok(range);
    assert.deepEqual(Array.from(text).slice(range[0], range[1]).join(""), "yoğunluğu");
  });

  it("emoji taşıyan metinde de doğru diliminler", () => {
    const text = "🔥 kart yoğunluk";
    const [range] = findMatchRanges(text, "yoğunluk");

    assert.ok(range);
    assert.equal(Array.from(text).slice(range[0], range[1]).join(""), "yoğunluk");
  });
});

describe("ortak önek kuralı", () => {
  /**
   * Tasarımın kendi örneği: `yoğunluk` sorgusu `yoğunluğu` kelimesini vurgular.
   * Ünsüz yumuşaması gövdeyi değiştirdiği için ne alt dize ne önektir.
   */
  it("Türkçe ekli hâli bütün olarak vurgular", () => {
    assert.deepEqual(highlighted("Kart yoğunluğu iki kademe düştü", "yoğunluk"), ["yoğunluğu"]);
    assert.deepEqual(highlighted("Liste yoğunluğunu ayarla", "yoğunluk"), ["yoğunluğunu"]);
  });

  it("tam alt dize her uzunlukta vurgulanır", () => {
    // Kullanıcı ne yazdıysa o: kısa terim, bulunduğu yerde işaretlenir.
    assert.deepEqual(highlighted("kartlar", "kar"), ["kar"]);
  });

  it("eşiği tam tutturan kelimeyi vurgular", () => {
    // 8 harflik `yoğunluk` için eşik 6. `yoğunlaşma` ilk 6 harfi paylaşır.
    assert.deepEqual(highlighted("Renk yoğunlaşma eğrisi", "yoğunluk"), ["yoğunlaşma"]);
  });

  it("eşiğin bir altında kalanı vurgulamaz", () => {
    // `yoğunbakım` ilk 5 harfi paylaşır: `yoğun` + `b` ≠ `l`.
    assert.deepEqual(highlighted("yoğunbakım servisi", "yoğunluk"), []);
  });

  it("yeterince benzemeyen kelimeyi vurgulamaz", () => {
    assert.deepEqual(highlighted("yoğurt aldım", "yoğunluk"), []);
  });

  it("tam eşleşme varken önek kuralına düşmez", () => {
    // Aksi hâlde aynı cümlede hem tam hem yaklaşık eşleşme vurgulanır ve
    // kullanıcı hangisinin aradığı olduğunu göremez.
    assert.deepEqual(highlighted("yoğunluk ve yoğunluğu", "yoğunluk"), ["yoğunluk"]);
  });
});

describe("kenar durumlar", () => {
  it("boş sorgu ve boş metin boş döner", () => {
    assert.deepEqual(findMatchRanges("", "kart"), []);
    assert.deepEqual(findMatchRanges("kart", ""), []);
    assert.deepEqual(findMatchRanges("kart", "   "), []);
  });

  it("çok terimli sorguda hepsini arar", () => {
    assert.deepEqual(highlighted("kart yoğunluk ayarı", "kart ayarı"), ["kart", "ayarı"]);
  });

  it("aynı terimi iki kez yazmak aralığı ikilemez", () => {
    assert.deepEqual(findMatchRanges("kart", "kart kart"), [[0, 4]]);
  });

  it("çakışan aralıkları birleştirir", () => {
    // "kart" ve "karto" aynı kelimenin içinde başlar; iki ayrı <mark> iç içe
    // geçmiş etiket üretirdi.
    const ranges = findMatchRanges("kartotek", "kart karto");

    assert.equal(ranges.length, 1);
    assert.deepEqual(ranges[0], [0, 5]);
  });
});

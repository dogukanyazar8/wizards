import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterFriends, sortFriends, splitFriendsByPresence, type SortableFriend } from "./sort";

function friend(id: string, name: string, status = "ONLINE"): SortableFriend {
  return { id, name, status };
}

const EMPTY_CONTEXT = { lastInteractionAt: new Map<string, number>() };

describe("duruma göre sıralama", () => {
  it("çevrimiçi → boşta → rahatsız etmeyin → çevrimdışı", () => {
    const rows = [
      friend("a", "A", "OFFLINE"),
      friend("b", "B", "DND"),
      friend("c", "C", "ONLINE"),
      friend("d", "D", "IDLE"),
    ];

    assert.deepEqual(
      sortFriends(rows, "status", EMPTY_CONTEXT).map((row) => row.id),
      ["c", "d", "b", "a"],
    );
  });

  it("aynı durumda ada göre sıralar", () => {
    const rows = [friend("a", "Zeynep"), friend("b", "Ahmet")];

    assert.deepEqual(
      sortFriends(rows, "status", EMPTY_CONTEXT).map((row) => row.name),
      ["Ahmet", "Zeynep"],
    );
  });

  it("bilinmeyen durumu çevrimdışı sayar", () => {
    const rows = [friend("a", "A", "UYDURMA"), friend("b", "B", "ONLINE")];

    assert.deepEqual(
      sortFriends(rows, "status", EMPTY_CONTEXT).map((row) => row.id),
      ["b", "a"],
    );
  });
});

describe("ada göre sıralama", () => {
  /**
   * `Ç` Unicode'da `Z`'den sonra oturuyor; varsayılan karşılaştırma kod
   * noktasına baktığı için `Çelik` listenin sonuna düşerdi.
   */
  it("Türkçe harf sırasını kullanır", () => {
    const rows = [friend("a", "Demir"), friend("b", "Çelik"), friend("c", "Arı")];

    assert.deepEqual(
      sortFriends(rows, "name", EMPTY_CONTEXT).map((row) => row.name),
      ["Arı", "Çelik", "Demir"],
    );
  });

  it("büyük/küçük harf farkını sıraya karıştırmaz", () => {
    const rows = [friend("a", "zeynep"), friend("b", "Ahmet")];

    assert.deepEqual(
      sortFriends(rows, "name", EMPTY_CONTEXT).map((row) => row.name),
      ["Ahmet", "zeynep"],
    );
  });

  it("durumu yok sayar", () => {
    const rows = [friend("a", "Ahmet", "OFFLINE"), friend("b", "Zeynep", "ONLINE")];

    assert.deepEqual(
      sortFriends(rows, "name", EMPTY_CONTEXT).map((row) => row.name),
      ["Ahmet", "Zeynep"],
    );
  });
});

describe("son etkileşime göre sıralama", () => {
  it("en son konuşulan başa gelir", () => {
    const rows = [friend("a", "A"), friend("b", "B"), friend("c", "C")];
    const context = {
      lastInteractionAt: new Map([
        ["a", 100],
        ["b", 300],
        ["c", 200],
      ]),
    };

    assert.deepEqual(
      sortFriends(rows, "recent", context).map((row) => row.id),
      ["b", "c", "a"],
    );
  });

  it("hiç konuşulmamışlar sona düşer ve ada göre sıralanır", () => {
    const rows = [friend("a", "Zeynep"), friend("b", "Ahmet"), friend("c", "Can")];
    const context = { lastInteractionAt: new Map([["c", 500]]) };

    assert.deepEqual(
      sortFriends(rows, "recent", context).map((row) => row.name),
      ["Can", "Ahmet", "Zeynep"],
    );
  });
});

describe("sıralama kararlılığı", () => {
  it("aynı girdide iki kez aynı sırayı verir", () => {
    // Kararsız bir sıra, aynı listeyi iki kez çizen render'da satırların yer
    // değiştirmesi demek.
    const rows = [friend("b", "Aynı"), friend("a", "Aynı"), friend("c", "Aynı")];

    for (const sort of ["status", "name", "recent"] as const) {
      const first = sortFriends(rows, sort, EMPTY_CONTEXT).map((row) => row.id);
      const second = sortFriends(rows, sort, EMPTY_CONTEXT).map((row) => row.id);

      assert.deepEqual(first, second, sort);
      assert.deepEqual(first, ["a", "b", "c"], sort);
    }
  });

  it("girdi dizisini bozmaz", () => {
    const rows = [friend("b", "B"), friend("a", "A")];
    sortFriends(rows, "name", EMPTY_CONTEXT);

    assert.deepEqual(
      rows.map((row) => row.id),
      ["b", "a"],
    );
  });
});

describe("bölümler", () => {
  /**
   * Tasarımın "5 çevrimiçi" sayacı odak modundaki Zeynep'i ve rahatsız
   * etmeyin'deki Emre'yi de içeriyor: ikisi de uygulamada açık.
   */
  it("boşta ve rahatsız etmeyin çevrimiçi sayılır", () => {
    const rows = [
      friend("a", "A", "ONLINE"),
      friend("b", "B", "IDLE"),
      friend("c", "C", "DND"),
      friend("d", "D", "OFFLINE"),
    ];

    const { offline, online } = splitFriendsByPresence(rows);

    assert.deepEqual(
      online.map((row) => row.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      offline.map((row) => row.id),
      ["d"],
    );
  });
});

describe("süzme", () => {
  const rows = [
    { id: "a", name: "Selin Aksoy", username: "selin" },
    { id: "b", name: "İstanbul Ekibi", username: "istanbulekibi" },
  ];

  it("boş sorguda hepsini döndürür", () => {
    assert.equal(filterFriends(rows, "   ").length, 2);
  });

  it("ad ve kullanıcı adında arar", () => {
    assert.equal(filterFriends(rows, "aksoy").length, 1);
    assert.equal(filterFriends(rows, "selin").length, 1);
    assert.equal(filterFriends(rows, "yok").length, 0);
  });

  it("Türkçe büyük I harfini doğru küçültür", () => {
    // İngilizce kuralla `İstanbul` → `istanbul` olmaz; arayan sonuç bulamazdı.
    assert.equal(filterFriends(rows, "istanbul").length, 1);
  });

  it("ortak sunucu adında da arar", () => {
    const servers = new Map([["a", ["Whispr Topluluğu"]]]);

    assert.deepEqual(
      filterFriends(rows, "whispr", servers).map((row) => row.id),
      ["a"],
    );
  });

  /**
   * Süzme düz alt dizedir; arama panelindeki (`match-ranges`) ortak önek
   * sezgiseli **burada yok**. Bir liste süzgeci yaklaşık eşleşmeyle "topluluk"
   * yazana "Topluluğu"yu getirseydi, kullanıcı neyi elediğini göremezdi.
   */
  it("ünsüz yumuşamasını tahmin etmez", () => {
    const servers = new Map([["a", ["Whispr Topluluğu"]]]);

    assert.deepEqual(filterFriends(rows, "topluluk", servers), []);
  });
});

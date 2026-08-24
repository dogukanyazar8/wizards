import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectThirdColumn } from "@/lib/home/third-column";

describe("selectThirdColumn", () => {
  /**
   * Mesajlar karar #2. Ana Sayfa paketinin karar #8'i ("2. sütun rota başına
   * değişir") tersine döndü: gezinme paneli her rotada durur ve rotaya göre
   * değişen şey onun **sağındaki** sütundur. Bu rotalarda o sütun yoktur.
   */
  it("komuta merkezi rotalarında üçüncü sütun yok", () => {
    for (const pathname of ["/home", "/events", "/inbox"]) {
      assert.equal(selectThirdColumn(pathname), null, pathname);
    }
  });

  it("Keşfet rotasında dizin rayı", () => {
    assert.equal(selectThirdColumn("/discover"), "discover");
    assert.equal(selectThirdColumn("/discover?lane=people"), "discover");
    assert.equal(selectThirdColumn("/discover/"), "discover");
  });

  /**
   * Bahsedilmeler Ş1: `/mentions` artık `null` dalında değil. Ekranın kendi rayı (276)
   * gezinme panelinin sağında durur ve kabuk onu bu değere göre yerleştirir.
   */
  it("Bahsedilmeler rotalarında bahsetme rayı", () => {
    assert.equal(selectThirdColumn("/mentions"), "mentions");
    assert.equal(selectThirdColumn("/mentions/"), "mentions");
  });

  it("Bahsedilmeler alt yolları da rayı taşır", () => {
    // Ray filtreyi URL sorgusundan okur; bir alt segment eklenirse bile ekran aynı ekrandır.
    assert.equal(selectThirdColumn("/mentions/unread"), "mentions");
  });

  it("alt yolları da aynı dala düşer", () => {
    assert.equal(selectThirdColumn("/events/2026-08-19"), null);
    assert.equal(selectThirdColumn("/discover/servers"), "discover");
  });

  it("Mesajlar rotalarında sohbet rayı", () => {
    assert.equal(selectThirdColumn("/channels"), "messages");
    assert.equal(selectThirdColumn("/messages"), "messages");
    assert.equal(selectThirdColumn("/messages/conversation-1"), "messages");
  });

  it("yüzde kodlu `@me` de Mesajlar sayılır", () => {
    // `usePathname` segmenti kodlu verebilir; kodlu hâli başka bir ekran değil.
    assert.equal(selectThirdColumn("/channels/%40me"), "messages");
  });

  it("sunucu rotalarında kanal listesi", () => {
    assert.equal(selectThirdColumn("/channels/server-1"), "channels");
    assert.equal(selectThirdColumn("/channels/server-1/channel-1"), "channels");
    assert.equal(selectThirdColumn("/servers/server-1/about"), "channels");
  });

  it("sunucu kimliği olmayan `/servers` üçüncü sütun açmaz", () => {
    assert.equal(selectThirdColumn("/servers"), null);
  });

  it("sondaki eğik çizgi anlamı değiştirmez", () => {
    assert.equal(selectThirdColumn("/channels/"), "messages");
    assert.equal(selectThirdColumn("/home/"), null);
  });

  it("bozuk yüzde kodlaması çökmez", () => {
    // Çözülemeyen segment gerçek bir yol olamaz; sunucu dalına düşmesi yeterli.
    assert.equal(selectThirdColumn("/channels/%E0%A4%A"), "channels");
  });

  it("tanınmayan yol güvenli düşüşte kalır", () => {
    assert.equal(selectThirdColumn("/"), null);
    assert.equal(selectThirdColumn("/uydurma"), null);
  });
});

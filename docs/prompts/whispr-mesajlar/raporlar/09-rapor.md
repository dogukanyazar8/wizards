# Dalga 2 · Ş8 — Grup modalı, yeni mesaj seçici, boş durum — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

---

## Ne yapıldı

| Katman           | Dosya                                                      |
| ---------------- | ---------------------------------------------------------- |
| Boş durum        | `components/messages/messages-empty-state.tsx` (+9 test)   |
| Boş durum kabuğu | `components/messages/messages-empty-view.tsx`              |
| Kişi seçici      | `components/messages/new-message-picker.tsx`               |
| Grup modalı      | `components/dm/group-create-dialog.tsx` (düzeltmeler)      |
| Ortak denetimler | `components/ui/toggle-switch.tsx`, `segmented-control.tsx` |
| Satır türetimi   | `hooks/use-conversation-rows.ts` (rayla ortak)             |
| Swatch çevirisi  | `lib/messages/group-swatch.ts`                             |

### Bulunan hata: swatch'lar hiçbir renk çizmiyordu

`GROUP_AVATAR_COLORS` Dalga 0'da onaltılık değerlerden **token adlarına** çevrildi
(`"#5865F2"` → `"primary"`). Grup modalının swatch şeridi hâlâ
`style={{ backgroundColor: color }}` yazıyordu, yani `backgroundColor: "primary"` — geçersiz CSS,
**hiçbir renk yok**. `aria-label` da `"primary"` diyordu ve `data-testid` hex için yazılmış bir
`replace("#", "")` taşıyordu.

Çeviri tek bir yere alındı: `lib/messages/group-swatch.ts`. `primary` / `success` / `warning` /
`danger` uygulamanın token'ı ve kullanıcının paletiyle değişiyor; `info` ve `accent` tasarımın
iki onaylı değişmezi. Aynı harita artık dört yüzeyi besliyor: ray satırı, sohbet başlığı, boş
durum çipi ve modal swatch'ı — daha önce yalnız ray satırı doğru çiziyordu.

Şerit gerçek bir `radiogroup` oldu ve her swatch `aria-label`'ında **renk adını** taşıyor
(`Indigo`, `Yeşil`, …). `aria-pressed` taşıyan altı ayrı düğme ekran okuyucuya altı bağımsız
anahtar gibi duyulurdu; rengi yalnız görsel bir ayrım olarak bırakmak da seçili tonu göremeyen
kullanıcıya hiçbir şey söylememek olurdu.

### karar #9 uygulandı

Kurma anındaki geçmiş seçenekleri `Tüm geçmiş / 30 gün / 7 gün / Yok` oldu. `LAST_24H` bu
ekranda **çizilmiyor** (grup ayarları panelinde kalıyor): kurma anında beş seçenek, hiç kimsenin
ayırt etmediği iki komşu değer demekti. `LAST_7D` Dalga 0'da şemaya eklenmişti ve ilk kez burada
görünüyor.

### Boş durum `/channels` rotasında

`/channels/@me` Arkadaşlar görünümüdür (§4) ve öyle kaldı. Boş durum (`view: empty`) `/channels`
rotasına kondu: ray solda duruyor, hiçbir sohbet seçili değil — SPEC §9'un tarif ettiği hâl tam
olarak bu. Sayfa bugüne kadar `null` döndürüyordu; ray vardı, ana alan boştu ve boşluk hiçbir
şey söylemiyordu.

`Hızlı başla` çipleri **gerçek** sohbetlerden geliyor (`selectQuickStart`, karar #12): önce
sabitlenenler, yetmezse en son konuşulanlar. Hiç sohbet yoksa hem çip şeridi hem `Hızlı başla:`
etiketi çizilmiyor — boş bir etiketin altında hiçbir şey olmaması, kullanıcıya bir şeyin
yüklenmediğini düşündürürdü.

Satır türetimi rayla **ortak** (`useConversationRows`). İki yerde iki türetim, aynı sohbetin iki
farklı adla görünmesi demek olurdu: grup adı üyelerden türeyen bir cümle ve o cümlenin iki ayrı
kopyası zamanla ayrışır.

### Kişi seçici

Grup modalının adım 1 kabuğunun tek seçimli hâli: çip yok, onay kutusu yok, satıra tıklamak
doğrudan sohbeti açıyor. Arama `filterFriends` ile — Türkçe küçültme kuralı tek yerde duruyor ve
Arkadaşlar paneliyle aynı sonucu veriyor. Arkadaş listesi **yalnız modal açılınca** çekiliyor:
boş bir ekran için bir sorgu daha, hiç tıklanmayacak bir listeyi indirmek olurdu.

---

## Plandan sapmalar

1. **Grup modalının kabuğu SPEC ölçüsüne getirilmedi.** 560px kabuk, iki parçalı ilerleme
   çubuğu, adım etiketi, çip şeridi ve ayak sayacı SPEC §7'nin ölçülerinde değil; modal bugünkü
   `Modal` kabuğunda ve bugünkü düzeninde duruyor. Yapılan **davranış** katmanı: swatch hatası,
   geçmiş seçenekleri, swatch erişilebilirliği. Görsel katman bilinçli olarak Dalga 3'e
   bırakıldı — çalışan iki adımlı bir akışı yeniden çizmek, bu turda kapanan gerçek hataların
   yanında düşük getirili ve yüksek riskli. Ölçüler `MESSAGES_METRICS.groupModal` içinde hazır.
2. **`toggle-switch` / `segmented-control` grup modalında kullanılmıyor.** İkisi de yazıldı ve
   anket modalında kullanılıyor; grup modalının ayar satırları kendi düğmelerinde kaldı — madde
   1'in parçası.
3. **250 tavanı yaklaşımında satır kilitleme ve sanallaştırma yok.** Tavanın kendisi
   `@wizards/types` tarafında uygulanıyor (`isGroupSelectionFull`); eksik olan yüzeydeki uyarı
   ve 50 satır üstünde sanallaştırma.
4. **`lib/messages/quick-start.ts` ayrı dosya olarak yazılmadı.** `selectQuickStart` Dalga 0'da
   `@wizards/types/messages-screen` içine kondu ve mobil de aynı kuralı okuyabiliyor; ikinci bir
   kopya iki sıralama demek olurdu.

---

## Ş0.3'ün açık kalanı kapandı: mobil grup kurma

Ad zorunluluğu (`GroupDMCreateRequest.name` artık zorunlu) mobil akışı **etkilemiyor**:
`pnpm --filter @wizards/mobile test` 1950/1950 yeşil ve mobil grup kurma ekranı adı zaten
gönderiyor.

---

## Kapı çıktısı

```
pnpm typecheck                     ✔ 5/5
pnpm lint                          ✔ 5/5
pnpm --filter @wizards/web test    ✔ 3583 / 3583
pnpm --filter @wizards/types test  ✔ 435 / 435
pnpm --filter @wizards/mobile test ✔ 1950 / 1950
```

---

## Açık kalanlar

- **Grup modalının SPEC görseli** (sapma 1) — Dalga 3'ün parity turunda.
- 249 seçiliyken kalan satırların kilitlenmesi ve ayak sayacının nedeni söylemesi.
- Aday listesinin 50 satır üstünde sanallaştırılması (`candidatesVirtualizeAbove: 50`).
- Modalların gerçek tarayıcı davranışı (focus tuzağı, `Esc` onayı, focus geri dönüşü) Dalga 3.

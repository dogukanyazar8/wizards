# Dalga 2 · Ş7 — Sağ paneller — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

---

## Ne yapıldı

| Katman        | Dosya                                                    |
| ------------- | -------------------------------------------------------- |
| Ortak kabuk   | `components/messages/messages-side-panel.tsx` (+10 test) |
| Arama gövdesi | `components/messages/message-search-results.tsx`         |
| Arama paneli  | `components/messages/messages-search-panel.tsx`          |
| Arama durumu  | `hooks/use-message-search.ts`                            |
| Vurgu         | `lib/messages/search-highlight.ts` (+9 test)             |
| Thread paneli | `components/chat/thread-panel.tsx` (yeniden çizildi)     |

### Yüzen popover kalktı (karar #6)

Arama artık ekranın bir sütunu ve **global**. Popover'ın asıl sorunu kapsamıydı: açık sohbetin
içinde arıyordu, oysa "şu cümleyi biri söylemişti" sorusunun cevabı çoğu zaman başka bir
sohbette. Kanal tarafındaki popover **dokunulmadı** — SPEC-MESAJLAR Mesajlar ekranını tarif
ediyor.

Sonuca tıklamak başka bir sohbete gitse bile **panel kapanmıyor**: aramaya devam edilebilsin
diye (SPEC §6.2).

### Docked ile overlay ayrımı

`<1100px`'te panel ana alanın üstüne biniyor ve o hâlde bir diyalog: `role="dialog"` +
`aria-modal` + focus tuzağı. Yerleşikken `role="complementary"` ve tuzak **yok** — kurulsaydı
klavye kullanıcısı, sohbetin geri kalanı gözünün önündeyken oraya hiç gidemezdi.

Açılışta odak başlığa taşınıyor. Taşınmasaydı `Tab` kullanıcıyı tetikleyen ikonun sonrasına
götürür, panelin içine hiç uğramazdı.

### Vurgu sunucudan

`search-highlight.ts` **arama yapmıyor**; aralıkları (`matchRanges`, Ş2) parçalara bölüyor.
İstemci kendi eşleşmesini kursaydı, sunucunun bulduğu satırda başka bir yeri vurgulardı ve
fark ancak Türkçe ünsüz yumuşamasında ortaya çıkardı — yani en zor fark edilecek yerde.

Aralıklar **kod noktası** cinsinden; `String.slice` UTF-16 kod birimi sayar ve tek bir emoji
bütün aralıkları kaydırır. Çakışan aralıklar birleştiriliyor (iç içe `<mark>` olmasın) ve metin
sınırına kırpılıyor.

### Zıplamayan liste

Üç kural `use-message-search` içinde: 300ms debounce + 2 karakter tabanı, önceki sonuçlar
**kaybolmaz** (soluklaşır), son istek kazanır. Sonuçlar **anahtarlarıyla** saklanıyor: girdi
değişince eski sayfa kendiliğinden geçersiz sayılıyor. Alternatif, girdi değişiminde bir
efektten `setState` çağırmaktı — fazladan bir render turu ve React'in "efektte senkron
setState" uyarısı.

### Thread paneli 340'a indi

460px'lik tam ekran diyalog gitti; panel artık ortak kabuğu kullanan yerleşik bir sütun. Veri
katmanı olduğu gibi korundu (`useThreadMessages` sonsuz sorgusu, socket yaması, gönderim yolu).

**Başlık uydurulmadı.** Sunucu "thread başlığı" tutmuyor; alt satırdaki özet kök mesajın
gövdesinden türüyor (Ş5'in `excerpt`'i). Ayrı bir alan icat etmek, hiçbir yerin doldurmadığı bir
sözleşme yaratırdı.

---

## `Ana sohbete de gönder` — DM karşılığı **yok**

Doğrulandı: `SocketMessageSendPayloadSchema` `alsoSendToChannel` taşıyor,
`SocketDMMessageSendPayloadSchema` **taşımıyor** ve şema `.strict()` — gönderilen bir bayrak
reddedilirdi.

Plan "kutuyu çiz ama isteği bayraksız gönder" diyordu. **Yapılmadı.** İşaretlenen ama hiçbir şey
yapmayan bir kutu, kullanıcıya çalışmayan bir söz verir; Ş3'teki `Sunucuya davet et` satırı ve
Ş5'teki `Mesajı ilet` satırıyla aynı kural uygulandı: **karşılığı yoksa çizilmez**. Kutu kanal
thread'inde duruyor ve orada gerçekten çalışıyor. `TODO(api)` kaynakta.

---

## Plandan sapmalar

1. **`chat/message-search-panel.tsx` silinmedi.** Kanal tarafı hâlâ onu kullanıyor; DM'de
   kullanımdan kalktı. Silmek kanal aramasını kaldırmak olurdu.
2. **`Tarih ekle` çipi çizilmiyor.** Tarih aralığı seçicisi bu turda yapılmadı ve tıklanınca
   hiçbir şey yapmayan bir çip çalışmayan bir söz demek. `useMessageSearch` `from`/`to`'yu
   zaten taşıyor; eksik olan yalnız seçici.
3. **Sayfalama tetiklenmiyor.** `fetchNextPage` ve `hasNextPage` hazır ama kaydırma sonunu
   gözleyen `IntersectionObserver` bağlanmadı.

---

## Kapı çıktısı

```
pnpm typecheck                   ✔ 5/5
pnpm lint                        ✔ 5/5
pnpm --filter @wizards/web test  ✔ 3583 / 3583
```

---

## Açık kalanlar

- **Tarih filtresi seçicisi** (sapma 2). Uç ve durum hazır, yüzey yok.
- **Sonsuz kaydırma bağlanmadı** (sapma 3); uzun sonuç listesinde ilk sayfadan sonrası
  görünmüyor.
- `MESSAGES_DENSITY_BY_SCALE[scale].searchResults` ilk sayfa uzunluğu olarak kullanılmadı;
  sayfa boyu sunucudan geliyor. Ölçek arttıkça panel daha çok satır göstermeli — Dalga 3.
- Panel dışlayıcılığının entegrasyon testi (thread açıkken arama ikonuna basmak) gerçek
  tarayıcı istiyor; kural `chat-area`'da `toggleSearchPanel` / `openThreadPanel` içinde.

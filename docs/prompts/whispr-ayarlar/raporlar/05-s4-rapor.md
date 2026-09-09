# Ş4 raporu — İstisnalar (üç tablodan tek liste) + Ayarlar arama indeksi

**Dalga 1 / Ş4** · dal `uat` · 2026-08-24 · commit **atılmadı**.

Ön koşul doğrulandı: `lib/settings/tree.ts` (2048 satır, 170 satır sözleşmesi) ve
`lib/settings/navigation.ts` yerinde; `walkSettingsRows()` arama indeksinin girdisi olarak
zaten dışa açık.

---

## 1. Ne yapıldı

### A · İstisnalar (K4)

| Dosya                                                                          | Satır | Ne                                       |
| ------------------------------------------------------------------------------ | ----- | ---------------------------------------- |
| `apps/web/src/lib/notifications/exceptions-service.ts`                         | 296   | Üç kaynaktan tek liste + tembel temizlik |
| `apps/web/src/lib/notifications/exceptions-service.test.ts`                    | 402   | 22 test                                  |
| `apps/web/src/app/api/v1/users/me/notification-exceptions/route.ts`            | 8     | `GET` sarmalayıcı                        |
| `apps/web/src/app/api/v1/users/me/notification-exceptions/route-logic.ts`      | 39    | `runHomeRoute` deseni                    |
| `apps/web/src/app/api/v1/users/me/notification-exceptions/route-logic.test.ts` | 103   | 7 test                                   |
| `apps/web/src/lib/settings/exceptions-client.ts`                               | 174   | Okuma + üç mevcut uca yönlendirme        |
| `apps/web/src/lib/settings/exceptions-client.test.ts`                          | 169   | 11 test                                  |

**Yeni tablo yok, yeni yazma ucu yok.** Açılan tek uç okuma:
`GET /api/v1/users/me/notification-exceptions` → `{ items, truncated }`.

Süzgeç prompt §1'deki tabloyla birebir:

| Kaynak                | Süzgeç                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `UserServerSettings`  | `muted` **veya** `mutedUntil != null` **veya** `messageNotifications != DEFAULT` **veya** `suppressEveryone` **veya** `suppressRoles` |
| `UserChannelSettings` | `muted` **veya** `mutedUntil != null` **veya** `messageNotifications != DEFAULT`                                                      |
| `DMParticipant`       | `notifyLevel != ALL`                                                                                                                  |

Düzey çözümü (`resolveExceptionLevel`), susturma düzeyin önünde:

```
etkin susturma  → "muted"
NOTHING         → "off"
MENTIONS        → "mentions"
ALL             → "all"
DEFAULT + suppress* → "important"
DEFAULT, susturmasız → null   // istisna değil, listeye girmez
```

Sıralama `scope` (server → channel → dm), sonra `name.localeCompare(name, "tr")`.
Kesme `NOTIFICATION_EXCEPTION_LIMIT = 200`, üstü `truncated: true`.

### B · Ayarlar arama (sapma #7)

| Dosya                                            | Satır | Ne                                            |
| ------------------------------------------------ | ----- | --------------------------------------------- |
| `apps/web/src/lib/settings/search-index.ts`      | 115   | `SETTINGS_TREE`'den üretim + TR normalizasyon |
| `apps/web/src/lib/settings/search-index.test.ts` | 149   | 13 test                                       |
| `apps/web/src/lib/settings/search.ts`            | 111   | Eşleme, sıralama, `Bölüm › Grup` yolu         |
| `apps/web/src/lib/settings/search.test.ts`       | 203   | 14 test                                       |

İndeks `walkSettingsRows()` ile üretiliyor; **170 kayıt**, sırası ağacın sırası (`order` alanı
eşitlik kırıcısı). Statik `SET_HITS` dizisi kodda yok ve bir tarama testi bunu üretim kodunda
(yorumlar ve dizeler ayıklanarak) sabitliyor.

**Türkçe normalizasyon** üç adım: `toLocaleLowerCase("tr")` → `ı` katlama → NFD ayrıştırma +
`\p{M}` düşürme. `Bİldİrİm` / `BILDIRIM` / `bildirim` / `BiLdIrIm` dördü de aynı sonuç
kümesini veriyor (test edildi). `ÇÖĞÜŞİ` → `cogusi`.

**Sıralama beş kademe** — spec'in dördü artı bir:

| #   | Kademe                               |
| --- | ------------------------------------ |
| 0   | Başlıkta kelime başı eşleşmesi       |
| 1   | Başlıkta içerme                      |
| 2   | Açıklamada içerme                    |
| 3   | Seçenek etiketinde içerme            |
| 4   | _(ek)_ Yalnız grup başlığında içerme |

Beşinci kademe eklendi çünkü `haystack` grup başlığını taşıyor (§4) ama §5 onu
sıralamıyordu; grup-eşleşmesini sessizce elemek "sessiz saatler" araması için o grubun
satırlarını kaybettirirdi. Kendi başlığı eşleşen hiçbir satırın önüne geçmiyor.

---

## 2. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   → Ş4 dosyalarında 0 hata
pnpm --filter @wizards/web lint        → Ş4 dosyalarında 0 uyarı/hata
pnpm --filter @wizards/web test        → Ş4 dosyaları 67/67 yeşil
```

Sahiplenilen sekiz dosyanın hedefli koşusu:

```
tests 67 · suites 15 · pass 67 · fail 0
```

`typecheck` iki hata veriyor ve **ikisi de Ş4'ün değil** —
`src/lib/security/security-event-service.ts:103` ve `:160`. O dosya paralel koşan Ş3'ün
(K5 · `SecurityEvent`) untracked çıktısı; `git status` ile doğrulandı.

`prettier` yalnız sahiplenilen dosyalarda çalıştırıldı; paralel şeritlerin biçimlendirme
borcuna dokunulmadı.

---

## 3. Kayda geçen sapmalar

Bunlar `lib/settings/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisine **yazılmadı**: o dosya
Ş0'ın ve Ş1–Ş3 aynı anda koşuyor; dalga kapandığında Ş13 bu üçünü diziye alabilir.

### #7-b · Sunucu kapsamının web yazma ucu yok

Prompt §2 `PATCH /api/v1/servers/[serverId]/user-settings` diyor. **Böyle bir uç yok.**
Kodda tek yazma yolu `PATCH /api/v1/mobile/servers/[serverId]/settings` ve o uç
`requireMobileApiUserId` ile korunuyor (Bearer JWT) — oturum çerezli bir web isteği oraya
ulaşamıyor. Ş4 yeni uç açmama kuralına uydu; `exceptions-client.ts`
`NOTIFICATION_EXCEPTION_WRITE_SUPPORT.server = { update: false, remove: false }` ilan ediyor ve
çağrı `NotificationExceptionUnsupportedError` ile dönüyor (sessizce yutmuyor).

### #7-c · Kanal ucu `DEFAULT` yazamıyor

`PATCH /api/v1/channels/[channelId]/notification-settings` sözlüğü üç üyeli:
`all | mentions | muted`. `DEFAULT` yazamadığı için "İstisnayı kaldır" kanalda satırı
listeden düşürmüyor — `all` yazmak satırı `Kanal · Tümü` istisnası olarak bırakıyor
(referanstaki `#duyurular` satırı tam olarak bu). Kaldırma bugün yalnız DM'de çalışıyor
(`notifyLevel = ALL`).

### #7-d · `important` düzeyi hiçbir uçtan yazılamıyor

`UserChannelSettings`'te `suppress*` kolonu yok; `DMNotifyLevel`'da karşılığı yok. Düzey
**okunuyor** (sunucu satırında `DEFAULT + suppressEveryone|suppressRoles`) ama yazılamıyor.

---

## 4. `TODO(api):` bırakılanlar

`apps/web/src/lib/settings/exceptions-client.ts` içinde iki not:

1. Sunucu kapsamının web eşleniği yok (yukarıda #7-b). Uç açıldığında değişen tek şey
   `NOTIFICATION_EXCEPTION_WRITE_SUPPORT` tablosu ve `buildRequest`'in üçüncü dalı.
2. Kanal ucu `default` düzeyini öğrenmeli (yukarıda #7-c).

Başka uydurma uç yok; okuma ucu dışında hiçbir yeni adres açılmadı ve bir test
(`hiçbir çağrı yeni bir uca gitmez`) bunu sabitliyor.

---

## 5. Yorum gerektiren iki karar

### `mutedUntil` geçmiş satır: "düşer" ne demek

Prompt "satır listeden düşer ve `muted = false` olarak tembel düzeltilir" diyor. Uygulama şu
sırayı izliyor: süresi geçmiş susturma **önce** temizlenmiş sayılıyor, satır **sonra** süzgeçten
geçiyor. Yani:

- `mutedUntil` geçmiş + `messageNotifications = DEFAULT` → satır listeden düşer ✔
- `mutedUntil` geçmiş + `messageNotifications = MENTIONS` → satır **listede kalır**, düzeyi
  `mentions`, `mutedUntil` alanı `null`

İkinci durumda satırı da düşürmek, kullanıcının açıkça kurduğu düzey tercihini ekrandan
silmek olurdu. İkisi de test edildi.

Tembel düzeltme **kapsam başına tek `updateMany`** (satır başına değil), okumadan ayrı bir
işlem olarak ve yalnız `exceptions-service.ts` içinde. Temizlenecek satır yoksa hiç yazma
yapılmıyor.

### Susturma düzeyin önünde

Kanal ucu `muted` seçimini `NOTHING + muted = true` olarak yazıyor. Düzey önce okunsaydı o
satır `Kapalı` görünürdü; kullanıcı orada `Sessiz` seçtiğini biliyor. Referanstaki
`#genel-sohbet — Kanal · Sessiz · 24 Ağustos 18:00'a kadar` satırı bu sırayla doğru çıkıyor.

---

## 6. Kabul listesi

**İstisnalar**

- [x] Üç kaynaktan gelen satırlar tek listede, doğru `scope` ile.
- [x] `DEFAULT` seviyeli ve susturulmamış satır listede yok.
- [x] `mutedUntil` geçmiş satır listede yok ve tembel düzeltme bir kez çalışıyor.
- [x] Aynı sunucu hem `muted` hem `suppressEveryone` ise listede bir kez.
- [x] Sıralama `tr` collation ile; `Ceren` → `Çınar` → `Deniz`.
- [x] `truncated` bayrağı 200 üstünde çıkıyor, tam 200'de çıkmıyor.
- [x] Yeni yazma ucu açılmadı; `updateException` mevcut uçlara yönlendiriyor
      (sunucu kapsamı hariç — §3 #7-b).

**Arama**

- [x] İndeks `SETTINGS_TREE`'den üretiliyor; statik `SET_HITS` dizisi üretim kodunda yok.
- [x] Hiçbir sonuç var olmayan sekmeye götürmüyor (170 satırın tamamı taranıyor).
- [x] `Bİldİrİm` / `BILDIRIM` / `bildirim` aynı sonuç kümesini veriyor.
- [x] 2 karakterden kısa sorgu boş dönüyor.
- [x] Sıralama önceliği dört kademede doğru (beşinci ek kademe §1'de gerekçeli).
- [x] `Bölüm › Grup` yolu i18n'den kuruluyor; sabit Türkçe metin yok (EN ile de sınandı).

---

## 7. Ş9'a devredilenler

- `Yüzeyler` sekmesindeki `Aktif istisna` sayısı **bu ucun** `items.length`'i; ikinci bir sayaç
  ucu açılmamalı.
- `truncated: true` → `+{n} daha`.
- `canUpdateException(scope)` / `canRemoveException(scope)` kontrolün `disabled` durumunu
  besler; `NotificationExceptionUnsupportedError` yakalanmalı.
- Düzey etiketleri (`Tümü` / `Bahsetmeler` / `Yalnızca önemli` / `Sessiz` / `Kapalı`) ve süre
  pili (`… kadar` · `Ben açana kadar`) sunum katmanının işi — servis düzey anahtarını ve ISO
  tarihi veriyor, metin vermiyor.
- DM satırları `mutedUntil` taşımaz (`DMParticipant`'ta kolon yok); süre pili orada çizilmez.

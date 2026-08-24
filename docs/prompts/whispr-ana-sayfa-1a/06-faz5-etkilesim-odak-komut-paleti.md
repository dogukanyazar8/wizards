# Faz 5 — Etkileşimler, odak modu ve komut paleti

**Ön koşul:** Faz 4. **Sonraki:** Faz 6.
**Önce oku:** `00-ortak-baglam.md` §5 (kalite çıtası), karar #4 ve #10; SPEC-ANA-SAYFA §4
(etkileşim tablosu), §6 (state).

Kartlar artık dolu; bu faz onları çalışır hâle getirir. Üç risk yoğunlaşması: optimistic
güncellemeler, geri sayım zamanlayıcıları ve yeni bir overlay (⌘K).

---

## 0. Başlangıç

```
graphify query "voice katılma akışı ve joined room state"
graphify query "modal ve overlay portal host kullanımı"
graphify query "optimistic mutation kalıpları react query"
```

---

## 1. Etkileşim envanteri (SPEC §4)

| Öğe                                    | Davranış                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ray sunucu ikonu                       | Sunucuya geç (mevcut yönlendirme). Hover `translateY(-2px)`.                                           |
| Ray `+`                                | Mevcut sunucu oluştur/katıl modalı.                                                                    |
| Nav satırları                          | `/home`, `/channels`, `/mentions`, `/events`, `/discover`.                                             |
| Sunucu listesi satırı                  | Sunucuya git; okunmamış badge mevcut davranışla temizlenir.                                            |
| Kullanıcı ayağı ikonları               | Mikrofon / kulaklık aç-kapa, ayarlar overlay'i (mevcut).                                               |
| Arama alanı / `⌘K`                     | Komut paletini aç.                                                                                     |
| "Kaldığın yer" satırı                  | İlgili kanal/DM'e git, okunmamışı sıfırla. Satır tamamı tek hedef.                                     |
| `Tümünü gör` / `Gelen kutusu` / `Tümü` | Sırasıyla kanal listesi, `/inbox`, arkadaşlar görünümü (Faz 6).                                        |
| Oda kartı `Katıl`                      | Sesli odaya katıl (mevcut voice akışı). Katıldıktan sonra buton `Ayrıl`, kart kenarı `--success/0.35`. |
| Dalga formu                            | Yalnız aktif konuşmacı varken animasyonlu.                                                             |
| İstek satırı `Yanıtla`                 | Kanal/DM'e git ve besteciyi odakla.                                                                    |
| İstek satırı `Kabul et`                | Daveti/isteği kabul et; satır optimistic olarak listeden çıkar, `<n> yeni` sayacı düşer.               |
| Durum çipleri                          | Presence değiştir; optimistic + socket doğrulama.                                                      |
| `Rahatsız etmeyin`                     | Odak modu toggle'ı; geri sayım, ilerleme çubuğu, süre bitince otomatik kapanış.                        |
| `Hatırlat`                             | Etkinlik hatırlatıcısı; buton geçici olarak `Hatırlatılacak` metnine döner.                            |
| `Takvim`                               | `/events` takvim görünümüne git (karar #10).                                                           |
| Arkadaş kartı                          | Tıklama → DM aç. Sağ tık → mevcut `ContextMenu` (mesaj gönder, profili gör, sesli ara).                |

---

## 2. Optimistic güncellemeler

Ortak kural: **iyimser yaz, hata gelirse geri al, kullanıcıya söyle.**

### 2.1 Presence çipi

- Tıklama anında seçili çip değişir.
- `PATCH /users/me/presence` çağrılır.
- Hata → eski değere dön + toast (mevcut toast standardı).
- `presence:update` socket olayı geldiğinde sunucu değeri kazanır.
- Aynı çipe ikinci tık isteği tekrarlamaz.

### 2.2 "Kabul et"

- Satır listeden hemen çıkar, `newCount` bir azalır.
- Arkadaşlık isteği → mevcut `friends/request/[id]` ucu; sunucu daveti → mevcut katılma ucu.
- Hata → satır geri gelir, toast.
- Aynı satır iki kez kabul edilemez (buton `disabled` + istek uçuşta bayrağı).
- Kabul başarılıysa `app/awaiting` ve `app/summary` invalidate.

### 2.3 "Hatırlat"

- `ScheduledEventInterest` idempotent — ikinci tık sayacı artırmaz (şemanın kendi yorumunda yazıyor).
- Buton metni `Hatırlatılacak`'a döner ve **öyle kalır** (durum `interested` alanından okunur),
  geçici bir animasyon değil.
- Kaldırma: aynı butona tekrar basmak ilgiyi kaldırır ve metin `Hatırlat`'a döner.

### 2.4 "Kaldığın yer" satırı

- Gezinmeden önce okunmamış sayacı yerel olarak sıfırlanır (algılanan hız).
- Gerçek okuma işaretlemesi hedef ekranın mevcut davranışıdır — burada ikinci bir "read" çağrısı
  yapılmaz.

---

## 3. Odak modu (karar #4)

### 3.1 Durum makinesi

```
kapalı --toggle açık--> açık(status=DND, restoreTo=önceki, expiresAt=now+N)
açık  --toggle kapalı--> kapalı(status=restoreTo, alanlar temizlenir)
açık  --expiresAt geçti--> kapalı(aynı geri dönüş)
```

- Varsayılan süre 25 dk (tasarım). Süre seçimi bu pakette **sabit 25 dk**; farklı süre isteniyorsa
  kullanıcıya sorulur.
- Toggle açıkken presence çipleri **kilitlenmez** — kullanıcı yine durum seçebilir; seçim
  `statusRestoreTo`'yu günceller, odak sürerken görünen durum DND kalır. (Tasarımdaki "Çevrimiçi
  seçili + DND açık" görüntüsünün karşılığı budur.)

### 3.2 Geri sayım

- Tek `useFocusCountdown` hook'u. Kaynak `statusExpiresAt` (mutlak zaman) — sayaç değil.
- Tik **dakikada bir**. `setInterval` unmount'ta temizlenir.
- Sekme gizliyken interval durur (`document.visibilitychange`); geri gelince mutlak zamandan
  yeniden hesaplanır. Böylece uyku sonrası yanlış sayı çıkmaz.
- Süre dolduğunda istemci `PATCH` göndermez — sunucu sweep'i (Faz 3 §1.1) halleder; istemci
  yalnız kendi görünümünü tazeler ve `presence:update` bekler. Çift kapatma yok.
- İlerleme çubuğu `elapsed / total`; `total` = `statusExpiresAt - focusStartedAt`. Başlangıç
  zamanı sunucudan gelmiyorsa `totalMinutes` alanından türetilir.

### 3.3 Görünürlük

Odak açıkken üç yer aynı kaynaktan okur: üst çubuk pill'i, kullanıcı ayağı satırı, `Durumun`
kartı. Üç ayrı hesap yok.

---

## 4. Sesli odaya katılma

- `Katıl` mevcut voice akışını çağırır — yeni katılma yolu yazma.
- `joinedVoiceRoomId` mevcut voice context'ten okunur (SPEC §6). Kart bu değere göre `Katıl` /
  `Ayrıl` gösterir; ekran kendi kopyasını tutmaz.
- Katılınca kart kenarı `--success/0.35`.
- Zaten başka bir odadayken `Katıl`: mevcut akışın oda değiştirme davranışı neyse o. Yeni onay
  diyalogu **uydurma** — mevcut davranış yoksa kullanıcıya sor.
- Katılma sırasında buton yükleme durumuna geçer, çift tık engellenir.

---

## 5. Komut paleti — `components/command/command-palette.tsx`

Karar #10: arama **ve** komut.

### 5.1 Açılış

- `⌘K` (macOS) / `Ctrl+K` (diğer). Global dinleyici tek yerde; input içindeyken tetiklenmez
  (`event.target` kontrolü).
- Üst çubuktaki arama alanına tıklama da açar.
- Overlay mevcut portal host üzerinden render edilir — yeni bir portal mekanizması kurma.
- `dynamic()` ile kod bölünür; ilk yükte bundle'a girmez (§5.2).

### 5.2 Davranış

- Genişlik 560, kabuk içinde ortalanır (Mesajlar spec'indeki modal ölçüsüyle tutarlı).
- Arama girdisi debounce **200 ms**; her tuşta istek yok.
- Sonuç grupları: Sunucular · Kanallar · Mesajlar (DM) · Kişiler · Komutlar.
- Boş sorguda son ziyaretler + komut listesi.
- Klavye: `↑`/`↓` gezinme, `Enter` seç, `Esc` kapat, focus tuzağı, açılışta girdiye focus,
  kapanışta tetikleyiciye dönüş.
- `aria-activedescendant` ile seçili sonuç duyurulur; liste `role="listbox"`, öğeler
  `role="option"`.
- Sonuç yokken tek satır muted metin.

### 5.3 Komutlar

İstemcide statik liste, **yetki kontrollü** (§5.1.8):

| Komut              | Etki                | Koşul          |
| ------------------ | ------------------- | -------------- |
| Durumu değiştir    | Presence alt menüsü | —              |
| Odak modunu başlat | 25 dk odak          | odak kapalıysa |
| Odak modunu bitir  | Odağı kapat         | odak açıksa    |
| Sunucu oluştur     | Mevcut modal        | —              |
| Ayarları aç        | Mevcut overlay      | —              |
| Bahsedilmelere git | `/mentions`         | —              |
| Gelen kutusuna git | `/inbox`            | —              |

Sunucu tarafı komutun etkisini **yine de** doğrular; palet listesi güvenlik sınırı değildir.

### 5.4 Güvenlik

- Sonuçlardaki `href` yalnız göreli yol; dış bağlantı paletten açılmaz.
- Arama sorgusu URL'e yazılmaz (gizlilik: `?q=` geçmişte kalır).
- Rate limit sunucu tarafında `search:command`; istemci 429'da kullanıcıya sakin bir mesaj gösterir
  ve isteği tekrarlamaz.

---

## 6. Arkadaş kartı bağlam menüsü

- Sağ tık → mevcut `ContextMenu`. Yeni menü bileşeni yazma.
- Öğeler: `Mesaj gönder`, `Profili gör`, `Sesli ara`.
- Klavye karşılığı: kart odaktayken `Shift+F10` / `ContextMenu` tuşu.
- Menü açıkken başka bir menü/overlay açılamaz (SPEC-MESAJLAR'daki "aynı anda iki panel açık
  kalmaz" kuralı burada da geçerli).

---

## 7. Performans

- Tüm mutation'lar `onMutate`/`onError`/`onSettled` üçlüsüyle; `refetch` yerine hedefli cache
  yazımı.
- Geri sayım tek interval; kart başına ayrı timer yok.
- Palet açılmadan sorgu çalışmaz.
- `Katıl` sırasında ekranın kalanı bloklanmaz.

---

## 8. Kapı

```bash
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
pnpm --filter @wizards/web exec playwright test e2e/specs/design
pnpm --filter @wizards/web e2e:a11y
```

**Geçme koşulları:**

- [ ] SPEC §4 tablosundaki 17 etkileşimin hepsi çalışıyor; her biri için e2e ya da render testi var.
- [ ] Optimistic yollar hata senaryosunda geri alıyor (test: uç 500 döndürünce satır geri geliyor).
- [ ] Odak durum makinesi saf fonksiyon olarak testli (4 geçiş).
- [ ] Geri sayım sekme gizlenip açıldığında doğru değeri gösteriyor (elle doğrulama, raporda).
- [ ] `useFocusCountdown` unmount'ta interval bırakmıyor (test: fake timer + cleanup).
- [ ] ⌘K klavye ile tam gezilebiliyor; `Esc` kapatıyor, focus tetikleyiciye dönüyor.
- [ ] Palet sonuçlarında dış bağlantı yok (test).
- [ ] Aynı anda iki overlay/menü açık kalmıyor.
- [ ] `Katıl` çift tıkta iki katılma isteği göndermiyor.

## 9. Tuzaklar

- Geri sayımı saniye sayacı olarak kurma — sekme uykuya girince kayar. Mutlak zamandan hesapla.
- Süre dolunca istemciden de `PATCH` gönderme; sunucu sweep'i ile yarışır ve `statusRestoreTo`
  iki kez uygulanabilir.
- Odak toggle'ını üst üste açmak süreyi sıfırlamamalı (Faz 3 §3.9 idempotentlik).
- `⌘K` dinleyicisini her bileşende kurma; tek global dinleyici.
- Palet açıkken `⌘K` tekrar basılırsa kapanmalı, ikinci palet açılmamalı.
- Arkadaş kartında sol tık DM açıyor, sağ tık menü açıyor — sağ tık DM'i de tetiklemesin.

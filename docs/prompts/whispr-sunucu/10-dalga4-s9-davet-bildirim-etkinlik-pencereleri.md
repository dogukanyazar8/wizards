# Ş9 — Davet · kanal bildirimleri · etkinlik pencereleri (Dalga 4)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §6.3, §6.4, §6.5.
> Bağımlılık: **Ş0**, **Ş3** (davet API), Ş8 (kabuk + parçalar). Paralel: Ş8, Ş10.

---

## 1. Davet bağlantısı — 480 (§6.3)

- Kopyalanabilir bağlantı satırı (`whispr.app/i/<kod>`, monospace) + `Kopyala` düğmesi.
- Altında **iki** kart: `SÜRE` (varsayılan 7 gün) ve `KULLANIM` (varsayılan Sınırsız), her biri
  chevron'lu → `OptionChipGroup` açar.
- **ROL alanı yok** (SPEC: tasarımdan kaldırıldı). Eklenmez.
- Altta success bilgi kutusu: "Bağlantı kopyalandı · 7 gün sonra kendiliğinden sona erer."
  (metin seçili süreye göre çekimlenir).
- **QR (K3):** bağlantı satırının altında QR bloğu — `lib/invites/qr.ts` (Ş3) ile canvas'a çizilir,
  renkler token'dan. `İndir` yerine yalnız görüntüleme; pano kopyalama bağlantı için çalışır.
- **Arkadaş seçerek davet (K3):** ikinci bir sekme/blok — arkadaş listesi + arama, seçilen kişiye
  hedefli davet (`targetUserId`). Gönderilen satır `Gönderildi` durumuna geçer.
- Uç: Ş3'ün `createServerInvite` yardımcısı. Yetkisiz kullanıcıya pencere açılmaz.

## 2. Kanal bildirimleri — 460 (§6.4)

- Üç radyo seçeneği: `Tüm mesajlar` · `Yalnızca bahsedilmeler` · `Sessiz`
  (ikon tonları sırasıyla primary / warning / danger).
- Altta `Mobil bildirimleri de sustur` anahtarı — `Sessiz` seçiliyken **açık** gelir.
- Ayak: `İptal` · `Kaydet`.
- Kaydedince kanal başlığındaki durum çipi ve zil rengi değişir (Ş6 ile aynı state kaynağı).
- Uç: mevcut `/api/v1/channels/[channelId]/notification-settings`.
  "Mobil bildirimleri de sustur"un sunucu karşılığı yoksa `TODO(api):` + tipli adapter.
- `role="radiogroup"` + ok tuşlarıyla gezinme.

## 3. Etkinlik oluştur — 560 (§6.5)

Sunucu ayarları › Etkinlikler › `Etkinlik oluştur` düğmesinden açılır (**pencere ayarların üstünde**,
K11).

- `ETKİNLİK ADI` + `Zorunlu` + `0/60` (K6), örnek: "Örn. Sürüm 2.4 canlı demo".
- `AÇIKLAMA` + `Opsiyonel` + `0/180` (K6), textarea 2 satır.
- Üç kolon (`1.35fr / 1fr / 1fr`): `TARİH` · `BAŞLANGIÇ` · `BİTİŞ`; her biri zorunlu
  (etiket yanında 5px danger nokta), ikonlu kutu, örnekler `18.08.2026` · `20:00` · `21:00`.
  Dolu alanın çerçevesi `primary/.5`.
- `KANAL / ODA` — "Etkinliğin gerçekleşeceği sunucu kanalı." Sunucunun kanalları çip olarak
  (yazı `#`, sesli hoparlör ikonu success).
- Ayak: zorunlular eksikken warning "Ad, tarih ve saat alanları zorunlu." ve **pasif** buton;
  tamamlanınca `tarih · başlangıç–bitiş · kanal` özeti. `İptal` · `Etkinlik oluştur`.
- Tarih/saat → `scheduledStartAt` / `scheduledEndAt` ISO'ya kullanıcının saat diliminde çevrilir;
  mevcut tarih yardımcıları kullanılır, yeni kütüphane eklenmez.
- Bitiş başlangıçtan önceyse alan hatası (sözleşmedeki `hasOrderedSchedule` mesajı).
- Uç: mevcut `POST /servers/[serverId]/events` (`CreateServerScheduledEventSchema`).
  `entityType` seçilen kanalın türünden türetilir (`VOICE` / `EXTERNAL`).

---

## Sınırlar

- Ayarlar bölümlerinin gövdesi Ş13'te; bu şerit yalnız pencereleri yazar.
- Yeni uç yazılmaz.
- Davet listesi/iptali ayarlar bölümünde (Ş13).

---

## Kabul kriterleri

- [ ] Davet penceresinde yalnız `Süre` ve `Kullanım` var — ROL alanı yok.
- [ ] QR çiziliyor, tema değişince renkleri değişiyor; hata yolunda pencere çalışmaya devam ediyor.
- [ ] Arkadaş seçerek davet gerçekten hedefli davet üretiyor; arkadaş olmayan listede yok.
- [ ] Bildirim penceresi üç seçenek + mobil anahtarı; `Sessiz`te anahtar açık geliyor;
      kaydedince başlık çipi ve zil rengi değişiyor.
- [ ] Etkinlik penceresi: 0/60 ve 0/180 sayaçları, üç zorunlu alan, kanal çipleri, eksikte pasif
      buton + warning, tamamlanınca özet.
- [ ] Bitiş < başlangıç reddediliyor.
- [ ] Üç pencere de `Esc` ile kapanıyor, focus tetikleyiciye dönüyor, focus tuzağı çalışıyor.
- [ ] Yeni hex yok; typecheck/lint/test yeşil.

## Rapor

`raporlar/s9-pencereler.md`

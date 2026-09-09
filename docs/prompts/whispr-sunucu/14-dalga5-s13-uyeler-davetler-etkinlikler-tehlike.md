# Ş13 — Üyeler · Davetler · Etkinlikler · Tehlike bölgesi (Dalga 5)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §8.6, §8.7, §8.8, §8.9.
> Bağımlılık: **Ş0**, **Ş1** (sahiplik devri), **Ş2** (ban/timeout), **Ş3** (davet), Ş9 (etkinlik
> penceresi), Ş11 (ayarlar kabuğu). Paralel: Ş11, Ş12.

---

## 1. Üyeler ve Moderasyon (§8.6)

- Arama kutusu ("Üye veya kullanıcı adı ara") + sağda `N / M üye` sayacı (filtreye göre canlı).
- Filtre çipleri: `Tümü` · `Üye` · `Moderatör` · `Admin` · `Sunucu Sahibi` · `Çevrimiçi` ·
  `Çevrimdışı`. Rol filtreleri **atanmış role**, son ikisi **presence**'a bakar.
  Süzme Ş2'nin `q` + `filter` parametreleriyle sunucu tarafında yapılır.
- `ToggleRow`: `Üyeler kullanıcı ekleyebilir` — "Kapalıyken yalnızca admin ve sahip davet
  gönderebilir." → `allowMemberAdds`.
- Üye satırı (`11px 14px`, `r16`, hover `border-color primary/.4`): avatar 36 + presence noktası,
  ad + tür rozeti (`Sahip` primary · `Admin` danger · `Üye`), `@kullanıcı`, rol açılır düğmesi
  (chevron), kesikli `+ Rol` düğmesi, sağda çıkarma düğmesi.
  **Sahibin çıkarma düğmesi pasif** (`opacity .3` + `aria-disabled` + neden metni).
- Rol atama/kaldırma: `UpdateWorkspaceMemberRolesSchema` ile mevcut uç.

**K3 eklentisi — moderasyon menüsü.** Üye satırındaki fazladan menü:
`Zaman aşımı ver` (süre seçenekleri: 60 sn · 5 dk · 10 dk · 1 sa · 1 gün · 1 hafta) ·
`Zaman aşımını kaldır` · `Sunucudan yasakla` (sebep + mesaj silme penceresi) ·
`Yasağı kaldır` (yasaklı listesinde).
Yetki: `TIMEOUT_MEMBERS` / `BAN_MEMBERS`. Sahibe uygulanamaz. Uçlar Ş2'de.
Zaman aşımlı üyenin satırında warning çipi (`Zaman aşımında · <kalan>`).
Yasaklı üyeler için bölümün altında `Yasaklılar (N)` katlanır listesi — kullanıcı, sebep, kim, ne
zaman, `Yasağı kaldır`.

SPEC'in "Ban, zaman aşımı ve ban kaldırma özellikleri bir sonraki fazda bu ekrana eklenecek."
bilgi notu **kaldırılır** (K3).

## 2. Davetler (§8.7)

**Yeni davet kartı** — üç `OptionChipGroup`:

- `Hedef kanal`: sunucunun yazı kanalları (varsayılan ilk).
- `Süre`: 1 saat · 12 saat · 24 saat · **7 gün** · 30 gün · Süresiz.
- `Kullanım sınırı`: 1 · 5 · **25** · 100 · 1000 · Sınırsız.

Ayraçtan sonra **canlı özet** `# <kanal> · <süre> · <kullanım>` ve `Davet oluştur` düğmesi.

**Mevcut davetler**: kod (monospace) + kanal çipi, alt satır oluşturan · süre, sağda kullanım çipi
(`3 / 25`, `12 / ∞`), `Kopyala` ve `İptal et` düğmeleri.

**K3 eklentisi:** kesikli "sonraki özellikler" çipleri **kaldırılır**, yerine gerçek yüzeyler:

- `QR kod` düğmesi → davet satırının QR'ını gösterir (Ş3'ün `renderInviteQr`'ı).
- `Arkadaş seçerek davet` → Ş9'daki hedefli davet akışını açar.
- `Bekleyen davetler (N)` katlanır liste → `?pending=1`; satırda hedef kullanıcı, kanal, kalan süre,
  `İptal et`.

Yetki: `MANAGE_INVITES`; yoksa bölüm render edilmez.

## 3. Etkinlikler (§8.8)

- Segment: `Yaklaşan` / `İptal edilen`; sağda `+ Etkinlik oluştur` → Ş9 penceresi.
- Etkinlik kartı: solda `52×56 r14 primary/.14` tarih kutusu (gün `600 19px`, ay `600 9.5px`),
  başlık `600 14.5px Outfit`, açıklama, altında üç çip: saat (saat ikonu) · kanal (success,
  hoparlör ikonu) · ilgilenen sayısı (kişi ikonu); sağda `Düzenle` ve `İptal et`.
- `Düzenle` aynı pencereyi dolu açar (`UpdateServerScheduledEventSchema`).
- `İptal et` etkinliği `CANCELLED` durumuna alır ve `İptal edilen` sekmesine taşır.
- `İptal edilen` sekmesi boşken: kesikli çerçeve, takvim ikonu 26, "İptal edilen etkinlik yok".
- Yetki: `MANAGE_EVENTS`.

## 4. Tehlike bölgesi (§8.9) — **yalnız sahip**

**Sahipliği devret** (warning tonu, `warning/.06` zemin, `warning/.35` çerçeve):

- Başlık + "Devir tamamlandığında sen Admin rolüne düşersin, sahiplik yetkileri seçtiğin üyeye geçer."
- `YENİ SAHİP` altında **sahip dışındaki** üyelerin radyo listesi (avatar + ad + `rol · @kullanıcı`),
  `role="radiogroup"` + ok tuşları.
- Onay anahtarı: "Sahipliği devrettiğimde bu işlemin geri alınamayacağını anlıyorum."
- Alt satır: üye seçilmemişse "Devretmek için bir üye seç."; onay kapalıysa "Devam etmek için onayı
  aç."; ikisi tamamsa "Sahiplik <ad> kullanıcısına geçecek."
- `Sahipliği devret` düğmesi **ancak ikisi de tamamken** aktif (warning dolgu).
- Uç: Ş1'in `transfer-ownership` ucu. Başarıda overlay kapanır, kullanıcı Admin görünümüne düşer
  ve sunucu detayı yeniden yüklenir.

**Sunucuyu sil** (danger tonu):

- Başlık + "Tüm kanallar, mesajlar, roller ve davetler kalıcı olarak silinir. Bu işlem geri alınamaz."
  - `yalnızca sahip` çipi.
- `ONAYLAMAK İÇİN SUNUCU ADINI YAZ` — input (placeholder = sunucu adı).
  Metin sunucu adına **birebir** eşitse çerçeve danger olur ve `Sunucuyu kalıcı olarak sil` düğmesi
  aktifleşir (danger dolgu + gölge); aksi halde `surface-tertiary` + `not-allowed`.
- Uç: mevcut `DELETE /servers/[serverId]` (`DeleteServerSchema`).
- Başarıda overlay kapanır, kullanıcı Ana Sayfa'ya yönlenir, ray listesi güncellenir.

---

## Sınırlar

- Sahiplik devri ve silme dışında hiçbir yıkıcı eylem eklenmez.
- Yeni uç yazılmaz (hepsi Ş1–Ş3'te).
- Etkinlik penceresinin gövdesi Ş9'da.

---

## Kabul kriterleri

- [ ] Üyeler: arama + 7 filtre çipi listeyi **gerçekten** süzüyor; sayaç `N / M üye` canlı;
      sahibin çıkarma düğmesi pasif ve nedenli.
- [ ] Zaman aşımı ver/kaldır ve yasakla/yasağı kaldır çalışıyor; sahibe uygulanamıyor;
      zaman aşımlı üyede warning çipi görünüyor; yasaklılar listesi doğru.
- [ ] Davetler: üç çip grubu özet satırına yansıyor; davet oluşuyor; kopyala/iptal çalışıyor.
- [ ] QR · arkadaş seçerek davet · bekleyen davetler **gerçek** çalışıyor; "yakında" çipi kalmadı.
- [ ] Etkinlikler: iki sekme, kart düzeni, düzenle/iptal, boş durum.
- [ ] Tehlike bölgesi yalnız sahibe render ediliyor (negatif test).
- [ ] Sahiplik devri: iki koşul tamam olmadan buton pasif; başarıda sahip değişiyor ve overlay
      kapanıyor.
- [ ] Sunucu silme: metin birebir eşleşmeden buton pasif; başarıda yönlendirme ve ray güncellemesi.
- [ ] Yeni hex yok; typecheck/lint/test yeşil.

## Rapor

`raporlar/s13-uyeler-davetler-tehlike.md`

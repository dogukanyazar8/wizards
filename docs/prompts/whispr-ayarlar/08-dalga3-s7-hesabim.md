# Dalga 3 · Ş7 — Hesabım bölümü (6 sekme · 35 satır · 5 özel blok · 3 riskli blok)

**Ön koşul:** Dalga 2 kapısı yeşil. **Paralel:** Ş8, Ş9, Ş10.

Referans kareler: `screens/04-ayarlar-profil.png`. Otorite `.dc.html` `SET[0]` dalı.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/settings/sections/account/*.tsx` (6 sekme dosyası)
- `apps/web/src/components/settings/blocks/profile-hero-card.tsx` (yeni)
- `apps/web/src/components/settings/blocks/connections-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/security-events-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/active-sessions-block.tsx` (yeni — `active-sessions-card` sarar)
- `apps/web/src/components/settings/blocks/badge-grid-block.tsx` (yeni — `account-badges-card` sarar)
- `apps/web/src/components/settings/risky/password-block.tsx` · `two-factor-block.tsx` · `delete-account-block.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-custom-block.tsx` (**yalnız kendi 5 anahtarı**)
- Her biri için `.test.tsx`

**Okunur, yazılmaz:** `lib/settings/tree.ts`, satır motoru, `lib/settings/security-client.ts`,
`components/settings/profile-avatar-field.tsx`, `account-data-controls.tsx`.

---

## Sekmeler

### 1. Profil

**Hero bloğu (tam genişlik, `fullWidth` — kendi içinde kırpar):**

- 132 px banner: `linear-gradient(120deg, H(primary,.45), H(primary,.14) 62%, H(primary,.3))`
  - alta doğru `H(surface-card)` geçişi. Kullanıcının `bannerUrl`'ü varsa gradyan yerine görsel,
    `bannerOffsetX/Y` odak noktasıyla.
- Sağ üstte `Banner değiştir` + kaldır düğmesi. **"Kırp / Yakınlaştır / Sıfırla" dizisi yok**
  (PROMPT §5) — kırpma dosya seçildikten sonra ayrı adımda.
- 80 px avatar, 5 px `H(surface-card)` halka + gölge, `margin-top:-42px`; sağ altta 17 px durum
  noktası, sol altta 28 px kamera düğmesi.
- Ad `600 18px display`, altında `@dogukan · dogukan@whispr.app`.
- Sağda durum pili (`H(tone,.15)`) + `Profilimi görüntüle`.
- Altta özel durum şeridi: emoji · metin · süre pili · temizle düğmesi.

**Hero canlı güncellenir:** `pn`, `pu`, `pp`, `ps`, `pe`, `px` yazıldıkça hero anında yansır
(kaydedilmeden). Değer kaynağı satır motorunun taslak state'i, sunucu yanıtı değil.

**Kimlik grubu** (not: `Bu alanlar profilinde herkese görünür.`):
`Görünen ad` · `Kullanıcı adı` (`@` önekli, açıklama `Bahsetmelerde ve davet bağlantılarında
kullanılır`) · `Zamirler` (`İsteğe bağlı`) · `Biyografi` (sayaçlı, 190).

Kullanıcı adı değişimi **30 günlük bekleme** kuralına tabi (`User.usernameChangedAt`);
bekleme sürüyorsa alan `disabled` ve açıklama kalan süreyi yazar.

**Durum grubu:** `Çevrimiçi durum` (renk noktalı menü: Çevrimiçi `--success` · Boşta `--warning` ·
Rahatsız Etmeyin `--danger` · Görünmez `--text-muted`) · `Özel durum` · `Durum emojisi`
(🎧 💬 🌙 📌 ☕) · `Özel durum ne zaman temizlensin`.

Durum menüsü ve kullanıcı barındaki durum **aynı kaynağı** yazar (`updatePresenceStatusAction`).

### 2. Hesap

**İletişim bilgileri:** `E-posta adresi` (`Doğrulandı` pili, `Değiştir`) ·
`Doğrulama e-postası` (`Son gönderim …`, `Yeniden gönder`) ·
`Telefon numarası` (`Doğrulanmadı`, `Değiştir` + `Kodu gönder` — **`disabled` + `TODO(api):`**, K5) ·
`Parola` (riskli blok).

**Parola bloğu:** mevcut parola tam genişlik, yeni parola + tekrarı iki kolon, yardım metni
`En az 10 karakter, bir sayı ve bir büyük harf gerekir.`, `İptal` + `Parolayı güncelle`.
`POST /api/v1/users/me/password` (Ş3).

**Bağlı hesaplar** (not: `Bağlı hesaplar profilinde görünür.`): GitHub · Spotify · Steam · Xbox.
Bağlı olanda `Kaldır`, olmayanda primary `Bağla`. **Dördü de `disabled` + `TODO(api):`** (K5);
`fetchConnections` adapter'ı okunur, uydurma endpoint çağrılmaz.
İkon zemini: GitHub `--primary`, Spotify `--success`, Steam `--warning`, Xbox `--info`.

### 3. Gizlilik

Dört grup: **Görünürlük** (profil / çevrimiçi durum menüleri + `Oynadığım oyunu göster`
**+ K9'un `Boşta sayılma süresi` satırı**) · **Mesaj ve istekler** (DM ve arkadaşlık isteği
menüleri + grup daveti ve okundu bilgisi anahtarları) · **İçerik** (`Hassas içerik filtresi`) ·
**Dil ve bölge** (dil segmenti, saat dilimi menüsü, tarih biçimi, saat biçimi).

Saat dilimi menüsü mevcut `AccountTimeZoneCombobox` mantığını kullanır ama **satır motorunun**
`SettingSelect`'i olarak çizilir (tek kontrol ekseni). `Otomatik · Europe/Istanbul` etiketi
`AUTO` değerinin i18n karşılığıdır.

Dil segmenti değiştiğinde `LocaleProvider` anında dönmeli; sayfa yenilenmemeli.

### 4. Güvenlik

**Giriş güvenliği** (not: `Bu işlemler otomatik kaydedilmez; her biri ayrı onay ister.`):

- `İki aşamalı doğrulama` — `Kurulu` / `Kurulu değil` pili + riskli blok:
  104 px QR (istemcide üretilir, sunucu resim göndermez), `Manuel kurulum anahtarı` 4'lü
  gruplanmış + `Kopyala`, altı haneli kod alanı + `Doğrula ve aç`.
  Kapatma **reauth** ister.
- `Kurtarma kodları` — `10 kod · 8 tanesi kullanılmadı`; `Görüntüle` (reauth) / `İndir` / `Yenile`.
- `Tüm cihazlardan çıkış yap` — danger; bu satır **bu cihaz dahil** herkesi kapatır (açıklaması
  öyle diyor), `revoke-others`'tan farklıdır.

**Son güvenlik etkinlikleri** — 3 satır, renk noktalı; `GET /users/me/security-events` (Ş3).
Metin i18n'den; sunucu Türkçe göndermiyor.

**Aktif oturumlar** (`3 oturum açık.`) — `Bu cihaz` pili olan satırda `H(success,.06)` zemin ve
kapat düğmesi **yok**; diğerlerinde 30 px X. Altında `Listeyi yenile` + `Diğerlerini kapat`.
`Diğerlerini kapat` mevcut oturumu **kapatmaz** (tuzak #13).

### 5. Rozetler

Grup başlığı `9 / 16 rozet kazanıldı` — **gerçek sayıdan** üretilir, sabit değil.
Beş kategori (Kimlik · Katkı · Aktivite · Ticaret · Etkinlik), her biri 4 kolonlu ızgara;
kazanılanda dolu yıldız + `H(primary,.14)` ikon zemini, kilitlide boş yıldız + soluk metin.
16 rozet adı SPEC §5.1'deki sırayla.

`account-badges-card` sarılır; **rozet açıklaması yok** (README notu) — `title` özniteliği de
konmaz, uydurma metin üretilmez.

Blok ilk açılışta iskeletle gelir (ağır bölüm, PROMPT §8).

### 6. Verilerim

`Hesap verilerimi dışa aktar` (`Son arşiv 24 Ağustos · 42 MB`, `Hazır` pili, `İndir` +
`Yeni arşiv oluştur`) — `account-data-controls` mantığı satır motoruna taşınır.

**Tehlikeli bölge:** `Hesabı sil` (danger zemin) + riskli blok: sahiplik uyarısı, parola,
doğrulama cümlesi `hesabımı kalıcı olarak sil`, `Vazgeç` + `Hesabı kalıcı olarak sil`.
Cümle **sunucuda** da denetlenir (Ş3).

---

## Kabul

- [ ] 6 sekme, 15 grup, 35 satır eksiksiz; sayım testi `tree.ts` ile uyuşuyor.
- [ ] Hero: 132 banner · 80 avatar · 5 halka · `-42` üst boşluk · 17 durum noktası · 28 kamera
      düğmesi; `Profilimi görüntüle` sağda durum pilinin yanında.
- [ ] Ad ve kullanıcı adı yazdıkça hero **canlı** güncelleniyor.
- [ ] `Kırp / Yakınlaştır / Sıfırla` düğme dizisi **yok**.
- [ ] Kullanıcı adı 30 günlük bekleme sürüyorsa alan `disabled` ve kalan süre yazılı.
- [ ] `@` öneki değere dahil değil.
- [ ] Biyografi sayacı `75 / 190` biçiminde ve sınırda `aria-invalid`.
- [ ] Telefon satırı ve 4 bağlı hesap satırı `disabled` + `TODO(api):`; **uydurma endpoint çağrısı yok**.
- [ ] Parola bloğu üç hata dalını gösteriyor; yardım metni birebir.
- [ ] 2FA bloğu QR'ı **istemcide** üretiyor; manuel anahtar 4'lü gruplu; kopyalama çalışıyor.
- [ ] `Diğerlerini kapat` mevcut oturumu kapatmıyor; `Bu cihaz` satırında X düğmesi yok.
- [ ] Güvenlik etkinlikleri metni i18n'den; renk tek başına anlam taşımıyor (nokta + metin).
- [ ] Rozet sayacı gerçek veriden; 16 rozet adı SPEC sırasında; **açıklama uydurulmamış**.
- [ ] Rozet ızgarası ilk açılışta iskeletle geliyor.
- [ ] Hesap silme cümlesi yanlışken düğme `disabled`.
- [ ] Aynı anda tek riskli blok açık.
- [ ] Açık ve koyu temada `screens/04-ayarlar-profil.png` ile karşılaştırma yapıldı, fark rapora yazıldı.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/08-s7-rapor.md`

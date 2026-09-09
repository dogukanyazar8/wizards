# PLAN — Whispr giriş · hesap oluşturma · kurtarma

Kaynak: `design_handoff/giris-kayit-paketi/` (SPEC §1–§13, referans bundle, 10 ekran görüntüsü).
Dal: `uat`. Ortak bağlam: `00-ortak-baglam.md`.

---

## 1. Kapsam

| Grup                   | Adet                  | Not                                      |
| ---------------------- | --------------------- | ---------------------------------------- |
| Web ekranı             | 10                    | SPEC'in 11'i eksi telefon doğrulama (K1) |
| Masaüstü penceresi     | 2 çizili + 8 devralan | 1040×720, çerçevesiz, 38px başlık çubuğu |
| Mobil ekran            | 3                     | SPEC'in 4'ü eksi telefon doğrulama (K1)  |
| Durum kartı            | 10                    | SPEC §7                                  |
| Hata gösterim seviyesi | 3                     | SPEC §8                                  |
| Etkileşim durum seti   | 10 bileşen × 5 durum  | SPEC §9                                  |
| i18n anahtarı          | ~150 çift             | SPEC §13                                 |

---

## 2. Dalgalar

### Dalga 1 — Temel (Ş1 kapı, ardından Ş2 ‖ Ş3)

| Şerit  | Konu                                                                                       | Dosya                                 |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Ş1** | Sözleşme · token · metrik sözlüğü · i18n · şifre politikası                                | `01-dalga1-s1-sozlesme-token-i18n.md` |
| **Ş2** | Kimlik backend: 2FA challenge · e-posta kodu · kilit · hız sınırı · sıfırlama              | `02-dalga1-s2-kimlik-backend.md`      |
| **Ş3** | Ortak UI parçaları: aurora · marka paneli · seçiciler · alan/düğme/hücre · 3 hata seviyesi | `03-dalga1-s3-ortak-parcalar.md`      |

Ş1 **bitmeden** Ş2 ve Ş3 başlamaz (tip, token ve metin sözlüğü ikisinin de girdisi).
Ş2 ve Ş3 birbirine dokunmaz: Ş2 yalnız `lib/` + `packages/db`, Ş3 yalnız `components/` + `globals.css`.

### Dalga 2 — Web ekranları (Ş4 ‖ Ş5 ‖ Ş6)

| Şerit  | Konu                                                  | Dosya                                        |
| ------ | ----------------------------------------------------- | -------------------------------------------- |
| **Ş4** | Giriş · 2FA · Yedek kod                               | `04-dalga2-s4-web-giris-2fa-yedek-kod.md`    |
| **Ş5** | Hesap oluştur                                         | `05-dalga2-s5-web-hesap-olustur.md`          |
| **Ş6** | E-posta doğrulama + şifre sıfırlama zinciri (5 ekran) | `06-dalga2-s6-web-dogrulama-ve-sifirlama.md` |

Üçü de yalnız kendi rota klasörüne yazar; ortak dosyaya (`auth-screen.tsx`, `globals.css`) **yazmaz**,
Ş3'ün bıraktığını tüketir. Ortak parçada eksik bulan şerit raporuna yazar, kendi kopyasını üretmez.

### Dalga 3 — Yüzeyler ve kapanış (Ş7 ‖ Ş8 ‖ Ş9)

| Şerit  | Konu                                                           | Dosya                                  |
| ------ | -------------------------------------------------------------- | -------------------------------------- |
| **Ş7** | Masaüstü kabuğu ve ölçek kademesi                              | `07-dalga3-s7-masaustu.md`             |
| **Ş8** | Mobil: Giriş · Hesap oluştur · 2FA                             | `08-dalga3-s8-mobil.md`                |
| **Ş9** | 10 durum kartı bağlama · a11y · parity kapısı · e2e · temizlik | `09-dalga3-s9-durumlar-a11y-parity.md` |

---

## 3. Bağlayıcı kararlar

| #       | Karar                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Gerekçe / etki                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **K1**  | **Telefon tamamen kapsam dışı.** Kayıt alanı yalnız e-posta kabul eder; SPEC §4.6 ve §6.4 telefon doğrulama ekranları kurulmaz. Alan etiketi `f_email` ("E-posta"), placeholder `ada@whispr.app`, algılama satırı `f_contact_ok` ("E-posta adresi algılandı") korunur — geometri, tipografi ve boşluklar SPEC §4.4/2 ile birebir aynıdır. `vp_*` ve `f_contact_phone` anahtarları sözlüğe **girer** ama `SKIPPED_BY_K1` listesinde tutulur; parity testi bu listeyi tanır. | Kullanıcı kararı. Depoda SMS/sesli arama sağlayıcı yok.                 |
| **K2**  | **2FA sunucu taraflı challenge.** `loginAction` kimlik bilgisini doğrular, 2FA açıksa oturum **açmaz**; Redis'te 5 dakikalık, tek kullanımlık, IP + User-Agent parmak izine bağlı opak challenge üretir ve `{ twoFactorRequired: true, challengeId }` döner. `/login/two-factor` yalnız kod + challenge gönderir. Parola istemcide tutulmaz, ikinci kez ağa çıkmaz.                                                                                                        | Kullanıcı kararı. `attempt-tracker.ts` Redis deseni hazır.              |
| **K3**  | **E-posta doğrulama 6 haneli koda geçer, link geriye uyumlu kalır.** Yeni `EmailVerificationCode` modeli + uçları; `/verify-email` rotası `token` sorgu parametresi varsa eski link sonucunu, yoksa kod ekranını render eder. İki yol da aynı doğrulama servisine bağlanır.                                                                                                                                                                                                | Kullanıcı kararı. Gönderilmiş linkler kırılmaz.                         |
| **K4**  | **Kaldırılanlar:** Discord sağlayıcı düğmesi (NextAuth sağlayıcısı kalır, UI'dan çıkar) · `AudienceSelector` + `RoleTabs` · `HeroSection` metin rotasyonu · mobil `Welcome` ekranı ve `MobileAuthStackParamList.Welcome` girdisi.                                                                                                                                                                                                                                          | Kullanıcı kararı. Hiçbiri sunucuya veri göndermiyordu.                  |
| **K5**  | **Auth yüzeyi kendi token katmanını kurar.** `globals.css` içinde `[data-auth-surface]` kökü SPEC §1.1 ve §1.2 üçlülerini birebir tanımlar (`--surface-inset` dahil). Hangi ürün teması seçili olursa olsun auth ekranları tasarımın renkleriyle çizilir. Renk yalnız `hsl(var(--token))` ile okunur; hex yazılmaz. Ürünün ölçülmüş `-soft` invaryantı ve `splash-contrast.test.ts` kapısı auth dışında **değişmez**.                                                      | Kullanıcı kararı. SPEC koyu teması ürünün 20+ koyu paletiyle uyuşmuyor. |
| **K6**  | **Auth tema seçicisi yalnız auth yüzeyini etkiler.** `☀`/`☾` seçimi `data-auth-theme` olarak auth kökünde yaşar ve cihazda (`localStorage`) hatırlanır; kullanıcının 20+ temalı global tercihi silinmez, oturum açılınca devralır.                                                                                                                                                                                                                                         | Kullanıcı kararı.                                                       |
| **K7**  | **`--desktop-titlebar-height` global 38px olur.** SPEC §5 değeri; beş hesaplama satırı zaten değişkenden okuyor. Ana ekran dikey alanı 4px azalır, ölçek testleri yeniden koşulur.                                                                                                                                                                                                                                                                                         | Kullanıcı kararı.                                                       |
| **K8**  | **Kullanıcı adı kuralı ürün değerinde kalır** (2–32, `a-zA-Z0-9_`). Tasarımın 3–20 / `a-z0-9._` metni ekranda görünmüyor; ipucu satırı (`whispr.app/@ada · bu ad herkese görünür`) ve öneri etiketleri değişmez. Görsel sapma **yok**.                                                                                                                                                                                                                                     | Kullanıcı kararı. Mevcut kullanıcı adları kırılmaz.                     |
| **K9**  | **Şifre politikası:** SPEC §4.4'ün dört kuralı (min 10 · büyük+küçük · rakam · sembol) hem istemcide hem sunucuda uygulanır; `Hesabı oluştur` ve `Şifreyi güncelle` **en az 3 kural** karşılanmadan etkinleşmez (SPEC §10). Mevcut hesapların **girişi** etkilenmez (`LoginCredentialsSchema` min 8 kalır).                                                                                                                                                                | SPEC §10 birebir.                                                       |
| **K10** | **Kayıtta şifre tekrar alanı yoktur** (SPEC §4.4: dört alan). `RegisterSchema.confirmPassword` düşer. Şifre sıfırlamada iki alan **kalır** (SPEC §4.7 "Yeni şifre" ekranı).                                                                                                                                                                                                                                                                                                | Tasarım.                                                                |
| **K11** | **Rota haritası** `00-ortak-baglam.md` §1'dedir ve bağlayıcıdır. "Bağlantı gönderildi" ve "Bağlantı yeniden gönderildi" **tek rotadır** (`/forgot-password/sent`), aradaki fark üç görsel değişimdir (SPEC §4.7).                                                                                                                                                                                                                                                          | Tasarım: aynı ekranın iki durumu.                                       |
| **K12** | **Metin otoritesi SPEC §13'tür.** Anahtarlar ürüne `auth.<ekran>.<parça>` biçiminde girer; eşleme tablosunu Ş1 üretir (`docs/prompts/whispr-giris-kayit/raporlar/s1-metin-eslemesi.md`) ve sonraki şeritler o tablodan okur. Yeni metin **uydurulmaz**; SPEC'te olmayan bir metin gerekirse şerit durur ve rapora yazar.                                                                                                                                                   | SPEC §12/9.                                                             |
| **K13** | **Alt bilgi:** web ve masaüstü **hesap oluştur** ekranında yoktur; diğer tüm web/masaüstü ekranlarında ve **her üç mobil ekranda** vardır (referans mobil kayıtta alt bilgiyi gösteriyor).                                                                                                                                                                                                                                                                                 | Ç1 çözümü.                                                              |
| **K14** | **Sağlayıcı işaretleri:** depodaki resmî Google/Microsoft/Apple SVG'leri (`social-login.tsx`) kullanılır, SPEC'in harf karoları kullanılmaz. Ölçü ve boşluk SPEC §4.8'den (22×22 kutu, köşe 6). Google **aktif**, Microsoft ve Apple `disabled` + `aria-disabled` + `Yakında` rozeti.                                                                                                                                                                                      | PROMPT.md açıkça istiyor.                                               |

---

## 4. Kabul kriterleri (SPEC §12 + paket ekleri)

1. Aurora her yüzeyde pencere kökünün ilk çocuğu; ayırıcıyı geçiyor, kolonlarda opak zemin yok.
2. Logo çubukları 3px genişlik / `17·25·34·24·18` yükseklik / 3px aralık ve hareketli; büyütme
   yalnız `scale()` (web 1.55 · masaüstü 1.2 · mobil başlık .95 · mobil satır içi .72).
3. Google aktif; Microsoft ve Apple `Yakında` rozetiyle devre dışı; Discord düğmesi yok.
4. Şifre güç göstergesi ve 2×2 kural listesi yazdıkça canlı güncelleniyor; skor→ton eşlemesi
   `0–1 danger · 2 warning · 3–4 success`.
5. Tema ve dil değişimi tüm auth ekranlarını anında etkiliyor; hiçbir metin sabit kodlanmamış.
6. Tüm durum metinleri `-soft` tonda ve zemin üzerinde en az 4.5:1.
7. Mobil dokunma hedefleri 44px'in altına düşmüyor.
8. Alt bilgi K13'e uyuyor.
9. Metinler SPEC §13 ile birebir aynı (`SKIPPED_BY_K1` hariç).
10. **(paket eki)** 2FA ekranına challenge'sız girilemiyor; challenge tek kullanımlık ve 5 dakikada
    düşüyor.
11. **(paket eki)** 5 başarısız girişte hesap 15 dakika kilitleniyor; kalan deneme sayacı ve kalan
    süre ekranda SPEC metinleriyle görünüyor.
12. **(paket eki)** Şifre güncellendiğinde diğer oturumlar kapanıyor ve kapatılan cihaz sayısı
    `rps_meta` bandında gerçek değerle yazıyor.
13. **(paket eki)** `prefers-reduced-motion: reduce` altında aurora · ışıma · imleç · spinner duruyor;
    düzen ve renk değişmiyor.

---

## 5. Riskler

| Risk                                                                       | Etki       | Önlem                                                                                                                         |
| -------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| K7 (38px) ana ekran ölçek testlerini kırar                                 | Orta       | Ş7 `pnpm --filter @wizards/web test` tamamını koşar, kırılan snapshot'ları düzeltir                                           |
| `modern-*` sınıflarının silinmesi başka yüzeyi etkiler                     | Orta       | Ş9 silmeden önce kullanım taraması yapar; auth dışında kullanılan sınıf **silinmez**                                          |
| NextAuth `authorize` challenge dalı yanlış kurulursa parolasız giriş açığı | **Yüksek** | Ş2: challenge yalnız Redis'ten tüketilir, tek kullanımlıktır, IP+UA parmak izi eşleşmezse reddedilir; negatif testler zorunlu |
| `EmailVerificationCode` kaba kuvvete açık                                  | Yüksek     | 6 hane + 5 yanlış denemede kod iptali + IP/hesap bazlı hız sınırı; kod hash'lenerek saklanır                                  |
| Auth token katmanı (K5) ürün temalarıyla çakışır                           | Düşük      | `[data-auth-surface]` kapsamı yalnız auth rotalarına konur, kapanış testi kapsam dışına sızmadığını doğrular                  |
| Mobil `Welcome` kaldırılınca derin bağlantı kırılır                        | Düşük      | Ş8 `Welcome` rotasına giden her çağrıyı tarar ve `Login`'e yönlendirir                                                        |

# Başlatma promptları — Whispr giriş · hesap oluşturma · kurtarma

Her şerit için hazır prompt. **Sırayla** kullan: Dalga 1'de önce Ş1 tek başına, sonra Ş2 ‖ Ş3;
Dalga 2'nin üç şeridi paralel; Dalga 3'ün üç şeridi paralel (Ş9 en son biter).

Ortak ön ek — **her prompta yapıştır**:

```
Dal: uat. Kaynak tasarım: design_handoff/giris-kayit-paketi/
(SPEC.md · referans.html · ekranlar/ · PROMPT.md · README.md).
Otorite sırası: SPEC.md > referans.html > ekranlar/*.png > PROMPT.md.
Önce docs/prompts/whispr-giris-kayit/00-ortak-baglam.md ve PLAN.md §3 (K1-K14) oku, sonra kendi
şerit dosyanı oku ve harfiyen uygula. Bir ölçüden emin olmadığında SPEC'in ilgili paragrafına bak,
tahmin etme; SPEC'te yoksa dur ve rapora yaz.
Renk yalnız hsl(var(--token)); hex, rgb() ve yeni tema sınıfı üretme. Metin yalnız i18n
anahtarından; sabit TR/EN dize bırakma. Ölçü yalnız AUTH_METRICS / mobileAuthMetrics sözlüğünden.
Tasarımın dışına çıkma; çıkman gereken bir yer bulursan uygulama, rapora yaz.
Bitince docs/prompts/whispr-giris-kayit/raporlar/ altına raporunu yaz.
```

---

## Dalga 1

### Ş1 — Sözleşme · token · metrik · i18n (kapı, tek başına)

```
docs/prompts/whispr-giris-kayit/01-dalga1-s1-sozlesme-token-i18n.md dosyasını uygula.
@wizards/types içinde RegisterSchema'yı (displayName ekle, confirmPassword kaldır),
LoginSchema'yı (twoFactorCode çıkar) ve yeni TwoFactorChallengeSchema / BackupCodeChallengeSchema /
EmailVerificationCodeSchema sözleşmelerini kur. auth-password-policy.ts ile SPEC §4.4'ün dört
kuralını tek kaynağa al. globals.css'e [data-auth-surface] token katmanını (K5) ve
--desktop-titlebar-height: 38px (K7) yaz; global :root ve html.theme-* bloklarına DOKUNMA.
lib/auth/metrics.ts (AUTH_METRICS) ve status-catalog.ts sözlüklerini SPEC'ten kur.
SPEC §13'ün ~150 metin çiftini tr.ts + en.ts + mobile-copy.ts'e taşı ve
raporlar/s1-metin-eslemesi.md eşleme tablosunu üret. Mobil tarafta mobileAuthMetrics ve
redesignAuthLight/Dark'ı SPEC §1/§6 değerlerine çek. Kırılan çağrı yerlerini derlenebilir hale
getir. UI YAZMA.
```

### Ş2 — Kimlik backend (Ş1 bitince, Ş3 ile paralel)

```
docs/prompts/whispr-giris-kayit/02-dalga1-s2-kimlik-backend.md dosyasını uygula.
Yalnız lib/**, app/api/**, packages/db/** altına yaz; components/ ve globals.css'e DOKUNMA.
1) login-lockout.ts: 5 deneme / 15 dk (attempt-tracker üstünde, hesap + IP iki sayaç).
2) login-challenge.ts: Redis'te 5 dk TTL, tek kullanımlık, IP+UA parmak izine bağlı opak
   challenge; loginAction'ı twoFactorRequired döndürecek şekilde yeniden kur; NextAuth
   authorize'a challengeTicket dalını ekle ve 5 negatif güvenlik testini yaz (parolasız giriş
   mümkün olmamalı).
3) EmailVerificationCode modeli + servisi: 6 hane, 10 dk, hash'li saklama, 5 denemede iptal,
   60 sn yeniden gönderme kilidi, 3 istek/2 dk hız sınırı. Migration YALNIZ
   packages/db/prisma/rebaseline-migrations/ altına.
4) Şifre sıfırlama: TTL 60 -> 30 dk, yeniden gönderme kilidi, güncelleme sonrası oturum
   kapatma ve KAPATILAN CİHAZ SAYISINI döndürme.
5) registerAction: displayName, confirmPassword yok, min 10 + 3 kural; username-availability ucu.
Her modül için birim testi. Raporun Dalga 2'nin tek backend sözleşmesi olacak: her eylemin
girdi/çıktı status değerlerini tablo halinde yaz.
```

### Ş3 — Ortak UI parçaları (Ş1 bitince, Ş2 ile paralel)

```
docs/prompts/whispr-giris-kayit/03-dalga1-s3-ortak-parcalar.md dosyasını uygula.
Yalnız components/auth/** ve globals.css auth bloğuna yaz; app/(auth)/** sayfalarına ve
lib/auth/** içine DOKUNMA.
AuthScreenLayout + AuthAurora (6 ton) + AuthBrandPanel (SPEC §3.3 tablosu birebir) +
ThemeLanguageControls (K6: seçim yalnız auth yüzeyini etkiler, next-themes'e yazma) +
FooterSecurity kabuğunu kur. app/(auth)/layout.tsx içindeki muafiyet dalını kaldır.
Form ilkelerini SPEC §4 ortak tablosu ve §9'un beş durumuyla kur: TextInput, PasswordInput,
PrimaryButton, SecondaryButton, AuthLink, AuthDivider, AuthCheckbox, SocialAuthButtons (K14:
Google aktif, MS/Apple disabled + Yakında rozeti, Discord YOK), CodeInput (yapıştırma dağıtımı +
Backspace + one-time-code), PasswordStrength, TurnstileRow, SuggestionChip, SuccessTile,
CountdownPill. SPEC §8'in üç hata seviyesini ve §7'nin kart kabuğunu bırak.
prefers-reduced-motion kuralını yaz: yalnız animation kapanır, renk ve düzen değişmez.
HeroSection rotasyonunu, AudienceSelector ve RoleTabs'ı kaldır. modern-* sınıflarını SİLME,
kullanım yerlerini rapora yaz. EKRAN YAZMA.
```

---

## Dalga 2 (Ş4 ‖ Ş5 ‖ Ş6)

### Ş4 — Web: Giriş · 2FA · Yedek kod

```
docs/prompts/whispr-giris-kayit/04-dalga2-s4-web-giris-2fa-yedek-kod.md dosyasını uygula.
Yalnız app/(auth)/login/** altına yaz; components/auth/** ve lib/auth/** DEĞİŞMEZ.
Ş3'ün bileşenlerini ve Ş2'nin eylem sözleşmesini (raporlar/s2-kimlik-backend.md) tüket.
/login (SPEC §4.1), /login/two-factor (§4.2), /login/backup-code (§4.3) ekranlarını kur.
Giriş dönüşlerinin 8 status değerini seviye 1/2/3 gösterimine SPEC §8'e göre bağla:
credentials -> yalnız şifre alanı kırmızı + remember satırının sağında "3 deneme kaldı";
accountLocked ve accountSuspended -> formu gizleyen blok panel.
challengeId URL'e YAZILMAZ, sessionStorage'da taşınır; challenge yoksa /login'e dön.
RoleTabs'ı, satır içi 2FA alanını ve AUTH_ERROR_MESSAGES sabitini kaldır; masaüstü OAuth
kablolamasını KORU. Ekran testlerini yaz.
```

### Ş5 — Web: Hesap oluştur

```
docs/prompts/whispr-giris-kayit/05-dalga2-s5-web-hesap-olustur.md dosyasını uygula.
Yalnız app/(auth)/register/** altına yaz.
SPEC §4.4'ün 8 maddesini sırayla kur: iki kolonlu grid (Ad Soyad + Kullanıcı adı, h44) + ipucu,
e-posta alanı + algılama satırı (K1: telefon dalı YOK, etiket f_email), Göster/Gizle'li şifre
alanı, güç çubuğu + 2x2 kural listesi, Turnstile satırı (gerçek widget arkada), şartlar onayı,
birincil düğme + Giriş yap bağlantısı. Form sütunu 424px, dolgu 0 56px, ALT BİLGİ YOK (K13).
Düğme kapısı: min 10 karakter + en az 3 kural + şartlar + Turnstile (K9).
Kullanıcı adı onBlur'da sunucuya sorulur; alınmışsa uyarı biçimi + üç öneri etiketi (durum 4).
REGISTER_COPY sabitini ve confirmPassword alanını kaldır. Ekran testlerini yaz.
```

### Ş6 — Web: Doğrulama + şifre sıfırlama zinciri

```
docs/prompts/whispr-giris-kayit/06-dalga2-s6-web-dogrulama-ve-sifirlama.md dosyasını uygula.
Yalnız app/(auth)/verify-email/**, forgot-password/**, reset-password/** altına yaz.
/verify-email iki modlu olsun (K3): ?token= varsa eski link sonucu, yoksa 6 haneli kod ekranı
(SPEC §4.5) - geri sayım pill'i ve "Tekrar gönder · 00:42".
Şifre sıfırlama zincirinin beş ekranını SPEC §4.7'ye göre kur. "Bağlantı gönderildi" ve
"Bağlantı yeniden gönderildi" TEK rotadır (/forgot-password/sent); yeniden gönderimde tam olarak
üç şey değişir: aurora ikinci radyali --success/.16, açıklamanın altına success tonunda bant
(karo glifi ↻, ✓ DEĞİL), ve bağlantının yerini white-space:nowrap geri sayım pill'i alır.
"Şifre güncellendi" akışın tek ortalanmış ekranıdır; bilgi bandındaki cihaz sayısı Ş2'den gelen
GERÇEK sayıdır, 0 ise band gösterilmez. Ekran testlerini yaz.
```

---

## Dalga 3 (Ş7 ‖ Ş8 ‖ Ş9)

### Ş7 — Masaüstü

```
docs/prompts/whispr-giris-kayit/07-dalga3-s7-masaustu.md dosyasını uygula.
38px sürüklenebilir başlık çubuğunu (solda 600 11px Whispr, sağda üç 38x28 kutu, düğmeler
no-drag) Tauri pencere eylemlerine bağla; Tauri API yoksa render etme.
AuthSurfaceProvider surface="desktop" bağlamını kur; bileşenlerin içine isDesktop koşulu YAZMA,
hepsi AUTH_METRICS.desktop dalını okusun. SPEC §5 ölçek tablosunun her satırını uygula
(panel 376, form 352 / kayıt 392, başlık 25, alan h42-44, düğme h46, sağlayıcı h42, seçici h28,
alt bilgi 56/22, aurora inset -32% 16s).
K7 sonrası tüm web testlerini koş ve --desktop-titlebar-height değişiminin kırdığı testleri onar.
.auth-canvas / .auth-frame kurallarını yeni kabuğa göre düzelt veya kaldır.
```

### Ş8 — Mobil

```
docs/prompts/whispr-giris-kayit/08-dalga3-s8-mobil.md dosyasını uygula.
Yalnız apps/mobile/**.
MobileAuthStackParamList'ten Welcome'ı kaldır, TwoFactor ve BackupCode ekle, initialRoute Login
olsun; Welcome'a giden her çağrıyı tara ve çevir. Welcome dosyalarını kullanım taramasından sonra
sil. SPEC §6'nın üç ekranını kur: Giriş (74px halka + scale(.95) logo, başlık 27, kısa sağlayıcı
etiketleri), Hesap oluştur (satır içi scale(.72) logo + Whispr 19px, dört alan ALT ALTA, alt bilgi
VAR - K13), 2FA kodu (36px geri satırı + altı eşit hücre flex:1 x 62). BackupCode ekranı 2FA
kabuğunu ve web §4.3 içeriğini kullanır.
Tüm ölçüler mobileAuthMetrics'ten; dokunma hedefi 44'ün altına düşmesin. Tema seçimi yalnız auth
yüzeyini etkiler (K6). auth-profile-type-selector'ı kaldır. Testleri güncelle/yaz.
```

### Ş9 — Durumlar · a11y · parity · temizlik (kapanış)

```
docs/prompts/whispr-giris-kayit/09-dalga3-s9-durumlar-a11y-parity.md dosyasını uygula.
SPEC §7'nin 10 durum kartını içerikle bağla ve gerçek akışa tak (tablo dosyada); durum 10 NÖTR
tonda, doygun renk yalnız zemin/kenar/nokta, metin her zaman -soft.
/dev/auth-states iç galerisini kur (yalnız production dışı): 10 kart + 3 hata seviyesi +
10 bileşenin 5 durumu.
SPEC §11'in 9 erişilebilirlik maddesini teste bağla (role=alert, aria-invalid/describedby,
one-time-code, aria-disabled + Yakında erişilebilir adda, radiogroup/menu klavye gezinmesi,
focus-visible, reduced-motion, tek h1, kontrast >= 4.5:1).
lib/auth/parity.test.ts ile PLAN §4'ün 13 kriterini kapıya bağla; ayrıca AUTH_METRICS dışından
çıplak px ve hex/rgb renk taraması yap - bulursan kapıyı düşür.
E2E'yi apps/web/e2e/specs/auth/ altına yaz; koşamazsan rapora "koşulamadı" yaz, "geçti" YAZMA.
Ölü kodu temizle: modern-* sınıflarından yalnız auth'a özel olanlar, auth-reference-* kalıntıları,
kullanımı sıfır bileşenler. Kullanılmayan i18n anahtarlarını SİLME, listele.
Son olarak raporlar/PAKET-OZETI.md yaz: dokuz şeridin özeti + tasarımdan bilinçli sapmaların
(K1, K7, K8, Ç1-Ç6) tam listesi ve gerekçeleri.
```

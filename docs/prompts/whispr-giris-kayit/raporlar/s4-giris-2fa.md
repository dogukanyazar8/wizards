# Ş4 — Web: Giriş · İki adımlı doğrulama · Yedek kod (Dalga 2)

Durum: **tamamlandı.** Dal: `uat`. Commit yok.

Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §4.1, §4.2, §4.3, §4.8, §8, §9, §11.
Girdi: `raporlar/s2-kimlik-backend.md` (eylem sözleşmesi), `raporlar/s3-ortak-parcalar.md` (bileşenler).

---

## 1. Kurulan ekranlar

| Rota                 | Dosya                                                 | SPEC |
| -------------------- | ----------------------------------------------------- | ---- |
| `/login`             | `app/(auth)/login/login-client.tsx`                   | §4.1 |
| `/login/two-factor`  | `app/(auth)/login/two-factor/two-factor-client.tsx`   | §4.2 |
| `/login/backup-code` | `app/(auth)/login/backup-code/backup-code-client.tsx` | §4.3 |

Üçü de `AuthScreenLayout` üstünde; marka paneli, aurora, dil/tema seçici ve alt bilgi kabuktan
geliyor.

### 1.1 SPEC §4.1 madde madde

Eyebrow → başlık → açıklama → e-posta → şifre (etiket satırında `Şifremi unuttum`) →
`Beni hatırla` (+ sağında deneme sayacı) → birincil düğme → `veya` ayırıcısı → üç sağlayıcı →
`Hesabın yok mu? Hesap oluştur`. Sıra teste bağlandı.

### 1.2 Durum → gösterim eşlemesi

| Sunucu `status`         | Seviye | Ekran                                                                                                                                          |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `credentials`           | 1      | Yalnız şifre alanı kırmızı + `E-posta ya da şifre eşleşmiyor`; e-posta değeri korunur; `Beni hatırla` satırının sağında `{count} deneme kaldı` |
| `rateLimit` · `network` | 2      | Form üstü bant (`AuthLevelTwoBanner`)                                                                                                          |
| `accountLocked`         | 3      | Form gizlenir; blok panel + canlı `Kalan süre 14:32` + `Şifremi sıfırla`                                                                       |
| `accountSuspended`      | 3      | Blok panel + `Referans · WSP-…` (referans yoksa bant çizilmez)                                                                                 |
| `twoFactorRequired`     | —      | `/login/two-factor`                                                                                                                            |

Aurora tonu duruma göre değişiyor: seviye 1 → `danger-field`, seviye 3 → `danger-block`
(SPEC §3.1 son madde).

### 1.3 İki adımlı doğrulama

- Challenge kimliği **URL'e yazılmıyor**; `sessionStorage` üstünden taşınıyor
  (`challenge-transport.ts`) ve `router.replace` kullanıldığı için geri tuşu formu geri getirmiyor.
- Challenge yoksa ekran mount olur olmaz `/login`'e dönüyor.
- Altı hane girilince form **otomatik gönderilmiyor**; düğme etkinleşiyor.
- Yanlış kod: altı hücre kırmızı + kalan deneme. Kalan deneme gelmiyorsa challenge düşmüş
  demektir (süre doldu ya da üçüncü yanlış) → sekme temizlenir, `/login`.
- `Yedek kod ile giriş yap` challenge'ı koruyarak `/login/backup-code`'a gider;
  `Giriş ekranına dön` sekmeyi temizler.

### 1.4 Yedek kod

Tek alan h52 / `600 18px Outfit` / `letter-spacing:.14em`, placeholder `7QF4-2KDX-9M`.
Görüntü maskesi 4-4-2, sunucuya **normalize** değer gider (büyük harf, ayraçsız) — kullanıcı
tireli, tiresiz ya da boşluklu yapıştırsa da kod tutar.

---

## 2. Kaldırılanlar (K4)

`RoleTabs` · `getLoginRoleHint` · `selectedRole` · `AUTH_ERROR_MESSAGES` · `showTwoFactorPrompt`
ve satır içi 2FA alanı · `LoginCard` / `LoginPage` sarmalayıcıları · `SocialLogin`.

**Korunanlar:** masaüstü OAuth el sıkışması (`buildDesktopOAuthStartUrl`,
`DesktopOAuthPendingDialog`, `isWhisprDesktopRuntime`) ve masaüstü açılış splash'ı — yalnız görsel
dilleri kabuğun bileşenlerine taşındı.

## 3. Yeni ortak parçalar

Üç ekran (ve Dalga 2'nin diğer iki şeridi) aynı iki şeye ihtiyaç duyduğu için ortak katmana
kondu — üç kopya yerine tek kaynak:

| Dosya                                  | İş                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `lib/auth/countdown.ts`                | `formatCountdown(ms)` → `mm:ss`. SPEC dört yerde bu biçimi istiyor.                      |
| `components/auth/auth-status-view.tsx` | `AuthLevelTwoBanner` (seviye 2 bandı), `useCountdown` (canlı sayaç), `resolveAuthLevel`. |

## 4. Testler

`app/(auth)/login/login-screen-contract.test.ts` — 15 test: SPEC §4.1 sırası · etiket satırındaki
`Şifremi unuttum` · deneme sayacının yeri · yalnız şifre alanının kırmızıya dönmesi · blok panel ·
**challenge'ın URL'e yazılmaması** · challenge'sız ekranların `/login`'e dönmesi · otomatik gönderim
olmaması · §4.2 ve §4.3 parça listeleri · kaldırılan eski parçalar · masaüstü OAuth kablolamasının
durması · **hiçbir ekranda sabit metin düğümü olmaması** · yedek kod maskesi · dört geri sayım biçimi.

Regresyon: `app/(auth)/login` + `components/auth` + `lib/auth` + auth metin testi → **308/308 ✅**.
`pnpm --filter @wizards/web typecheck` → Ş4 tarafında **0 hata**.

**Ekranlar gerçek render edilerek test edilmedi.** Web'in node test kabuğu `renderToStaticMarkup`
kullanıyor ve bu üç bileşen `useRouter` ile sunucu eylemlerine bağlı; yönlendirici olmadan render
edilemiyorlar. Doğrulama kaynak düzeyinde yapıldı, canlı çizim Ş9'un e2e'sine kaldı.

## 5. Kararlar ve sapmalar

1. **Askı bloğunda `İtiraz gönder` düğmesi yok.** SPEC §7/10 iki eylem gösteriyor. İtiraz ucu
   üründe var (`/api/v1/moderation/appeal`) ama **oturum açmış yasaklı kullanıcı** istiyor
   (`requireBannedApiUserId`); giriş ekranı tam da o oturumu vermeyi reddettiği yer, yani oradan
   ulaşılamıyor. Web'de itiraz formu da yok. Ölü bir düğme koymaktansa blok yalnız çalışan eylemi
   (`Kuralları oku` → `/terms`) taşıyor. **Eksik yüzey:** yasaklı kullanıcı için itiraz ekranı.
2. **Turnstile kapısı yapılandırmaya bağlı.** SPEC §4.1'de görünür bir Turnstile satırı yok ama
   `loginAction` token istiyor; widget `sr-only` içinde çalışıyor ve token gelmeden düğme
   açılmıyor. Site anahtarı tanımlı değilse (yerel geliştirme) kapı devre dışı — aksi hâlde ekran
   tamamen kullanılamaz olurdu.
3. **`emailNotVerified` ayrı bir ekran davranışı almadı.** Ş2 bu durumu jenerik kimlik hatası
   olarak döndürüyor (SPEC'te giriş ekranı metni yok). Yanıt `email` taşıyor; doğrulama ekranına
   yönlendirme kararı Ş6'ya ait.
4. **`rememberDevice` gönderiliyor ama kalıcı değil.** Ş2'nin raporundaki borç: cihaz güveni için
   tablo açılmadı. Kutu SPEC gereği ekranda duruyor ve değeri sunucuya gidiyor.

## 6. Sonraki şeritler için borç

1. **`login-page.tsx` · `login-card.tsx` · `theme-toggle.tsx`** artık yalnız `/register` tarafından
   kullanılıyor; Ş5 kayıt ekranını taşıyınca üçü de ölür ve Ş9 siler.
2. **E2E yardımcıları kontrol edilmeli.** `e2e/helpers/auth.ts` `data-testid="login-form"`,
   `input[name="email"]`, `input[name="password"]` seçicilerini kullanıyor — üçü de korundu.
   Ama iki adımlı doğrulama artık ayrı rotada; 2FA'lı kullanıcıyla giriş yapan bir senaryo varsa
   Ş9'da güncellenmeli.
3. **Askı için itiraz yüzeyi** (madde 5/1) ürün kararı gerektiriyor.

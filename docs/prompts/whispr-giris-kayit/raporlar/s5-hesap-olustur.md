# Ş5 — Web: Hesap oluştur (Dalga 2)

Durum: **tamamlandı.** Dal: `uat`. Commit yok.

Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §4.4, §4.8, §8, §9, §10, §11.
Kararlar: `PLAN.md` §3 (K1 · K8 · K9 · K10 · K13).

---

## 1. Kurulan ekran

| Rota        | Dosya                                                           |
| ----------- | --------------------------------------------------------------- |
| `/register` | `app/(auth)/register/page.tsx` (sunucu) + `register-client.tsx` |

Sayfa ikiye ayrıldı: sunucu tarafı oturumu kontrol edip açık oturumda `/` sayfasına yönlendiriyor,
istemci formu taşıyor. Eskiden tek bir `"use client"` sayfaydı.

Kabuk `AuthScreenLayout variant="register"`: form sütunu 424px, kolon dolgusu `0 56px`,
**alt bilgi yok** (K13).

## 2. SPEC §4.4 madde madde

| #   | SPEC                                                        | Durum                                                                             |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | İki kolonlu grid `Ad Soyad` + `Kullanıcı adı` (h44) + ipucu | ✓ `fieldSize="compact"` × 2, `auth.register.usernameHint`                         |
| 2   | Tek iletişim alanı + algılama satırı                        | ✓ **yalnız e-posta** (K1); satır `E-posta adresi algılandı`, `aria-live="polite"` |
| 3   | Şifre + `Göster`/`Gizle`                                    | ✓ `PasswordInput`                                                                 |
| 4   | Güç göstergesi                                              | ✓ `AuthPasswordStrength`, skor paylaşılan `evaluatePasswordStrength`'ten          |
| 5   | 2×2 canlı kural listesi                                     | ✓ aynı bileşen                                                                    |
| 6   | Turnstile satırı                                            | ✓ `AuthTurnstileRow`; gerçek widget `sr-only` içinde arkada                       |
| 7   | Şartlar onay kutusu                                         | ✓                                                                                 |
| 8   | Birincil düğme + `Hesabın var mı? Giriş yap`                | ✓                                                                                 |

**Algılama satırı yer kaplamaya devam ediyor** (rengi şeffaflaşıyor): görünüp kaybolurken formun
düzeni zıplamıyor — SPEC §4.4/2'nin geometrisi sabit kalıyor.

## 3. Etkinleşme kapısı (SPEC §10, K9)

`displayName` ≥ 2 · `username` ≥ 2 · geçerli e-posta · `meetsPasswordPolicy(password)`
(min 10 **ve** en az 3 kural) · şartlar onaylı · Turnstile hazır.

Turnstile koşulu yapılandırmaya bağlı: site anahtarı yoksa (yerel geliştirme) kapı devre dışı,
aksi hâlde ekran kullanılamaz olurdu — Ş4'teki aynı gerekçe.

## 4. Durumlar

| Sunucu `status`             | Gösterim                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `usernameTaken` (durum 4)   | Kullanıcı adı alanı uyarı biçimi + üç öneri etiketi; etikete tıklayınca alan dolar ve uyarı düşer |
| `emailRegistered` (durum 6) | E-posta alanı uyarı biçimi + `Giriş yap` / `Şifremi sıfırla` bağlantıları                         |
| `passwordWeak` (durum 5)    | Şifre alanı uyarı biçimi + `İki kural daha karşılanmalı`                                          |
| `rateLimit` · `network`     | Form üstü bant (`AuthLevelTwoBanner`)                                                             |

Kullanıcı adı müsaitliği alan bırakıldığında `POST /api/v1/auth/username-availability` ile
soruluyor; ağ hatasında **sessizce geçiliyor** (sunucu kayıtta yine doğruluyor, kullanıcıyı
yazarken bir bantla durdurmanın karşılığı yok).

## 5. Başarı yolu

Kayıt başarılıysa adres `sessionStorage`'a yazılıyor (`lib/auth/pending-verification.ts`) ve
`/verify-email?next=…` açılıyor. **Adres URL'e yazılmıyor**: e-posta kişisel veridir, sorgu dizesi
tarayıcı geçmişine, sunucu günlüklerine ve `Referer` başlığına düşer.

Eski ekranın satır içi "e-postanı kontrol et" durumu ve yeniden gönderme düğmesi kalktı; o iş
artık doğrulama ekranının (Ş6).

## 6. Kaldırılanlar

`REGISTER_COPY` sabit TR/EN metin bloğu · `RoleTabs` · `LoginCard` / `LoginPage` sarmalayıcıları ·
`confirmPassword` alanı ve ikinci `PasswordInput` · `normalizeNameAsUsername` ile ad→kullanıcı adı
türetmesi (artık iki ayrı alan) · satır içi doğrulama durumu.

## 7. Testler

`app/(auth)/register/register-screen-contract.test.ts` — 13 test: SPEC §4.4 sırası · iki kolonlu
gridin iki `compact` alanı · şifre tekrar alanının olmaması · yalnız e-posta kabulü (telefon
anahtarlarının hiç okunmaması) · algılama satırının yer ayırması · alt bilginin gizlenmesi ·
gönderim kapısının altı koşulu · kullanıcı adı sorgusu ve öneri etiketleri · durum 6'nın iki
bağlantısı · adresin URL'e yazılmaması · eski parçaların düşmesi · sabit metin olmaması ·
gönderim kapısının paylaşılan politikayla tutarlılığı.

Regresyon: `app/(auth)` + `components/auth` + `lib/auth` + auth metin testi → **321/321 ✅**.
`pnpm --filter @wizards/web typecheck` → Ş5 tarafında **0 hata**.

Ş4'teki sınırlama burada da geçerli: ekran `useRouter` ve sunucu eylemine bağlı olduğu için node
test kabuğunda render edilemiyor; canlı çizim Ş9'un e2e'sinde ölçülecek.

## 8. Kararlar ve sapmalar

1. **`lib/auth/pending-verification.ts` şerit sınırının dışında.** Ş5'in kapsamı `register/**`
   ama adresi doğrulama ekranına taşıyan modülü iki şerit de kullanıyor; `register/` altında
   bırakmak Ş6'yı başka bir şeridin klasöründen import etmeye zorlardı. Ş4'te `countdown.ts` ve
   `auth-status-view.tsx` için verilen kararla aynı.
2. **`emailDetected` istemcide basit bir regex.** Sunucu zaten `z.string().email()` ile
   doğruluyor; buradaki kontrol yalnız algılama satırını ve düğme kapısını sürüyor.
3. **`passwordWeak` durumu sunucudan gelmiyor olabilir.** Kapı istemcide kapalı olduğu için bu
   durum ancak istemci kapısı atlatılırsa (JavaScript kapalı, doğrudan istek) doğar; ekran yine
   de karşılıyor.
4. **Öneri etiketleri ürün kuralına uyuyor** (K8: `a-zA-Z0-9_`), tasarımın `ada.dev` örneğindeki
   nokta üründe geçersiz. Etiketlerin görünümü değişmedi.

## 9. Sonraki şeritler için borç

1. **`login-page.tsx` · `login-card.tsx` hâlâ ayakta** — artık yalnız `/forgot-password` ve
   `/reset-password` kullanıyor. Ş6 o iki ekranı taşıyınca ikisi de ölür; silme Ş9'da.
2. **`/verify-email` henüz eski link ekranı.** Ş5 oraya yönlendiriyor ve adresi sekmeye bırakıyor;
   kod ekranını kuran Ş6, `readPendingVerificationEmail()` ile adresi okumalı.
3. **`turnstile-widget.tsx` hâlâ `auth-reference-*` sınıflarını kullanıyor.** SPEC §4.4/6'nın
   görünür satırı `AuthTurnstileRow` olarak çizildi; gerçek widget görünmez katmanda çalışıyor.
   İki katmanı tek bileşende birleştirmek Ş9'un temizliğine kaldı.

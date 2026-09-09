# Ş5 — Web: Hesap oluştur (Dalga 2)

Yalnız `apps/web/src/app/(auth)/register/**` altına yaz. `components/auth/**` ve `lib/auth/**`
**değiştirilmez**.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3 (K1, K8, K9, K10, K13), `SPEC.md` §4.4, §4.8, §8, §9, §10,
§11 ve Ş1/Ş2/Ş3 raporları.

---

## 1. Kabuk

`AuthScreenLayout variant="register"` — form sütunu **424px**, kolon dolgusu `0 56px`,
**alt bilgi yok** (K13). Marka paneli, aurora, dil/tema seçici aynı.

---

## 2. Form (SPEC §4.4 sırası birebir)

1. **Eyebrow / başlık / açıklama** — `auth.register.eyebrow` (`HESAP OLUŞTUR`),
   `auth.register.title` (`Whispr'a katıl`), `auth.register.subtitle`.

2. **İki kolonlu grid** (`grid-template-columns: 1fr 1fr; gap:12px`), alan yüksekliği **h44**:
   - `auth.field.fullName` (`Ad Soyad`) — `autocomplete="name"`, `RegisterSchema.displayName`.
   - `auth.field.username` (`Kullanıcı adı`) — `autocomplete="username"`.
     Altında ipucu satırı: `auth.register.usernameHint`
     (`whispr.app/@ada · bu ad herkese görünür`), 11.5px `--text-muted`.

3. **E-posta alanı** — K1: etiket `auth.field.email`, placeholder `ada@whispr.app`,
   `type="email"`, `autocomplete="email"`.
   Altında **algılama satırı**: 11.5px `--success`, başında 10px ✓ —
   `auth.field.emailDetected` (`E-posta adresi algılandı`).
   Satır yalnız girdi geçerli bir e-posta biçimine ulaşınca görünür; görünüp kaybolurken
   düzen zıplamaz (yükseklik rezerve edilir). `aria-live="polite"`.

4. **Şifre alanı** — `PasswordInput`, `autocomplete="new-password"`, placeholder
   `auth.field.passwordPlaceholder` (`En az 10 karakter`). Sağ içinde `Göster`/`Gizle`
   (h30, köşe 8, `--surface-soft`, `600 11.5px`, `top:7px right:7px`, alan sağ dolgusu 66px).
   **Tekrar alanı yoktur** (K10).

5. **Güç göstergesi + kural listesi** — `PasswordStrength` (Ş3), girdi
   `evaluatePasswordStrength(password)` (Ş1). Çubuk h5, `width: score/4*100%`,
   `transition: width .25s ease`; etiket `Şifre gücü · <…>` tonun `-soft` renginde;
   2×2 kural listesi `gap:5px 14px`, 11.5px.

6. **Turnstile satırı** — `TurnstileRow` (Ş3): h52, köşe 12, `1px solid --border`,
   zemin `--surface-card/.7`; solda 20px yeşil onay karesi, ortada
   `auth.register.turnstileTitle` (`İnsan olduğun doğrulandı`), sağda 10.5px
   `auth.register.turnstileHint` (`Cloudflare Turnstile`).
   **Gerçek `TurnstileWidget` bu satırın arkasında çalışır**: doğrulanmadan önce satır bekleme
   görünümünde (nötr karo + spinner), doğrulanınca tasarımdaki yeşil hâline geçer, başarısızsa
   seviye 2 bant (SPEC §10).

7. **Şartlar onay kutusu** — üstten hizalı 18px kutu + `auth.register.terms`
   (`Kullanım Şartları ve Gizlilik Politikası’nı okudum, kabul ediyorum.`).
   `Kullanım Şartları` ve `Gizlilik Politikası` metin içinde **bağlantıdır** (alt bilgideki
   hedeflerle aynı). Kesme işareti `’` birebir.

8. **Birincil düğme** `auth.register.cta` (`Hesabı oluştur`), altında
   `auth.register.haveAccount` + `auth.login.cta` bağlantısı → `/login`.

---

## 3. Etkinleşme kapısı (SPEC §10, K9)

`Hesabı oluştur` şu dördü sağlanmadan `disabled`:

- `displayName` boş değil,
- `username` ürün kuralına uyuyor (K8: 2–32, `a-zA-Z0-9_`),
- e-posta biçimi geçerli,
- parola **en az 3 kural** karşılıyor **ve** min 10 karakter,
- şartlar onaylı,
- Turnstile token'ı var.

`disabled` görünümü SPEC §9: `--surface-soft` zemin, `--text-muted` metin.

---

## 4. Kullanıcı adı müsaitliği (SPEC §10, durum 4)

- Alan **bırakıldığında** (`onBlur`) `POST /api/v1/auth/username-availability` çağrılır (Ş2).
- Alınmışsa: alan uyarı biçimine geçer (`1.5px solid --warning`, zemin `--warning/.06`),
  altında `FieldError` tonunda uyarı — `auth.status.usernameTaken.title` +
  `auth.status.usernameTaken.description`, ve **üç öneri etiketi** (`SuggestionChip`, Ş3).
  Etikete tıklanınca alan dolar, uyarı kalkar, tekrar sorgulanır.
- Çağrı sırasında alanın sağında küçük spinner; yanıt gelmeden düğme kilitlenmez
  (kullanıcı yazmaya devam edebilir).
- Ağ hatasında sessizce geçilir (kayıt sunucuda yine doğrulanır).

---

## 5. Diğer durumlar

| Dönüş                       | Seviye | Davranış                                                                                                                         |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `emailRegistered` (durum 6) | 1      | E-posta alanı uyarı biçimi + `Giriş yap` / `Şifremi sıfırla` bağlantıları                                                        |
| `passwordWeak` (durum 5)    | 1      | Alan uyarı biçimi + `auth.status.passwordWeak.field` ("İki kural daha karşılanmalı") — sayı gerçek eksik kural sayısıyla değişir |
| `turnstile`                 | 2      | `AuthBanner`                                                                                                                     |
| `rateLimit`                 | 2      | `AuthBanner` + geri sayım                                                                                                        |
| `network`                   | 2      | `AuthBanner` + otomatik tekrar                                                                                                   |
| `success`                   | —      | `/verify-email` (kod ekranı, Ş6)                                                                                                 |

---

## 6. Kaldırılanlar

`REGISTER_COPY` sabit metin bloğu, `RoleTabs`, `normalizeNameAsUsername`'in
kullanıcıya görünen davranışı (kullanıcı adı artık ayrı alan; yardımcı öneri üretiminde
kalabilir), `confirmPassword` alanı ve doğrulaması, `LoginCard`/`LoginPage` sarmalayıcıları
(yerine `AuthScreenLayout`).

---

## 7. Testler

`app/(auth)/register/register-client.test.tsx`:

- Alan sırası ve iki kolonlu gridin tek satırda iki alan taşıması.
- Şifre yazarken çubuk genişliği ve kural ikonlarının 5 skorda doğru olması.
- 2 kural karşılanınca düğmenin `disabled` kalması, 3'te açılması.
- Şartlar onaylanmadan düğmenin kapalı olması.
- Kullanıcı adı alınmışsa üç öneri etiketinin gelmesi, tıklayınca alanın dolması.
- Algılama satırının geçerli e-postada görünmesi ve düzeni zıplatmaması.
- Bu ekranda alt bilginin **render edilmemesi** (K13).
- Kaynak taraması: sabit TR/EN dize yok.

## 8. Bitirme

`pnpm --filter @wizards/web typecheck` + `test` yeşil.
Rapor: `raporlar/s5-hesap-olustur.md` — SPEC §4.4'ün 8 maddesinin tek tek doğrulaması,
K1 nedeniyle uygulanmayan telefon dalının tam listesi, Ş2/Ş3'ten eksik çıkanlar.

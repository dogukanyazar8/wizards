# Ş9 — 10 durum kartı · a11y · parity kapısı · temizlik (kapanış)

**Durum:** landed (uncommitted) · 2026-08-27 · dal `uat`
**Kapsam:** SPEC-GIRIS-KAYIT §7 · §8 · §9 · §11 · §12

---

## 1. 13 kabul kriteri — tek tek sonuç

Kapı: [`apps/web/src/lib/auth/parity.test.ts`](../../../../apps/web/src/lib/auth/parity.test.ts) — **15/15 geçti**.

| #   | Kriter                                                   | Sonuç                             | Nerede ölçüldü                                                                                      |
| --- | -------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Aurora kökün ilk çocuğu, kolonlarda opak zemin yok       | ✓                                 | `parity.test.ts` 1 (kaynak sırası + CSS bloğu)                                                      |
| 2   | Logo çubukları 3px / `17·25·34·24·18`, yalnız `scale()`  | ✓                                 | `parity.test.ts` 2                                                                                  |
| 3   | Google aktif; MS/Apple `Yakında` + disabled; Discord yok | ✓                                 | `parity.test.ts` 3                                                                                  |
| 4   | Güç göstergesi ve kural listesi canlı, skor→ton eşlemesi | ✓                                 | `parity.test.ts` 4                                                                                  |
| 5   | Tema/dil anında; sabit metin yok                         | ✓ (kaynak) · e2e **koşulamadı**   | `parity.test.ts` 5 + `auth-parity.spec.ts`                                                          |
| 6   | Durum metinleri `-soft` ve ≥4.5:1                        | ✓                                 | `parity.test.ts` 6 (hesaplamalı, iki tema)                                                          |
| 7   | Mobil dokunma hedefi ≥44                                 | ✓                                 | `mobile-auth-token-contract.test.ts` (Ş8); kapı varlığı `parity.test.ts` 7                          |
| 8   | Alt bilgi K13'e uyuyor                                   | ✓                                 | `parity.test.ts` 8                                                                                  |
| 9   | Metinler SPEC §13 ile birebir                            | ✓                                 | `auth-screen-copy.test.ts` (Ş1) + `parity.test.ts` 9                                                |
| 10  | Challenge'sız 2FA'ya girilemez, tek kullanımlık, 5 dk    | ✓ (sözleşme) · e2e **koşulamadı** | `login-challenge.test.ts` (Ş2) + `parity.test.ts` 10                                                |
| 11  | 5 denemede 15 dk kilit, sayaçlar ekranda                 | ✓ (sözleşme) · e2e **koşulamadı** | `login-lockout.test.ts` (Ş2) + `parity.test.ts` 11                                                  |
| 12  | Şifre güncellenince oturumlar kapanır, sayı gerçek       | ✓                                 | `parity.test.ts` 12 (`password-reset.ts` → `revokeUserSessions`, ekran `signedOutDeviceCount` okur) |
| 13  | Reduced-motion tüm animasyonu durdurur                   | ✓                                 | `parity.test.ts` 13 + `auth-a11y.test.ts` 7                                                         |

Ek iki kapı aynı dosyada: **çıplak `px` / hex / `rgb()` taraması** (`components/auth/**` +
`app/(auth)/**`) ve **ölçü köprüsü** (`AUTH_METRICS` → CSS değişkeni; `buildAuthCssVars`
çıktısında ne px ne hex).

### Kapının kabul ettiği tek istisna

Sağlayıcı marka glifleri (`fill="#4285F4"` gibi) hex taramasından muaf. Google'ın dört rengini
ve Microsoft'un dört karesini Whispr tokenıyla boyamak marka kurallarını çiğnerdi; SPEC de çok
renkli markayı istiyor. Muafiyet **yalnız** SVG boya özniteliklerine açık, bir `style` ya da
`className` içindeki hex hâlâ kapıyı düşürüyor.

---

## 2. Erişilebilirlik — SPEC §11

[`apps/web/src/components/auth/auth-a11y.test.ts`](../../../../apps/web/src/components/auth/auth-a11y.test.ts) — **9/9 geçti**.

| #   | Madde                                                                            | Sonuç                                    |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Form üstü bant ve engelleyici blok `role="alert"`                                | ✓                                        |
| 2   | Alan içi mesaj `aria-describedby` + `aria-invalid`                               | ✓                                        |
| 3   | Kod hücreleri tek alan (`inputmode` · `one-time-code` · yapıştırma · Backspace)  | ✓                                        |
| 4   | Sağlayıcılar `disabled` **ve** `aria-disabled`; `Yakında` erişilebilir ada girer | ✓                                        |
| 5   | Tema `radiogroup`, dil `menu`; `Esc` kapatır, odak tetikleyiciye döner           | ✓                                        |
| 6   | Halkasız `outline:none` yok                                                      | ✓ — **bir gerçek hata kapandı**, aşağıda |
| 7   | Reduced-motion: düzen ve renk değişmeden animasyon durur                         | ✓                                        |
| 8   | Ekran başına tek `<h1>`                                                          | ✓                                        |
| 9   | Kendiliğinden değişen bölgeler kibar (`polite` / `role="status"`)                | ✓                                        |

Tarayıcı gerektiren maddeler (axe taraması, sekme sırası, canlı bölge duyurusu)
[`e2e/specs/a11y/auth-a11y.spec.ts`](../../../../apps/web/e2e/specs/a11y/auth-a11y.spec.ts)
içinde — **koşulamadı** (§5).

### Kapanan gerçek hata

`/oauth-two-factor` ekranının kod alanı `outline-none` taşıyordu ve sarmalayıcısında da halka
yoktu: klavyeyle gelen kullanıcı alanın odakta olduğunu **hiç göremiyordu**. Halka sarmalayıcıya
`focus-within` ile eklendi. Ekran SPEC'in on ekranından biri değil (OAuth'a bağlı 2FA), ama
`(auth)` altında olduğu için kapının kapsamında.

---

## 3. 10 durum kartı — nereye bağlı

Kartların **kabuğu** Ş3'te, **içi** bu şeritte kuruldu. Hepsi ürün akışında tetikleniyor;
`supported: false` kalan durum **yok**.

| #   | Durum              | Seviye | Ürün tetikleyicisi                                               |
| --- | ------------------ | ------ | ---------------------------------------------------------------- |
| 1   | `credentials`      | 1      | `login-client.tsx` · `actions.ts`                                |
| 2   | `accountLocked`    | 3      | `login-lockout.ts` → `login-client.tsx`, `two-factor-client.tsx` |
| 3   | `codeInvalid`      | 1      | `two-factor-login.ts` · `verify-email-client.tsx`                |
| 4   | `usernameTaken`    | 1      | `register-client.tsx` (öneri etiketleriyle)                      |
| 5   | `passwordWeak`     | 1      | `register-client.tsx`, `reset-password-client.tsx`               |
| 6   | `emailRegistered`  | 1      | `register-client.tsx`                                            |
| 7   | `network`          | 2      | `actions.ts` (her ekran)                                         |
| 8   | `linkExpired`      | 3      | `reset-password-client.tsx`, `verify-email-client.tsx`           |
| 9   | `rateLimit`        | 2      | `verify-email-client.tsx`, `sent-client.tsx`                     |
| 10  | `accountSuspended` | 3      | `account-suspension.ts` → `login-client.tsx`                     |

Galeri: **`/dev/auth-states`** (üretimde 404) — 10 kart + 3 seviye + bileşenlerin durumları,
açık ve koyu tema yan yana.
[`components/dev/auth-states-gallery.tsx`](../../../../apps/web/src/components/dev/auth-states-gallery.tsx).

Sayfa `components/dev/` altında, `components/auth/` altında **değil**: kriter 5 taraması auth
ağaçlarında sabit metne izin vermiyor ve galeri başlıkları (bölüm adları, durum etiketleri)
geliştirici aracının kendi metni. Kartların içi yine yalnız sözlükten okuyor.

---

## 4. Temizlik

| #   | İş                                          | Sonuç                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `modern-*` sınıfları                        | **198 seçici silindi.** Yalnız kimlik ailesine ait ve hiçbir yerde kullanılmayanlar: `modern-login-*`, `modern-register-*`, `modern-auth-*`, `modern-role-*`, `modern-social-*`, `modern-language-*`, `modern-theme-switch`, `modern-password-toggle`, `modern-reset-login-cta`. Liste: [`ek/s9-silinen-modern-secicileri.txt`](ek/s9-silinen-modern-secicileri.txt) |
| 1b  | Kullanılmayan ama **silinmeyen** `modern-*` | `modern-combined-card`, `modern-match-card`, `modern-typing-card` — adları kimlik akışına ait değil, başka bir yüzeye dönebilir. Ş9 kuralı gereği bırakıldı.                                                                                                                                                                                                         |
| 2   | `auth-reference-*` kalıntısı                | **275 kural + 86 karışık liste satırı silindi.** Turnstile widget'ının hâlâ kullandığı 5 sınıf (`-turnstile-box/-help/-mount/-shell/-state`) duruyor. Liste: [`ek/s9-silinen-auth-reference-secicileri.txt`](ek/s9-silinen-auth-reference-secicileri.txt)                                                                                                            |
| 3   | Ölü bileşenler                              | `audience-selector.tsx`, `role-tabs.tsx`, `login-card.tsx`, `login-page.tsx`, `theme-toggle.tsx` — **hiçbiri depoda yok**, önceki şeritlerde zaten silinmişler.                                                                                                                                                                                                      |
| 4   | `--font-auth-body` (DM Sans)                | Bağ kaldırıldı (`layout.tsx` + `layout-fonts.test.ts`). Hiçbir CSS kuralı okumuyordu; SPEC §1.3 gövdeyi Figtree yapmıştı. **Font dosyası silinmedi.**                                                                                                                                                                                                                |
| 5   | Çağrılmayan `auth.*` anahtarları            | 424 anahtarın **180'i** ürün kodundan çağrılmıyor. **Silinmedi**, listelendi: [`ek/s9-cagrilmayan-auth-anahtarlari.txt`](ek/s9-cagrilmayan-auth-anahtarlari.txt)                                                                                                                                                                                                     |

`globals.css`: **8 647 → 6 025 satır** (−2 622, %30).

Anahtar listesi hakkında bir uyarı: içinde K1 ile bilerek askıya alınan telefon anahtarları
(`auth.field.contact*`, `auth.verifyPhone.*`) ve eski tasarımın metinleri karışık duruyor.
Silme kararı anahtar anahtar verilmeli; toplu silme, telefon sağlayıcısı geldiğinde SPEC §13
tablosunu eksik bırakır.

---

## 4b. Canlı doğrulama — 2026-08-27

Dev sunucu açıldı, **10 web ekranı + galeri açık ve koyu temada** hesaplanmış stil üzerinden
ölçüldü (tarayıcı paneli görüntülenemediği için ekran görüntüsü alınamadı; ölçüm `getComputedStyle`
ile yapıldı — piksel karşılaştırmasından daha kesin, ama görsel değil).

**Doğrulananlar:** marka paneli 512 · halka 150 · wordmark 42/1 `-.025em` · ayırıcı 300/34-28 ·
başlık 21/1.35 · gövde 13.5/1.65 36ch · form 384 (kayıt 424) · alan 46 (kayıt satırı 44,
yedek kod 52/18px/`.14em`) · düğme 48/r12 · kod hücresi 54×62 r12 gap10 rakam 25/600 ·
turnstile satırı 52/r12 + 20px karo + 10.5px · onay kutusu 18/r6 · durum kartı 440/22/r16,
karo 24, etiket 9.5, başlık 16.5 · başarı karosu 52, halka 76. Koyu temada hiçbir ekranda
açık token sızıntısı (beyaz zemin) **yok**, yatay taşma **yok**, konsol hatası **yok**,
ürünün global teması (`theme-light`) değişmiyor (K6).

### Canlı doğrulamada bulunan beş kusur — hepsi kapatıldı

| #   | Kusur                                            | Kök neden                                                                                     | Düzeltme                                                                                    |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `.auth-hint` 16px, `--foreground`                | Sınıf kullanılıyordu ama **hiçbir CSS kuralıyla eşleşmiyordu**; gövde boyutunu miras alıyordu | `.auth-hint` kuralı eklendi: 11.5px `--text-muted` (SPEC §4.4/1)                            |
| 2   | Alt satır (`Hesabın yok mu?`) da 16px            | Aynı sınıfı paylaşıyordu; SPEC §4.1 13px istiyor                                              | Ayrı `.auth-footnote` sınıfı (13px `--text-secondary`)                                      |
| 3   | Onay kutusu etiketi 16px                         | Aynı sınıf                                                                                    | `.auth-checkbox-label` (12.5px; SPEC boyut yazmıyor, alan etiketi ölçeği alındı)            |
| 4   | `Ad Soyad` · `Kullanıcı adı` ızgara aralığı 10px | Kod hücresi aralığı (`--auth-cell-gap`) kullanılmıştı; SPEC §4.4/1 12px                       | `--auth-field-grid-gap` eklendi (12px)                                                      |
| 5   | Kod hücresi 57px                                 | Bileşen `flex-1` ekliyordu, `width:54` eziliyordu                                             | `flex-1` kaldırıldı; hücre `flex: 0 1 54px` — masaüstü kademesinde küçülebilir, hiç büyümez |

### İki gerçek hata daha

6. **`/reset-password/done` kendini kapıdan atıyordu.** Sonuç `sessionStorage`'dan okunup hemen
   siliniyor; React StrictMode etkiyi iki kez çalıştırınca ikinci çalıştırma boş depoyu görüp
   kullanıcıyı `/login`'e atıyordu. Okunan değer artık ref'te tutuluyor. (Üretimde StrictMode
   çift çalıştırmaz, ama Fast Refresh ya da herhangi bir yeniden montaj aynı sonucu verirdi.)
7. **Dar pencerede form ekran dışında kırpılıyordu.** Marka paneli (512) + form (384) + dolgu
   (2×72) = 1040; pencere bundan darsa `.auth-window`'un `overflow: hidden` kuralı formu
   kesiyordu ve kaydırma çubuğu olmadığı için **giriş yapılamıyordu**. 1080px altında marka
   paneli gizlenip form ortalanıyor, 560px altında kolon dolgusu 28px'e iniyor. 375px'te form
   318px, taşma yok. Kural `parity.test.ts` ile kilitlendi.

### İkinci tur — kullanıcı geri bildirimi (aynı gün)

Üç şikâyet, üçü de gerçek kusur çıktı. Otorite bu turda `referans.html`'in kendisi: paket
bundle'ı açılıp sayfa şablonu okundu (`__bundler/template`).

| #   | Şikâyet                                | Kök neden                                                                                                                                                                                                                                                                                                                           | Düzeltme                                                                                                                                                                                                                                                          |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | `Göster`/`Gizle` alakasız yerde        | Düğme `TextInput`'un **dışına** konmuştu; `top:7px` etiket satırından ölçülüyor ve düğme alanın altına düşüyordu                                                                                                                                                                                                                    | `TextInput` `trailing` yuvası aldı; düğme alanın sarmalayıcısına girdi, `top:50%` + `translateY(-50%)` ile dikeyde ortalandı. Alan `data-reveal` ile 66px sağ dolgu alıyor (referans: `padding:0 66px 0 13px`), düğme dolgusu 14 → 11px                           |
| 9   | Marka paneli sağdan çok uzak           | **Kabuk sabit kart değil, tüm görüntü alanıydı.** Referans: `width:1280px;height:720px;border-radius:14px;overflow:hidden` — sayfada ortalı bir kart. Uygulamada `min-h-screen` vardı: 1440'ta form sütunu 928'e çıkıyor, boşluk açılıyordu. Ölçüler `AUTH_METRICS.window`'da **duruyordu ama hiçbir CSS değişkenine basılmıyordu** | `--auth-window-width/height` eklendi; `.auth-page` sarmalayıcısı kartı ortalıyor. 1440'ta kart 1280×720, 1280'de tam kenar kenara, kısa ekranda sayfa kayıyor (kart kısalmıyor — `overflow:hidden` alt bilgiyi gizlerdi)                                          |
| 10  | Giriş düğmesi tıklayınca sönük kalıyor | Düğme gönderim sırasında hem `disabled` hem `data-loading`; yükleme kuralı yalnız zemini eziyordu, **metin rengi ve gölge `:disabled`'dan geliyordu**                                                                                                                                                                               | Yükleme kuralı görünümün tamamına sahip: `--primary/.85` zemin, `--primary-foreground` metin, gölge korunur, `cursor:progress`. Ölçüldü: boşta `primary`/beyaz/gölge · yükleniyor `primary/.85`/beyaz/gölge · devre dışı `--surface-soft`/`--text-muted`/gölgesiz |

**Tüm düğmelerin denetimi (SPEC §9 × referans).** Referansta yalnız üç durum var: birincil
hover `brightness(1.06)`, kenarlıklı denetimlerde hover `--foreground/.3`–`/.35`, odak
`1px --primary` + `3px --primary/.16`. Diğer durumlar SPEC §9'dan geliyor. Denetim sonucu:
ikincil düğme · bağlantı · öneri etiketi · sağlayıcı düğmesi · onay kutusu · kod hücresi ·
metin alanı **eksiksiz**; yalnız birincil düğmenin yükleme durumu bozuktu (#10).

Bir sapma düzeltildi: `hoverBrightness` 1.08 → **1.06**. SPEC §9 tablosu 1.08 diyor ama hem
SPEC §4 ortak tablosu hem referansın kendisi 1.06 yazıyor; iki kaynak bir kaynağı yeniyor.

| 11 | Alt bilgi satırı iki kolonun ortasında | `FooterSecurity` pencerenin çocuğuydu; `left/right:72px` **pencereye** göre ölçülüyordu. Referansta satır form sütununun son çocuğu, ölçüler o sütuna göre | Alt bilgi form sütununun içine alındı. Ölçüldü: satır merkezi 896 = sütun merkezi = form merkezi, sütun kenarlarından 72/72, alttan 30, 11.5px, gap 16, `--text-muted` |

Dördü de `parity.test.ts` ile kilitlendi (kabuk kartı · alan içi düğme · beş durum · alt bilgi
sütunun içinde). `auth-shell-contract.test.ts` artık yorumları ayıklıyor: bir kuralın **neden**
72px olduğunu anlatan açıklama ölçü sayılmamalı.

### Üçüncü tur — kullanıcı geri bildirimi

| #   | Şikâyet                                                                   | Bulgu                                                                                                                                                                                                                                                                                                                                                                                   | Düzeltme                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | `whispr.app/@ada · bu ad herkese görünür` neye dayanıyor?                 | SPEC §13 `reg_user_hint` satırı. **İki yanlış:** `whispr.app` üründe hiçbir yerde gerçek değil (gerçek alan adı `whispr.team` — `support@` · `status.` · `updates.`; `whispr.app` yalnız test fixture'larında), ve `/@kullaniciadi` diye bir rota **yok** — profil yalnızca `userId` ile ve oturum arkasında açılıyor. `ada` da sabit örnekti, kullanıcı ne yazarsa yazsın değişmiyordu | Kullanıcı kararı: alan adı düştü, yazılan ad canlı gösteriliyor. Boşken `Bu ad herkese görünür`, yazınca `@Wizard_User · bu ad herkese görünür`. Yeni anahtar `auth.register.usernameHintEmpty`; metin kapısı SPEC sapmasını gerekçesiyle taşıyor                                                                                                                             |
| 13  | Konsol hatası: "Encountered a script tag while rendering React component" | `next/script` + `strategy="beforeInteractive"` **yalnız kök düzende** desteklenir. Rota grubu düzeninde React uyarıyor **ve** betik istemci geçişlerinde hiç koşmuyordu: ürün içinden `/login`'e geçen kullanıcıda `data-auth-theme` yazılmıyor, koyu tema seçili olsa bile yüzey açık geliyordu                                                                                        | Betik kök düzenin `<head>`'ine düz satır içi `<script>` olarak taşındı — kök düzen yalnız belge isteğinde render edildiği için uyarı imkânsız ve öznitelik her girişte ilk boyadan önce yazılıyor. `AuthSurfaceGate`'e öznitelik yoksa yazan emniyet kemeri eklendi. Auth dışı sayfalarda görsel etki yok: token bloğu `[data-auth-theme="dark"] [data-auth-surface]` istiyor |

---

## 5. E2E — koşulamadı

İki dosya yazıldı, **koşulmadı** (yerel Playwright ortamı + tohumlu veritabanı bu oturumda ayakta
değil):

- [`e2e/specs/auth/auth-parity.spec.ts`](../../../../apps/web/e2e/specs/auth/auth-parity.spec.ts) —
  5 genel ekran × 2 tema kabuk sırası ve taşma; tema anahtarı; dil menüsü klavye + `Esc`;
  5 hatalı denemede kilit bloğu; şifremi unuttum → gönderildi → yeniden gönder; challenge'sız
  2FA rotasına girilemez; reduced-motion.
- [`e2e/specs/a11y/auth-a11y.spec.ts`](../../../../apps/web/e2e/specs/a11y/auth-a11y.spec.ts) —
  4 ekran × 2 tema axe A+AA; sekme sırası; `role="alert"` duyurusu; kod hücrelerinin tek alan
  görünmesi; kapalı sağlayıcıların erişilebilir adı.

İkisi de typecheck'ten geçiyor; **"geçti" yazılmadı**, çünkü koşmadılar.

---

## 6. Ölçüm

| Koşum                                                           | Sonuç                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm --filter @wizards/web test`                               | **7536 test · 0 hata · 3 atlandı** (canlı doğrulama düzeltmeleri sonrası) |
| `parity.test.ts`                                                | 15 / 15                                                                   |
| `auth-a11y.test.ts`                                             | 9 / 9                                                                     |
| `auth-shell-contract.test.ts` + `auth-desktop-contract.test.ts` | 18 / 18                                                                   |
| `pnpm --filter @wizards/web typecheck`                          | temiz (e2e dosyaları dâhil)                                               |
| e2e                                                             | **koşulamadı**                                                            |

---

## 7. Kalan açık borç

1. **`rememberDevice` sunucuda karşılıksız** (Ş8'den devir). Web ve mobil alanı gönderiyor,
   `two-factor-login.ts` okumuyor: güvenilir cihaz kaydı yok. Kutu bugün hiçbir şey yapmıyor.
2. **Askı itirazı düğmesi yok** (Ş4'ten devir). `/api/v1/moderation/appeal` yasaklı **oturum**
   istiyor; giriş ekranından ulaşılamıyor. SPEC §7/10 düğmeyi istiyor, ürün karşılığı yok.
3. **`AuthSecurityCard` ölü** (Ş8'den devir, mobil). Tema sözleşmesi onu `successSoft`/
   `successText` kontrast çiftinin tek örneği olarak kullandığı için silinmedi.
4. **180 çağrılmayan `auth.*` anahtarı** — anahtar anahtar karar bekliyor.
5. **E2E koşulmadı** — ortam ayağa kalktığında iki spec'in de koşması gerekiyor.

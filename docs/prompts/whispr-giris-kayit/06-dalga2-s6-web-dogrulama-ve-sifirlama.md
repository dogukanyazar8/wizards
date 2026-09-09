# Ş6 — Web: E-posta doğrulama + şifre sıfırlama zinciri (Dalga 2)

Yalnız `apps/web/src/app/(auth)/verify-email/**`, `forgot-password/**`, `reset-password/**`
altına yaz. `components/auth/**` ve `lib/auth/**` **değiştirilmez**.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3 (K3, K11), `SPEC.md` §4.5, §4.7, §7 (durum 8, 9), §8, §9,
§11 ve Ş1/Ş2/Ş3 raporları.

Beş ekran + bir durum: **E-posta doğrulama · Şifremi unuttum · Bağlantı gönderildi ·
Bağlantı yeniden gönderildi (aynı rota) · Yeni şifre · Şifre güncellendi.**

---

## 1. `/verify-email` — E-posta doğrulama (SPEC §4.5, K3)

Rota iki modda çalışır:

- `?token=…` varsa → **eski link doğrulaması** (mevcut sunucu bileşeni davranışı korunur, yalnız
  görsel dil yeni kabuğa taşınır: başarı/süresi geçti/geçersiz durumları `BlockingPanel` veya
  başarı ekranı olarak).
- Token yoksa → **kod ekranı**:

1. `AuthEyebrow` `auth.verifyEmail.eyebrow` (`E-POSTA DOĞRULAMA`).
2. `AuthTitle` `auth.verifyEmail.title` (`E-postanı doğrula`).
3. `AuthDescription` `auth.verifyEmail.subtitle` — adres ve 10 dakika bilgisi
   **gerçek adresle** doldurulur (metin şablonu §13'ten, `{email}` yer tutucu).
4. `CodeInput` altı hücre.
5. `PrimaryButton` `auth.verifyEmail.cta` (`Doğrula`).
6. Geri sayım satırı: kilitliyken `auth.verifyEmail.wait` (`Tekrar gönder · 00:42`,
   `--text-muted`, canlı sayaç); sayaç bitince `auth.verifyEmail.resend`
   (`Kodu tekrar gönder`, bağlantı) olur.
7. `auth.verifyEmail.changeEmail` (`E-posta adresini değiştir`) — kayıt akışına döner.

Durumlar: `codeInvalid` → hücreler kırmızı + seviye 1 mesaj;
`rateLimit` (durum 9) → seviye 2 bant + devre dışı `Yeni kod · 01:58` düğmesi ve %34 ilerleme
çubuğu (SPEC §7/9); `success` → uygulamaya giriş.

---

## 2. `/forgot-password` — Şifremi unuttum (SPEC §4.7)

1. `AuthEyebrow` `auth.forgotPassword.eyebrow` (`ŞİFRE SIFIRLAMA`).
2. `AuthTitle` `auth.forgotPassword.title` (`Şifreni sıfırla`).
3. `AuthDescription` `auth.forgotPassword.subtitle`.
4. Tek `TextInput` e-posta, placeholder `ada@whispr.app`, `autocomplete="email"`.
5. `PrimaryButton` `auth.forgotPassword.cta` (`Sıfırlama bağlantısı gönder`).
6. `AuthLink` `auth.common.backToLogin`.

Turnstile görünmez modda (Ş4 §1.1 deseni). Yanıt **her zaman** jenerik başarıdır
(kullanıcı numaralandırması yok) → `/forgot-password/sent`.

---

## 3. `/forgot-password/sent` — Bağlantı gönderildi **ve** yeniden gönderildi (K11)

Tek ekran, iki durum. Ortak iskelet:

1. `SuccessTile` 52×52, köşe 14, zemin `--success/.14`, kenar `1px solid --success/.35`,
   24px ✓ `--success-soft`, **`margin:0 auto`**.
2. 20px altta `AuthTitle` `auth.forgotPassword.sentTitle` (`Bağlantıyı gönderdik`).
3. `AuthDescription` `auth.forgotPassword.sentSubtitle` (30 dakika, tek kullanımlık).
4. `PrimaryButton` `auth.forgotPassword.openMailApp` (`E-posta uygulamasını aç`) —
   `mailto:` değil; kullanıcının sağlayıcısına göre webmail linki **uydurulmaz**, düğme
   `mailto:` olmayan bir eylem değilse basitçe `mailto:` açar. Karar: `href="mailto:"`.
5. `auth.verifyEmail.resend` (`Kodu tekrar gönder`, 600) ve `auth.common.backToLogin`.

**Yeniden gönderildi durumu** — `Kodu tekrar gönder` basılınca aynı ekran üç değişiklikle döner
(SPEC §4.7 birebir):

1. `AuthAurora tone="success"` — ikinci radyal `--success/.16`.
2. Açıklamanın **altına** `AuthBanner tone="success"` girer: `padding:14px 15px`, köşe 12,
   zemin `--success/.1`, kenar `1px solid --success/.34`; solda 22px yeşil karo (köşe 7) içinde
   beyaz 12px **`↻`** (✓ değil); sağda `600 13px` `auth.forgotPassword.resentTitle`
   (`Bağlantıyı yeniden gönderdik`) + 12px/1.55 `auth.forgotPassword.resentSubtitle`
   (`--success-soft`, `opacity:.85`).
3. `Kodu tekrar gönder` bağlantısının **yerini** `CountdownPill` alır: h34, köşe 999,
   `--surface-inset`, `1px solid --border/.7`, `600 12px --text-muted`, solunda 6px nokta
   (`flex:none`), `white-space:nowrap`, metin `auth.forgotPassword.resendWait`
   (`Yeniden gönderme 00:58 sonra açılır`). **Sayaç bitince pill kaybolur, bağlantı geri gelir.**

Sayaç kaynağı Ş2'nin `retryAfterMs` değeridir; istemci saatine güvenilmez, sayfa yenilenince
kalan süre sunucudan tekrar okunur.

---

## 4. `/reset-password?token=` — Yeni şifre (SPEC §4.7)

1. `AuthEyebrow` `auth.forgotPassword.eyebrow`.
2. `AuthTitle` `auth.resetPassword.title` (`Yeni şifre belirle`).
3. `AuthDescription` `auth.resetPassword.subtitle` (diğer cihazlardaki oturumlar kapanır).
4. İki `PasswordInput`: `auth.field.newPassword` ve `auth.field.confirmNewPassword`
   (K10 — burada tekrar alanı **vardır**), `autocomplete="new-password"`.
5. `PasswordStrength` — hesap oluşturmadakiyle **aynı bileşen**: çubuk + `Şifre gücü · <…>` +
   2×2 kural listesi (`margin-top:9px`, `gap:5px 14px`, 11.5px).
6. `PrimaryButton` `auth.resetPassword.cta` (`Şifreyi güncelle`) — K9 kapısı (min 10 + 3 kural)
   **ve** iki alanın eşleşmesi.
7. `AuthLink` `auth.common.backToLogin`.

Token durumları: geçersiz/süresi geçmiş/kullanılmış → **seviye 3 blok** (durum 8):
`⏱` karosu + `auth.status.linkExpired.*` + bilgi kutusu (adres + `26.08.2026 · 14:02`) +
`Yeni bağlantı gönder` + `Giriş ekranına dön`.

---

## 5. `/reset-password/done` — Şifre güncellendi (SPEC §4.7)

**Akışın tek ortalanmış hizalı ekranı.** Aurora ters çevrilir:
`AuthAurora tone="success-final"` (1. radyal `--success/.18`, 2. `--primary/.16`).

| Öğe           | Değer                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Işıma halkası | 76×76, `margin:0 auto`, `radial-gradient(circle, hsl(var(--success)/.26), transparent 66%)`, `wglow 3.6s`                                                  |
| Başarı karosu | 52×52, köşe 14, zemin `--success/.16`, kenar `1px solid --success/.4`, 24px ✓ `--success-soft`                                                             |
| Eyebrow       | `auth.forgotPassword.eyebrow`, **ortalı**, üst boşluk 18                                                                                                   |
| Başlık        | `auth.resetPassword.doneTitle` (`Şifren güncellendi`), `600 29px/1.2 Outfit`, ortalı                                                                       |
| Açıklama      | Ortalı, 13.5px/1.6 `--text-secondary`                                                                                                                      |
| Bilgi bandı   | h44, köşe 12, `--surface-inset`, kenar `--border/.7`, ortalı içerik: 7px `--success` nokta + `600 12.5px --text-secondary` — `auth.resetPassword.doneMeta` |
| Eylem         | `PrimaryButton` `auth.login.cta` (`Giriş yap`)                                                                                                             |
| İpucu         | Ortalı 12px `--text-muted`, üst 16 — `auth.resetPassword.doneTip`                                                                                          |

`doneMeta` şablonu: `{count} cihazda oturum kapatıldı · {date} · {time}`. `count` Ş2'nin
döndürdüğü **gerçek** kapatılan oturum sayısıdır; `date`/`time` sunucu zaman damgasından
kullanıcının yereline göre biçimlenir (TR `27.08.2026 · 11:24`). Sayı 0 ise band **gösterilmez**
(yalan bilgi yazılmaz) — bunu rapora not düş.

Bu ekrana yalnız başarılı güncellemeden sonra girilebilir; doğrudan gelinirse `/login`'e yönlenir.

---

## 6. Testler

- `verify-email` : token'lı ve token'sız mod ayrımı; kod hücreleri; geri sayımın pill→bağlantı
  dönüşü; `rateLimit` durumunda devre dışı düğme + ilerleme çubuğu.
- `forgot-password` : jenerik başarı (var olmayan e-posta da `/sent`'e gider).
- `sent` : üç değişimin hepsi (aurora tonu, success bandının `↻` glifi, pill'in bağlantının
  yerine geçmesi); sayaç bitince bağlantının geri gelmesi; sayfa yenilenince kalan sürenin
  sunucudan okunması.
- `reset-password` : iki alan eşleşmesi, K9 kapısı, geçersiz token'da blok panel.
- `done` : ortalanmış hizalama, aurora tonu, `count = 0` durumunda bandın gizlenmesi,
  doğrudan erişimde yönlendirme.
- Kaynak taraması: bu beş ekranda sabit dize yok.

## 7. Bitirme

`pnpm --filter @wizards/web typecheck` + `test` yeşil.
Rapor: `raporlar/s6-dogrulama-sifirlama.md` — SPEC §4.5 ve §4.7'nin her satırının ✓/✗ listesi,
`count = 0` kararının sonucu, eski link akışında değişen davranışlar, Ş2 sözleşmesindeki eksikler.

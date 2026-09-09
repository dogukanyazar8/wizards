# Dalga 1 raporu — Tasarım katmanı + kayıt tarafı e-postaları

Tarih: 2026-08-27 · Branch: `uat` · Commit atılmadı.

Doğrulama kodu ve kayıt denemesi e-postaları yeni tasarıma geçti. Şifre sıfırlama bilerek eski
tasarımda kaldı (Dalga 2'nin işi).

---

## 1. Dosyalar

### Eklendi — `apps/web/src/lib/email/`

| Dosya                                                                                                                                                                         | Gerekçe                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `email-theme.ts`                                                                                                                                                              | SPEC §1 renk + §2 tipografi + §3 ölçü tokenları. Ham hex'in tek kaynağı.                                                                 |
| `email-html.ts`                                                                                                                                                               | `escapeHtml`, `inlineStyle` (anahtar sırası korunur), `typeDeclarations`/`typeStyle`, `stripHeaderNewlines`, `spacerCell`, `byteLength`. |
| `email-links.ts`                                                                                                                                                              | K1 adresleri + `getEmailAppUrl` + `EmailConfigurationError`.                                                                             |
| `email-shell.ts`                                                                                                                                                              | Kabuk: `<head>`/MSO/font/medya sorgusu, preheader, marka bandı + işaret, gövde hücresi, alt bilgi, `RenderedEmail` tipi.                 |
| `email-blocks.ts`                                                                                                                                                             | `eyebrow`, `heading`, `paragraph`, `emphasis`, `codeBox`, `callToAction`, `fallbackUrlBox`, `metaGrid`, `securitySection`, `inlineLink`. |
| `email-text.ts`                                                                                                                                                               | Düz metin üreteci + alt bilgi satırları.                                                                                                 |
| `templates/verification-code-email.ts`                                                                                                                                        | SPEC §4.                                                                                                                                 |
| `templates/registration-attempt-email.ts`                                                                                                                                     | K4 + E1–E3.                                                                                                                              |
| `email-theme.test.ts`, `email-html.test.ts`, `email-shell.test.ts`, `email-blocks.test.ts`, `email-contract.test.ts`, `email-reference-parity.test.ts`, `templates/*.test.ts` | 87 test.                                                                                                                                 |

### Değişti

| Dosya                                         | Değişiklik                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/auth/email-verification.ts` | `renderVerificationEmail` (108 satır) ve `renderRegistrationAttemptEmail` (41 satır) silindi; yerlerine yeni şablonlar. Yerel `escapeHtml` ve `getAppUrl` silindi. `buildVerificationUrl` artık `buildVerifyEmailUrl`i sarıyor ve `EmailConfigurationError`ı `EmailVerificationError("CONFIGURATION_ERROR", …)`ya çeviriyor — dışarıdaki hata eşlemesi ve mesaj metni aynen korundu. `sendVerificationEmail` / `sendRegistrationAttemptEmail` **imzaları değişmedi**. |
| `apps/web/src/lib/locale/messages/tr.ts`      | 50 yeni `auth.email.*` anahtarı; 11 eski anahtar silindi.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/web/src/lib/locale/messages/en.ts`      | Aynısı, SPEC metninin sadık çevirisiyle.                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Dokunulmadı

`password-reset.ts`, `reauth-email.ts`, `actions.ts`, `mobile/auth.ts`, rotalar, env, şema.

## 2. Silinen sözlük anahtarları

Silmeden önce her biri için `grep -rn "<anahtar>\"" apps packages` çalıştırıldı; 11'inin de tek
tüketicisi silinen `renderVerificationEmail` fonksiyonuydu (`email-verification.ts:180-191`):

`auth.emailVerification.` → `subject`, `title`, `greeting`, `body`, `cta`, `expires`,
`fallback`, `ignore`, `footer`, `codeLabel`, `codeHint`

**Silinmedi** (ekranlarda da kullanılıyor): `notConfigured`, `rateLimited`, `resendCta`,
`resendGenericSuccess`, `resendHelp`, `resendingCta`, `senderRestricted`, `sendFailed`.

`auth.passwordReset.email*` anahtarları duruyor — `password-reset.ts` hâlâ onları okuyor;
Dalga 2'de silinecek.

## 3. Birebirlik kapısı

`email-reference-parity.test.ts` — üretilen HTML'in yapı imzası
(`etiket{bgcolor|width|height|align|valign|class|style(sıralı kurallar)}`)
`design_handoff/eposta-handoff/html/dogrulama-kodu.html` ile karşılaştırıldı.

**Sonuç: fark yok, ilk denemede yeşil.** `href` değerleri imzaya girmiyor (K1 yol farkı), metin
düğümleri ayrı testlerde birebir denetleniyor.

## 4. Bayt boyutları

| Varyant            | tr     | en     |
| ------------------ | ------ | ------ |
| Doğrulama (kodlu)  | 10 520 | 10 516 |
| Doğrulama (kodsuz) | 9 370  | 9 345  |
| Kayıt denemesi     | 8 428  | 8 391  |

Sınır 15 360 bayt. Referans uygulama 10 670 bayt; üretilen 150 bayt daha küçük (boşluk farkı).

Önizleme satırı uzunlukları (85–110 kapısı): tr kodlu 99, en kodlu 110, tr kodsuz 92,
en kodsuz 90, tr kayıt denemesi 101, en 102.

## 5. Testler

| Kapı                                   | Sonuç                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm --filter @wizards/web typecheck` | ✅ temiz                                                                           |
| `pnpm --filter @wizards/web test`      | ✅ 7629 test, 7626 geçti, 3 atlandı, **0 hata**                                    |
| `pnpm --filter @wizards/web lint`      | ⚠️ 10 hata — hepsi bu dalganın dokunmadığı, önceden var olan izlenmemiş dosyalarda |
| `graphify update .`                    | ✅ 37 273 düğüm                                                                    |

Yeni test: 87 (`src/lib/email/**`). Önceki taban 7542.

Lint hataları `react-hooks/set-state-in-effect` ve `react-hooks/refs` kuralları:
`(auth)/forgot-password/sent/sent-client.tsx`, `(auth)/login/backup-code/backup-code-client.tsx`,
`(auth)/login/two-factor/two-factor-client.tsx`, `(auth)/verify-email/verify-email-client.tsx`,
`components/auth/auth-status-view.tsx`, `components/auth/theme-language-controls.tsx`,
`components/settings/sections/account/account-section.tsx`. Hepsi `git status`ta izlenmemiş
(`??`) — bu paketten önce gelen iş. Bu dalganın dosyaları ayrıca lint'ten geçirildi: temiz.

## 6. Bilinçli sapmalar

| #      | Sapma                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1     | Bağlantılar ürün rotalarına bakıyor (`/verify-email`, `/privacy`, `/terms`, `/cookies`). Kullanıcı kararı.                                                                                                                                                                                                                                                                                                                                                                                       |
| E1     | Kayıt denemesi bant etiketi `Hesap güvenliği` / `Account security` (SPEC çizmiyor).                                                                                                                                                                                                                                                                                                                                                                                                              |
| E2     | Kayıt denemesi göz üstü etiketi `Bildirim` / `Notice`.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| E3     | Kayıt denemesi eylemsiz düzen: kod kutusu, buton, yedek URL, meta ızgarası yok.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **E5** | **Yeni.** Kodsuz doğrulama varyantı. SPEC bu durumu çizmiyor ama ürün gerçeği: kod hız sınırına takılırsa `requestEmailVerificationCode` "sent" dönmez. Üç sonuç: (a) `auth.email.verification.preheaderNoCode` anahtarı eklendi — SPEC'in kodlu önizleme satırı kodsuz mektupta yalan olurdu; (b) konu `subjectNoCode`a düşer (K7'nin öngördüğü yol); (c) kod kutusu çizilmediğinde butonun 22 px üst dolgusu kaldırılır, yoksa paragrafın alt boşluğuyla üst üste binip 44 px açıklık kalırdı. |

Bunların dışında tasarımdan sapma yok.

## 7. Ek sertleştirmeler (SPEC'i bozmayan)

- Kod yalnız `^\d{6}$` ise kabul edilir; bozuk değer ne kutuya ne konuya girer.
- Konu satırındaki her değerden `\r`/`\n` çıkarılır (başlık enjeksiyonu).
- Alıcı adı, bant etiketi ve belge başlığı kaçırılır; testlerle kanıtlandı.
- `escapeHtml`ın üç kopyasından ikisi kaldırıldı (`reauth-email.ts` kapsam dışı olduğu için duruyor).

## 8. Yapılamayan

**Canlı görsel doğrulama.** Önizleme paneli `file://` adreslerini durağan anlık görüntü olarak
açıyor; ekran görüntüsü alınamadı. Üretilen HTML tarayıcıda ayrıştı (`<title>` doğru okundu) ve
yapı imzası referansla birebir eşleşiyor, ama piksel karşılaştırması yapılmadı. Dalga 2'deki
`/dev/email-preview` sayfası `http://localhost` üzerinden servis edileceği için o kapı orada
kapanacak.

## 9. Dalga 2'ye devir

1. Şifre sıfırlama şablonu + istek bağlamı (cihaz satırı, istek zamanı) — Ş7–Ş9.
2. `auth.passwordReset.email*` eski anahtarlarının silinmesi (şu an `password-reset.ts` okuyor).
3. `password-reset.ts` içindeki `escapeHtml` ve `getAppUrl` kopyalarının kaldırılması.
4. `email-reference-parity.test.ts`in `sifre-sifirlama.html` ile genişletilmesi.
5. `/dev/email-preview` + ekran görüntüsü karşılaştırması (bu dalgada yapılamayan doğrulama).
6. E5'in Dalga 2 karşılığı: cihaz satırı çözülemezse meta ızgarasının tek kolona düşmesi
   (`metaGrid` bunu zaten destekliyor ve testi var).

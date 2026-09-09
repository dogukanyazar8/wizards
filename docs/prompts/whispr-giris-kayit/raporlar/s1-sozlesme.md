# Ş1 — Sözleşme · token · metrik · i18n (Dalga 1 kapısı)

Durum: **tamamlandı.** UI yazılmadı. Dal: `uat`. Commit yok (çalışma ağacında).

Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §1, §2, §3, §4, §5, §6, §10, §13.
Kararlar: `docs/prompts/whispr-giris-kayit/PLAN.md` §3 (K1 · K5 · K7 · K8 · K9 · K10 · K12).

---

## 1. Ne yapıldı

### 1.1 `@wizards/types` — kimlik sözleşmesi

| Dosya                                        | İş                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/auth-password-policy.ts` | **yeni.** SPEC §4.4/5 dört kuralı ve dört regexi tek kaynağa aldı: `evaluatePasswordStrength` · `meetsPasswordPolicy` · `getUnmetPasswordRules`. `PASSWORD_MIN_LENGTH = 10`, `PASSWORD_REQUIRED_RULE_COUNT = 3`.                                                                                                                                                            |
| `packages/types/src/auth.ts`                 | `RegisterSchema` yeniden kuruldu (`displayName` geldi, `confirmPassword` düştü — K10). `LoginSchema`'dan `twoFactorCode` **çıktı** (K2). Yeni: `TwoFactorChallengeSchema` · `BackupCodeChallengeSchema` · `EmailVerificationCodeSchema` · `ResendVerificationSchema` · `DisplayNameSchema` · `UsernameSchema`. `NewPasswordSchema` min 8 → **min 10 + en az 3 kural** (K9). |
| `packages/types/src/index.ts`                | `auth-password-policy` dışa vuruldu.                                                                                                                                                                                                                                                                                                                                        |

Kurallar birebir SPEC'ten: `/[a-zçğıöşü]/` + `/[A-ZÇĞİÖŞÜ]/` · `/\d/` ·
`/[^A-Za-z0-9çğıöşüÇĞİÖŞÜ\s]/`. Ton eşlemesi `0–1 danger · 2 warning · 3–4 success`.

**Uzunluk kuralı gönderim kapısında ayrıca zorunlu.** Yalnız `satisfiedCount >= 3` yetseydi
9 karakterlik `Ab1!efghi` geçerdi; `meetsPasswordPolicy` uzunluğu ayrı kontrol eder.

**Kullanıcı adı ürün kuralında bırakıldı** (K8): 2–32, `a-zA-Z0-9_`. Tasarımın 3–20 / `a-z0-9._`
metni ekranda görünmüyor, görsel sapma yok.

### 1.2 Auth token katmanı (K5)

`apps/web/src/app/globals.css` sonuna iki blok: `[data-auth-surface]` (SPEC §1.1, 17 token) ve
`[data-auth-surface][data-auth-theme="dark"]` (SPEC §1.2, 17 token). `--surface-inset` ürüne
**yalnız burada** girdi. Global `:root` ve 20+ `html.theme-*` bloğuna dokunulmadı; ölçülmüş
`-soft` invaryantı ve `splash-contrast.test.ts` kapısı yerinde.

`--desktop-titlebar-height` **34px → 38px** (K7).

### 1.3 Ölçü sözlüğü

`apps/web/src/lib/auth/metrics.ts` → `AUTH_METRICS` (23 dal, 300+ ölçü) + `AUTH_MIN_TAP_TARGET`.
`pxToRem` · `pxToEm` · `hairline` `lib/home/metrics`'ten yeniden dışa vuruldu — ikinci ölçek
motoru yazılmadı. Sözlük **renk taşımıyor**; test bunu ayrıca doğruluyor.

### 1.4 Durum kataloğu

`apps/web/src/lib/auth/status-catalog.ts` → SPEC §7'nin 10 durumu + SPEC §8'in üç seviyesi.
Her kayıt ton, seviye, glif ve metin **anahtarı** taşıyor; metin katalogda değil sözlükte.
`accountSuspended` `supported: false` ile işaretli (§3/2).

### 1.5 i18n

- `apps/web/src/lib/locale/messages/tr.ts` · `en.ts` → **176 yeni `auth.*` anahtarı**
  (SPEC §13'ün 164 satırı + §13 tablosunda olmayan 12 metin).
- `apps/mobile/src/locale/mobile-copy.ts` → aynı 176 metin `identity*` camelCase adlarıyla.
- `apps/web/src/lib/auth/skipped-copy.ts` → `SKIPPED_BY_K1` (8 telefon anahtarı).
- Eşleme tablosu: **`raporlar/s1-metin-eslemesi.md`** — sonraki altı şeridin tek metin kaynağı.

### 1.6 Mobil tasarım katmanı

- `apps/mobile/src/design/palette.ts` → `redesignAuthLight` / `redesignAuthDark` içine SPEC §1.1
  ve §1.2'nin 16'şar tokenı `spec*` önekiyle eklendi. Mevcut anahtarlar **silinmedi** (§3/1).
- `apps/mobile/src/design/tokens.ts` → `mobileAuthMetrics` (SPEC §6) ve `mobileAuthTypography`
  (SPEC §1.3 — başlık/rakam Outfit, gövde/form Figtree) eklendi. Yeni font yüklenmedi.

---

## 2. Testler

| Dosya                                                    | Test | Sonuç |
| -------------------------------------------------------- | ---- | ----- |
| `packages/types/src/auth-password-policy.test.ts`        | 13   | ✅    |
| `packages/types/src/auth.test.ts`                        | 14   | ✅    |
| `apps/web/src/lib/auth/auth-tokens.test.ts`              | 7    | ✅    |
| `apps/web/src/lib/auth/metrics.test.ts`                  | 9    | ✅    |
| `apps/web/src/lib/locale/auth-screen-copy.test.ts`       | 7    | ✅    |
| `apps/mobile/scripts/mobile-auth-token-contract.test.ts` | 10   | ✅    |

Paket geneli:

- `pnpm --filter @wizards/types test` → **584/584 ✅**
- `pnpm --filter @wizards/mobile test` → **1980/1980 ✅**
- `pnpm --filter @wizards/web typecheck` → auth/i18n tarafında **0 hata**; ağaçta kalan iki hata
  bu şeride ait değil (§4).

Kontrast ölçümü kapıya bağlandı: SPEC'in altı `-soft` tonu, kendi `--surface-card` ve
`--surface-inset` zeminlerinde iki temada da **≥ 4.5:1** (SPEC §12/6).

---

## 3. Kırılan ve düzeltilen çağrı yerleri

| Dosya                                                        | Ne oldu                                                                                                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(auth)/login/login-client.tsx`                          | `LoginSchema` artık `twoFactorCode` taşımıyor. Ekran Ş4'te yeniden kurulacağı için yerel `LegacyLoginFormSchema` eklendi (`TODO(Ş4)`); **ürün davranışı değişmedi**, satır içi 2FA alanı çalışmaya devam ediyor.      |
| `app/(auth)/register/page.tsx`                               | `confirmPassword` sözleşmeden düştü. Yerel `LegacyRegisterFormSchema` eklendi (`TODO(Ş5)`); `displayName` gönderimde kullanıcı adından türetiliyor — bugünkü sunucu davranışının aynısı.                              |
| `lib/auth/actions.ts`                                        | `registerAction` `displayName` okuyor ve `User.displayName`'e yazıyor (eskiden `username` yazılıyordu). `loginAction` 2FA kodunu şemadan değil ham formdan okuyor (`TODO(Ş2)`) ki 2FA açık hesaplar giriş yapabilsin. |
| `lib/auth/auth-schema.test.ts`                               | 2FA testi ikiye ayrıldı: kodun giriş formunda **olmadığı** + challenge sözleşmesinde olduğu.                                                                                                                          |
| `lib/zod-form-resolver.test.ts`                              | Özel doğrulama anahtarı kontrolü `TwoFactorChallengeSchema` üstüne taşındı.                                                                                                                                           |
| `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts` | Auth paletinin beklenen tablosu 16'şar yeni `spec*` tokenıyla güncellendi.                                                                                                                                            |
| `apps/mobile/scripts/mobile-copy-parity.test.ts`             | İki istisna eklendi: `Cloudflare Turnstile` ve `Whispr 2026` iki dilde aynı; `Türkiye` özel adı İngilizce sütunda meşru (SPEC §13 böyle veriyor).                                                                     |

---

## 4. Bu şeride ait olmayan, ağaçta duran hatalar

`pnpm --filter @wizards/web typecheck` iki hata daha veriyor. İkisi de başka bir çalışmanın
commit edilmemiş dosyalarından geliyor, Ş1'in dokunduğu hiçbir dosyayla ilgisi yok:

- `apps/web/src/lib/polls/service.test.ts` — `authorizeChannelViewer` ve `channelId`
  `PollServiceDependencies` üstünde yok (kanal içi anket çalışması yarım).
- Şerit çalışırken bir ara `apps/web/src/components/servers/modals/channel-form-model.test.ts`
  de `hasCreateChannelProgress` eksikliğinden düştü, sonra ağaçtan kalktı.

Ş1 bunlara **dokunmadı**. Dalga 2 başlamadan önce bu iki dosyanın sahibi tarafından
kapatılması gerekiyor, yoksa `typecheck` kapısı yeşile dönmez.

---

## 5. Sonraki şeritler için borç ve uyarı

1. **Mobil kayıt sözleşmesi ayrı.** `MobileAuthRegisterRequestSchema` (`packages/types/src/mobile.ts`)
   hâlâ `confirmPassword` taşıyor ve `displayName` bilmiyor. Web sözleşmesiyle hizalanması
   **Ş2'nin** işi; Ş8 mobil ekranları o sözleşmeye bağlayacak.
2. **Şifre gücü etiketlerinin İngilizcesi SPEC'te yok.** Dördü (`Very weak · Weak · Medium · Good`)
   bu şeritte türetildi — `s1-metin-eslemesi.md` §Uyarılar/1.
3. **Altı i18n anahtarı eski sözlükle çakıştı**, SPEC değerleri kazandı, eskiler silindi.
   Eski giriş/kayıt ekranları bu anahtarları okuyor; metinleri artık SPEC metni. Liste:
   `s1-metin-eslemesi.md` §Uyarılar/4.
4. **`redesignAuthLight` içinde ölü anahtarlar var.** `profileGamer*` · `profileCorporate*` ·
   `feature*` eski karşılama ekranının kitle seçicisine ait; K4 o seçiciyi kaldırıyor.
   Silinmedi (Ş1 kapsamı değil) — **Ş8** ekranları taşıdıktan sonra **Ş9** temizler.
   Aynı şey `mobileTypography.auth*` girdileri için de geçerli (Jakarta yüzü, eski tasarım).
5. **`--font-auth-body` (DM Sans)** hâlâ `globals.css:4454`'te auth'a bağlı. Ş3 bunu
   `--font-sans`'a çevirecek.
6. **`LegacyLoginFormSchema` ve `LegacyRegisterFormSchema`** geçici. Ş4 ve Ş5 kendi ekranını
   kurunca **silinmeli**; kalırsa iki doğruluk kaynağı doğar.
7. **`accountSuspended` durumu `supported: false`.** Ş2 askı verisinin kaynağını bulacak;
   bulamazsa katalog kaydı akışa bağlanmaz (boş referans numarasıyla blok gösterilmez).

# Ş3 — Ortak UI parçaları (Dalga 1)

Durum: **tamamlandı.** Ekran yazılmadı. Dal: `uat`. Commit yok.

Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §2, §3, §4 (ortak tablo), §7, §8, §9, §11.
Kararlar: `PLAN.md` §3 (K4 · K5 · K6 · K13 · K14).

---

## 1. Dalga 2'nin bileşen sözleşmesi

Hepsi `@/components/auth/*`. Ölçü ve renk **hiçbirinin içinde** yoktur: sınıflar
`globals.css` içinde, sınıfların okuduğu değişkenler `lib/auth/css-vars.ts` üstünden
`AUTH_METRICS`'ten gelir.

### 1.1 Kabuk

| Bileşen                 | Özellikler                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `AuthScreenLayout`      | `variant?: "default" \| "register"` · `align?: "start" \| "center"` · `auroraTone?`                       |
| `AuthAurora`            | `tone?: "default" \| "danger-field" \| "danger-banner" \| "danger-block" \| "success" \| "success-final"` |
| `AuthBrandPanel`        | özelliği yok; metinleri `auth.brand.*`'tan okur                                                           |
| `ThemeLanguageControls` | özelliği yok; dil `LocaleProvider`, tema `data-auth-theme` (K6)                                           |
| `FooterSecurity`        | özelliği yok; `variant="register"` iken kabuk **çizmez** (K13)                                            |

`AuthScreenLayout` içeriği şu sırayla basar — sıra sözleşmenin parçası (kabul kriteri 1):
`AuthAurora` → `AuthBrandPanel` → form sütunu → `ThemeLanguageControls` → alt bilgi.

### 1.2 Form ilkeleri

`AuthEyebrow` · `AuthTitle` · `AuthDescription` · `TextInput` · `PasswordInput` ·
`PrimaryButton` · `SecondaryButton` · `AuthLink` · `AuthDivider` · `AuthCheckbox`.

- `TextInput`: `label` · `labelAction` (etiket satırının sağı — `Şifremi unuttum`) · `hint`
  (alanın altı — kullanıcı adı ipucu, e-posta algılama satırı) · `error` (seviye 1) ·
  `size: "default" | "compact" | "code"` · `tone: "danger" | "warning"`.
  `error` verildiğinde alan `aria-invalid` ve `aria-describedby` alır (SPEC §11).
- `PasswordInput`: `TextInput` + `Göster`/`Gizle` düğmesi (SPEC §4.4/3).
- `PrimaryButton`: `loading` → zemin `--primary/.85`, metnin soluna 14px spinner.
- `AuthCheckbox`: `label` + `trailing` (satırın sağına `3 deneme kaldı` sayacı girer).

### 1.3 Özel parçalar

| Bileşen                                                                                                                                     | Dosya                        | Notlar                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthCodeInput`                                                                                                                             | `auth-code-input.tsx`        | `value` · `onChange` · `onComplete` · `tone` · `ariaLabel`. Görünmez tek `<input autocomplete="one-time-code" inputmode="numeric">`, hücreler görsel. Yapıştırma dağıtır, `Backspace` geri döner. **Otomatik gönderim yok.** |
| `AuthPasswordStrength`                                                                                                                      | `auth-password-strength.tsx` | `strength: PasswordStrength` alır; skoru **hesaplamaz**                                                                                                                                                                      |
| `AuthTurnstileRow` · `AuthSuggestionChip` · `AuthCountdownPill` · `AuthSuccessTile` · `AuthSuccessRing` · `AuthInfoBand` · `AuthStatusCard` | `auth-pieces.tsx`            |                                                                                                                                                                                                                              |
| `AuthBanner` · `AuthBlockingPanel` · `AUTH_TONE_VARS`                                                                                       | `auth-error-levels.tsx`      | Bant success varyantında karo glifi `↻` (SPEC §4.7)                                                                                                                                                                          |
| `SocialAuthButtons`                                                                                                                         | `social-login.tsx`           | `disabled` · `onSelect(provider)` · `shortLabels` (SPEC §6/1 mobil)                                                                                                                                                          |

---

## 2. Ne değişti

- **`app/(auth)/layout.tsx` muafiyet dalı kalktı.** login/register/forgot/reset artık kabuğu
  atlamıyor. Düzenin tek işi kaldı: açık/koyu seçimini ilk boyadan önce köke yazan senkron betik.
- **`components/auth/auth-screen.tsx` yeniden kuruldu.** `HeroSection` metin rotasyonu,
  `ProfileCards`, `AuthCard`, `BetaNotice` ve eski `FooterSecurity` (güvenlik satırı + sistem
  durumu) düştü; yerine SPEC §3.3/§3.5 geldi.
- **`social-login.tsx` yeniden kuruldu.** Discord düğmesi kalktı (K4); Google aktif, Microsoft ve
  Apple `disabled` + `aria-disabled` + `Yakında` rozeti, rozet erişilebilir ada giriyor.
- **`audience-selector.tsx` ve `role-tabs.tsx` silindi.** Kullanımları iki eski sayfadan
  temizlendi (`RoleTabs`, `getLoginRoleHint`, `selectedRole`). Bu, "sayfalara dokunma" kuralının
  tek istisnasıdır: dosyayı silip import'u bırakmak derlemeyi kırardı.
- **`--font-auth-body` (DM Sans) auth yüzeyinden düştü**, yerine `--font-sans` (Figtree, SPEC §1.3).
  `layout.tsx` içindeki font tanımı **durmaya devam ediyor** (Ş9 temizleyecek).
- **`globals.css`** yaklaşık 1 100 satırlık bileşen katmanı aldı: `.auth-*` sınıfları, dört
  keyframe (`wdrift` · `wglow` · `wcaret` · `wspin`) ve hareket azaltma bloğu.
- **Ş1'in koyu token bloğu iki seçiciye çıktı** (`[data-auth-surface][data-auth-theme="dark"]`
  **ve** `[data-auth-theme="dark"] [data-auth-surface]`), çünkü ilk boya betiği özniteliği
  `<html>`'e yazıyor; `auth-tokens.test.ts` buna göre güncellendi.

## 3. Yeni yardımcılar

| Dosya                              | İş                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/auth/css-vars.ts`             | `AUTH_METRICS` → ~180 CSS değişkeni. Yüzey (`web` / `desktop`) tek anahtar.                                                                                                |
| `lib/auth/auth-theme.ts`           | K6 — `data-auth-theme`, `localStorage`, ilk boya betiği.                                                                                                                   |
| `components/auth/auth-surface.tsx` | SPEC §5 ölçek kademesi bağlamı. **Ş7'nin planında bu dosya vardı**; bileşenler ölçeği okumak zorunda olduğu için Ş3'te doğdu, Ş7 yalnız masaüstü kabuğunu bununla saracak. |

## 4. Testler

`components/auth/auth-shell-contract.test.ts` — 11 test:
aurora sırası · kolonların opak zemin boyamaması · `interactive={false}` · wordmark gizleme ·
K14 sağlayıcı düzeni · **bileşenlerde çıplak `px`/hex/rgb yasağı** · metrik→değişken köprüsü
(web ≠ masaüstü) · hareket azaltmanın yalnız animasyonu kapatması · success bandının `↻` glifi ·
pill'in `nowrap`'i · tema anahtarının `next-themes`'e yazmaması.

Regresyon: `src/components/auth/**` + `src/lib/auth/**` + auth metin testi → **293/293 ✅**.
`pnpm --filter @wizards/web typecheck` → Ş3 tarafında **0 hata**.

## 5. Kararlar ve sapmalar

1. **`auth-reference-*` CSS silinmedi.** Şerit dosyası silinmesini istiyordu ama
   `turnstile-widget.tsx` üç sınıfını hâlâ kullanıyor (`auth-reference-turnstile-shell`,
   `-box`, `-state`) ve iki eski sayfa da bu ailenin içinde. Silmek çalışan bir bileşeni
   kırardı; **Ş9'a devredildi** — `modern-*` için zaten konulmuş olan kuralla aynı.
2. **`theme-toggle.tsx` silinmedi.** `login-page.tsx` hâlâ kullanıyor, o da iki eski sayfanın
   sarmalayıcısı. Ş4/Ş5 sayfaları kurunca üçü birden düşer.
3. **Ölçüler CSS değişkenine köprülendi.** SPEC'in piksel tablosu bir TS sözlüğünde, hover/odak/
   basılı durumları ise CSS'te yaşamak zorunda. Kökte bir kez basılan değişkenler ikisini
   birleştiriyor; bileşen dosyalarında çıplak `px` kalmıyor ve Ş9'un parity taraması bunu ölçüyor.
4. **`AuthCodeInput` altıncı hanede formu göndermiyor.** SPEC otomatik gönderim demiyor; kazara
   gönderim kullanıcıyı yanlış kodla kilide yaklaştırır. Düğme etkinleşir, karar kullanıcıda.
5. **Mobil ölçüler bu katmanda yok.** `AUTH_METRICS`'in mobil dalı duruyor ama web bileşenleri
   yalnız `web`/`desktop` kademesini okuyor; mobil ekranlar React Native tarafında (Ş8).

## 6. Sonraki şeritler için borç

1. **Eski sayfalar hâlâ `modern-*` işaretlemesiyle çalışıyor.** Ş3 yalnız kaldırılan bileşenlerin
   kullanımını temizledi; `/login` ve `/register` görsel olarak hâlâ eski kuşak. Ş4 ve Ş5 bu
   sayfaları `AuthScreenLayout` üstüne taşıyacak.
2. **`login-page.tsx` · `login-card.tsx` · `theme-toggle.tsx` · `auth-reference-*` · `modern-*`**
   — beşi de Ş4/Ş5 sonrası ölü kalacak; silme işi Ş9'da, kullanım taramasıyla.
3. **`turnstile-widget.tsx` yeniden giydirilmedi.** SPEC §4.4/6'nın satır görünümü
   `AuthTurnstileRow` olarak hazır; gerçek widget'ı bu satırın arkasına almak Ş5'in işi.
4. **`AuthStatusCard` kart içi parçaları boş.** 10 durumun içerikleri (sayaç bandı, öneri
   etiketleri, ilerleme çubuğu, hatalı alan) Ş9'da bağlanacak.

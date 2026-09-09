# Ş7 — Masaüstü kabuğu ve ölçek kademesi (Dalga 3)

Yalnız masaüstü kabuğu ve ölçek kademesi. Ekran içeriği Dalga 2'de kuruldu; bu şerit onu
1040×720 çerçevesiz pencereye oturtur.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3 (K7), `SPEC.md` §3.3 (masaüstü varyantı), §5, §3.4, §3.5
ve Ş3/Ş4/Ş5/Ş6 raporları.

---

## 1. Gerçekler

- Masaüstü **Tauri**'dir (`apps/desktop/src-tauri/`), Electron değil (Ç3). Pencere içeriği web
  uygulamasıdır; `html.whispr-desktop-chrome` sınıfı masaüstü modunu açar
  (`lib/desktop/runtime.ts` → `isWhisprDesktopRuntime`).
- `--desktop-titlebar-height` bugün 34px, **K7 gereği 38px olur** (Ş1 yaptı; bu şerit sonucu
  doğrular ve kırılan ölçek testlerini onarır).
- `globals.css` içinde `html.whispr-desktop-chrome .auth-canvas` ve `.auth-frame` kuralları var —
  yeni kabukla uyumlu hâle getirilir veya kaldırılır.

---

## 2. Başlık çubuğu (SPEC §5)

`components/auth/auth-desktop-titlebar.tsx`:

- Yükseklik **38px**, `border-bottom: 1px solid hsl(var(--border)/.35)`.
- Sürüklenebilir: `-webkit-app-region: drag`; **düğmeler `no-drag`**.
- Solda 16px içeriden `600 11px` `Whispr`.
- Sağda üç **38 × 28** kutu: `–` (13px), `▢` (10px), `✕` (12px), renk `--text-muted`.
  Hover zemini `--surface-soft`; `✕` hover'ı `--danger/.16` zemin + `--danger-soft` glif.
- Eylemler Tauri penceresine bağlanır (minimize · maximize/unmaximize · close). Tauri API'si
  yoksa (tarayıcıda açıldıysa) çubuk **render edilmez**.
- A11y: her düğme `aria-label` alır (`auth.desktop.minimize` · `.maximize` · `.close`);
  klavyeyle erişilebilir, `:focus-visible` halkası SPEC §9 halkasıdır.

Pencere: köşe 16, `1px solid --border/.55`,
`box-shadow: 0 26px 58px -26px hsl(var(--foreground)/.24)`.

---

## 3. Ölçek kademesi (SPEC §5)

Masaüstünde tipografi bir kademe küçülür. `AUTH_METRICS`'in `desktop` dalı zaten bu değerleri
taşıyor (Ş1); bu şerit kabuk seviyesinde bir bağlam anahtarı kurar:

```tsx
<AuthSurfaceProvider surface="desktop"> … </AuthSurfaceProvider>
```

Ş3'ün bileşenleri bu bağlamı okuyup `AUTH_METRICS[surface]` dalını seçer.
**Bileşenlerin içine `if (isDesktop)` yazılmaz**; tek anahtar, tek sözlük.

| Öğe               | Web                                                                                                              | Masaüstü                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Marka paneli      | 512 / `56px 52px` / halka 150 / `scale(1.55)` / wordmark 42 / slogan 14.5 / ayırıcı 300 / başlık 21 / gövde 13.5 | **376** / `40px 38px` / halka **104** / `scale(1.2)` / wordmark **32** / slogan **13** / ayırıcı **230** / başlık **18** / gövde **12.5** |
| Form sütunu       | `0 72px` / 384 (kayıt `0 56px` / 424)                                                                            | `0 56px` / **352** (kayıt `0 48px` / **392**)                                                                                             |
| Başlık            | 29                                                                                                               | **25**                                                                                                                                    |
| Açıklama          | 13.5                                                                                                             | **12.5–13**                                                                                                                               |
| Etiket            | 12.5                                                                                                             | **12**                                                                                                                                    |
| Alan              | h46 / 14px                                                                                                       | **h42–44** / **13.5px**                                                                                                                   |
| Birincil düğme    | h48 / 14.5                                                                                                       | **h46** / **14**                                                                                                                          |
| Sağlayıcı düğmesi | h44                                                                                                              | **h42**                                                                                                                                   |
| Dil/tema seçici   | h30, segment 26, `top:26 right:32`                                                                               | **h28**, segment **24**, `top:18 right:22`                                                                                                |
| Alt bilgi         | `left/right:72 bottom:30`                                                                                        | `left/right:56 bottom:22`                                                                                                                 |
| Aurora            | `inset:-30%`, 18s                                                                                                | `inset:-32%`, `32% 36% at 30% 36%` / `26% 30% at 72% 70%`, **16s**                                                                        |

---

## 4. Kapsam

- **Çizili iki pencere:** Giriş ve Hesap oluştur.
- **Devralanlar:** 2FA · yedek kod · e-posta doğrulama · şifremi unuttum · bağlantı gönderildi ·
  yeni şifre · şifre güncellendi — aynı kabuk, aynı ölçek kademesi, web muadilinin içeriği
  (SPEC §5 son paragraf). Ayrı tasarım yok, ayrı kod da yazılmaz.

---

## 5. Doğrulama ve onarım

1. `--desktop-titlebar-height` 38px olduktan sonra **tüm** web testleri koşulur; ölçek/yükseklik
   bekleyen snapshot ve birim testleri düzeltilir (`calc(100dvh - var(--desktop-titlebar-height))`
   okuyan beş yer dahil).
2. `apps/desktop/scripts/desktop-trust-boundary.test.mjs` ve varsa masaüstü sözleşme testleri
   yeşil kalır.
3. `.auth-canvas` / `.auth-frame` kuralları yeni kabukla çakışıyorsa kaldırılır; kaldırılan her
   kural rapora yazılır.

## 6. Testler

- `auth-desktop-titlebar.test.tsx`: 38px yükseklik, üç düğme 38×28, `no-drag` bölgeleri,
  Tauri API yokken render edilmemesi, `aria-label`'lar.
- `auth-surface-context.test.tsx`: `surface="desktop"` altında marka paneli 376, form sütunu 352,
  başlık 25, seçici h28 — sözlükten okunuyor, sabit sayı yok.
- Kaynak taraması: bileşenlerin içinde `whispr-desktop-chrome` koşulu yok (tek anahtar kuralı).

## 7. Bitirme

`pnpm --filter @wizards/web typecheck` + `test`, `pnpm --filter @wizards/desktop test`
(varsa) yeşil.
Rapor: `raporlar/s7-masaustu.md` — 38px geçişinin kırdığı ve onarılan testler, kaldırılan CSS
kuralları, SPEC §5 tablosunun satır satır doğrulaması.

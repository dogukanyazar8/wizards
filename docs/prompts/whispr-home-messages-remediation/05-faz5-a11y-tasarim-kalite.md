# Faz 5 Prompt — Erişilebilirlik, Responsive, Görsel Kalite

`00-ortak-baglam.md` ve Faz 1–4 raporlarını oku. Bu faz davranışı yeniden tasarlamaz; mevcut Ana Sayfa ve
Mesajlar görsel sözleşmesini erişilebilir, responsive ve deterministik yapar. Global shell padding'e dokunma.

## Başlangıç

```powershell
graphify query "Home Messages overlay focus trap restore trigger touch target contrast responsive reduced motion parity a11y"
git status --short --branch
```

İncele:

- Shared side panel/overlay, `thread-panel.tsx`, `message-search-panel.tsx`, pin panel/sheet
- Home header/cards/list rows/primitives
- Messages rail/header/composer/message toolbar/friend rows
- `apps/web/e2e/specs/design/home-parity.spec.ts`
- `apps/web/e2e/specs/design/messages-parity.spec.ts`
- `apps/web/e2e/specs/design/messages-responsive.spec.ts`
- `apps/web/e2e/specs/a11y/messages-a11y.spec.ts` ve ortak a11y spec'leri
- `apps/web/src/lib/home/metrics.ts`, Messages metrics/density ve global tokens

## 1. Focus yönetimi

Her overlay için component testi + browser testi:

- Açılışta focus görünür heading/close/ilk anlamlı kontrole gider.
- `Tab` son kontrolden ilk kontrole; `Shift+Tab` heading/ilk sınırdan son kontrole döner.
- `Escape` yalnız üstteki overlay'i kapatır.
- Backdrop click sözleşmeye uygunsa kapatır; içeride click kapatmaz.
- Kapanınca mount anındaki gerçek `document.activeElement` tetikleyicisine döner; tetikleyici DOM'dan çıktıysa
  güvenli fallback kullanılır.
- Conversation değişimiyle otomatik kapanma focus'u görünmeyen/eski elemana göndermez.
- Thread panel açılışı composer focus'unu zorlamaz.

Ortak overlay primitive zaten varsa orada düzelt. Her panelde ayrı focus trap yazma. Yeni dependency ekleme.

## 2. 44×44 pointer hedefleri

Ana Sayfa ve Mesajlar parity helper'ının ürettiği allowlist raporunu güncel kaynaktan çıkar. Her pointer control:

- Fiziksel hit area en az 44×44 CSS px.
- Görsel ikon/chip ölçüsü tasarımla aynı kalabilir; pseudo-element, padding + negatif margin veya mevcut hit-area
  primitive kullan.
- Hit area komşu butonun alanına binmez; `elementFromPoint` ile merkez ve kenarlar test edilir.
- Inline semantic text link için bile dikey hit region mümkünse 44px; istisna zorunluysa exact test id + gerekçe ile
  kapalı allowlist. Genel selector/klasör allowlist yasak.
- UI scale ×1, ×1.15, ×1.5, ×2 ve 900px responsive yüzeylerinde ölç.

## 3. Kontrast ve tema

- `--text-muted` + `--surface-tertiary` gibi bilinen düşük kombinasyonları gerçek computed renklerle ölç.
- Normal metin 4.5:1; büyük metin/UI sınırı 3:1.
- Mevcut `--primary-readable`, `--warning-readable`, `--text-secondary` gibi semantik token'ları kullan.
- Global token'ı değiştirmek bütün uygulamayı etkiliyorsa yalnız ilgili component sınıfını düzelt.
- Hex/RGBA sabit renk veya tema başına inline istisna ekleme. Data-URI cursor renkleri mevcut gerekçeli allowlist'te
  kalır.
- Açık/koyu tema ve high-contrast benzeri mevcut tema eksenlerinde test et.

## 4. Responsive ve görsel parity

- 6 viewport × 2 tema × mevcut 11 Messages state matrisi skipsiz çalışmalı.
- Home parity mevcut viewport/theme/state matrisini korumalı.
- 900px'te rail/panel drawer davranışı; `Escape`, backdrop, scroll ownership.
- 1360×920 tabanında shell 12px padding nedeniyle mevcut ölçü sözleşmesini kullan; viewport'a full-bleed yapmak için
  global CSS değiştirme.
- Text clipping, horizontal overflow, overlapping hit areas, fixed-height localization taşması yok.
- UI scale root font yarışını test helper'da bekle; arbitrary sleep kullanma.
- Reduced motion'da animated transition/skeleton/parallax kapalı veya anlık.

## 5. Semantik ve hata durumları

- Dialog/panel doğru role, accessible name, labelled heading.
- Tabs `aria-selected`; busy surfaces gerçek boolean `aria-busy`; disabled kontrol erişilebilir açıklama taşır.
- Mutation/server hatası yalnız renk ile anlatılmaz; live region veya görünür metin vardır.
- Icon-only controls localized accessible name taşır.

## Dar testler

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/components/home/home-a11y.test.tsx src/components/home/home-interactions.test.tsx src/components/chat/message-item-contract.test.ts src/components/friends/friend-row.test.tsx
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web lint
pnpm.cmd --filter @wizards/web typecheck
graphify update .
```

Browser/E2E için yabancı `:3000` sürecini kapatma. Port boşsa mevcut config'i kullan; doluysa final fazdaki ayrı
port prosedürünü kullan. Axe, parity veya visual çalışmazsa `ENV BLOCKED`; kaynak testiyle görsel PASS iddia etme.

Rapor: `docs/prompts/whispr-home-messages-remediation/raporlar/05-faz5-rapor.md`.

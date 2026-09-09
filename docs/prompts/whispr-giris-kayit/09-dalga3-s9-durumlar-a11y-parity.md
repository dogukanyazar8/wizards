# Ş9 — 10 durum kartı · a11y · parity kapısı · temizlik (Dalga 3, kapanış)

Bu şerit paketi kapatır: SPEC §7'nin 10 kartını içerikle bağlar, SPEC §11 erişilebilirlik
maddelerini doğrular, SPEC §12'nin dokuz kriterini + paketin dört ek kriterini otomatik kapıya
bağlar, ölü kodu temizler.

Oku: `00-ortak-baglam.md`, `PLAN.md` §4 (13 kriter), `SPEC.md` §7, §8, §9, §11, §12 ve
**tüm** önceki şerit raporları.

---

## 1. 10 durum kartı (SPEC §7)

Ş3 kart kabuğunu bıraktı; bu şerit her kartın **içini** kurar ve gerçek akışa bağlar.

| #   | `AuthStatusId`     | Ton                                              | Kart içi parça                                                                    | Nerede tetiklenir                                 |
| --- | ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `credentials`      | danger                                           | Hatalı şifre alanı + `✕ E-posta ya da şifre eşleşmiyor` + `3 deneme kaldı`        | `/login` seviye 1                                 |
| 2   | `accountLocked`    | danger                                           | h44 sayaç bandı `Kalan süre 14:32` + `Şifremi sıfırla` / `Giriş ekranına dön`     | `/login` seviye 3                                 |
| 3   | `codeInvalid`      | danger                                           | Altı hücre kırmızı dolu (`914027`) + `Yedek kod kullan` + `Tekrar gönder · 00:42` | `/login/two-factor`, `/verify-email` seviye 1     |
| 4   | `usernameTaken`    | warning                                          | Uyarı alanı + üç öneri etiketi                                                    | `/register` seviye 1                              |
| 5   | `passwordWeak`     | warning                                          | Uyarı alanı + %50 çubuk + 2/4 kural listesi                                       | `/register`, `/reset-password` seviye 1           |
| 6   | `emailRegistered`  | warning                                          | Uyarı alanı + `Giriş yap` / `Şifremi sıfırla`                                     | `/register` seviye 1                              |
| 7   | `network`          | danger                                           | Band `whispr.app · 503` + `Tekrar dene`                                           | her ekran, seviye 2                               |
| 8   | `linkExpired`      | warning                                          | Bilgi kutusu (adres + `26.08.2026 · 14:02`) + `Yeni bağlantı gönder`              | `/reset-password`, `/verify-email` seviye 3       |
| 9   | `rateLimit`        | warning                                          | Devre dışı `Yeni kod · 01:58` düğmesi + **%34 ilerleme çubuğu**                   | `/verify-email`, `/forgot-password/sent` seviye 2 |
| 10  | `accountSuspended` | **nötr** (`--surface-soft` / `--text-secondary`) | `Referans · WSP-40219` + `İtiraz gönder` / `Kuralları oku`                        | `/login` seviye 3                                 |

Kurallar:

- Hatalı alan biçimi: `1.5px solid <ton>`, zemin `<ton>/.06`–`/.07`; odaklıysa ek
  `0 0 0 3px <ton>/.14` halkası.
- Metin **her zaman** `-soft`; doygun ton yalnız zemin tint'i, kenarlık ve 8px nokta.
- 9,5px uppercase etiket **asla** doygun tonda yazılmaz.
- Durum 10 nötr tondadır — `--danger` kullanılmaz.
- Ş2'nin `supported: false` bayrağı olan durumlar (ör. askı desteği yoksa) katalogda kalır ama
  akışa bağlanmaz; rapora yazılır.

Bunlar ayrıca bir **iç galeri sayfasında** toplanır: `/dev/auth-states` (yalnız
`NODE_ENV !== "production"`) — 10 kart + 3 hata seviyesi + 10 bileşenin 5 durumu tek sayfada.
Bu sayfa tasarım denetimini elle yapılabilir kılar ve görsel testin hedefidir.

---

## 2. Erişilebilirlik kapısı (SPEC §11)

`apps/web/src/components/auth/auth-a11y.test.tsx` + e2e:

1. Form üstü bant `role="alert"`.
2. Alan içi mesaj `aria-describedby` ile alana bağlı, alan `aria-invalid="true"`.
3. Kod hücreleri tek alan gibi: `inputmode="numeric"`, `autocomplete="one-time-code"`,
   yapıştırma dağıtımı, Backspace geri dönüşü.
4. Sağlayıcı düğmeleri `disabled` **ve** `aria-disabled`; `Yakında` rozeti erişilebilir ada girer
   (`aria-label="Microsoft ile devam et — Yakında"` veya `aria-describedby`).
5. Tema seçici `role="radiogroup"`, dil seçici `aria-haspopup="menu"`; ikisi de klavyeyle
   gezilebilir, `Esc` kapatır, odak tetikleyiciye döner.
6. Hiçbir yerde tek başına `outline:none` yok; tüm halkalar `:focus-visible`.
7. `prefers-reduced-motion: reduce` altında aurora · ışıma · imleç · spinner durur;
   **düzen ve renk değişmez** (hesaplanan `background-color` karşılaştırması).
8. Her ekranda `<h1>` tek ve doğru; sekme sırası görsel sıra ile aynı.
9. Kontrast: tüm `-soft` metinler kendi zemininde **≥ 4.5:1** (light + dark, hesaplamalı test).

---

## 3. Parity kapısı (SPEC §12 + paket ekleri)

`apps/web/src/lib/auth/parity.test.ts` (node) — kaynak/CSS okuyarak:

| #   | Kriter                                                             | Nasıl ölçülür                                                                 |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | Aurora kökün ilk çocuğu, kolonlarda opak zemin yok                 | Bileşen ağacı testi + CSS taraması                                            |
| 2   | Logo çubukları 3px / `17·25·34·24·18`, hareketli, yalnız `scale()` | `BrandLogo` + `AUTH_METRICS.logo`                                             |
| 3   | Google aktif; MS/Apple `Yakında` + disabled; Discord yok           | `SocialAuthButtons` testi                                                     |
| 4   | Güç göstergesi ve kural listesi canlı                              | Ş5 testi + skor→ton eşlemesi                                                  |
| 5   | Tema/dil anında; sabit metin yok                                   | Kaynak taraması: `app/(auth)/**` + `components/auth/**` içinde TR/EN dize yok |
| 6   | Durum metinleri `-soft` ve ≥4.5:1                                  | Kontrast testi (§2/9)                                                         |
| 7   | Mobil dokunma hedefi ≥44                                           | `mobile-auth-metrics.test.ts` (Ş8)                                            |
| 8   | Alt bilgi K13'e uyuyor                                             | Ekran testleri                                                                |
| 9   | Metinler SPEC §13 ile birebir                                      | `auth-copy-parity.test.ts` (Ş1) + `SKIPPED_BY_K1`                             |
| 10  | Challenge'sız 2FA'ya girilemez, tek kullanımlık, 5 dk              | Ş2 testleri + e2e                                                             |
| 11  | 5 denemede 15 dk kilit, sayaçlar ekranda                           | Ş2 + e2e                                                                      |
| 12  | Şifre güncellenince oturumlar kapanır, sayı gerçek                 | Ş2 + e2e                                                                      |
| 13  | Reduced-motion tüm animasyonu durdurur                             | §2/7                                                                          |

**Ölçü taraması:** `components/auth/**` ve `app/(auth)/**` içinde `AUTH_METRICS` dışından gelen
çıplak `px` sayısı (0, 1px hairline ve `100%` hariç) bulunursa kapı düşer.

**Renk taraması:** aynı dosyalarda `#` ile başlayan hex renk veya `rgb(`/`rgba(` bulunursa kapı
düşer (SPEC §1: yalnız `hsl(var(--token))`).

---

## 4. E2E (yerel ortam ayaktaysa)

`apps/web/e2e/specs/auth/auth-parity.spec.ts` (yeni klasör):

- 1280×720'de 10 web ekranının açık ve koyu temada ekran görüntüsü; yatay kaydırma yok,
  metin kırpılmıyor, içerik kabuk içinde bitiyor (mevcut `helpers/design-parity.ts` kullanılır —
  yeniden yazılmaz).
- Giriş → 2FA → başarı; giriş → 5 hatalı deneme → kilit bloğu;
  şifremi unuttum → gönderildi → yeniden gönderildi (pill) → süre sonunda bağlantının dönmesi.
- `apps/web/e2e/specs/a11y/auth-a11y.spec.ts`: axe taraması, sekme sırası, `role="alert"` duyurusu.
- Koşulamıyorsa rapora **"koşulamadı"** yazılır; "geçti" yazılmaz.

---

## 5. Temizlik

1. **`modern-*` sınıfları.** `globals.css` içindeki 325 kullanım taranır. Auth dışında kullanılan
   sınıf **silinmez**; yalnız auth'a özel olanlar kaldırılır. Silinen her seçici rapora yazılır.
2. `auth-reference-*` blokları (Ş3 kaldırdı) — kalıntı kontrolü.
3. Ölü bileşenler: `audience-selector.tsx`, `role-tabs.tsx`, `login-card.tsx`, `login-page.tsx`,
   `theme-toggle.tsx` — her biri için kullanım taraması, sıfırsa silinir.
4. `--font-auth-body` (DM Sans) hiçbir yerde kullanılmıyorsa `app/layout.tsx`'ten ve
   `app/fonts/dm-sans-latin.woff2` bağından çıkarılır (dosya silinmez, bağ kaldırılır).
5. Kullanılmayan i18n anahtarları: eski `auth.*` anahtarlarından hangileri artık çağrılmıyor,
   listelenir — **silinmez**, rapora yazılır (başka yüzey kullanıyor olabilir).

---

## 6. Bitirme

Tam kapı:

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile test
```

Rapor: `raporlar/s9-kapanis.md` — 13 kriterin tek tek sonucu (✓ / ✗ / koşulamadı),
10 durum kartının bağlandığı yerler, `supported:false` kalan durumlar, silinen ve
silinmeyen ölü kod listesi, kalan açık borçlar.

Ayrıca `raporlar/PAKET-OZETI.md`: dokuz şeridin özeti, tasarımdan bilinçli sapmaların tam listesi
(K1 · K7 · K8 · Ç1–Ç6) ve her birinin gerekçesi.

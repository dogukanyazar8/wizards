# Giriş · Hesap oluşturma · Kurtarma — paket özeti

**Dal:** `uat` · **Tarih:** 2026-08-27 · **Durum:** dokuz şeridin tamamı landed, **hiçbiri commit edilmedi**
**Otorite:** `design_handoff/giris-kayit-paketi/SPEC.md` (+ `referans.html`)

---

## 1. Dokuz şerit

| Şerit  | Konu                                                | Rapor                                                                           | Ne bıraktı                                                                                                                                               |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş1** | Sözleşme · token · metrik · i18n · şifre politikası | [s1-sozlesme.md](s1-sozlesme.md) · [s1-metin-eslemesi.md](s1-metin-eslemesi.md) | `auth-password-policy.ts`, `[data-auth-surface]` token katmanı, `AUTH_METRICS` (23 dal), `AUTH_STATUS_CATALOG` (10 durum), 176 metin çifti               |
| **Ş2** | Kimlik backend                                      | [s2-kimlik-backend.md](s2-kimlik-backend.md)                                    | Sunucu taraflı 2FA challenge (Redis, 5 dk, tek kullanımlık, parmak izli), e-posta kodu, 5/15 dk kilit, askı referansı, `EmailVerificationCode` migration |
| **Ş3** | Ortak UI parçaları                                  | [s3-ortak-parcalar.md](s3-ortak-parcalar.md)                                    | Kabuk (aurora → marka → form), 10 bileşen, üç hata seviyesi, ~180 CSS değişkeni köprüsü, ~1100 satır `.auth-*` CSS                                       |
| **Ş4** | Giriş · 2FA · yedek kod                             | [s4-giris-2fa.md](s4-giris-2fa.md)                                              | `/login`, `/login/two-factor`, `/login/backup-code` + challenge taşıyıcısı                                                                               |
| **Ş5** | Hesap oluştur                                       | [s5-hesap-olustur.md](s5-hesap-olustur.md)                                      | `/register`, kullanıcı adı uygunluk ucu, canlı güç göstergesi                                                                                            |
| **Ş6** | Doğrulama + sıfırlama zinciri                       | [s6-dogrulama-sifirlama.md](s6-dogrulama-sifirlama.md)                          | `/verify-email` (iki başlı), `/forgot-password`, `/forgot-password/sent`, `/reset-password`, `/reset-password/done`                                      |
| **Ş7** | Masaüstü                                            | [s7-masaustu.md](s7-masaustu.md)                                                | Yüzey kapısı + ölçek kademesi; ürünün başlık çubuğu 38px'e alındı (K7)                                                                                   |
| **Ş8** | Mobil                                               | [s8-mobil.md](s8-mobil.md)                                                      | Beş ekran (karşılama silindi), iki adımlı doğrulama + yedek kod uçları, kod hücresi kit bileşeni                                                         |
| **Ş9** | Durumlar · a11y · parity · temizlik                 | [s9-kapanis.md](s9-kapanis.md)                                                  | 10 kartın içi + `/dev/auth-states` galerisi, iki otomatik kapı, iki e2e dosyası, 473 ölü CSS seçicisi silindi                                            |

---

## 2. Tasarımdan bilinçli sapmalar

Kullanıcı kararıyla alınanlar (K) ve SPEC ↔ referans çelişkilerinin çözümü (Ç).

| #       | Sapma                                                                                                                                            | Gerekçe                                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K1**  | **Telefon dalı tamamen kapsam dışı.** SPEC §4.6 ve §6.4 telefon doğrulama ekranları kurulmadı; kayıt/kurtarma alanı yalnız e-posta kabul ediyor. | Depoda SMS ya da sesli arama sağlayıcı yok (twilio · sns · vonage · messagebird — hiçbiri bağımlılık değil). Metinler sözlükten **silinmedi**, `SKIPPED_BY_K1` listesinde bekliyor; sağlayıcı geldiğinde ekran tek yerden açılır. |
| **K4**  | **Silinenler:** Discord düğmesi (NextAuth sağlayıcısı duruyor), `AudienceSelector`, `RoleTabs`, hero metin rotasyonu, mobil karşılama ekranı.    | Hiçbiri sunucuya veri göndermiyordu; karşılama ekranı SPEC'in mobil akışında yok.                                                                                                                                                 |
| **K7**  | **`--desktop-titlebar-height` global 38px.** Ana ekranın dikey alanı 4px azaldı.                                                                 | SPEC §5 değeri; beş hesaplama satırı zaten değişkenden okuyordu.                                                                                                                                                                  |
| **K8**  | **Kullanıcı adı kuralı üründe kalıyor** (2–32, `a-zA-Z0-9_`); tasarımın 3–20 / `a-z0-9._` kuralı uygulanmadı.                                    | Kural ekranda görünmüyor (ipucu satırı ve öneri etiketleri değişmedi), ama uygulansaydı mevcut kullanıcı adları kırılırdı. Görsel sapma **yok**.                                                                                  |
| **K10** | **Kayıtta şifre tekrar alanı yok** (SPEC §4.4: dört alan). Şifre sıfırlamada iki alan duruyor.                                                   | Tasarım. Mobil API sözleşmesi sahadaki sürümler için alanı hâlâ zorunlu tuttuğundan istemci aynı değeri iki kez gönderiyor.                                                                                                       |
| **K13** | **Alt bilgi** web ve masaüstü hesap oluşturma ekranında yok; diğer tüm ekranlarda ve **her üç mobil ekranda** var.                               | Ç1 çözümü: SPEC §12/8 "kayıt hariç her ekranda" diyor, referansın **mobil** kaydı alt bilgiyi gösteriyor.                                                                                                                         |
| **K14** | **Sağlayıcı işaretleri** depodaki resmî Google/Microsoft/Apple SVG'leri; SPEC'in harf karoları kullanılmadı.                                     | `PROMPT.md` açıkça istiyor. Marka renkleri (hex) korunuyor — parity kapısının tek renk istisnası bu.                                                                                                                              |
| **Ç3**  | SPEC "çerçevesiz Electron penceresi" diyor; ürün **Tauri**.                                                                                      | Kabuk Tauri kaldı; ölçüler ve davranış SPEC'ten alındı.                                                                                                                                                                           |
| **Ç5**  | SPEC §1.2 koyu teması ürünün `theme-dark` paletiyle uyuşmuyor.                                                                                   | **K5**: auth yüzeyi kendi token katmanını kuruyor (`[data-auth-surface]`), ürünün 20+ teması auth dışında değişmedi.                                                                                                              |
| **Ç6**  | Referans mobil 2FA'da 3 dolu hücre, web'de 4.                                                                                                    | Mock durumu; üretimde gerçek kod uzunluğu.                                                                                                                                                                                        |

Sapma **olmayan** iki nokta, karışmasın diye: K2 (sunucu taraflı challenge) ve K3 (6 haneli
e-posta kodu + eski linkin çalışmaya devam etmesi) tasarımdan sapma değil, tasarımın söylemediği
yerde alınmış mimari kararlar.

---

## 3. Ürün karşılığı olmayan üç tasarım maddesi

Bunlar sapma değil **borç**: tasarım istiyor, arkasındaki ürün yok.

1. **Askı ekranının `İtiraz gönder` düğmesi** (SPEC §7/10). `/api/v1/moderation/appeal` yasaklı
   bir **oturum** istiyor; giriş ekranından ulaşılamıyor. Düğme çizilmedi.
2. **`Bu cihazı hatırla`** (SPEC §4.2). Hem web hem mobil alanı gönderiyor,
   `two-factor-login.ts` okumuyor — güvenilir cihaz kaydı yok. Kutu bugün hiçbir şey yapmıyor.
3. **`f_contact_ph`** ve telefon algılama satırı (SPEC §4.4/2). K1 ile askıda.

---

## 4. Ölçüm

| Koşum                                           | Sonuç                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @wizards/web test`               | 7536 test · 0 hata · 3 atlandı                                                                               |
| `pnpm --filter @wizards/web typecheck`          | temiz (e2e dâhil)                                                                                            |
| `pnpm --filter @wizards/mobile test`            | 1980 / 1980                                                                                                  |
| `pnpm --filter @wizards/mobile test:components` | 1371 / 1371                                                                                                  |
| `pnpm --filter @wizards/types test`             | 584 / 584                                                                                                    |
| `pnpm --filter @wizards/types typecheck`        | temiz                                                                                                        |
| e2e (Playwright)                                | **koşulamadı** — yerel ortam ayakta değil                                                                    |
| Canlı doğrulama (dev sunucu)                    | 10 ekran + galeri, açık **ve** koyu tema — 7 kusur bulundu ve kapatıldı ([s9-kapanis.md](s9-kapanis.md) §4b) |

`globals.css`: 8 647 → 6 025 satır (−%30).

---

## 5. Sırada ne var

1. E2E'yi ayakta bir ortamda koş: `e2e/specs/auth/auth-parity.spec.ts` +
   `e2e/specs/a11y/auth-a11y.spec.ts`. (Ekranlar canlı doğrulandı; kalan boşluk tarayıcı
   otomasyonu: axe taraması, sekme sırası, uçtan uca akışlar.)
2. Üç ürün borcuna karar ver (§3).
3. 180 çağrılmayan `auth.*` anahtarını anahtar anahtar gözden geçir
   ([ek/s9-cagrilmayan-auth-anahtarlari.txt](ek/s9-cagrilmayan-auth-anahtarlari.txt)).
4. Paket commit edilmedi; tek bir dalda toplanıp gözden geçirilmeyi bekliyor.

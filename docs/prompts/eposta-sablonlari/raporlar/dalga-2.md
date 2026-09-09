# Dalga 2 raporu — Şifre sıfırlama + istek bağlamı + doğrulama

Tarih: 2026-08-27 · Branch: `uat` · Commit atılmadı.

Üç e-posta da yeni tasarımda. Şifre sıfırlama mektubunun "İstek özeti" bloğu gerçek istek
verisiyle doluyor; `/dev/email-preview` galerisi kuruldu ve canlı düzen ölçüldü.

---

## 1. Dosyalar

### Eklendi

| Dosya                                                                     | Gerekçe                                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/src/lib/email/email-request-context.ts`                         | Cihaz satırı (K5) + istek zamanı (K6) çözücüsü. Şehir başlığı yalnız burada okunur. |
| `apps/web/src/lib/email/templates/password-reset-email.ts`                | SPEC §5.                                                                            |
| `apps/web/src/app/dev/email-preview/page.tsx`                             | K8 galerisi; üretimde `notFound()`.                                                 |
| `email-request-context.test.ts`, `templates/password-reset-email.test.ts` | 26 yeni test.                                                                       |

### Değişti

| Dosya                                                                             | Değişiklik                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/auth/password-reset.ts`                                         | Yerel `renderPasswordResetEmail` (91 satır), `escapeHtml` ve `getAppUrl` silindi. `buildPasswordResetUrl` artık `buildResetPasswordUrl`i sarıp `EmailConfigurationError`ı `PasswordResetError("CONFIGURATION_ERROR", …)`ya çeviriyor. `sendPasswordResetEmail`e **isteğe bağlı** üçüncü parametre eklendi: `{ headers?, now? }`. `loadUserTimeZone` eklendi. |
| `apps/web/src/lib/auth/actions.ts`                                                | Şifre sıfırlama çağrısı `{ headers: headerStore }` geçiyor.                                                                                                                                                                                                                                                                                                  |
| `apps/web/src/lib/mobile/auth.ts`                                                 | `MobilePasswordResetOptions.requestHeaders` eklendi ve gönderime aktarılıyor.                                                                                                                                                                                                                                                                                |
| `apps/web/src/app/api/v1/mobile/auth/forgot-password/route-logic.ts`              | `request.headers` gönderim katmanına geçiyor.                                                                                                                                                                                                                                                                                                                |
| `.../forgot-password/route.test.ts`                                               | Başlığın gerçekten geçtiğini kanıtlayan iddia eklendi.                                                                                                                                                                                                                                                                                                       |
| `apps/web/src/lib/analytics/client-info.ts`                                       | Yalnız `HeaderSource` tipi dışa açıldı. Çalışma zamanı davranışı ve uç tel biçimi **değişmedi**.                                                                                                                                                                                                                                                             |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`                                     | 9 ölü `auth.passwordReset.email*` anahtarı silindi (her biri grep ile doğrulandı: sıfır tüketici).                                                                                                                                                                                                                                                           |
| `apps/web/src/lib/email/email-contract.test.ts`, `email-reference-parity.test.ts` | Sıfırlama varyantlarıyla genişletildi.                                                                                                                                                                                                                                                                                                                       |

### Dokunulmadı

Rotalar, env, Prisma şeması, mobil/masaüstü istemci kodu.
`reauth-email.ts` bu dalgada kapsam dışıydı (K4); kullanıcı isteğiyle sonradan §10'da kapsandı.

**Masaüstü doğrulaması:** `apps/desktop` içinde e-posta gönderen ya da sıfırlama/doğrulama
adresi kuran hiçbir kod yok (`grep` boş döndü). Tauri kabuğu web akışını kullanıyor; bu paketin
masaüstü işi yalnız aynı sunucu şablonunun servis edilmesiydi.

## 2. İstek bağlamı (K5 / K6)

- **Cihaz satırı:** `getAnalyticsClientInfo` tarayıcı/işletim sistemi/ülkeyi verir; şehir
  `x-vercel-ip-city` → `cloudfront-viewer-city` → `cf-ipcity` sırasıyla okunur ve yüzde
  kodlaması çözülür (`%C4%B0stanbul` → `İstanbul`). Sonuç `Chrome · macOS · İstanbul, TR`.
  Düşüş basamakları: `Chrome · macOS · TR` → `Chrome · macOS` → `null`.
  `null` olduğunda şablon Cihaz hücresini **hiç çizmez**, İstek zamanı tam genişliğe yayılır.
- **Zaman:** `UserSettings.timeZone` varsa o, yoksa `Europe/Istanbul`. Geçersiz saat dilimi
  dizesi `Intl` içinde `RangeError` atıyor; try/catch ile varsayılana düşülüyor.
  Fark etiketi `timeZoneName:"shortOffset"`ten okunuyor, yani yaz saati kendiliğinden doğru
  (`Europe/Berlin`: Ocak `GMT+1`, Ağustos `GMT+2` — teste bağlandı).
- **Maliyet:** gönderim başına bir ek sorgu (`userSettings.findUnique`, `userId` benzersiz
  indeks). try/catch içinde; ayar okunamazsa mektup yine gidiyor. Sorguyu çağrı yerlerindeki
  kullanıcı `select`lerine gömmek iki uçta da DI tiplerini değiştirirdi; sözleşmeyi sade tutmak
  için tek sorgu tercih edildi.

## 3. Birebirlik kapısı

`email-reference-parity.test.ts` artık iki referans dosyayı da karşılaştırıyor:

| Referans                    | Sonuç                  |
| --------------------------- | ---------------------- |
| `html/dogrulama-kodu.html`  | fark yok               |
| `html/sifre-sifirlama.html` | fark yok, ilk denemede |

İmza uzunluğu için alt sınır iddiası eklendi (`> 60 etiket`), böylece imza üretimi bozulursa
test sessizce yeşil kalmıyor.

## 4. Canlı düzen doğrulaması

`/dev/email-preview` dev sunucusunda açıldı ve çerçevelerin içindeki **hesaplanmış** değerler
okundu (ekran görüntüsü alınamadı — bu oturumda tarayıcı paneli görüntülenmiyor, panel
"not displayed" hatası veriyor). Ölçülenler:

| Ölçü                 | 600 px çerçeve                | 390 px çerçeve               |
| -------------------- | ----------------------------- | ---------------------------- |
| Kart genişliği       | 600 px                        | tam genişlik (365 px)        |
| Yatay taşma          | 0                             | 0                            |
| H1                   | 25 px                         | 21 px                        |
| Kod                  | 34 px / 11 px                 | 28 px / 8 px                 |
| Yan boşluk (`.w-px`) | 32 px                         | 22 px                        |
| Meta hücreleri       | `table-cell`, 267 + 267 px    | `block`, 304 px tam genişlik |
| Cihazsız meta        | tek hücre 535 px              | tek hücre `block`            |
| Bant zemini          | `rgb(17,21,29)` = `#11151D`   | aynı                         |
| Buton zemini         | `rgb(89,102,242)` = `#5966F2` | aynı                         |

Galeri sayaçları (bayt / önizleme karakteri / `img` / `script`) on varyantın tamamında yeşil.

`iframe`ler `sandbox="allow-same-origin"` taşıyor, `allow-scripts` **taşımıyor**: mektupta betik
yok ve olmamalı; same-origin bilerek açık ki denetim çerçevenin içindeki ölçüleri okuyabilsin.

## 5. Kapılar

| Kapı                                     | Sonuç                                                                |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `pnpm --filter @wizards/web typecheck`   | ✅ temiz                                                             |
| `pnpm --filter @wizards/web test`        | ✅ 7684 test, 7681 geçti, 3 atlandı, **0 hata** (Dalga 1 sonu: 7629) |
| `eslint` (bu dalganın dosyaları)         | ✅ temiz                                                             |
| `pnpm --filter @wizards/web lint` (tümü) | ⚠️ Dalga 1'de raporlanan 10 önceden var olan hata sürüyor            |
| `pnpm --filter @wizards/web e2e:api`     | ⛔ koşulamadı                                                        |
| `graphify update .`                      | ✅                                                                   |

**e2e neden koşulamadı:** ortam ön denetimi üç eksik bildiriyor —
`E2E_TEST_MODE` `"true"` değil, `E2E_DATABASE_URL`/`DATABASE_URL` yok, `E2E_TEST_PASSWORD` yok.
Playwright test verisini sıfırlayıp tohumlayamadan çalışamıyor; yerel makinede test veritabanı
ayağa kaldırılmadan bu kapı açılamaz.

## 6. Kabul ölçütleri (00 §15)

| #   | Ölçüt                                                       | Durum                                    |
| --- | ----------------------------------------------------------- | ---------------------------------------- |
| 1   | Tek başına açılıyor, `<img>`/`<script>` yok, < 15 KB        | ✅ en büyük varyant 11 753 bayt          |
| 2   | İlk eleman gizli preheader, 85–110 karakter                 | ✅ 10 varyantın tamamı                   |
| 3   | Buton `<td bgcolor="#5966F2">` + `display:block` `<a>`      | ✅                                       |
| 4   | Tüm bağlantılar gerçek `https://` (K1 rotaları)             | ✅                                       |
| 5   | 600 px taşma yok; 390 px tek kolon, 22 px boşluk, kod 28 px | ✅ canlı ölçüldü (§4)                    |
| 6   | Alt bilgi yalnız Gizlilik · Şartlar · Çerezler + telif      | ✅                                       |
| 7   | Metinler §11 tablosuyla birebir                             | ✅                                       |
| 8   | Hiçbir hex `email-theme.ts` dışında değil                   | ✅                                       |
| 9   | `<style>` silinse de okunur                                 | ✅ blok yalnız `@import` + medya sorgusu |
| 10  | tr/en anahtar kümeleri eşit                                 | ✅ `messages.test.ts` yeşil              |
| 11  | `flex`/`grid`/`float`/`position`/`<button>`/monospace yok   | ✅                                       |

## 7. Bilinçli sapmalar

Dalga 1'deki K1, E1, E2, E3, E5 sürüyor. Bu dalgada eklenen:

| #      | Sapma                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **E4** | İngilizce istek zamanı da 24 saat ve `27 August 2026, 14:32 (GMT+3)` sırasında. SPEC yalnız Türkçe örnek veriyor; `2:32 PM` iki kolonlu ızgarada satırı taşırırdı. |

Başka sapma yok.

## 8. Güvenlik notları

- Cihaz satırı yalnız istek başlıklarından türer; ham IP saklanmaz, mevcut `hashAnalyticsValue`
  davranışı korunur.
- Şehir değeri çözülemezse ham hâliyle gösterilmez; denetim karakterleri düşer, 64 karakter üstü
  değer reddedilir.
- Şifre sıfırlama akışının jenerik yanıtı bozulmadı: kullanıcı bulunamasa da, e-posta
  gönderilemese de uç aynı gövdeyi döner.
- `sendPasswordResetEmail` üçüncü parametresi isteğe bağlı; bağlam taşımayan çağrılar
  kırılmadan çalışır ve o mektupta cihaz satırı hiç çizilmez.

## 9. Açık kalan

- e2e kapısı yerel test veritabanı kurulunca koşulmalı.
- Piksel karşılaştırması (ekran görüntüsü) tarayıcı paneli görüntülenen bir oturumda
  `/dev/email-preview` üzerinden yapılabilir; düzen ölçüleri hesaplanmış değerlerle doğrulandı.

---

## 10. Ek — hesap silme yeniden kimlik doğrulama e-postası (kullanıcı isteğiyle kapsama alındı)

K4 bu mektubu kapsam dışı bırakmıştı; kullanıcı sonradan aynı kabuğa geçirilmesini istedi.

### Değişiklik

| Dosya                                                               | Değişiklik                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/email/templates/account-deletion-reauth-email.ts` | **Yeni.** Ortak kabuk + buton + yedek bağlantı kutusu + güvenlik notu.                                                                                                                                |
| `apps/web/src/lib/email/email-blocks.ts`                            | `spacerBlock(height)` eklendi.                                                                                                                                                                        |
| `apps/web/src/lib/auth/reauth-email.ts`                             | Yerel `renderAccountDeletionReauthEmail` (96 satır) ve `escapeHtml` silindi. `buildAccountDeletionReauthUrl` ve env enjeksiyonlu `getAppUrl` **korundu** (token yolda duruyor, testleri env geçiyor). |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`                       | 14 yeni `auth.email.reauth.*` anahtarı; 8 ölü `auth.reauthEmail.*` anahtarı silindi. `auth.reauthEmail.title` **silinmedi** — `settings/reauth/[token]/reauth-confirmation.tsx:40` da okuyor.         |
| `apps/web/src/app/dev/email-preview/page.tsx`                       | Web ve mobil varyantlar galeriye eklendi.                                                                                                                                                             |
| `email-contract.test.ts`                                            | Varyant başına izinli şema (`allowedSchemes`) eklendi; mobil varyant `whispr://` taşıyor.                                                                                                             |

### Metin

Rendered metin eskisiyle **aynı**. İki cümle yalnız bölündü, kelime değişmedi:

- Süre cümlesi üçe ayrıldı ki süre `#B4761A` vurgusunu alsın:
  `Bu bağlantı ` + `10 dakika` + ` içinde sona erer.`
- `ignore` cümlesi etiket + gövdeye ayrıldı:
  `Hesap silme isteğinde bulunmadıysan` + `Bu e-postayı güvenle yok sayabilirsin.`
- Eski alt bilgi cümlesi (`Whispr, yalnızca OAuth ile açılmış hesapları…`) alt bilgi bandından
  gövdeye taşındı: SPEC alt bilgide yalnız Gizlilik · Şartlar · Çerezler + telif satırına izin
  veriyor. Cümle silinmedi, üçüncü paragraf oldu.

### Yeni türetmeler

| #      | Türetme                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E6** | Bant etiketi `Hesap güvenliği` / `Account security`.                                                                                                                                                                        |
| **E7** | Göz üstü etiketi `Hesap silme` / `Account deletion`.                                                                                                                                                                        |
| **E8** | Yedek kutu etiketi olarak SPEC'in `Düğme çalışmıyorsa` metni kullanıldı: eski `fallback` cümlesi ("Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:") kabuğun kısa, büyük harf, harf aralıklı etiket biçimine uymuyordu. |
| **E9** | Önizleme satırı yazıldı (eski şablonda preheader yoktu): tr 97, en 86 karakter.                                                                                                                                             |

Ayrıca `whispr://reauth/account-delete/<token>` mobil bağlantısı "tüm bağlantılar gerçek
`https://`" ölçütünün istisnasıdır: gerçek bir bağlantıdır, yalnız şeması uygulamanındır.
Kapı bunu varyant bazında tanır; alt bilgi bağlantıları o mektupta da `https://` kalır.

### Doğrulama

| Kapı                              | Sonuç                                           |
| --------------------------------- | ----------------------------------------------- |
| typecheck                         | ✅ temiz                                        |
| `pnpm --filter @wizards/web test` | ✅ 7723 test, 7720 geçti, 3 atlandı, **0 hata** |
| e-posta modülü                    | ✅ 181 test                                     |
| eslint (dokunulan dosyalar)       | ✅ temiz                                        |

Canlı ölçüm (`/dev/email-preview`, tr):

| Ölçü          | 600 px                                                       | 390 px                |
| ------------- | ------------------------------------------------------------ | --------------------- |
| Kart          | 600 px, taşma 0                                              | tam genişlik, taşma 0 |
| H1            | 25 px                                                        | 21 px                 |
| Yedek URL     | 12.5 px                                                      | 11 px                 |
| Yan boşluk    | 32 px                                                        | 22 px                 |
| Boşluk satırı | 20 px                                                        | 20 px                 |
| Ayırıcı       | 1 px (kalınlaşmadı)                                          | 1 px                  |
| Buton adresi  | `https://…/settings/reauth/…` · mobil varyantta `whispr://…` | aynı                  |

Bayt: web 11 012, mobil 11 000 (sınır 15 360).

Artık kod tabanında tek `escapeHtml`, tek e-posta kabuğu ve dört gönderim noktası var; dördü de
aynı tasarımı üretiyor.

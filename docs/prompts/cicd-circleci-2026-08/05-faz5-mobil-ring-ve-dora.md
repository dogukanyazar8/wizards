# Faz 5 — Mobil ring, otomatik ramp/halt, DORA, kapanış

> Başlamadan **[00-ortak-baglam.md](00-ortak-baglam.md)** oku. Bu faz §3.7, §4.5, §4.6, §4.7'ye dayanır. Faz 4 kapısı geçmeden başlama.

## Amaç

Mobil release'i CircleCI'ye taşı, `canary` ve `production` ring'lerinin kilidini aç, yayını **otomatik ramp eden ve metrik düşünce durduran** bir yapıya bağla. Sonra Hyper-V'yi kapat ve GitHub Actions'ı sil.

Bu fazın en değerli keşfi: **altyapının yarısı zaten var.** `mobile-release.yml` girdilerinde `canary` ve `production` seçenekleri duruyor ama işler `uat`'a kilitli; `rollout` yüzdesi deterministik; OTA rotasında `PATCH` var; mobil Sentry kurulu. Eksik olan tek parça otomatik ramp ve halt.

---

## Görevler

### G1 — Mobil release'in taşınması

`mobile-release.yml`'ın dört job'u (`preflight` → `contract` → `ota` | `apk`) CircleCI'ye taşınır.

| Job         | Executor / resource class | Not                                                                                                                                                                                                   |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preflight` | `ci` medium               | `.github/scripts/setup-aws-cli.sh` **aynen** kullanılır (§4.6 — `aws-cli/2.27.41` tam eşitlik aranıyor). Script `.github/` altından `scripts/ci/` altına taşınırsa yolu kullanan her yer güncellenir. |
| `contract`  | `ci` medium               | `mobile-release-workflow.mjs` + sözleşme testleri                                                                                                                                                     |
| `ota`       | `ci` medium               | `expo export`, fingerprint, imza, R2, kayıt, uzaktan doğrulama                                                                                                                                        |
| `apk`       | `ci` **large**            | JDK 17 + `setup-android-build-tools.sh` + `eas build --local`. **x86_64 zorunlu** (§4.7).                                                                                                             |

Bağlayıcı kurallar:

- **Otomatik retry kapalı** (§4.5). OTA yükleyicisi var olan bir R2 anahtarını görürse hard fail ediyor; yarım kalmış bir job'un yeniden koşması release'i patlatır. Yeniden deneme yeni bir `release_id` ile, elle.
- Gizli bilgiler tek bir `mobile-release` context'inde: `WHISPR_MOBILE_OTA_PRIVATE_KEY`, `WHISPR_RELEASE_PUBLISH_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `EXPO_TOKEN`.
- Dal kısıtı **iş içinde de** doğrulanır — bugünkü `github.ref_name == 'uat'` guard'ının karşılığı korunur. Context kısıtı tek savunma katmanı olarak bırakılmaz.
- Özel anahtar dosyaya `umask 077` ile yazılır ve `trap` ile silinir; mevcut desen aynen taşınır. Scrub adımları (`if: always()` karşılığı) korunur.

Kredi tahmini (V5): APK large'da ~40 dk ≈ 800 kredi; ayda 4 release ≈ 3.200 kredi. Tahmin tutmazsa Codemagic ücretsiz katmanı (500 dk/ay) yedek plandır — ama **önce ölç**.

### G2 — Ring kilidinin açılması

Bugünkü kısıt: `ota` ve `apk` job'ları `if: inputs.environment == 'uat' && github.ref_name == 'uat'`, `preflight` de UAT dışını reddediyor.

Açılış **kademeli**:

1. `canary` ring'i açılır. Kanal, R2 anahtar öneki, imza sertifikası ve trust root'u UAT'tan **ayrı** olmalı — `apps/mobile/certs/ota/uat/certificate.pem` deseninde `canary` karşılığı üretilir. Sertifika üretimi ve dağıtımı kullanıcının işidir.
2. `canary` bir gerçek release ile doğrulandıktan sonra `production` açılır.
3. Her ring için ayrı context; production context'i yalnız `main` dalından erişilebilir.

`mobile-release-workflow.mjs` ve `publish-ota-bundle.mjs` içindeki ortam doğrulaması ring başına genişletilir; sözleşme testleri (`mobile-release-workflow.test.mjs`, `publish-ota-bundle.test.mjs`) **aynı fazda** güncellenir.

### G3 — Otomatik ramp ve halt

Endüstri deseni, sizin `PATCH` ucunuza oturtulmuş hali:

```
%5   → 24 saat → metrik kontrol
%20  → 48 saat → metrik kontrol
%50  → 48 saat → metrik kontrol
%100
```

Mekanizma:

- Zamanlanmış bir CircleCI workflow'u (günlük) aktif ring'lerdeki release'leri okur.
- Her release için üç metrik çekilir: **crash-free session oranı**, **p95 cold start**, **API hata oranı**. Kaynak: Sentry (mobil tarafta `apps/mobile/src/observability/mobile-sentry.ts` kurulu).
- Eşikler yapılandırma dosyasında, kodda gömülü değil. Başlangıç: crash-free ≥ **%99.5**. p95 cold start ve API hata oranı eşikleri mevcut telemetriden **ölçülerek** belirlenir — uydurulmaz.
- Eşik sağlanıyor ve bekleme süresi dolduysa: `PATCH` ile sonraki yüzdeye çık.
- Eşik ihlali: `PATCH rollout=0`, ramp durur, bildirim atılır. **Otomatik geri alma yapılmaz** — durdurma otomatik, geri alma kararı insanın.
- Minimum örneklem kuralı: örneklem sayısı eşiğin altındaysa ne ilerle ne durdur, bekle. Az veriyle %100'e çıkmak da durdurmak da yanlış.

Metrik eşiği yardımcısı Faz 4'teki soak kontrolüyle **aynı modülü** paylaşır (§Faz 4 G5). İki ayrı eşik mantığı yazılmaz.

Ramp durumu bir yerde saklanmalı: mevcut `Release` modeline alan eklemek mi, ayrı bir tablo mı — şema kararı **kullanıcıya sorulur**. Prisma migration dizini tuzağı geçerli (§4.4): `packages/db/prisma/rebaseline-migrations/`.

### G4 — DORA ve pipeline ölçümü

Yeni sistem kurulmaz — `tools/local-quality-dashboard/` genişletilir.

| Metrik                   | Kaynak                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Deployment frequency     | Railway deployment API + release kayıtları                 |
| Lead time for changes    | commit zamanı → o commit'in digest'inin prod'a ulaştığı an |
| Change failure rate      | rollback + halt edilen ramp + hotfix oranı                 |
| MTTR                     | halt/incident başlangıcı → çözüm                           |
| PR sinyal süresi p50/p95 | CircleCI Insights API                                      |
| Flaky oranı              | CircleCI Test Insights (Faz 2 envanteri)                   |
| Kredi tüketimi           | CircleCI kullanım API'si — haftalık, bütçe uyarısıyla      |

Dashboard'un mevcut test dosyası deseni korunur (`node --test tools/local-quality-dashboard/*.test.mjs`).

### G5 — Kapanış

Sıra önemli, atlanmaz:

1. **Hyper-V runner'ları durdur** — silme, yalnız durdur. Bir hafta bekle.
2. `.github/workflows/` üç dosyayı sil.
3. Sözleşme testlerinden `.github/workflows` hedeflerini kaldır:
   - `runtime-toolchain-contract.test.mjs` — `ci.yml` iddiaları
   - `desktop-ops-workflow-contract.test.mjs` — dizin taraması, `ubuntu-*` yasağı, `desktop-native-build.yml`/`desktop-release.yml` yokluk kontrolü. **Yokluk kontrolü korunur** ama CircleCI karşılığına çevrilir: desktop release job'u olmamalı.
   - `semgrep-ci-contract.test.mjs`
   - `actionlint-contract.test.mjs` ve `scripts/quality/actionlint.mjs` — workflow kalmadıysa **silinir**; kök `package.json`'daki `actionlint` betiği ve `local-gate-profiles.json`'daki `fast-actionlint` adımı da kaldırılır.
4. `local-gate-profiles.json` → `Fast` profilinde `actionlint` yerine `circleci config validate`.
5. Runner'ları sil, VM'leri kapat.

Adım 3'te `pnpm test:toolchain` bir an için kırılır — bu beklenen. Silme ve test güncellemesi **tek commit'te** olur.

---

## Yasaklar

- Release job'unda otomatik retry yok (§4.5).
- Ramp eşikleri uydurulmaz; p95 cold start ve API hata oranı eşikleri mevcut telemetriden ölçülür.
- Otomatik **geri alma** yok — yalnız otomatik durdurma.
- `production` ring'i `canary` gerçek bir release ile doğrulanmadan açılmaz.
- Hyper-V VM'leri GitHub Actions silinmeden **önce** yok edilmez; bir hafta durdurulmuş halde bekler.
- Desktop release hattı açılmaz.
- ARM executor kullanılmaz (§4.7).
- Ramp durumu için şema kararı sorulmadan verilmez.

---

## Kabul kriterleri

1. Bir `uat` OTA release'i baştan sona CircleCI'de tamamlandı; uzaktan manifest doğrulaması dâhil bütün adımlar geçti.
2. Bir `uat` APK build'i CircleCI large üzerinde tamamlandı; süre ve kredi ölçüldü.
3. `canary` ring'i açık, kendi sertifikası ve context'i var, bir gerçek release ile doğrulandı.
4. Ramp otomasyonu çalışıyor: en az bir release %5 → %20 geçişini otomatik yaptı.
5. Halt yolu **test edildi** — eşik yapay olarak düşürülüp `PATCH rollout=0` davranışı doğrulandı.
6. Minimum örneklem kuralı çalışıyor: veri azken ne ilerliyor ne durduruyor.
7. DORA dört metriği dashboard'da görünüyor; kredi tüketimi haftalık raporlanıyor.
8. `.github/workflows/` boş, üç dosya silinmiş.
9. Sözleşme testleri güncellenmiş, `pnpm test:toolchain` yeşil.
10. Hyper-V VM'leri kapalı; bir hafta boyunca hiçbir pipeline onlara ihtiyaç duymadı.
11. `local-gate-profiles.json` CircleCI'yi yansıtıyor, `actionlint` referansı kalmamış.

---

## Doğrulama

```bash
pnpm test:toolchain
```

```bash
node --test apps/mobile/scripts/mobile-release-workflow.test.mjs
```

```bash
node --test apps/mobile/scripts/publish-ota-bundle.test.mjs
```

```bash
node --test tools/local-quality-dashboard/*.test.mjs
```

```bash
circleci config validate .circleci/config.yml
```

```bash
graphify update .
```

---

## Kullanıcının elle yapacakları

1. `canary` (ve sonra `production`) için OTA imza sertifikası ve trust root üret; `apps/mobile/certs/ota/<ring>/` altına yerleştir.
2. CircleCI'de ring başına context oluştur; production context'ini `main` dalına kısıtla.
3. Sentry'de crash-free session, cold start ve API hata oranı için sorguları/eşikleri doğrula.
4. Ramp durumu için şema kararını ver (mevcut `Release` modeline alan mı, ayrı tablo mu).
5. İlk gerçek ramp'i izle; %5 → %20 geçişini onayla.
6. Hyper-V VM'lerini durdur, bir hafta sonra sil.

---

## Rapora yazılacak ek

- OTA ve APK release'lerinin gerçek süresi ve kredisi; V5 tahmininin tutup tutmadığı.
- Ramp otomasyonunun ilk çalışması: hangi release, hangi yüzdeler, hangi metrik değerleri.
- Halt testinin nasıl yapıldığı ve sonucu.
- Silinen dosyalar ve güncellenen sözleşme testlerinin tam listesi.
- Paket kapanış tablosu: beş fazın toplam etkisi (süre, kredi, kapı sayısı, ölçülen DORA başlangıç değerleri).

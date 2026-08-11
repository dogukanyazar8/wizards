# CI/CD — GitHub Actions → CircleCI geçişi ve endüstri seviyesi boru hattı

Beş fazlık uygulama paketi. Hedef: self-hosted Hyper-V runner'ları tamamen kapatmak, ücretsiz CircleCI katmanında kalmak, ve boru hattını PR sinyali 10 dakikanın altına inen, build-once/promote-always çalışan, mobil tarafta otomatik ramp/halt yapan bir yapıya çıkarmak.

## Dosyalar

| Dosya                                                                | İçerik                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [00-ortak-baglam.md](00-ortak-baglam.md)                             | Beş fazın paylaştığı zemin. Doğrulanmış gerçekler, tuzaklar, kararlar. **Uygulanmaz, okunur.**               |
| [01-faz1-circleci-temel.md](01-faz1-circleci-temel.md)               | Golden image, `.circleci/`, job bölme, workspace, sözleşme testlerinin taşınması                             |
| [02-faz2-pr-kapisi-ve-flaky.md](02-faz2-pr-kapisi-ve-flaky.md)       | Şerit ayrımı, merge queue, JUnit, flaky ölçümü ve karantina                                                  |
| [03-faz3-cache-ve-test-impact.md](03-faz3-cache-ve-test-impact.md)   | Turbo remote cache, test impact filtresi, test bölme, E2E prod-mode                                          |
| [04-faz4-build-once-ve-promote.md](04-faz4-build-once-ve-promote.md) | Tek immutable image, tarama + SBOM, Railway image deploy, ring promotion                                     |
| [05-faz5-mobil-ring-ve-dora.md](05-faz5-mobil-ring-ve-dora.md)       | Mobil release'in taşınması, canary/production kilidinin açılması, otomatik ramp/halt, DORA, Hyper-V kapanışı |
| `raporlar/`                                                          | Her faz kendi raporunu buraya yazar                                                                          |

## Faz sırası ve kapılar

```
Faz 1  CircleCI temel        → golden image, config, job bölme, workspace, sözleşme testleri
   ↓   kapı: CircleCI yeşil, pnpm test:toolchain yeşil, GH Actions hâlâ açık (gölge mod)
Faz 2  PR kapısı + flaky     → şerit ayrımı, merge queue, JUnit, karantina
   ↓   kapı: PR'da kapı var, flaky listesi ölçülmüş, retries düşürülmüş
Faz 3  Hız                   → remote cache, test impact, test bölme, E2E prod-mode
   ↓   kapı: PR p95 < 10 dk, main full < 25 dk, kredi/push ölçülmüş
Faz 4  Build once            → tek image digest, scan + SBOM, Railway image deploy, promotion
   ↓   kapı: aynı digest uat/staging/main'de, deploy süresi ölçülmüş
Faz 5  Mobil ring + DORA     → release taşındı, ramp/halt çalışıyor, Hyper-V kapandı
       kapı: gerçek bir OTA release ramp ile tamamlandı, GH Actions silindi
```

Bir faz kendi kapısını geçmeden sonraki faz başlamaz.

## Bir bakışta ne değişiyor

| Konu            | Bugün                                           | Faz 5 sonunda                                      |
| --------------- | ----------------------------------------------- | -------------------------------------------------- |
| Compute         | Lokal Hyper-V VM'ler                            | CircleCI cloud, ücretsiz katman                    |
| PR kapısı       | Yok (`if: github.event_name != 'pull_request'`) | Hızlı şerit + merge queue                          |
| Kurulum tekrarı | 4 e2e job'u ayrı ayrı kurulum yapıyor           | Tek `install` + `build-web`, workspace ile dağıtım |
| E2E             | Dev-mode Next, tek işçi, `retries: 2`           | Prod-mode, bölünmüş, `retries: 1` + karantina      |
| Build           | Aynı commit 3 kez derleniyor                    | Tek digest, ortamlar arası promote                 |
| Mobil release   | Manuel dispatch, sadece `uat`, sabit yüzde      | uat → canary → production, otomatik ramp + halt    |
| Ölçüm           | Yok                                             | DORA + flaky + kredi tüketimi dashboard'da         |

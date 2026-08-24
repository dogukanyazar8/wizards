# Faz 6 Prompt — Final Doğrulama, Güvenlik İncelemesi, Kabul

`00-ortak-baglam.md` ve Faz 1–5 raporlarını tamamen oku. Bu faz yeni özellik eklemez. Kalan regresyonu
kök nedeninden düzeltir; bütün kanıt sınıflarını ayrı raporlar. Yerel `uat`; commit/push/deploy yok.

## Hedef

Ana Sayfa ve Mesajlar geliştirmesinin kaynak, test, migration, production build, E2E, realtime,
erişilebilirlik, responsive, visual ve performans kapılarını tamamla. “Test yazıldı” ile “test koştu”yu;
yerel ile remote/UAT/prod kabulünü karıştırma.

## 1. Kapsam ve diff denetimi

```powershell
git status --short --branch
git rev-parse HEAD
git rev-list --left-right --count origin/uat...HEAD
git diff --check
git diff --cached --check
git diff --stat
git diff --cached --stat
```

- Faz raporlarındaki dosya listelerini gerçek status ile karşılaştır.
- Untracked dosyaları diff dışında kalmış sayma; tek tek oku ve raporla.
- İlgisiz WIP'i silme, formatlama, stage etme veya “temiz” sonuç almak için değiştirme.
- Her doğrulanmış bulguyu `FIXED`, `ALREADY FIXED`, `NOT REPRODUCIBLE`, `OPEN`, `ENV BLOCKED` olarak matrise koy.
  `NOT REPRODUCIBLE` için test/source kanıtı şart.

## 2. Statik ve unit/integration kapıları

Dar faz testleri önce yeniden koşsun. Sonra:

```powershell
pnpm.cmd --filter @wizards/types test
pnpm.cmd --filter @wizards/db test
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web lint
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd format
node scripts/quality/e2e-password-guard.mjs
node scripts/quality/count-arbitrary-px.mjs
```

Root test/lint/format unrelated WIP nedeniyle kırılırsa kısa kesin hata + dosya listesini raporla; ilgili fazın dar
kapısını FAIL sayma. Buna rağmen kendi değiştirdiğin dosyaların format/lint hatasını bırakma.

## 3. Prisma ve migration kanıtı

- `packages/db/prisma/schema.prisma` validate/generate.
- Aktif rebaseline migration contract testleri.
- Yeni migration varsa yalnız doğrulanmış loopback E2E DB üzerinde deploy + status + schema diff.
- DB adını parse ederek `localhost`/`127.0.0.1` ve açık E2E adı olduğunu doğrulamadan reset/deploy yapma.
- UAT/prod DB'ye migration yok.
- `Message.replyToId` için gerçek `pg_indexes` çıktısı; duplicate index olmadığını göster.
- Poll single-choice concurrency integration testini gerçek PostgreSQL üzerinde koş.

Kullanılacak repo komutları güncel package scriptlerinden alınır; `.env` düzenlenmez. DB yoksa `ENV BLOCKED`.

## 4. Production build

```powershell
pnpm.cmd --filter @wizards/web build
```

Build yalnız temiz unit/type/lint sonrası. Bayat `.next` manifestini kanıt olarak kullanma. Build cleanup gerekiyorsa
yalnız `apps/web/.next` mevcut komut tarafından güvenle yeniden üretilen artifact ise, sahibi olduğun failed build
sonrası kaldır; repo/WIP dizinlerine geniş delete uygulama.

## 5. E2E ortam güvenliği

Önce:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
pnpm.cmd --filter @wizards/web e2e:check-env
```

`:3000` boşsa normal Playwright config kullan. Doluysa yabancı süreci kapatma. Yeni PowerShell terminalinde:

```powershell
$env:CI = "true"
$env:PORT = "3001"
$env:E2E_BASE_URL = "http://127.0.0.1:3001"
pnpm.cmd --filter @wizards/web e2e:check-env
```

Aynı terminalde Playwright çalıştır. `CI=true`, config'in production `e2e:web-server` komutunu kullanır,
`reuseExistingServer` kapalı olur ve süreç cleanup'ını Playwright yapar. `E2E_DATABASE_URL`, `REDIS_URL`,
`E2E_TEST_PASSWORD` mevcut ve loopback değilse devam etme.

Dedicated E2E DB reset gerekiyorsa yalnız guard'lı kapı:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/quality/Invoke-LocalGate.ps1 -Profile E2EFull
```

Bu kapının destructive precondition'ı geçmezse elle reset komutu yazma.

## 6. E2E sırası

Targeted-first:

```powershell
pnpm.cmd --filter @wizards/web exec playwright test --project=chromium e2e/specs/smoke
pnpm.cmd --filter @wizards/web exec playwright test --project=chromium e2e/specs/design/home-parity.spec.ts e2e/specs/design/messages-parity.spec.ts e2e/specs/design/messages-responsive.spec.ts
pnpm.cmd --filter @wizards/web exec playwright test --project=chromium e2e/specs/a11y/messages-a11y.spec.ts e2e/specs/a11y/a11y.spec.ts
pnpm.cmd --filter @wizards/web exec playwright test --project=chromium e2e/specs/realtime e2e/specs/voice
```

Sonra ilgili API/security spec'leri ve full Chromium:

```powershell
pnpm.cmd --filter @wizards/web e2e:api
pnpm.cmd --filter @wizards/web e2e
pnpm.cmd --filter @wizards/web e2e:smoke:cross-browser
pnpm.cmd --filter @wizards/web e2e:visual
```

Exact spec yolu güncel ağaçta değişmişse `rg --files apps/web/e2e/specs` ile gerçek yolu kullan. Bir test fail olduğunda:

1. Screenshot/trace/DOM ve server logundan kök nedeni bul.
2. Test eski sözleşmeyse kaynak SPEC ile kanıtlayıp testi düzelt.
3. Ürün hatasıysa production code'u düzelt ve regresyon ekle.
4. Timeout artırma/arbitrary sleep/retry ile maskeleme.

## 7. Zorunlu iki-istemci realtime senaryoları

- Kullanıcı A poll vote/pin yapar; yetkili B doğru güncellemeyi alır.
- Hidden-history veya yetkisiz C full poll/pin/message DTO alamaz; refetch 404 ve eski cache temizlenir.
- Conversation değişimi listener leak üretmez.
- Single-choice eşzamanlı iki oy sonunda tek DB satırı ve iki istemcide aynı aggregate.

Bu senaryolar otomasyonda yoksa dar Playwright spec ekle. Sadece source inspection realtime PASS değildir.

## 8. Performans kabulü

Production build üzerinde soğuk ve sıcak koşuyu ayır:

- Home initial endpoint dökümü; screen ve shell çağrıları ayrı.
- Messages `/dm` request ve socket listener sayısı.
- 250 üyeli grup, 50+ görünür mesaj, çoklu poll fixture'ı.
- Tek vote/pin sonrası render sayısı.
- Poll/event/reply DB query row/plan kanıtı.
- Layout shift, long task ve response size; mevcut repo diagnostics helper'larını kullan.

Dev-mode ölçümünü production bütçesi diye yazma. Fixture yoksa `NOT RUN`; uydurma sayı yok.

## 9. Güvenlik final incelemesi

Değişen diff üzerinde source-to-sink incele:

- Authn ve authz ayrı mı?
- History/expiry/profile/channel permission list/read/mutate/realtime'da aynı mı?
- Poll concurrent invariant DB'de mi?
- Socket payload least disclosure mı?
- Raw SQL parametreli mi?
- Error/log hassas veri içeriyor mu?
- Rate limit/input cap mevcut mu?
- Cache revocation sonrası stale gizli veri bırakıyor mu?

Şüpheli maddeyi “muhtemelen” kapatma; testle doğrula veya OPEN bırak.

## 10. Final görsel kabul

Gerçek uygulamadan açık/koyu tema; Home ve Messages ana/empty/search/thread/pin/poll/error/loading/responsive
durumlarının screenshot'larını al. Prototype görseli parity kanıtı değildir. Screenshot'ları mevcut E2E artifact
düzeninde tut; binary baseline'ı yalnız test sözleşmesi gerçekten değiştiyse güncelle.

## 11. Son kapı

```powershell
graphify update .
git diff --check
git diff --cached --check
git status --short --branch
```

Final rapor:
`docs/prompts/whispr-home-messages-remediation/raporlar/06-final-kabul-raporu.md`.

Rapor şunları içerir:

- Tüm bulgular ve nihai durum.
- Dosya/davranış/test eşlemesi.
- Exact komut, süre, test sayısı, `PASS / FAIL / NOT RUN / ENV BLOCKED`.
- Security, DB, performance, a11y, browser, visual kanıtları ayrı.
- Yerel Git parity'nin CI/deploy/production kabulü olmadığı.
- Commit/push/deploy yapılmadığı.
- Kalan yalnız gerçek ürün kararları ve environment blocker'ları.

Bir zorunlu kapı FAIL iken “tüm geliştirme tamamlandı” deme.

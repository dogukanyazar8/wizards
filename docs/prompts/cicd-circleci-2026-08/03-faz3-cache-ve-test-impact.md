# Faz 3 — Hız: remote cache, test impact, test bölme, prod-mode E2E

> Başlamadan **[00-ortak-baglam.md](00-ortak-baglam.md)** oku. Bu faz §4.2, §4.3, §4.8 tuzaklarına ve §5-V2, §5-V6 varsayımlarına dayanır. Faz 2 kapısı geçmeden başlama.

## Amaç

Şerit sürelerini hedefe indir: **PR p95 < 10 dk**, merge queue ≤ 20 dk, main full ≤ 25 dk. Kredi tüketimini push başına 500'ün altına çek.

Dört kaldıraç, etki sırasına göre: remote cache → test impact → test bölme → prod-mode E2E.

---

## Görevler

### G1 — Turborepo remote cache

Şu an her job her şeyi sıfırdan derliyor. Monorepo'da en büyük tek kayıp bu.

- `ducktors/turborepo-remote-cache` Railway'de yeni bir servis olarak ayağa kaldırılır (V2).
- Depolama: **R2'de ayrı bir bucket**. OTA bucket'ı (`R2_BUCKET`) ile karıştırılmaz — ayrı erişim anahtarı, ayrı bucket adı.
- CircleCI tarafında `TURBO_API`, `TURBO_TOKEN`, `TURBO_TEAM` bir context'ten gelir.
- Aynı değişkenler geliştirici makinelerinde de kullanılabilir; kurulum adımı `docs/` altına bir sayfa olarak yazılır.

Cache'e giren görevler: `build`, `lint`, `typecheck`, `test`. `turbo.json`'da `cache: false` olanlar (`db:generate`, `test:coverage`, `e2e*`, `build:desktop`, `dev`) **dokunulmaz** — bilinçli olarak cache dışı.

Doğrulama: aynı commit'i iki kez koştur, ikinci koşuda `turbo` çıktısında `cache hit, replaying logs` görün.

### G2 — Test impact filtresi

PR şeridinde tüm monorepo değil, **etkilenen paketler** koşar:

```bash
pnpm turbo run test lint typecheck --filter='...[origin/main]'
```

- `packages/types` değişince web + mobile düşer (doğru davranış).
- Yalnız `apps/web` değişince mobil jest hiç koşmaz.
- `merge-queue`, `main` ve `nightly` şeritlerinde filtre **yok** — tam koşu.

Bu, Faz 1'deki `path-filtering` orb'unun üstüne biner: orb job'un başlayıp başlamayacağına, `--filter` job içinde hangi paketlerin koşacağına karar verir. İkisi çakışmaz.

`--filter='...[origin/main]'` shallow clone'da yanlış sonuç verir. CircleCI checkout'unun `origin/main` ref'ini gördüğünden emin ol; görmüyorsa job başında `git fetch origin main --depth=1` ile getirilir.

### G3 — Test bölme

#### G3a — `run-node-tests.mjs` enjeksiyon noktası (§4.2)

`apps/web/scripts/run-node-tests.mjs:35` dosyaları kendi tarıyor ve `process.argv.slice(2)`'yi dosya listesinden **önce** yerleştiriyor. Dışarıdan liste veremiyorsun.

Eklenecek: `--files-from <path>` bayrağı.

- Bayrak verilmezse davranış **birebir aynı** kalır (`collectTestFiles(srcRoot)`).
- Verilirse dosya listesi o dosyadan satır satır okunur; yollar aynı `toCliPath` normalizasyonundan geçer.
- Boş liste hata değil, **başarılı çıkış** olmalı — bir shard'a hiç test düşmeyebilir. Mevcut `testFiles.length === 0` → `exit(1)` davranışı yalnız bayraksız çağrı için geçerli kalır.
- `run-node-tests.mjs` için bir test dosyası yoksa yazılır (`scripts/quality/*.test.mjs` deseninde değil, `apps/web/scripts/` altında).

CircleCI tarafı:

```bash
circleci tests glob "src/**/*.test.ts" "src/**/*.test.tsx" \
  | circleci tests split --split-by=timings > /tmp/web-shard.txt
node scripts/run-node-tests.mjs --files-from /tmp/web-shard.txt
```

`parallelism: 2` ile başla. 4'e çıkarma kararı ölçümle verilir, peşinen değil.

#### G3b — jest sharding

`test:components` için jest'in yerleşik `--shard=<i>/<n>` bayrağı kullanılır. `parallelism: 2`.

#### G3c — E2E bölme

16 spec dosyası var, `workers: 1` (§3.5). E2E zaten **suite bazında** dört job'a bölünmüş durumda — bu yeterli. `parallelism` eklenmez, `fullyParallel` açılmaz.

Gerekçe: `fullyParallel` açmak paylaşılan bir Postgres şemasında yarışlara yol açar; her worker'a ayrı şema vermek ayrı bir proje. Bu paketin kapsamı dışında, gerekirse ayrı bir iş olarak açılır.

### G4 — Prod-mode E2E (§4.3)

Bugün `server.ts:15` `NODE_ENV !== "production"` → e2e job'ları `NODE_ENV: test` verdiği için Next **dev modda** koşuyor. İki bedeli var: rota başına JIT derleme duraklaması (CI timeout'larının 75s/60s olmasının sebebi) ve görsel regresyonun prod bundle'ı değil dev çıktısını ölçmesi.

Sıra:

1. **Önce doğrula:** `assertWebEnvironment(process.env, "production")` prod dalında hangi değişkenleri zorunlu kılıyor? Listeyi çıkar. Eksik varsa e2e'ye özel bir sahte-prod profili yaz — **gerçek secret kullanma**, mevcut e2e sahte değerlerinin (Turnstile test anahtarları, `e2e-livekit-api-key` vb.) desenini izle.
2. `build-web` job'u `NEXT_PUBLIC_E2E_TEST_MODE=true` ile derler — bu **build-time** değişken, çalışma zamanında verilmesi işe yaramaz.
3. `e2e` job'ları workspace'ten `.next` + `dist` alır, `NODE_ENV=production` ile `PLAYWRIGHT_SKIP_WEB_SERVER=1` verip sunucuyu ayrı bir adımda başlatır, `/ready` beklenir.
4. Timeout'lar düşürülür: test 75s → 30s, navigation 60s → 20s, action 30s → 15s, expect 30s → 10s. **Tek adımda değil** — bir koşu prod-mode'a geçiş, sonraki koşu timeout düşürme. İki değişken aynı anda oynatılırsa hatanın kaynağı belirsizleşir.
5. Görsel regresyon baseline'ları prod-mode'da değişecek (V6). Yenileme **kullanıcı onayıyla** yapılır; diff'ler tek tek gözden geçirilir, toplu `--update-snapshots` ile sessizce kabul edilmez.

Prod-mode'a geçiş bir testi kırıyorsa: bu bir **bulgu**dur, dev-mode'a geri dönmek çözüm değil. Kırılan test rapora yazılır ve düzeltilir.

### G5 — Golden image otomatik yeniden basımı

Faz 1'de imaj elle basılıyordu. Artık `pnpm-lock.yaml` veya `docker/ci/Dockerfile` değiştiğinde imajı yeniden basan bir job eklenir:

- yalnız `main`/`uat` push'unda,
- yeni digest `.circleci/main.yml`'a **otomatik yazılmaz** — job digest'i çıktı olarak basar, güncelleme elle yapılır (sessiz imaj değişimi istemiyoruz),
- `circleci-config-contract.test.mjs`'e iddia: executor imajı `:latest` değil digest kullanıyor.

---

## Yasaklar

- `resource_class` büyüterek hız satın alınmaz. Kredi doğrusal artar, kazanç değil.
- `fullyParallel: true` açılmaz (G3c gerekçesi).
- `parallelism` ölçüm olmadan artırılmaz.
- Cache anahtarları `{{ .Branch }}` ile daraltılmaz — dal başına cache ıskası üretir.
- Prod-mode geçişinde kırılan test `.skip` edilmez, karantinaya da alınmaz — düzeltilir.
- Turbo cache'e `test:coverage` ve `e2e*` görevleri **eklenmez**.

---

## Kabul kriterleri

1. Aynı commit iki kez koşturulduğunda ikinci koşuda `build`, `lint`, `typecheck`, `test` görevlerinin çoğunluğu turbo cache hit.
2. Yalnız `apps/mobile` değiştiren bir PR'da web unit testleri **hiç koşmuyor** (`--filter` doğrulaması).
3. `node scripts/run-node-tests.mjs` bayraksız çağrıldığında davranışı Faz 2'deki ile birebir aynı; `--files-from` ile çağrıldığında yalnız verilen dosyalar koşuyor; boş liste `exit 0`.
4. `unit-web` ve `unit-mobile` job'ları iki shard'a bölünmüş, `--split-by=timings` gerçek zamanlama verisi kullanıyor (ikinci koşudan itibaren).
5. E2E prod-mode'da koşuyor: bir e2e job'unun logunda Next dev derleme satırı **yok**.
6. Playwright timeout'ları düşürülmüş ve suite yeşil.
7. Görsel baseline'lar yenilenmiş, her diff kullanıcı tarafından onaylanmış.
8. Ölçülen süreler: PR p95 **< 10 dk**, merge queue ≤ 20 dk, main ≤ 25 dk.
9. Push başına kredi **< 500**.
10. `pnpm test:toolchain` yeşil.

Kriter 8 veya 9 tutmuyorsa faz **kapanmaz**; hangi kaldıracın beklenenin altında kaldığı ölçülür ve rapora yazılır.

---

## Doğrulama

```bash
pnpm turbo run build --filter=@wizards/web --dry=json
```

```bash
node apps/web/scripts/run-node-tests.mjs --files-from /tmp/bos-liste.txt
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm test:toolchain
```

```bash
circleci config validate .circleci/config.yml
```

```bash
graphify update .
```

---

## Kullanıcının elle yapacakları

1. Railway'de turbo remote cache servisini oluştur; R2'de yeni bucket + erişim anahtarı üret.
2. `TURBO_API` / `TURBO_TOKEN` / `TURBO_TEAM` değerlerini CircleCI context'ine koy.
3. Prod-mode geçişinden sonra görsel regresyon diff'lerini tek tek onayla.
4. İkinci koşudan sonraki gerçek şerit sürelerini paylaş.

---

## Rapora yazılacak ek

- Kaldıraç başına kazanç: remote cache X dk, test impact Y dk, bölme Z dk, prod-mode W dk.
- Cache hit oranı (ilk hafta).
- Prod-mode geçişinde kırılan testler ve kök nedenleri — bunlar dev-mode'un gizlediği gerçek hatalardır.
- Güncellenmiş kredi/push ve aylık push kapasitesi.

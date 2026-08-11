# Faz 4 — Build once, promote always

> Başlamadan **[00-ortak-baglam.md](00-ortak-baglam.md)** oku. Bu faz §3.6, §4.4 ve §5-V8, §5-V9'a dayanır. Faz 3 kapısı geçmeden başlama.

## Amaç

Aynı commit'in **tek bir çalıştırılabilir çıktısı** olsun ve o çıktı ortamlar arasında taşınsın.

Bugün aynı commit üç kez derleniyor: `verify`/`build-web` içinde bir kez, e2e sunucusu için bir kez, Railway deploy'unda bir kez daha. Üçü farklı çıktı üretiyor. "CI'da geçti, prod'da patladı" sınıfının kaynağı tam olarak bu.

Bu faz aynı zamanda paketin **tek yeni kalite kapısı** iznini kullanır (K8): image güvenlik taraması + SBOM.

---

## Görevler

### G1 — Runtime image

`docker/web/Dockerfile`. Golden image'dan **ayrıdır** (V8): golden image CI araçları içerir, runtime image yalnız uygulamayı.

- Çok aşamalı: builder (pnpm install + `pnpm build`) → runtime (`node:24.18.0-bookworm-slim`, yalnız `dist`, `.next`, prod `node_modules`, Prisma client ve engine'ler)
- `apps/web/package.json` → `start` betiği giriş noktası: `node --enable-source-maps --import ./dist/instrument.js dist/server.js`
- Outbox worker aynı image'dan farklı komutla kalkar (`start:outbox-worker`) — ayrı image basılmaz
- `NODE_ENV=production`, root olmayan kullanıcı
- Prisma engine'lerinin taban imajla uyumu doğrulanır (`linux-musl` değil `debian-openssl-3` ailesi)

**Uyarı:** `turbo.json` → `build.env` uzun bir liste taşıyor (`NEXT_PUBLIC_*`, Sentry, Railway/Vercel değişkenleri). `NEXT_PUBLIC_*` olanlar **build-time**'dır — image'a gömülür. Yani ortam başına farklı `NEXT_PUBLIC_*` değeri gerekiyorsa **tek digest üç ortamda kullanılamaz**. Bunu önce doğrula:

- Hepsi ortamlar arası aynıysa → tek digest, plan aynen ilerler.
- Farklıysa → ya değişkenler çalışma zamanına taşınır (`/api/config` veya sunucu tarafı enjeksiyon), ya da ring başına ayrı digest basılır. **Karar kullanıcıya sorulur**, sessizce seçilmez.

### G2 — CI'da image üretimi

`build-image` job'u:

- Yalnız `main`, `staging`, `uat` push'larında ve tag'lerde koşar. PR şeridinde **yok**.
- Etiketleme: `ghcr.io/dogukanyazar8/whispr-web:<git-sha>` + digest.
- `latest` etiketi **kullanılmaz**.
- Digest bir workspace dosyasına yazılır ve sonraki job'lar oradan okur.
- Docker Layer Caching **açılmaz** (job başına 200 kredi, §2). Katman düzeni cache dostu kurulur: lockfile önce, kaynak sonra.

### G3 — Tarama ve SBOM (yeni kapı, K8 istisnası)

- **Image scan**: trivy (veya grype), `HIGH,CRITICAL` bulguda kırar. İlk koşuda mevcut bulgular bir baseline dosyasına alınır; **yeni** bulgular kırar. Baseline kalıcı bir muafiyet değildir, her girdide tarih ve gerekçe olur.
- **SBOM**: CycloneDX formatında üretilir, artifact olarak saklanır. Depo zaten bir açık kaynak manifesti tutuyor (`apps/mobile/src/legal/mobile-open-source-license-manifest.ts`) — SBOM onun yerini almaz, tamamlar.
- İkisi de yalnız `build-image` sonrası, PR şeridinde değil.

### G4 — Railway image deploy

`railway.toml` nixpacks build'inden image deploy'a geçer.

Korunacaklar:

- `preDeployCommand` — migration **aynı image içinden** çalışır. Bu, migration ile uygulama arasında sürüm sapmasını imkânsız kılar; bugünkü ayrı build'lerde bu garanti yok.
- `healthcheckPath = "/ready"`, `healthcheckTimeout = 300`
- `restartPolicyType = "ON_FAILURE"`, `restartPolicyMaxRetries = 10`

Dikkat: `db:recover:uat-history` UAT'a özel bir kurtarma adımı. Ring'lere yayarken bunun staging/production'da ne yaptığı **doğrulanır**; körlemesine kopyalanmaz.

Migration geri alınamaz. Image promotion sırası **daima** migration-uyumlu olmalı: yeni image eski şemayla, eski image yeni şemayla çalışabilmeli (genişlet-daralt deseni). Bu fazda bir kural olarak yazılır; şema değişikliği içeren her PR'da gözetilir.

### G5 — Ring promotion

```
uat     ← her uat push'u, otomatik
staging ← uat yeşilse + 30 dk soak, otomatik promote
main    ← manuel onay, aynı digest
```

- Promotion **yeniden build değildir** — aynı digest yeni ortama işaretlenir. Bunu doğrulayan bir kontrol eklenir: hedef ortama gidecek digest, kaynak ortamda çalışan digest ile aynı olmalı.
- Soak penceresi kontrolü: `/ready` sağlıklı + hata oranı eşiğin altında. Metrik kaynağı Sentry; eşik ve sorgu Faz 5'teki mobil halt mantığıyla **aynı yardımcıyı** kullanır — iki ayrı eşik mantığı yazılmaz.
- `main` promotion'ı CircleCI'de manuel onay adımıdır (`type: approval`).

### G6 — Sözleşme testleri

`scripts/quality/circleci-config-contract.test.mjs`'e eklenir:

- `build-image` job'u PR şeridinde yok.
- Image etiketinde `latest` geçmiyor.
- Promotion job'ları `docker build` **çağırmıyor** (yeniden build yasağı makine tarafından zorlanır).
- Scan job'u `build-image`'a bağlı ve `HIGH,CRITICAL` eşiğini taşıyor.

`railway.toml` değiştiği için onu okuyan bir sözleşme testi varsa güncellenir; yoksa yazılmaz.

---

## Yasaklar

- Promotion sırasında **yeniden build yok**. Bir ortama giden şey başka bir ortamda koşmuş digest'in aynısıdır.
- `latest` etiketi yok.
- Docker Layer Caching yok.
- Runtime image'a CI aracı (Rust, Playwright, cargo-audit) girmez.
- Scan baseline'ı "hepsini muaf tut" olarak kullanılmaz; her girdi tarihli ve gerekçeli.
- `NEXT_PUBLIC_*` farkı çıkarsa **varsayımla ilerlenmez** (G1), kullanıcıya sorulur.
- Desktop tarafına release hattı **açılmaz** — sözleşme testi `desktop-release.yml`'ın var olmamasını zorluyor, bu bilinçli.

---

## Kabul kriterleri

1. `uat` push'unda tek bir image digest üretiliyor; e2e o image'a karşı koşuyor (veya en azından aynı `.next` çıktısını kullanıyor).
2. Railway uat servisi o digest'i çalıştırıyor; Railway'de build adımı **yok**.
3. `staging` promotion'ından sonra çalışan digest uat'takiyle **birebir aynı**.
4. `main` promotion'ı manuel onay gerektiriyor ve yine aynı digest'i taşıyor.
5. Trivy taraması koşuyor; `HIGH,CRITICAL` yeni bulguda pipeline kırılıyor.
6. CycloneDX SBOM artifact olarak erişilebilir.
7. `preDeployCommand` migration'ı aynı image içinden çalıştırıyor.
8. Deploy süresi ölçülmüş ve önceki nixpacks build süresiyle karşılaştırılmış.
9. `pnpm test:toolchain` yeşil; yeni sözleşme iddiaları içeriyor.
10. `NEXT_PUBLIC_*` build-time değişkenleri konusunda alınan karar rapora yazılmış.

---

## Doğrulama

```bash
docker build -f docker/web/Dockerfile -t whispr-web:local .
```

```bash
docker run --rm whispr-web:local node --version
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

1. Railway'de uat servisini image deploy'a çevir (GHCR erişimi için registry kimlik bilgisi gerekir).
2. Aynı işlemi staging ve production için, ancak **yalnız uat bir hafta sorunsuz çalıştıktan sonra**.
3. `NEXT_PUBLIC_*` değişkenlerinin ortamlar arasında farklı olup olmadığını doğrula (G1) ve kararı ver.
4. İlk `main` promotion'ını manuel onayla.

---

## Rapora yazılacak ek

- Digest yolculuğu: hangi commit, hangi digest, hangi ortamlarda ne zaman çalıştı.
- Deploy süresi: önce / sonra.
- Scan baseline'ındaki her girdi, tarihi ve gerekçesi.
- `NEXT_PUBLIC_*` kararı ve gerekçesi.
- Genişlet-daralt migration kuralının nereye yazıldığı.

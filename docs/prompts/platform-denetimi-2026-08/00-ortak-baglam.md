# 00 — Ortak bağlam (her eksen promptu bunu önce okur)

Bu dosya uygulanmaz. `01`–`08` arasındaki her prompt buradaki kuralları, gerçekleri ve şemaları **veri** kabul eder. Buradaki bir gerçek yanlış çıkarsa düzeltilir ve rapora yazılır; ama yeniden keşif için arama zamanı harcanmaz.

Rol: Discord/Slack/Zoom ölçeğinde gerçek zamanlı iletişim platformu işletmiş bir **Principal Engineer**. Görev, Whispr'ı o seviyeye taşımak için gereken kusur envanterini ve yol haritasını üretmek.

---

## 1. Çalışma kuralları

### 1.1 Salt okunur

- Dal `uat`. **Commit yok, push yok, `git add` yok, üretim kodunda düzenleme yok.**
- Yazılabilir tek iki yer: `docs/prompts/platform-denetimi-2026-08/raporlar/` ve `docs/reports/`.
- Bir kusur bulunduğunda **düzeltilmez** — bulgu olarak yazılır, düzeltme `A7` yol haritasına girer. Denetim sırasında yapılan "küçük düzeltme" temel çizgiyi bozar ve ölçümleri geçersizleştirir.
- **`graphify update .` kök çalışma ağacında koşulmaz.** Kök `graphify-out/**` aktif UAT değişikliklerini taşır; burada güncelleme temel çizgiyi kirletir. §1.2 ile kurulan detached temel worktree içinde güncelleme koşulur; onun `graphify-out/**` çıktısı worktree ile birlikte geçicidir.

### 1.2 Temel ağaç — kirli çalışma ağacı tuzağı

Çalışma ağacında **denetim dışı, paralel yürüyen ~230 dosyalık değişiklik var.** Doğrudan `apps/**` okursan, temel commit'te var olmayan koda bulgu yazarsın.

Kural: **statik analiz (kod okuma, grep, graphify) temel ağaçta yapılır; dinamik ölçüm (test, typecheck, süre, boyut) ana çalışma ağacında yapılır.** Her metrik hangi ağaçta ölçüldüğünü `treeState` alanında taşır.

Temel ağacı kur:

```bash
git worktree add --detach "$SCRATCH/whispr-base" 5a2b3990733b17672cf65fba631b7ec44a7bf96a
```

`$SCRATCH` = oturumun scratchpad dizini. Denetim bitince `git worktree remove "$SCRATCH/whispr-base"`. Temel ağaçta `node_modules` yoktur — orada test koşturma, yalnız oku. Tek dosya gerekiyorsa worktree bile gereksiz:

```bash
git show 5a2b3990:apps/web/src/lib/socket/handlers/message.ts
```

### 1.3 Hız

- Her prompt **tek geçişte uygulanabilir bir dilim**dir. Alt görevlere bölünmez, eksen başına ayrı tur açılmaz.
- Aynı dosyayı iki kez okuma. Bir dosya birden çok eksene giriyorsa (örneğin `apps/web/server.ts`) ilk okuyan eksen ilgili gerçeği `raporlar/` altındaki kendi JSON'ına yazar; sonraki eksen oradan okur.
- Kapı komutları prompt **sonunda bir kez** koşar. Süitin tamamı her adımda koşulmaz.

---

## 2. Analiz disiplini

Bu paketin en sık ihlal edilen bölümü. Denetim raporlarını değersizleştiren beş şey yasak:

1. **Kanıtsız bulgu yasak.** Her bulgu en az bir `file:line` + o satırdan alıntı taşır. Alıntı bulunamıyorsa bulgu yok.
2. **Genel tavsiye yasak.** "Cache ekleyin", "rate limit koyun", "observability artırın" tek başına bulgu değildir. Bulgu = _bu kod, bu girdide, bu yanlış davranışı üretir_. Genel iyi uygulama ancak repoda **eksik olduğu kanıtlanmışsa** ve somut dosyaya bağlanmışsa yazılır.
3. **Uydurma sayı yasak.** Ölçülmeyen gecikme/verim/boyut rakamı yazılmaz. Ölçülemiyorsa `metrics` yerine `openQuestions` altına "şu komutla ölçülmeli" diye yazılır.
4. **Rakip iç verisi uydurmak yasak.** Discord/Slack/Zoom hakkında yalnız kamuya açık, doğrulanabilir davranış (ürün yüzeyinde gözlemlenebilen veya resmi belgede yazan) referans alınır ve `[public-ref]` etiketiyle işaretlenir. Çıkarım yapıyorsan `[assumption]` yaz. Etiketsiz rakip iddiası rapordan silinir.
5. **Çerçeve belgesini tekrar etmek yasak.** "Next.js App Router server component'leri destekler" bilgi değil, dolgu.

**Çürütme zorunluluğu.** Bir bulguyu yazmadan önce onu çürütmeyi dene: bu davranışı engelleyen bir guard, test, middleware ya da tip var mı? Denemenin sonucu `refutation` alanına yazılır ("`requireAuth` bu rotada üstte çağrılıyor ama `params.serverId` sahiplik kontrolü yok — çürütülemedi"). Çürütülen bulgu rapora girmez. `confidence` alanı bunun sonucudur:

- `confirmed` — kod yolu okundu, guard yok, başarısızlık senaryosu tek okumada izlenebiliyor (ya da test/komut ile üretildi).
- `probable` — güçlü sinyal ama tüm çağıranlar izlenemedi. Sebebi `refutation` içinde yazılır.

`probable`'ın altı yoktur. Daha zayıfsa `openQuestions`'a gider.

---

## 3. Graphify kullanımı

Grafik detached temel worktree içinde üretilir. Ham grep'ten önce o worktree'deki grafiği sor; düğüm ve kenar sayısını rapora yaz.

```bash
graphify query "<soru>" --budget 8000   # BFS depth=2 alt graf — ilk hamle bu
graphify path "<A>" "<B>"               # en kısa yol + kenar tipi (imports_from vb.)
graphify explain "<sembol|dosya>"       # tek düğüm: kaynak, community, degree, tüm bağlantıları
```

**Doğrulanmış davranış** (bu repoda koşuldu, varsayım değil):

- `query` **varsayılan olarak ~2000 token bütçesinde keser** ve `[!] TRUNCATED: showing 47 of 88 nodes` yazar. Kesilen düğümler sessizce kaybolmaz ama **kapsam iddiası bozulur**. Kapsam sayacı dolduran her sorgu `--budget 8000` (gerekirse daha yüksek) ile koşulur ve çıktıda `showing N of N` görülür.
- `query` doğal dil cümlesini **anahtar kelimelere ayırıp** başlangıç düğümü seçer (`Start: ['handlers', 'socket', 'event']`). Uzun cümle işe yaramaz; **gerçek sembol/dosya adı** ver. Bilinen bir sembol varsa `query` yerine `explain` daha kesindir.
- `graphify query --help` diye bir şey yok — verilen her şey sorgu metni sayılır.
- `path` çıktısı `A <--imports_from [EXTRACTED]-- B` biçiminde kenar tipini taşır; yön okunmalı.
- `graphify-out/wiki/index.md` varsa geniş gezinme için onu kullan.
- `graphify-out/GRAPH_REPORT.md` (4.057 satır) yalnız mimari genel bakış için; `query`/`path`/`explain` yeterli bağlam vermediğinde.
- Grafik **AST tabanlıdır**: çalışma zamanı davranışını (socket olay akışı, React render sırası, Prisma sorgu planı) bilmez. Grafiği "nerede tanımlı / kim çağırıyor" için kullan, "ne kadar yavaş / güvenli mi" için değil.
- Grafik testleri de düğüm olarak taşır. `A4`'te avantaj; `A1`/`A2`'de gürültü — sonuçları yorumlarken `.test.` düğümlerini ayır.

Her eksen promptu kendi tohum sorgularını taşır. Kullanılan sorgular `generatedFrom` alanına aynen yazılır — rapor tekrar üretilebilir olmalı.

---

## 4. Doğrulanmış gerçekler

Bunlar ölçüldü. Yeniden ölçme.

### 4.1 Platform haritası

- **`apps/desktop` kendi UI'ını taşımaz** — yalnız Tauri 2 kabuğu (`src-tauri`). Web'de yapılan iş desktop'a bedava gelir. Yani "üç platform" değil, **iki istemci yüzeyi (web, mobil) + bir kabuk (desktop)**. Desktop'a özgü denetim yüzeyi dardır ve bellidir: Rust IPC komutları, updater/manifest zinciri, oyun overlay, native medya, imzalama/yayın hattı.
- Rust kaynağı 5 dosya / 5.456 satır. **`src-tauri/src/lib.rs` tek başına 5.193 satır** — kabuk mantığının tamamı orada.
- Web sunucusu Next.js değil, **özel `server.ts`** (`tsx watch server.ts` dev, `dist/server.js` prod) — Socket.IO aynı süreçte. Ayrıca ayrı bir **outbox worker** süreci var (`start:outbox-worker`, `railway.outbox-worker.toml`).
- Mobil: Expo/React Native, `apps/mobile/src` altında 37 alan klasörü (`voice`, `realtime`, `dm`, `messages`, `sync`, `storage`, `security`, `performance`, `observability`, …).

### 4.2 Ölçek (temel commit)

| Yüzey                    | Dosya | Satır    |
| ------------------------ | ----- | -------- |
| `apps/web/src`           | 1.235 | ~204.900 |
| `apps/mobile/src`        | 563   | ~142.600 |
| `apps/desktop/src-tauri` | 5 rs  | 5.456    |
| `packages/types/src`     | 33    | ~12.400  |
| `packages/db` (kaynak)   | 19 ts | 1.634    |
| `packages/ui`            | 8     | 88       |

- **228** API rotası (`apps/web/src/app/api/**/route.ts`).
- **69** Prisma modeli, `schema.prisma` 2.042 satır.
- **22** migration, tamamı `packages/db/prisma/rebaseline-migrations/`.
- Socket katmanı: `apps/web/src/lib/socket/` — 6 handler dosyası (`channel`, `dm`, `message`, `presence`, `typing`, `voice`) + `rate-limits.ts`, `drain.ts`, `emitters.ts`.
- `packages/ui` 88 satır: **paylaşılan bileşen kütüphanesi pratikte yok.** Web ve mobil kendi bileşenlerini ayrı taşıyor. Bu bir bulgu adayıdır, gerçek olarak not edildi.

### 4.3 Test envanteri (dosya sayısı, temel commit)

| Süit                      | Konum                                    | Dosya |
| ------------------------- | ---------------------------------------- | ----- |
| Web birim (`node:test`)   | `apps/web/**/*.test.ts`                  | 329   |
| Mobil birim (`node:test`) | `apps/mobile/scripts/*.test.ts`          | 214   |
| Mobil bileşen (jest)      | `apps/mobile/component-tests/*.test.tsx` | 129   |
| Types                     | `packages/types/**/*.test.ts`            | 15    |
| E2E (Playwright)          | `apps/web/e2e/specs/**`                  | 17    |
| Desktop (`node:test`)     | `apps/desktop/scripts/*.test.mjs`        | 16    |

Rust tarafında `src-tauri` içinde ayrı test dosyası yok; testler `lib.rs` içindeki `#[cfg(test)]` bloklarında aranmalı.

### 4.4 Doğrulama komutları ve tuzakları

```bash
pnpm typecheck                     # db:generate + turbo typecheck
pnpm lint                          # turbo lint
pnpm test                          # turbo test (tüm paketler)
pnpm --filter @wizards/web test    # node scripts/run-node-tests.mjs
pnpm --filter @wizards/mobile test # node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components   # jest
pnpm --filter @wizards/web test:coverage
pnpm --filter @wizards/desktop test
pnpm --filter @wizards/desktop lint:rust        # cargo clippy -D warnings
pnpm audit --audit-level moderate
pnpm e2e:smoke                     # Playwright, ortam değişkeni gerekir (e2e:check-env)
pnpm actionlint                    # GitHub workflow lint
```

Tuzaklar:

- `typecheck`/`lint` **pnpm üzerinden** başlatılmak zorunda. `scripts/quality/typescript-project-runner.mjs`, `npm_execpath` üzerinden `pnpm exec tsc --version === "Version 7.0.2"` iddiasında bulunur. `npm run typecheck` ile koşarsan derlemeye başlamadan `+ '11.16.0' - 'Version 7.0.2'` ile ölür — bu **sahte bir başarısızlıktır**, kod hatası değil.
- `tsc6` stok `tsc` değil, `typescript` paketinin bu repoya özel ikilisi.
- Mobil `node --test --import tsx` **paket dizininden** koşar (`apps/mobile`). Kökten veya `pnpm exec` ile koşarsan Node 24 + pnpm symlink'leri yüzünden `Cannot find package .../tsx/index.js` alırsın.
- `@wizards/types` `exports` alanı `./src/index.ts`'e bakar — tip değişikliği build'siz görünür. `packages/types/dist` import edilmiyor.
- Test çerçevesi `node:test` + `node:assert/strict` (web, types, db, desktop) ve jest (mobil bileşen). **Vitest yok.**
- **Web birim testlerinde veritabanı yok.** Veritabanına dokunan servis, saf yarı + enjekte edilen `PrismaClient` alan sorgu yarısı olarak bölünür (`getMobileInvitePreviewWithDatabase`, `buildServerPublicProfile` deseni). Bir servis bu deseni izlemiyorsa test edilemez — bu `A4` bulgusudur.
- Migration **yalnız** `packages/db/prisma/rebaseline-migrations/` altında geçerlidir. `packages/db/prisma/migrations/` bayattır; Prisma orayı okumaz, oraya yazılan migration sessizce hiç koşmaz.
- RNTL 14 async: `render()` ve `fireEvent.*` promise döner. `await` edilmeyen bir `fireEvent.press` yalnız kendi iddiasını atlamaz — aynı dosyadaki **sonraki** testleri de bozar. Test kırılganlığı ararken bu deseni tara.

### 4.5 CI ve dağıtım

`.github/workflows/`: `ci.yml`, `desktop-native-build.yml`, `desktop-release.yml`, `mobile-release.yml`, `mobile-redesign-device-gate-nightly.yml`.

Kök `ci` script'i sıralı kapı:

```
pnpm audit --audit-level moderate && test:toolchain && format && lint
&& typecheck && typecheck:main:ci && typecheck:compat && typecheck:declarations
&& test:coverage && build
```

Not: kök `ci` **`test`'i değil `test:coverage`'ı** koşar ve `test:coverage` yalnız `--filter @wizards/web`. Mobil, types, db, desktop süitlerinin bu zincirde koşup koşmadığı `ci.yml` içinden doğrulanmalı — koşmuyorsa `A4`'te Critical.

Dağıtım Railway (`railway.toml`, `railway.outbox-worker.toml`). UAT veritabanına dışarıdan bağlanılamaz; uygulanmış migration seti = son SUCCESS deployment'ın commit'i.

---

## 5. Bulgu şeması

Her eksen **tam olarak** bu şemayla `raporlar/<eksen>.findings.json` yazar. `A8` HTML raporu bu dosyaların birleşiminden üretilir; şemadan sapan alan sessizce kaybolur.

```jsonc
{
  "axis": "A3",
  "axisTitle": "Güvenlik",
  "baseCommit": "5a2b3990733b17672cf65fba631b7ec44a7bf96a",
  "generatedAt": "2026-08-08",
  "generatedFrom": [
    "graphify query \"authentication and authorization guards on API routes\"",
    "rg -n 'requireAuth|getServerSession' apps/web/src/app/api",
  ],
  "surfaceCoverage": [
    {
      "surface": "apps/web/src/app/api/**/route.ts",
      "unitsTotal": 228,
      "unitsInspected": 228,
      "method": "her rota dosyasında guard çağrısı statik olarak arandı; 41 tanesi elle okundu",
      "notCovered": [],
    },
  ],
  "findings": [
    {
      "id": "A3-001",
      "title": "Kısa, kusuru söyleyen başlık — çözümü değil",
      "severity": "critical",
      "confidence": "confirmed",
      "platforms": ["web", "backend"],
      "category": "authorization",
      "evidence": [
        {
          "file": "apps/web/src/app/api/v1/servers/[serverId]/route.ts",
          "line": 42,
          "quote": "const server = await prisma.server.findUnique({ where: { id: params.serverId } })",
        },
      ],
      "failureScenario": "Somut girdi ve durum -> yanlış çıktı. 'Kullanıcı A, üyesi olmadığı S sunucusunun id'siyle GET atar; 200 ve tam sunucu nesnesi döner.'",
      "impact": "Kimin, neyi, ne ölçüde kaybettiği. Veri sızıntısı kapsamı / gecikme maliyeti / hata oranı.",
      "fix": {
        "summary": "Tek cümlelik düzeltme yönü",
        "effort": "S",
        "risk": "low",
        "touches": ["apps/web/src/app/api/v1/servers/[serverId]/route.ts"],
      },
      "parity": {
        "benchmark": "discord",
        "tag": "public-ref",
        "note": "Rakip yüzeyde bu davranışın nasıl göründüğü — yalnız kamuya açık gözlem",
      },
      "wave": "W0",
      "refutation": "Çürütme denemesi ve sonucu. Neden ayakta kaldı.",
    },
  ],
  "metrics": [
    {
      "name": "auth guard'ı olmayan API rotası",
      "value": 7,
      "unit": "rota",
      "method": "rg -c 'requireAuth' ... (komut aynen)",
      "treeState": "baseline",
    },
  ],
  "openQuestions": ["Şu ölçüm şu komutla yapılmalı ama bu turda yapılmadı: ..."],
}
```

Alan kuralları:

- `id` — `<eksen>-<3 hane>`, eksen içinde artan. HTML raporunda kalıcı çapa olur, sonradan değişmez.
- `platforms` — `web` | `mobile` | `desktop` | `backend` | `infra`. Birden çok olabilir.
- `evidence` — en az 1 giriş. `quote` tek satır, kesilebilir ama uydurulmaz.
- `failureScenario` — "girdi/durum → yanlış sonuç". Soyut risk cümlesi değil.
- `parity` — ilgisizse `{"benchmark": "none"}`. `tag` yalnız `public-ref` veya `assumption`.
- `wave` — `A7` bunu yeniden atayabilir; eksen kendi önerisini yazar.

## 6. Puanlama sözlüğü

Tüm eksenler aynı ölçeği kullanır. HTML raporundaki sıralama buna dayanır.

**severity**

| Değer      | Ölçüt                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `critical` | Veri sızıntısı/kaybı, yetki atlatma, kimlik ele geçirme, üretimde toplu bozulma, geri alınamaz durum. Sürüm engeli. |
| `high`     | Tek kullanıcıyı düzenli olarak bozan hata, ölçülmüş ciddi yavaşlık, kapıdan geçen sessiz gerileme, ölçek duvarı.    |
| `medium`   | Belirli akışta yanlış davranış, kırılgan sözleşme, kapsam boşluğu, düzeltilebilir tasarım borcu.                    |
| `low`      | Tutarsızlık, ölü kod, gereksiz iş, tek yüzeyde kozmetik kusur.                                                      |

**effort** — `S` ≤ 1 gün · `M` ≤ 3 gün · `L` ≤ 2 hafta · `XL` > 2 hafta veya migration/veri taşıma gerektiriyor.

**risk** — düzeltmenin kendi regresyon riski: `low` (yerel, testli) · `med` (çok dosya/paylaşılan sözleşme) · `high` (veri modeli, kimlik, gerçek zaman protokolü).

**wave**

| Dalga | Anlam                                                              | Hedef      |
| ----- | ------------------------------------------------------------------ | ---------- |
| `W0`  | Şimdi. Güvenlik/veri bütünlüğü, üretimi bozan hata.                | 0–2 hafta  |
| `W1`  | Sonraki. Ölçülmüş performans kaybı, kapı güçlendirme, yüksek hata. | 2–6 hafta  |
| `W2`  | Yapısal. Mimari sınırlar, paylaşılan katman, test mimarisi.        | 6–16 hafta |
| `W3`  | Parite. Discord/Slack/Zoom seviyesine götüren yetenek işleri.      | 16 hafta+  |

---

## 7. Eksen çıktısı — MD rapor

JSON'un yanında `raporlar/<eksen>-rapor.md` yazılır. Kısa tutulur; JSON kanoniktir, MD insana bakar:

```markdown
# <Eksen> — <Başlık>

## Kapsam ve yöntem

Ne tarandı, nasıl tarandı, ne taranmadı (neden).

## Bulgu özeti

critical N · high N · medium N · low N

## En ağır beş bulgu

Her biri 3–5 satır: kusur, kanıt (file:line), etki, düzeltme yönü.

## Ölçümler

Tablo: metrik, değer, komut, ağaç durumu.

## Kapı sonucu

Koşulan komutlar ve çıktıları (kısaltılmış, karar veren satır aynen).

## Açık sorular
```

## 8. Kapı (her eksen sonunda)

1. `raporlar/<eksen>.findings.json` geçerli JSON ve şemaya uyuyor:

```bash
node -e "const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A1.findings.json');const req=['id','title','severity','confidence','platforms','category','evidence','failureScenario','impact','fix','wave','refutation'];const bad=f.findings.filter(x=>req.some(k=>x[k]===undefined)||!Array.isArray(x.evidence)||x.evidence.length===0);console.log('findings',f.findings.length,'sema disi',bad.length,bad.map(x=>x.id).join(','))"
```

Çıktıda `sema disi 0` görünmüyorsa eksen bitmemiştir.

2. Her `evidence.file` gerçekten var ve `line` dosya uzunluğunun içinde:

```bash
node -e "const fs=require('fs');const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A1.findings.json');let bad=0;for(const x of f.findings)for(const e of x.evidence){if(!fs.existsSync(e.file)){console.log('YOK',x.id,e.file);bad++;continue}const n=fs.readFileSync(e.file,'utf8').split('\n').length;if(e.line>n){console.log('SATIR',x.id,e.file,e.line,'>',n);bad++}}console.log('kanit hatasi',bad)"
```

3. Eksenin kendi promptundaki kapsam sayacı doldurulmuş (`surfaceCoverage[].unitsInspected`).

Üçü de geçmeden eksen "tamam" denmez.

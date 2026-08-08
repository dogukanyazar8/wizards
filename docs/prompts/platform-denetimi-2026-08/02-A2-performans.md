# A2 — Performans denetimi

Ön koşul: `00-ortak-baglam.md` okundu.
Çıktı: `raporlar/A2.findings.json` + `raporlar/A2-rapor.md`.

## Amaç

Üç yüzeyde (web istemci, mobil istemci, sunucu/gerçek zaman) **ölçülmüş** yavaşlık kaynaklarını bulmak. Discord/Slack/Zoom seviyesinin anlamı burada nettir: sohbet açılışı ve mesaj gönderim geri bildirimi algısal olarak anında, ses odasına giriş saniyenin altında, uygulama soğuk açılışı rakiplerle aynı sınıfta.

**Ölçmediğin sayıyı yazma.** Ölçüm mümkün değilse bulguyu `probable` yaz ve `openQuestions`'a ölçüm komutunu ekle.

## Tohum sorgular

```bash
graphify query "database query hot paths and pagination" --budget 8000
graphify explain "message list rendering"
graphify explain "socket event fan-out"
graphify query "react query cache invalidation on mobile" --budget 8000
graphify path "apps/mobile/src/app/screens/dm-screen.tsx" "apps/mobile/src/query"
graphify query "startup bootstrap sequence" --budget 8000
```

## Kapsam matrisi

| Yüzey                | Birim                                      | Hedef kapsam                                |
| -------------------- | ------------------------------------------ | ------------------------------------------- |
| Prisma çağrı yerleri | `apps/web` içindeki tüm `prisma.*` çağrısı | %100 statik tarama, en ağır 20'si elle      |
| API rotaları         | 228                                        | %100 statik, sayfalama/N+1 için 30 örneklem |
| Socket handler       | 6 dosya                                    | %100                                        |
| Web istemci render   | En ağır 15 bileşen                         | fan-in'e göre seçilir                       |
| Mobil ekranlar       | En ağır 12 ekran                           | `apps/mobile/src/app/screens`               |
| Mobil bootstrap      | `apps/mobile/src/bootstrap` tamamı         | %100                                        |
| Desktop kabuk        | `lib.rs` içindeki IPC + pencere yolu       | %100                                        |
| Build/bundle         | web `.next` analiz + mobil Metro           | ölçüm yapılabildiği kadar                   |

## Ölçüm protokolü

Dinamik ölçüm **ana çalışma ağacında** yapılır (`treeState: "working"`), statik sayım temel ağaçta (`treeState: "baseline"`). Her metrik `method` alanında **aynen koşulabilir komutu** taşır.

Yapılabilir ölçümler:

```bash
# Derleme/tip süresi
pnpm typecheck                              # süreyi kaydet
pnpm --filter @wizards/web build            # süre + çıktı boyutu

# Test süitinin kendi süresi (kapı maliyeti)
pnpm --filter @wizards/web test
pnpm --filter @wizards/mobile test

# Bağımlılık ağırlığı
node -e "const p=require('./apps/web/package.json');console.log(Object.keys(p.dependencies||{}).length)"
node -e "const p=require('./apps/mobile/package.json');console.log(Object.keys(p.dependencies||{}).length)"
```

Repoda hazır ölçüm araçları var — önce onları ara, yenisini yazma:

- `apps/mobile/src/performance/**` ve `apps/mobile/src/observability/**` (mobil ölçüm katmanı)
- `apps/desktop/scripts/run-windows-measurement.mjs` (`pnpm --filter @wizards/desktop measure:windows`)
- `tools/local-quality-dashboard/` (`pnpm quality:dashboard`)
- `apps/web` tarafında Server-Timing / `instrument.ts` izleri

## Aranacak kusur sınıfları

### 1. Veritabanı ve sorgu

- **N+1**: döngü içinde `await prisma.*`. `rg -n -B3 'for \(|\.map\(' apps/web/src --glob '*.ts' | rg -A2 'prisma\.'` ile aday çıkarılır, elle doğrulanır.
- **Sınırsız sorgu**: `findMany` çağrılarında `take` yok. Sayım: `rg -c 'findMany' ...` vs `take` taşıyanlar.
- **Derin sayfalama**: `skip` tabanlı sayfalama büyük ofsette çöker; cursor tabanlıya geçmemiş uçlar.
- **Eksik indeks**: sık filtrelenen kolon (`createdAt`, `channelId`, `userId`, `serverId` bileşimleri) için `@@index` var mı? `schema.prisma`'daki indeks listesi ile sorgu `where` bileşimleri karşılaştırılır.
- **Ölü indeks**: hiçbir sorgunun kullanmadığı bileşik indeks (yazma maliyeti, okuma faydası yok).
- **`include` şişmesi**: ilişkili tabloların gereksiz çekilmesi; özellikle mesaj listesi ve sunucu üye listesi.
- **Sayaç yerine `count()`**: her istekte `count` mu, denormalize sayaç mı?
- **Transaction kapsamı**: uzun `$transaction` içinde ağ çağrısı/harici iş var mı (kilit süresi).

### 2. Gerçek zaman

- Yayın genişliği: bir mesaj olayının kaç sokete gittiği. Oda tabanlı mı, kullanıcı tabanlı fan-out mu?
- `fetchSockets` gibi tüm-örnekleri-sorgulayan çağrılar sıcak yolda mı?
- Typing/presence olay sıklığı ve throttle/debounce var mı; `rate-limits.ts` gerçekten sıcak olayları kapsıyor mu?
- Aynı veriyi hem socket hem HTTP refetch ile getiren desenler (gönderim başına gereksiz refetch). Bu repoda daha önce görülen kusur ailesi; tekrarını ara.
- Yeniden bağlanma fırtınası: kopma sonrası istemcilerin eşzamanlı yeniden abonelik maliyeti, jitter/backoff var mı.

### 3. Web istemci

- Sunucu/istemci bileşen sınırı: `"use client"` gereğinden yukarıda mı (ağaç tamamı istemciye kayıyor mu)? `rg -l '"use client"' apps/web/src | wc -l` ve konumları.
- Render tetikleyicileri: her render'da yeni referans üreten prop/`useMemo` eksikleri, context değeri olarak inline nesne.
- Liste sanallaştırma: uzun mesaj/üye listelerinde sanallaştırma var mı.
- Veri getirme şelalesi: sırayla bekleyen bağımsız isteklerin paralelleştirilmemesi.
- Bundle: en ağır import'lar, tekilleştirilmemiş kütüphaneler, ikon/emoji setlerinin tamamının paketlenmesi.

### 4. Mobil

- Soğuk açılış zinciri: `apps/mobile/src/bootstrap` içinde ilk boyamadan **önce** koşan iş (şifreli depo açma, dev listesi, tema hesaplama, ağ çağrısı).
- Depolama: SQLCipher/secure storage açılış maliyeti, senkron okuma ilk render'ı kilitliyor mu.
- Liste performansı: FlashList/FlatList yapılandırması, `getItemType`, `keyExtractor`, `drawDistance`, satır bileşeninin memo disiplini.
- Query katmanı: `apps/mobile/src/query` — gereksiz invalidation, `staleTime` yokluğu, ekran odaklandığında toptan refetch.
- Görsel/medya: resim boyutlandırma, önbellek, ses odasında video kutucuğu abonelik/kalite kararları.
- Köprü/worklet maliyeti: reanimated/worklets kullanımının sıcak yolda olması.

### 5. Desktop kabuk

- `lib.rs` içindeki IPC komutlarının bloklayıcı iş yapması (dosya, ağ, kripto) — async mi, ayrı thread mi?
- Pencere oluşturma ve overlay yolu maliyeti.
- Updater/manifest zincirinin açılışta senkron çalışması.
- `companion_snapshot.rs` üretim sıklığı ve boyutu.

### 6. Sunucu süreci

- `server.ts`: Socket.IO ile HTTP aynı event loop'ta — CPU yoğun iş (kripto, resim, JSON serileştirme) loop'u kitliyor mu?
- Outbox worker'ın yoklama (polling) sıklığı ve toplu iş boyutu.
- Redis kullanımı: kaç round-trip, pipeline var mı, TTL disiplini.
- Log/telemetri sıcak yolda senkron mu.

## Yapılmayacaklar

- Optimizasyon uygulamak. Yalnız ölçüm ve bulgu.
- Ölçmeden "yavaş" demek. Statik kusur (N+1 gibi) ölçüm gerektirmez ama **başarısızlık senaryosu** gerektirir: "1000 üyeli sunucuda üye listesi 1001 sorgu üretir".
- Mikro-optimizasyon bulgusu (`for` vs `forEach`, `??` vs `||`). Etki eşiği: kullanıcı tarafından algılanabilir veya sunucu kaynağında ölçülebilir olmalı.
- Önbellek katmanı önermek — ölçülmüş yavaşlık ve invalidation stratejisi olmadan öneri yazılmaz.

## Teslim

1. `raporlar/A2.findings.json`.
2. `raporlar/A2-rapor.md`, ek olarak:
   - **Ölçüm tablosu**: metrik, değer, birim, komut, ağaç durumu, tarih.
   - **Sıcak yol tablosu**: akış (sohbet aç / mesaj gönder / ses odasına gir / uygulama aç), yüzey, bilinen maliyet kalemleri, en ağır kalem.
   - **Bütçe önerisi**: her sıcak yol için hedef eşik (p50/p95) ve bugün nerede olduğu (ölçülemiyorsa "ölçüm eksik" yazılır).
3. Ölçüm boşlukları `openQuestions` altında, her biri koşulabilir komutla.

## Kapı

`00 §8` üç kontrol + :

```bash
node -e "const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A2.findings.json');const m=f.metrics||[];const eksik=m.filter(x=>!x.method||!x.treeState);console.log('metrik',m.length,'method/treeState eksik',eksik.length)"
```

`method/treeState eksik 0` olmalı. Ayrıca en az bir gerçek dinamik ölçüm (`treeState: "working"`) bulunmalı — hiç yoksa denetim statik kalmıştır, rapora bu açıkça yazılır.

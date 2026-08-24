# Whispr Ana Sayfa + Mesajlar Düzeltme Paketi — Ortak Bağlam

Bu belge faz `01`–`06` için bağlayıcı çalışma sözleşmesidir. Her faz başlamadan tamamen oku.

## Amaç

Yerel `uat` çalışma ağacındaki Ana Sayfa ve Mesajlar yeniden tasarımını; doğrulanmış güvenlik,
doğruluk, realtime, performans, erişilebilirlik ve tasarım sorunlarını kök nedenlerinden kapatarak
üretim kalitesine getirmek. Yeni ürün kapsamı üretme. İlgisiz refactor yapma. Kanıtsız optimizasyon
ve soyutlama kurma.

## Değişmez çalışma sınırı

- Çalışma dizini: `C:\Users\doguk\Desktop\Wizards`.
- Yerel `uat` üzerinde çalış. `origin/uat` veya başka branch'i yerel WIP yerine geçirme.
- Belge yazılırken HEAD: `bc8d6bba448ec62bf96289718a015753e1696693`; başlangıçta güncel HEAD'i yeniden kaydet.
- Çalışma ağacı büyük ölçüde kirli; tracked, staged ve untracked değişiklikler kullanıcı WIP'idir.
- `git reset`, `git clean`, `git stash`, `git restore`, `git checkout --`, branch/worktree oluşturma,
  merge, rebase, commit, push, PR, Railway/UAT/prod deploy yasak.
- Toplu staging, toplu formatlama, ilgisiz dosya düzeltme yasak.
- Dosya değiştirmeden önce `git status --short --branch`, `git diff --stat`, `git diff --cached --stat`
  çalıştır. Faz sonunda aynı kontrollerle yalnız faz diff'ini ayır.
- PowerShell yürütme politikası `pnpm.ps1` engellerse `pnpm.cmd` kullan.
- Bir süreç sana ait değilse kapatma. `:3000` doluysa PID/komut satırını yalnız oku; ayrı port kullan.
- Veritabanı reset/migrate yalnız açıkça doğrulanmış loopback E2E DB üzerinde yapılabilir. UAT/prod DB'ye
  dokunma. `.env` dosyalarını değiştirme.

## Kaynak önceliği

1. Güncel çalışma ağacındaki uygulama kaynakları, API/service yetki sınırları ve DB migration'ları.
2. Davranışı gerçekten doğrulayan unit/integration/E2E testleri.
3. `docs/prompts/whispr-ana-sayfa-1a/` ve `docs/prompts/whispr-mesajlar/` içindeki SPEC/promptlar.
4. İki paketin `raporlar/` belgeleri; bunlar tarihsel kanıttır, güncel kaynağın önüne geçmez.

Bir rapor ile güncel kaynak çelişirse kaynağı ve testi esas al. Bulguyu değiştirmeden önce yeniden üret.
Test zaten geçiyor ve invariant kaynakta açıkça mevcutsa `NO CHANGE — ALREADY FIXED` diye kanıtla;
gereksiz yeniden yazma yapma.

## Zorunlu mühendislik yöntemi

1. `graphify query "<fazın dar sorusu>"` ile başla; Graphify yalnız navigasyon kanıtıdır.
2. İlgili servis, route, istemci, test ve migration zincirini kaynakta doğrula.
3. Her davranış için önce doğru nedenle kırılan regresyon testi yaz.
4. En küçük güvenli değişikliği uygula. Mevcut yardımcı/component/pattern'i yeniden kullan.
5. Dar testi geçir. Sonra etkilenen paket testleri, lint, typecheck, build/E2E sırasıyla genişlet.
6. Kod değiştiyse faz sonunda `graphify update .` çalıştır. `WinError 5` olursa `ENV BLOCKED` yaz;
   Graphify dosyalarını silme veya kilit tutan yabancı süreci kapatma.
7. Sonucu yalnız `PASS / FAIL / NOT RUN / ENV BLOCKED` ile raporla. Koşulmayan kanıtı geçmiş sayma.

## Güvenlik invariantları

- Yetki istemcide gizleme ile değil service/query sınırında uygulanır.
- Kimliği bilinen fakat yetkisiz kaynaklarda, mevcut sözleşmeyle uyumlu biçimde 404 tercih edilir;
  kaynak varlığını 403 ile doğrulama.
- `historyFromAt`, mesaj/poll expiry, membership, channel `VIEW_CHANNEL`, block ve profile visibility
  aynı veri yüzeyinin list/read/mutate/realtime yollarında birlikte uygulanır.
- Broad socket room'a kişiye özel/full DTO yayınlama. Ya yetkili user-room fanout kullan ya yalnız kimlik
  taşıyan invalidation yayınlayıp yetkili GET ile tazele.
- Dış girdiyi Zod/API sınırında doğrula. Prisma tagged raw query dışında string SQL kurma.
- Süreç içi mutex dağıtık yarışları çözmez; DB transaction/constraint/lock kullan.
- Secret, token, e-posta, dahili stack veya başka kullanıcının mesaj/oy/meta verisini loglama.

## Kalite ve performans invariantları

- React Query cache paylaşımı ile socket listener sahipliği ayrı konudur; listener sayısını ölç.
- Aynı kullanıcı için DM conversation realtime aboneliği bir sahibi aşmamalı.
- Poll kartı başına timer kurma; ortak dakika saatini kullan.
- Memoize edilen mesaj satırına her render yeni ReactNode/callback/object gönderme.
- N+1 sorgu, sınırsız relation include, tüm oy satırlarını gereksiz taşıma, initial-load duplicate fetch ekleme.
- Cache yalnız ölçülmüş ihtiyaç + açık invalidation sahibi varsa eklenebilir.
- DB indeksi eklemeden önce schema, tüm rebaseline migration'ları ve gerçek `pg_indexes` çıktısını kontrol et.
  Aynı indeksi ikinci kez oluşturma.
- Performans değişikliği önce/sonra aynı fixture, production build ve soğuk/sıcak koşul ayrımıyla ölçülür.

## Tasarım ve erişilebilirlik invariantları

- Global `.app-shell` 12px padding bu pakette değişmez; tüm uygulamayı etkileyen ürün kararıdır.
- Görsel boyutu korurken pointer hedeflerini en az 44×44 CSS px yap; hit area komşu kontrollerle çakışmaz.
- Normal metin kontrastı en az 4.5:1; büyük metin ve anlamlı UI sınırı en az 3:1.
- Overlay: focus içeride kalır, `Shift+Tab` ilk sınırdan sona döner, `Escape` kapatır, kapanınca gerçek
  tetikleyiciye döner. Thread açıldığında focus'u zorla composer'a gönderme.
- `prefers-reduced-motion` hareketi kapatır. Klavye, ekran okuyucu ve pointer davranışı eşdeğer olur.
- Mevcut tema/token/ölçek motorunu kullan. Yeni sabit renk, keyfi px bütçesi veya ikinci layout sistemi kurma.

## Kapsam matrisi

### Kodla kapatılacak

- Private voice metadata yetkisi; Home recent/mentions geçmiş ve expiry sınırları.
- Poll/pin read, mutate ve realtime görünürlüğü; friend suggestion profile visibility.
- Single-choice poll yarışı; voice recorder geç callback/otomatik gönderme; focus cleanup yarışı.
- Kanal thread paneli; sohbet değişiminde global arama; Mesajlar rayı yeni DM/grup aksiyonları.
- Poll/pin realtime tüketimi; mutation loading/error; sahte `Mute friend`; `/channels` bildirim erişimi.
- Duplicate DM query/listener sahipliği; poll render/timer maliyeti.
- Overlay focus; 44px hit area; lokal kontrast; responsive/parity regresyonları.

### Önce ölçülecek, yalnız kanıt varsa değişecek

- Poll relation satır büyümesi.
- `events/upcoming.totalCount` exact count maliyeti.
- `Message.replyToId` index borcu; mevcut baseline'da partial index bulunabilir.
- Ana Sayfa açılışındaki 11 isteğin hangisinin ekran, hangisinin shell zorunluluğu olduğu.
- 100 arkadaşta şerit doygunluğu ve Mesajlar büyük grup yükü.

### Bu pakette sessizce değiştirilmeyecek ürün kararları

- Global shell padding.
- Odak süresinin 25 dakika olması.
- `kind: game`, canlı oda caption semantiği, takvim `Hatırlat`, `awaiting.newCount` 24 saat yaklaşımı.
- Sunucu daveti aktör modeli, admin ölçek motoru, bütün uygulamanın çoğul metin göçü.
- UAT/prod migration/deploy, eski DM pin kolonlarının düşürülmesi.

## Ortak dar test komutu

Tek TS/TSX test dosyası:

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/polls/service.test.ts
```

Yolu faz testine göre değiştir. Birden çok dosya aynı komuta eklenebilir. Sonra:

```powershell
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web lint
pnpm.cmd --filter @wizards/web typecheck
```

Root kapıları ancak dar kapılar yeşilken:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

`pnpm.cmd format` yalnız kontrol yapar; kirli unrelated dosyalardaki önceden var olan format hatasını
faz hatasıyla karıştırma. Hiçbir zaman format hatasını kapatmak için unrelated WIP'i yazma.

## Faz raporu sözleşmesi

Her faz `docs/prompts/whispr-home-messages-remediation/raporlar/NN-fazN-rapor.md` üretir:

- Başlangıç branch/HEAD/status özeti.
- Yeniden üretilen bulgu ve kök neden.
- Değişen dosyalar, her dosyanın amacı.
- Eklenen testler ve önce neden FAIL olduğu.
- Güvenlik/performance invariant kanıtı.
- Komut bazında `PASS / FAIL / NOT RUN / ENV BLOCKED`, test sayıları ve kısa hata.
- Fazın dokunmadığı mevcut WIP ve açık riskler.
- Commit/push/deploy yapılmadığı beyanı.

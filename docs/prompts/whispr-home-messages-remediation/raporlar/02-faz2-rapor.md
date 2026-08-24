# Faz 2 Raporu — Doğruluk, Yarış Durumları, Lifecycle

## Sonuç

**PASS — Faz 2 tamamlandı.** Single-choice poll yarışı gerçek loopback PostgreSQL üzerinde yeniden
üretildi ve transaction seviyesinde kapatıldı. Voice recorder geç Promise/session, auto-stop draft,
explicit-send ve idempotent cleanup sınırları testlendi. Focus expiry sweep/lazy cleanup tam snapshot
compare-and-set oldu. Repo istemcilerinin ayrı gönderdiği `presence` ve `focus` için birleşik body artık 400.

Commit, push, PR, deploy, staging, branch/worktree, merge/rebase, reset/clean/stash/restore yapılmadı.
UAT/prod DB'ye dokunulmadı. Yalnız doğrulanmış loopback PostgreSQL'de benzersiz test fixture'ı yaratıldı;
`finally` cleanup sonrası fixture user/conversation sayısı `0/0` doğrulandı.

## Başlangıç ve Faz 1 kapısı

- Dal: `uat...origin/uat`
- HEAD: `bc8d6bba448ec62bf96289718a015753e1696693`
- Başlangıç çalışma ağacı çok kirliydi; staged iki font silme kaydı ve geniş unrelated tracked/untracked
  WIP korundu.
- `01-faz1-rapor.md` mevcut. Sonuç `PASS`; açık güvenlik invariantı yok. Faz 2 güvenliği bypass etmedi.
- Başlangıçta `git diff --stat`: 260 tracked dosya, `524992` insertion, `428534` deletion.
- Başlangıçta `git diff --cached --stat`: yalnız iki staged font silme kaydı.

## Graphify kaynak zinciri

Başlangıç komutu:

```powershell
graphify query "single choice poll concurrent vote transaction voice recorder getUserMedia lifecycle focus presence expiry cleanup race" --budget 5000
```

- **PASS:** BFS depth 2, 468 node; bütçede 131 node gösterildi.
- Dar sorgular poll için `PollVote` migration/service; voice için `voice-recorder.tsx`,
  `message-input.tsx`, `voice-capture.ts`; focus için `focus.ts`, `presence-service.ts`,
  `summary-service.ts`, route/client/focus-machine zincirini buldu.
- Graphify yalnız navigasyon kanıtı olarak kullanıldı; exact davranış kaynak ve testten doğrulandı.

## Bulgular ve düzeltmeler

### 1. Single-choice poll atomikliği

- **OPEN → FIXED.** Mevcut `deleteMany` + `createMany` aynı transaction içindeydi fakat iki transaction
  boş başlangıçta birbirini serialize etmiyordu. Farklı option unique anahtarları çakışmadığından iki
  `PollVote` commit olabiliyordu.
- Gerçek PostgreSQL RED: ilk paralel denemede final iki satır; exact assertion
  `attempt 1: single-choice invariant`, `2 !== 1`.
- Düzeltme: `apps/web/src/lib/polls/service.ts` yalnız single-choice için transaction içinde
  `pg_advisory_xact_lock(hashtextextended(...))` alıyor. SQL Prisma tagged `$executeRaw` ile
  parametreli; string SQL/interpolation yok.
- Lock anahtarı `(pollId,userId)` kapsamlı. Farklı voter'lar etkilenmez. `multi === true` yolu lock
  almaz; multiple-choice paralelliği gereksiz serialize edilmez.
- Process-local mutex, arbitrary delay, broad retry ve UI-only çözüm yok.
- Transaction sonrası service poll'u yeniden okuyor. Gerçek test iki concurrent response'un her birinde
  tek `myOptionIds` ve toplam count `1`; final DTO doğrudan DB satırıyla eşit.
- **ALREADY FIXED:** Tam-küme yazımı, duplicate option eleme, boş küme ile undo/toggle semantiği mevcut
  testlerde zaten yeşildi. Değiştirilmedi; `multi` bilgisi yalnız DB yazma stratejisine taşındı.
- Migration gerekmedi. `packages/db/prisma/schema.prisma` açıklaması gerçek advisory-lock invariantına
  uyarlandı.

### 2. Voice recorder lifecycle

- **OPEN → FIXED.** `getUserMedia()` sonrası mount/session guard yoktu. Unmount/cancel sonrası geç stream
  yeni kaydı başlatabiliyordu. Global refs eski `onstop` callback'inin yeni session kaynaklarını
  etkileyebilmesine açıktı. Auto-stop/visibility-stop doğrudan `onRecorded` çağırıyor; üst katman bunu
  upload + send yapıyordu.
- `apps/web/src/lib/messages/voice-capture.ts` monotonic generation guard, gerçek async stream request,
  idempotent cleanup wrapper ve draft owner ekledi.
- Geç stream yalnız ignore edilmez; bütün track'leri hemen durdurulur. Stale rejection/state callback'i
  yeni generation'a yazamaz.
- `apps/web/src/components/chat/voice-recorder.tsx` session-local recorder/stream/AudioContext/timer/chunk/
  sample sahipliği kullanıyor. Cleanup recorder listener'ları, timer, stream track'leri ve AudioContext'i
  idempotent kapatıyor. Unmount önce generation'ı geçersizleştiriyor.
- Stop, maximum-duration ve visibility yolları yalnız preview/draft üretir. `onRecorded` yalnız preview
  “Gönder” aksiyonundan erişilebilir. Object URL discard/send/unmount'ta tek kez revoke edilir.
- Requesting durumda kullanıcı iptal düğmesi mevcut. Recording send düğmesi “Kaydı bitir” stop aksiyonu
  oldu; gerçek gönderim preview'da ayrı.
- İzin reddi current generation için erişilebilir `role=status` hata yüzeyine gider. Stale permission
  sonucu state yazmaz.
- Yeni global recorder manager kurulmadı.

### 3. Focus expiry/presence atomikliği

- **OPEN → FIXED.** Sweep önce expired satırları okuyup sonra koşulsuz `user.update` yapıyordu. Arada yeni
  focus veya manuel presence değişimi gelirse stale sweep yeni durumu eziyor, yine broadcast ediyor ve
  `restored` sayıyordu.
- `resolveExpiredFocus` artık kararın yanında beklenen tam snapshot'ı taşır: `status`,
  `statusExpiresAt`, `statusFocusMinutes`, `statusRestoreTo`.
- Sweep ve lazy cleanup `updateMany` ile `id + tam snapshot` compare-and-set yapıyor. Yalnız `count > 0`
  kazananı broadcast edilir ve `restored` sayılır.
- Yeni focus, manuel restore-target değişimi veya başka cleanup snapshot koşulunu bozarsa stale işlem
  no-op. İki concurrent cleanup'ta tek kazanan, tek publish.
- `summary-service.ts` lazy resolution aynı snapshot'ı DB sınırına taşıyor. Önce-read/koşulsuz-write yolu
  kalmadı.

### 4. `presence + focus` request sözleşmesi

- Repo taraması: web `planFocusToggle` yalnız `{ focus: ... }`; `planPresencePick` yalnız
  `{ presence: ... }` gönderiyor. `updateHomePresence` bunları aynı endpoint'e ayrı request'ler olarak
  taşır. Mobile kendi `/api/v1/mobile/account/presence` sözleşmesini kullanıyor; bu birleşik body'nin
  desteklenen istemcisi değil.
- **ALREADY FIXED:** Desteklenen istemciler birleşik body göndermiyordu; istemci kodu değiştirilmedi.
- **OPEN → FIXED:** Server Zod şeması iki alanı birlikte kabul ediyordu. `PresenceUpdateBodySchema` artık
  birleşik body'yi `400` ile reddediyor. Böylece belirsiz `statusRestoreTo` intermediate-state semantiği
  yok; restore baseline mevcut tek-aksiyon sözleşmesinden türemeye devam ediyor.

## TDD kanıtı

### RED — poll, gerçek PostgreSQL

```powershell
$env:WHISPR_PHASE2_DB_CONCURRENCY='1'
node --env-file=.env --import tsx --test --test-force-exit src/lib/polls/service.test.ts
```

- **FAIL (beklenen RED):** 21 test, 20 pass, 1 fail, 0 skip.
- Exact: `attempt 1: single-choice invariant`, `2 !== 1`.
- İki Promise gerçek service/default Prisma yoluyla ayrı PostgreSQL transaction'larına girdi.

### RED — voice lifecycle

- İlk guard RED: **FAIL**, 16 total; 15 pass, module-load failure.
  Exact: `does not provide an export named 'createIdempotentVoiceCleanup'`.
- Draft/explicit-send RED: **FAIL**, module-load failure.
  Exact: `does not provide an export named 'createVoiceRecordingDraft'`.
- Deferred getUserMedia RED: **FAIL**, module-load failure.
  Exact: `does not provide an export named 'requestVoiceCaptureStream'`.
- GREEN testleri gerçek deferred Promise resolve/reject, fake MediaStream track stop ve idempotent cleanup
  callback sayılarıyla lifecycle nedenini doğruluyor; yalnız static markup kontrolü değil.

### RED — focus/request

```powershell
node --env-file=.env --import tsx --test --test-force-exit src/lib/home/focus.test.ts src/lib/home/focus-machine.test.ts src/lib/home/presence-service.test.ts src/app/api/v1/users/me/presence/route-logic.test.ts
```

- **FAIL (beklenen RED):** 40 test, 36 pass, 4 fail.
- Birleşik body: `200 !== 400`.
- Stale new-focus sweep: `{ restored: 1 }` yerine `{ restored: 0 }`.
- Stale manual-presence sweep beklenmedik `IDLE` broadcast etti.
- Concurrent cleanup exact snapshot yerine eski dar koşulu kullandı.

## Zorunlu doğrulama

### Dar birleşik kapı + gerçek DB

```powershell
$env:WHISPR_PHASE2_DB_CONCURRENCY='1'
node --env-file=.env --import tsx --test --test-force-exit src/lib/polls/service.test.ts src/components/chat/voice-recorder.test.tsx src/lib/messages/voice-capture.test.ts src/lib/home/focus.test.ts src/lib/home/focus-machine.test.ts src/lib/home/presence-service.test.ts src/app/api/v1/users/me/presence/route-logic.test.ts
```

- **PASS:** 87 test, 87 pass, 0 fail, 0 skip.
- Poll gerçek DB testi bu koşuda aktif ve PASS.

### Full web test

```powershell
pnpm.cmd --filter @wizards/web test
```

- **PASS:** 3642 test, 838 suite, 3641 pass, 0 fail, 1 skip.
- Skip yalnız `WHISPR_PHASE2_DB_CONCURRENCY` full unit koşusunda bilinçli kapalı olduğu için gerçek DB
  testidir; aynı test yukarıdaki zorunlu dar koşuda 5 ardışık yarışla PASS.
- Beklenen failure-path logger/Prisma diagnostic satırları görüldü; runner exit 0.

### Lint

```powershell
pnpm.cmd --filter @wizards/web lint
```

- **PASS:** config/contract prelude 10/10; `eslint .` exit 0.
- Ara target lint: **FAIL**, `react-hooks/refs` 2 hata. Lifecycle/draft stabil nesneleri lazy `useState`
  initializer'a taşındı; aynı target lint sonra **PASS**.

### Typecheck

```powershell
pnpm.cmd --filter @wizards/web typecheck
```

- **PASS:** `typescript-project-runner --project=web --mode=check`, exit 0.
- Typecheck'in değiştirdiği temiz `apps/web/next-env.d.ts` generated yan etkisi `restore` kullanmadan exact
  `apply_patch` ile başlangıç içeriğine döndürüldü; final status temiz.

### Diff hygiene

```powershell
git diff --check -- <Faz 2 dosyaları>
```

- **PASS:** output yok, exit 0.
- Faz TS/TSX dosyaları explicit Prettier listesiyle formatlandı. İlk listede Prisma dosyası için
  `No parser could be inferred ... schema.prisma` nedeniyle komut exit 1; TS/TSX dosyaları yazıldı,
  Prisma yalnız comment değişimi ve diff-check temiz.

### Graphify

```powershell
graphify update .
```

- İlk deneme **FAIL:** `[Errno 22] Invalid argument: 'graphify-out\\.graphify_root'`.
- `.graphify_root` değeri `.`, dosya normal, çalışan Graphify/Python süreci yoktu. Dosya silinmedi; yabancı
  süreç kapatılmadı.
- Exact koşula dayalı retry **PASS:** `No code-graph topology changes detected; outputs left untouched.` ve
  `Code graph updated.`
- 32 mevcut zero-node warning; exit 0. HTML/generated graph elle değiştirilmedi.

### DB fixture cleanup

```sql
SELECT ... FROM "User" WHERE "id" LIKE 'phase2-poll-user-%';
SELECT ... FROM "DMConversation" WHERE "id" LIKE 'phase2-poll-conversation-%';
```

- **PASS:** users `0`, conversations `0`.
- Bağlantı hedefi başlangıçta sanitize edilerek doğrulandı: PostgreSQL, host `localhost`, port `5432`, DB
  `wizards`, loopback `true`. Server container adresi yalnız kimlik doğrulama amacıyla okundu; secret
  yazdırılmadı.

## Faz 2 tarafından hedefli düzenlenen dosyalar

- `apps/web/src/lib/polls/service.ts`
- `apps/web/src/lib/polls/service.test.ts`
- `apps/web/src/components/chat/voice-recorder.tsx`
- `apps/web/src/components/chat/voice-recorder.test.tsx`
- `apps/web/src/lib/messages/voice-capture.ts`
- `apps/web/src/lib/home/focus.ts`
- `apps/web/src/lib/home/focus.test.ts`
- `apps/web/src/lib/home/presence-service.ts`
- `apps/web/src/lib/home/presence-service.test.ts`
- `apps/web/src/lib/home/summary-service.ts`
- `apps/web/src/app/api/v1/app/summary/route-logic.test.ts`
- `apps/web/src/lib/home/types.ts`
- `apps/web/src/app/api/v1/users/me/presence/route-logic.test.ts`
- `packages/db/prisma/schema.prisma` — yalnız invariant açıklaması.
- Bu rapor.

`voice-capture.test.ts`, `focus-machine.test.ts` ve route source dosyaları doğrulandı fakat Faz 2 tarafından
değiştirilmedi.

## Kapı özeti

- Faz 1 güvenlik kapısı: **PASS**
- Poll gerçek PostgreSQL RED: **FAIL beklenen**, sonra **PASS**
- Voice deferred/lifecycle/explicit-send: **PASS**
- Focus stale sweep/manual/concurrent cleanup: **PASS**
- Birleşik request 400: **PASS**
- Zorunlu dar paket: **PASS — 87/87**
- Full web test: **PASS — 3641 pass / 0 fail / 1 documented skip**
- Web lint: **PASS — 10/10 prelude + ESLint**
- Web typecheck: **PASS**
- Diff hygiene: **PASS**
- Graphify final retry: **PASS**
- Build: **NOT RUN — Faz 2 prompt kapısı değil; web test/lint/typecheck geçti**
- E2E/browser: **NOT RUN — Faz 2 zorunlu lifecycle ve gerçek DB kanıtı dar testlerde kapandı**
- Root lint/typecheck/test/build: **NOT RUN — prompt web kapılarını istedi; unrelated geniş WIP korunuyor**
- UAT/prod DB mutation: **NOT RUN — yasak**
- Commit/push/PR/deploy: **NOT RUN — yasak**
- Açık Faz 2 zorunlu maddesi: **yok**

## WIP sınırı

Final HEAD başlangıçla aynı: `bc8d6bba448ec62bf96289718a015753e1696693`. Unrelated tracked,
untracked ve staged WIP korunuyor. Faz 2 dışında format/refactor yapılmadı. Final global diff büyük olduğu
için Faz diff'i explicit dosya listesi, target lint/typecheck/test ve `git diff --check` ile ayrıldı.

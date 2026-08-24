# Faz 1 Raporu — Güvenlik, Yetkilendirme, Veri Görünürlüğü

## Sonuç

**PASS — Faz 1 tamamlandı.** Açık güvenlik/yetkilendirme bulguları önce doğru nedenle kırılan regresyonlarla kanıtlandı, ardından server/service/query sınırında kapatıldı. Commit, push, PR, deploy, DB mutation, staging, branch/worktree, merge/rebase, reset/clean/stash/restore yapılmadı.

Çalışma ağacı başlangıçta ve sonda kirliydi. Yerel WIP korundu. `origin/uat` fetch/merge/rebase edilmedi ve yerel WIP yerine kullanılmadı.

- Dal: `uat...origin/uat`
- HEAD: `bc8d6bba448ec62bf96289718a015753e1696693`
- Başlangıçta staged olan iki font silme kaydı dahil unrelated değişikliklere dokunulmadı.
- Faz dosyalarının önemli bölümü başlangıçta zaten untracked WIP idi; yalnız aşağıdaki Faz 1 sınırları hedefli düzenlendi.

## Bulgular ve kapanış kanıtı

### 1. Private voice metadata

- **OPEN → FIXED:** Arkadaş satırındaki `voiceRoom`, yalnız presence görünürlüğüyle süzülüyordu; `VIEW_CHANNEL` yoktu.
- Düzeltme: `apps/web/src/lib/friends/queries.ts:202` mevcut `listChannelIdsByServerForUserWithPermission` helper'ını tüm ilgili server kimlikleri için tek batch çağrıda kullanıyor. `PermissionBits.VIEW_CHANNEL` + `ChannelType.VOICE`; özel kanal `voiceRoom` DTO'suna girmiyor.
- N+1: per-friend permission çağrısı yok. Bir voice-state sorgusu + bir across-server batch permission çözümü.
- Regresyon: özel kanal metadata gizleme ve batch-helper kaynak sınırı.
- **ALREADY FIXED:** Home live kartı zaten görünür kanal batch'i kullanıyordu (`apps/web/src/lib/home/live-service.ts:65`). Invisible katılımcı roster ve `participantCount` dışında; tüm roster gizliyse oda yok (`live-service.ts:201`). Kanıt: voice live 10/10 PASS.

### 2. Home recent + mentions zaman sınırları

- **OPEN → FIXED — recent:** DM recent seçimi artık `historyFromAt`, `deletedAt`, `placeholderRemovedAt`, `expiresAt` kurallarını latest-row seçimi öncesi uyguluyor (`apps/web/src/lib/home/recent-service.ts:151-170`). Preview sorgusu aynı expiry/history kurallarını tekrar uyguluyor (`recent-service.ts:228-242`).
- **OPEN → FIXED — mentions:** DM mention branch artık üyelik JOIN'i, `historyFromAt`, silinme/placeholder ve expiry sınırlarını SQL'de cursor'dan önce uyguluyor (`apps/web/src/lib/home/mentions-service.ts:166-194`). Aynı branch ilk ve sonraki keyset sayfasında kullanılıyor.
- Correctness/performance: recent sorgu bütçesi 5, mentions 2 olarak kaldı; page-size ile büyümüyor. Filtreleme `LIMIT` sonrası JavaScript'e bırakılmadı.

### 3. Poll

- **ALREADY FIXED:** Üyelik `poll → dmMessage → conversation → participants.some(viewer)` query sınırındaydı; yetkisiz poll 404. Anonymous DTO `canSeeVoters: false`; `getPollVoters` anonymous için creator dahil 403.
- **OPEN → FIXED:** Poll okuma/mutate artık message `deletedAt`, `placeholderRemovedAt`, `expiresAt` ve viewer `historyFromAt` görünürlüğünü aynı service kararında doğruluyor (`apps/web/src/lib/polls/service.ts:57-91`, `:141-162`). Görünmeyen poll 404; oy yazımı başlamıyor.
- Anonymous regresyon: serialized DTO'da başka voter kimliği bulunmadığı ayrıca kanıtlandı.
- **OPEN → FIXED — realtime:** Broad `poll:updated` payload full `PollDTO`/tally/`myOptionIds` taşımıyor; yalnız `{ conversationId, pollId }` invalidation (`apps/web/src/lib/dm/group-realtime.ts:123-138`). Recipient authorized GET ile yeniden okur.

### 4. Pins

- **OPEN → FIXED:** Katılımcı olmayan için varlık sızdırmayan 404 (`apps/web/src/lib/dm/pins-service.ts:174-184`).
- Pin listesi message deletion/placeholder/history/expiry filtrelerini relation query'sinde `take` öncesi uygular (`pins-service.ts:147-159`); service defense-in-depth aynı sınırları DTO öncesi tekrar kontrol eder (`:205-224`).
- Pin ve unpin hedefi aynı scoped `loadPinnableMessage` sorgusundan geçer (`:131-145`, `:235-247`, `:286-298`). Başka conversation, expired, deleted, placeholder-removed veya history dışı hedef mutate edilemez.
- **OPEN → FIXED — realtime:** Broad pin olayı count/excerpt/message kimliği taşımıyor; yalnız `{ conversationId }` invalidation (`apps/web/src/lib/dm/group-realtime.ts:106-121`).
- Performans: görünürlük filtreleri `take` öncesi; yeni per-row sorgu yok.

### 5. Friend suggestions

- **OPEN → FIXED:** Existing friend/request/block exclusion korunurken ortak `profileVisibilityWhereForViewer(viewerId)` candidate query `AND` koşuluna eklendi (`apps/web/src/lib/friends/suggestions-service.ts:82-101`, `:179-187`). Private profile candidate DTO'ya hiç girmez; sonradan private alan eklenmesi query sınırını aşamaz.
- N+1: server membership, exclusions, bounded candidate set ve mutual counts batch akışında kaldı. `take: FRIEND_SUGGESTION_MAX * 4` korunuyor.

### 6. Realtime disclosure

- Event type sözleşmeleri opaque invalidation olarak daraltıldı (`apps/web/src/lib/socket/events.ts:273-280`).
- Unit test exact emitted object'i deep-equal ile kilitliyor: pin yalnız conversation id; poll yalnız conversation + poll id. Full DTO/count/tally sızıntısı testte mümkün değil.
- **E2E NOT RUN:** Prompt koşuluna göre unit/integration kanıtı yeterli. Socket emitter'ın exact broad payload'ı doğrudan test edildi; ek realtime E2E gerekli değil.

## TDD kanıtı

### Baseline

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/friends/queries.test.ts src/lib/friends/suggestions-service.test.ts src/lib/polls/service.test.ts src/lib/dm/pins-service.test.ts src/lib/messages/messages-security.test.ts
```

- **ENV BLOCKED:** exit 1; 20 test, 16 pass, 4 loader fail.
- Exact hata: `DATABASE_URL is required for the PostgreSQL Prisma adapter.`
- Çözüm: env dosyası/DB değiştirmeden yalnız test process'ine local placeholder `DATABASE_URL` verildi. Bu mocked unit testler DB bağlantısı açmadı.

### RED

```powershell
$env:DATABASE_URL='postgresql://wizards:wizards@127.0.0.1:5432/wizards?schema=public'
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/friends/queries.test.ts src/lib/friends/suggestions-service.test.ts src/app/api/v1/app/recent/route-logic.test.ts src/app/api/v1/mentions/route-logic.test.ts src/lib/polls/service.test.ts src/lib/dm/pins-service.test.ts src/lib/dm/group-realtime.test.ts
```

- **FAIL (beklenen RED):** 93 test, 79 pass, 14 fail.
- 14 failure doğrudan hedef kök nedenlere bağlıydı: private voice permission/batch; profile policy; recent history/expiry; mentions expiry; poll history/message visibility; pin 404/query visibility/unpin; broad pin/poll realtime payload.

### GREEN

Aynı 7 dosyalı komut:

- **PASS:** 93 test, 93 pass, 0 fail.

## Zorunlu doğrulama

### Hedef komut

```powershell
$env:DATABASE_URL='postgresql://wizards:wizards@127.0.0.1:5432/wizards?schema=public'
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/friends/queries.test.ts src/lib/friends/suggestions-service.test.ts src/lib/polls/service.test.ts src/lib/dm/pins-service.test.ts src/lib/messages/messages-security.test.ts
```

- **PASS:** 73 test, 73 pass, 0 fail.

### ALREADY FIXED live görünürlüğü

```powershell
$env:DATABASE_URL='postgresql://wizards:wizards@127.0.0.1:5432/wizards?schema=public'
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/app/api/v1/voice/live/route-logic.test.ts
```

- **PASS:** 10 test, 10 pass, 0 fail.

### Full web test

```powershell
pnpm.cmd --filter @wizards/web test
```

- **PASS:** 3630 test, 836 suite, 3630 pass, 0 fail, 0 skipped.
- Bazı testler beklenen failure-path logger/Prisma diagnostic satırları üretti; runner exit 0 ve bütün assertion'lar geçti.

### Lint

```powershell
pnpm.cmd --filter @wizards/web lint
```

- **PASS:** config/contract prelude 10 test, 10 pass; ardından `eslint .` exit 0.

### Typecheck

```powershell
pnpm.cmd --filter @wizards/web typecheck
```

- **PASS:** `typescript-project-runner --project=web --mode=check`, exit 0.

### Diff hygiene

```powershell
git diff --check -- apps/web/src/lib/friends/queries.ts apps/web/src/lib/friends/queries.test.ts apps/web/src/lib/dm/group-realtime.ts apps/web/src/lib/dm/group-realtime.test.ts apps/web/src/lib/socket/events.ts
```

- **PASS:** output yok, exit 0.
- Untracked Faz WIP dosyaları `git diff` kapsamına girmedi; `eslint .` ve typecheck bunları doğruladı.

### Graphify

Başlangıç:

```powershell
graphify query "friends voice recent mentions poll pins suggestions authorization history expires realtime membership" --budget 5000
```

- **PASS:** scoped BFS 318 node; 127 node çıktı. Bulgular kaynak ve testle ayrıca doğrulandı.

Kod sonrası:

```powershell
graphify update .
```

- **PASS:** 28.760 node, 67.915 edge, 1.265 community; `graph.json` ve `GRAPH_REPORT.md` yenilendi.
- 5 curated graph dosyası Graphify tarafından `2026-08-20/` altına yedeklendi.
- 32 source zero-node uyarısı; exit 0. Grafik 5.000 node HTML limitini aştığı için yalnız HTML viz atlandı; JSON/report üretildi.
- Ara deneme `graphify update . --no-viz`: **FAIL**, `unknown update option: --no-viz`; hiçbir kod etkisi yok. Hemen exact zorunlu komutla düzeltildi ve PASS.

## Faz 1 tarafından hedefli düzenlenen dosyalar

- `apps/web/src/lib/friends/queries.ts`
- `apps/web/src/lib/friends/queries.test.ts`
- `apps/web/src/lib/friends/suggestions-service.ts`
- `apps/web/src/lib/friends/suggestions-service.test.ts`
- `apps/web/src/lib/home/recent-service.ts`
- `apps/web/src/app/api/v1/app/recent/route-logic.test.ts`
- `apps/web/src/lib/home/mentions-service.ts`
- `apps/web/src/app/api/v1/mentions/route-logic.test.ts`
- `apps/web/src/lib/polls/service.ts`
- `apps/web/src/lib/polls/service.test.ts`
- `apps/web/src/app/api/v1/polls/route-logic.ts`
- `apps/web/src/lib/dm/pins-service.ts`
- `apps/web/src/lib/dm/pins-service.test.ts`
- `apps/web/src/app/api/v1/dm/[conversationId]/pins/route-logic.ts`
- `apps/web/src/lib/dm/group-realtime.ts`
- `apps/web/src/lib/dm/group-realtime.test.ts`
- `apps/web/src/lib/socket/events.ts`

Graphify zorunlu güncellemesi ayrıca `graphify-out/` generated/curated çıktısını değiştirdi. Rapor bu dosyadır.

## Kapı özeti

- Güvenlik/yetkilendirme regresyonları: **PASS**
- Zorunlu hedef test: **PASS — 73/73**
- Dar genişletilmiş test: **PASS — 93/93**
- Live ALREADY FIXED regresyonu: **PASS — 10/10**
- Full web test: **PASS — 3630/3630**
- Web lint: **PASS — 10/10 prelude + ESLint**
- Web typecheck: **PASS**
- Graphify update: **PASS**
- Realtime E2E: **NOT RUN — exact unit payload proof sufficient**
- Build: **NOT RUN — Faz 1 prompt kapısı değil; typecheck/lint/full test geçti**
- UAT/prod DB: **NOT RUN — mutation yasak**
- Commit/push/PR/deploy: **NOT RUN — yasak**
- Açık Faz 1 zorunlu maddesi: **yok**

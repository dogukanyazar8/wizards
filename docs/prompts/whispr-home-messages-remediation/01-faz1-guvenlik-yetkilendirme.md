# Faz 1 Prompt — Güvenlik, Yetkilendirme, Veri Görünürlüğü

`00-ortak-baglam.md` belgesini tamamen oku ve uygula. Yerel kirli `uat` üzerinde çalış. Kod
değişikliği yetkisi var; commit/push/deploy, branch/worktree, reset/stash/clean yok.

## Hedef

Ana Sayfa ve Mesajlar veri yüzeylerinde list/read/mutate/realtime yollarının aynı erişim kararını
uygulamasını sağla. İstemci gizlemesine güvenme. Veri varlığını, gizli geçmişi, private channel
metadata'sını, poll oyunu veya profil bilgisini yetkisiz kullanıcıya sızdırma.

## Başlangıç araştırması

```powershell
graphify query "Home Messages friends voice recent mentions polls pins suggestions authorization history expiry realtime"
git status --short --branch
git diff --stat
git diff --cached --stat
```

En az şu zincirleri kaynakta izle:

- `apps/web/src/lib/friends/queries.ts`
- `apps/web/src/lib/friends/service.ts`
- `apps/web/src/lib/home/live-service.ts`
- `apps/web/src/lib/home/recent-service.ts`
- `apps/web/src/lib/home/mentions-service.ts`
- `apps/web/src/lib/privacy/visibility-policy.ts`
- `apps/web/src/lib/friends/suggestions-service.ts`
- `apps/web/src/lib/polls/service.ts`
- `apps/web/src/lib/dm/pins-service.ts`
- Poll/pin route'ları, DM realtime/socket fanout'u, `packages/types/src/poll.ts`

Önce mevcut ortak channel permission helper'ını bul. Aynı `VIEW_CHANNEL`/membership mantığını ikinci
kez kopyalama. Ortak helper yoksa yalnız iki veya daha fazla gerçek tüketiciyi sadeleştiren küçük,
sunucu tarafı helper çıkar.

## Zorunlu regresyonlar

### 1. Private voice metadata

- Arkadaş olan fakat private voice channel'ı göremeyen kullanıcı; channel id/name, server id/name,
  participant list/count veya “live” durumu alamaz.
- `VIEW_CHANNEL` sahibi kullanıcı aynı veriyi görür.
- Görünmez kullanıcı participant list/count içine girmez.
- Query toplu çalışır; arkadaş başına permission sorgusu oluşturmaz.

Testleri `friends/queries.test.ts` ve uygun service testine ekle. Client component testi yeterli değil.

### 2. Home recent ve mentions zaman sınırları

- DM için `historyFromAt` öncesi mesaj recent/mention sonuçlarında görünmez.
- `expiresAt <= now` mesaj/poll/pin sonuçlarında görünmez ve mutate edilemez.
- Kanal mesajı, kullanıcının artık göremediği kanaldan dönmez.
- Cursor/pagination ikinci sayfada da aynı sınırı korur; filtreyi sonuç geldikten sonra JS'de yapma.

### 3. Poll

- Conversation participant olmayan kullanıcı read/vote/result alamaz.
- Participant olsa bile poll bağlı mesaj `historyFromAt` öncesindeyse okuyamaz/oylayamaz.
- Expired/deleted/hidden poll mutate edilemez.
- Anonymous poll normal DTO'da voter identity döndürmez.
- Yetkisiz cevap mevcut API sözleşmesiyle uyumlu 404'tür; poll kimliğinin varlığını doğrulamaz.

### 4. Pins

- Participant olmayan, geçmişi göremeyen veya expired/deleted mesajı hedefleyen kullanıcı pin/unpin/list
  yapamaz.
- Pin listesi her satırda conversation membership, `historyFromAt`, deletion ve expiry uygular.
- Pin sayısı/kimliği broad socket payload üzerinden sızmaz.

### 5. Friend suggestions

- Engellenen/engelleyen hesaplar dönmez.
- Profil görünürlüğü `profileVisibilityWhereForViewer` veya güncel ortak policy ile sunucuda süzülür.
- Private profile için avatar/bio/activity gibi yasak alanlar DTO'ya sonradan eklenemez.

### 6. Realtime disclosure

`poll:updated` ve DM pin event zincirini emit noktasından istemciye kadar izle. Aşağıdakilerden yalnız
biri kabul:

1. Full DTO yalnız yetkisi o anda doğrulanmış user-room'lara yayınlanır.
2. Broad conversation room'a yalnız `{ conversationId, pollId }` veya eşdeğer opak invalidation gider;
   istemci yetkili GET ile tazeler.

Broad conversation room'a `PollDto`, `myOptionIds`, voter kimliği, pinned message içeriği veya author
metadata yayınlamak yasak. N+1 fanout oluşturma; recipient kararını batch çöz.

## Uygulama sınırı

- Yetkiyi route component'ine, React Query `enabled` koşuluna veya görünmez butona bırakma.
- Yeni genel “authorization framework” kurma.
- Mevcut endpoint response shape'i gereksiz kırma. Güvenlik için shape değişirse types, clients ve testleri
  aynı fazda güncelle.
- Güvenlik hatasını retry/cache ile maskeleme.

## Doğrulama

Önce hedef dosyaları tek komutta koş. Ardından:

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/friends/queries.test.ts src/lib/friends/suggestions-service.test.ts src/lib/polls/service.test.ts src/lib/dm/pins-service.test.ts src/lib/messages/messages-security.test.ts
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web lint
pnpm.cmd --filter @wizards/web typecheck
graphify update .
```

Socket güvenliğini bir unit/integration test gerçekten kanıtlamıyorsa ilgili realtime E2E'yi ekle; final
fazda çalıştırılacak. Fazı yalnız full DTO sızıntısı kapanmışsa tamamla.

Rapor: `docs/prompts/whispr-home-messages-remediation/raporlar/01-faz1-rapor.md`.

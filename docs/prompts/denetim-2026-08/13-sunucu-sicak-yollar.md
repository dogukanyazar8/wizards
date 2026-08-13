# 13 — Soket sıcak yolları ve eksik rate limit'ler

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 03 landed (rate limit kimliği doğru çözülmeden bütçe eklemek işe yaramaz). 04 landed (ses handler'ları orada limitlendi).

## Sorun

Ürünün en sık tetiklenen olayları küme çapında iş yapıyor. Bazı pahalı uçlarda hiç bütçe yok — biri için tanımlı bütçe bile ölü kod.

## Kapsam

### 1. `message:send` ve `typing:*` küme çapında `fetchSockets()` çağırıyor

`apps/web/src/lib/socket/handlers/message.ts:245` · `handlers/typing.ts:263`, `:282`, `:132`, `:25` · `apps/web/src/lib/workspace/unread-service.ts:608`, `:625` · `apps/web/src/lib/socket/emitters.ts:8`

`fetchSockets()` Redis adaptörüyle her düğümün eşleşen her soketi serileştirip cevaplaması demek. Repo bu maliyeti çevrimiçi sayaç için zaten yasaklamış (`server-online-presence.ts:4`) ve orada Redis set'ine geçmiş. Yazma göstergesi tavanı 24 olay/10 sn/kullanıcı; elli kişi yazarken saniyede yüzlerce küme turu.

Yap:

- `getActiveServerMemberUserIds` mevcut `server:<id>:online` Redis set'inden okusun (`SMEMBERS`).
- Kanal izleyicileri için `channel:<id>:viewers` set'i ekle; `channel:join`/`channel:leave` bakımını yapsın. Tek yazıcı kuralı: set'i yalnız bu iki handler yazsın.
- Yazma göstergesi ad çözümlemesini Redis hash değerinden yap — DM yolu (`typing.ts:206`) bunu zaten yapıyor, kanal yolu `prisma.user.findMany` çağırıyor.
- Yazma göstergesini izin filtresinden geçirmek yerine düz `channelId` odasına emit et. Yazma göstergesi geçici bir arayüz süsü; izin filtresi maliyeti değerinden büyük. **Bu bir davranış değişikliği** — kullanıcıya söyle.

### 2. `presence:activity` limitsiz ve no-op kontrolsüz

`apps/web/src/lib/socket/handlers/presence.ts:72`, `:103` · `apps/web/src/lib/friends/service.ts:282`, `:397`

Zaten ONLINE olan kullanıcının tekrar ONLINE'ı iki Postgres okuması + Redis pipeline + kullanıcının bulunduğu **her sunucunun her üyesine** fan-out yapıyor. 10 sunucu × 5k çevrimiçi = tek olaydan 50k teslimat. Debounce'suz bir focus/blur dinleyicisi tek bağlantıdan fan-out yolunu doyurabiliyor.

Yap:

- `data.status === ctx.socket.data.presenceStatus` ise erken dön.
- Yazma göstergesinin kullandığı `checkRateLimit`'i buraya da uygula.

### 3. Presence fan-out hedef setini her seferinde sıfırdan kuruyor

`apps/web/src/lib/friends/service.ts:368`, `:421`

Her durum değişiminde iki sınırsız sorgu (arkadaşlar + sunucu üyelikleri), sonuç emit'ten sonra atılıyor. Aynı arkadaş sorgusu ses fan-out'unda tekrar ediyor.

Yap: arkadaş id ve sunucu id setlerini mevcut `presence:` anahtar TTL'i arkasında Redis'te cache'le; `emitFriendsUpdated`'dan invalidate et.

### 4. Eksik rate limit'ler

Aynı kalıp, beş yer. Hepsi mevcut `API_RATE_LIMITS` tablosuna yeni satır + `enforceApiRateLimit` çağrısı — yeni mekanizma yok.

| Uç                                  | Yer                                                                            | Not                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/servers`              | `apps/web/src/app/api/v1/servers/route.ts:24`                                  | `server:create` bütçesi (10/saat) **zaten tanımlı ama hiçbir rota referanslamıyor** — ölü kod. Çağrıyı ekle. Her çağrı 1 Server + 3 Role + üyelik + kategori + kanallar yazan bir işlem. |
| Ek indirme                          | `apps/web/src/app/api/v1/attachments/[attachmentId]/download/route.ts:57`      | Ağaçtaki tek limitsiz kimlikli rota. 32 MB video döngüsü hem UploadThing hem Railway egress'ini faturalandırıyor. Yeni `attachment:download` bütçesi.                                    |
| Kanal pinleri                       | `apps/web/src/app/api/v1/channels/[channelId]/pins/route.ts:9`                 | Mobil ikizinde bütçe var (`mobile:channel:pins:list`), web'de yok.                                                                                                                       |
| Bildirim listesi + okunmamış sayısı | `apps/web/src/app/api/v1/notifications/route.ts:8` · `unread-count/route.ts:7` | İstemci bunları yokluyor; mobil ikizlerinde bütçe var.                                                                                                                                   |
| Arkadaş uçları (3)                  | `apps/web/src/lib/friends/queries.ts:80`, `:133`, `:152`                       | Rate limit **ve** `take` yok; `listFriends` ayrıca tüm sonuç kümesi için Redis presence + Postgres `groupBy` yapıyor.                                                                    |
| Ayarlar bootstrap                   | `apps/web/src/lib/settings/bootstrap.ts:19`                                    | Rate limit yok; ayrıca aşağıdaki madde.                                                                                                                                                  |
| GIF arama                           | `apps/web/src/app/api/v1/gifs/route.ts:24`                                     | Limit servis içinde, ama `User.findUnique` **limitten önce** koşuyor; reddedilen istek bile DB'ye gidiyor. Limiti öne al.                                                                |
| Masaüstü indirme                    | `apps/web/src/app/api/v1/desktop/download/route.ts:27`                         | Kimliksiz, limitsiz, her istek upstream'e gidiyor, cache yok. Diğer anonim rotalar `createClientRateLimitIdentity` kullanıyor. Manifest'i kısa TTL ile cache'le.                         |

### 5. Ayarlar bootstrap'i her istekte diski ve tabloyu tarıyor

`apps/web/src/lib/settings/bootstrap.ts:19`, `:28`

`package.json` her istekte okunup parse ediliyor; `Contributor` tablosu tam taranıyor. İkisi de süreç ömrü boyunca sabit.

Yap: modül düzeyinde memoize et. Yeni cache katmanı kurma — bir modül seviyesi değişken yeter.

### 6. Her soket bağlantısı moderatör listesini sorguluyor

`apps/web/src/lib/socket/server.ts:619` · `apps/web/src/lib/moderation/case-count-broadcast.ts` · `apps/web/src/lib/socket/drain.ts:44`

`listQueueReaderUserIds` üyelik testinden **önce** tüm moderatörleri çekiyor; kullanıcıların ~%100'ü moderatör değil. Rolling deploy'da drain tüm soketleri düşürdüğü için yeniden bağlanma dalgasında istemci başına bir tane.

Yap: tek `userId` için `AdminMembership` kontrolü yap, veya moderatör id setini kısa TTL ile Redis'te tut.

## Yapılmayacak

- Soket sunucusunu yeniden mimarlamak.
- Yeni presence deposu.
- Rate limit bütçe **değerlerini** ayarlamak (mevcut değerler denetim kapsamı dışı) — yalnız eksik olanları ekle.
- İstemci tarafında yazma göstergesi UI'ına dokunma.

## Kabul kriterleri

1. `message:send` ve `typing:*` yollarında `fetchSockets()` çağrısı kalmadı.
2. Aynı durumla gelen `presence:activity` erken dönüyor ve rate limit'li.
3. Tablodaki sekiz uç da bütçe uyguluyor; `server:create` artık ölü kod değil.
4. GIF rotasında limit DB okumasından önce.
5. Ayarlar bootstrap'i istek başına disk/DB'ye gitmiyor.
6. Moderatör kontrolü tüm listeyi çekmiyor.

## Testler

- `getActiveChannelViewerUserIds` / `getActiveServerMemberUserIds`: Redis set'inden okuduğu (sahte Redis ile), `fetchSockets` çağrılmadığı.
- `presence:activity`: aynı durumda hiçbir yan etki olmadığı.
- Rate limit: her uç için limit aşımında handler gövdesine girilmediği.
- Bootstrap memoizasyonu: ikinci çağrının disk okumadığı.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

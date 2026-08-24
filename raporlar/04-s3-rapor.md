# Dalga 1 Ş3 raporu

## Sonuç

`GET /api/v1/discover/events`, aynı yolun idempotent `POST/DELETE interest` mutasyonu,
`ServerPublicProfile` gerçek veri genişletmesi ve üç mevcut üyelik ucunu kullanan
`lib/discover/join-client.ts` uygulandı. Yeni katılma ucu açılmadı. Commit/push yapılmadı;
74 px ray, 228 px nav ve kullanıcı barına dokunulmadı.

## Etkinlikler

- Yüklem `SCHEDULED`, başlangıcı gelmemiş, `isPublic`, keşfedilebilir + public sunucu ve
  @everyone için görünür kanal şartlarını uygular. Kullanıcının üye olduğu sunucular elenmez.
- `Channel` modelinde `isPrivate` kolonu yok. Bu nedenle private/public, mevcut
  `resolveChannelPermissions` ile default rolün `VIEW_CHANNEL` sonucundan türetildi.
- Sıralama `scheduledStartAt asc, id asc`; keyset `e|<epochMs>|<id>`; sayfa ilgisi tek
  `ScheduledEventInterest.findMany` sorgusuyla yüklenir.
- `durationLabel` farktan (`n sa m dk`), bitiş yoksa boş; location kanal, external location,
  yoksa yalnız sunucu adı olarak üretilir. Saat metni sunucuda kurulmaz.
- `discover:events` bütçesi `120/60sn` eklendi.
- Interest yazısı `upsert/deleteMany`; sonra `GOING` ve `MAYBE` satırları sayılıp iki saklı
  sayaç aynı Serializable işlemde eşitlenir. `+1/-1` kullanılmaz. API yanıtı yalnız istenen
  `{ interested, interestedCount }` sözleşmesini taşır.

## Profil

- Ortak arkadaş rolü: sahip veya `ADMINISTRATOR`/`MANAGE_SERVER` taşıyan rol `admin`; diğerleri
  `member`. Üyelikler tek toplu sorguda yüklenir.
- Presence Redis socket kaydından toplu okunur; `ONLINE -> online`, `IDLE/DND -> idle`,
  `OFFLINE/INVISIBLE -> offline`.
- `voiceRoomCount`, preview sınırından bağımsız tüm `VOICE` kanallarından ve @everyone
  görünürlüğünden türetilir. Sunucu profili + voice satırları aynı `$transaction` içinde okunur.
  `voiceActiveCount` değiştirilmedi.
- `category` ve `languages` doğrudan `Server` kolonlarından gelir. `category = null` iken profil
  kategori pili çizmemeli ve görsel ton `--primary` fallback kullanmalı; bu UI kararı Ş3'te
  veri uydurularak kapatılmadı.

## Katılma

- `joinDiscoverServer` → `POST /api/v1/servers/[serverId]/join`.
- `leaveDiscoverServer` → `DELETE /api/v1/servers/[serverId]/members/me`.
- `redeemDiscoverInvite` → `POST /api/v1/servers/join`.
- İki mevcut join yanıtına additive `serverId + name` eklendi; eski alanlar ve mobil yanıtlar
  korunuyor.
- `parseInviteCode` dört sözleşmeli biçimi kabul eder; boş, iç boşluk, query/hash, farklı yol
  ve 60 karakteri reddeder. Prompt aynı anda "uzunluk dayatma" ve "60 karakteri reddet" dediği
  için 8 karakterlik DB invite sınırı vanity'ye uygulanmadı; vanity güvenlik tavanı 32 seçildi.
- Başarı yardımcısı tek sınırda profil `joined` değerini yazar; workspace server listesi ile
  tüm Keşfet server-grid sorgu varyantlarını geçersizler.
- Hata kodları mevcut `resolveServerJoinErrorMessageKey` üzerinden
  `banned/full/unavailable/generic` anahtarlarına gider. Davet expiry/use hatasında mevcut ucun
  mesaj/kodu aynen taşınır; yeni hata sınıfı yok.

## Socket kararları

- `TODO(api):` invite/public self-join yolu membership'e özgü bir `server:membership:added`
  olayı üretmiyor; yalnız genel `server:settings:updated` yayıyor. Uydurma event dinlenmedi;
  Keşfet kendi mutasyonunun başarılı `onSuccess` yardımcısına güvenir.
- `discover.index.updated` üründe yok ve saatlik dizin için gerekli değil; uygulanmadı.

## TDD ve doğrulama

- RED: servis/route/join-client modülleri yokken ilgili testler `ERR_MODULE_NOT_FOUND` verdi.
- GREEN: Ş3 odaklı servis, route, profil, join, mevcut workspace uyumluluğu ve sayaç
  sözleşmesi: `122/122 PASS`.
- Sahip olunan Ş3 dosyalarının hedefli ESLint koşusu geçti.
- `pnpm --filter @wizards/web typecheck`: `FAIL`. Ş3 dosyalarında hata yok; eşzamanlı etkinlik
  WIP'inde üç hata var:
  - `src/lib/events/mutations.ts:1`: `ScheduledEventRsvpStatus` dışa aktarılmıyor.
  - `src/lib/events/notifications.ts:254`: `NotificationSocketPayload` içinde `message` yok.
  - `src/lib/workspace/scheduled-event-service.ts:1`: `ScheduledEventRsvpStatus` dışa aktarılmıyor.
- `pnpm --filter @wizards/web lint`: yapılandırma sözleşmeleri `10/10 PASS`, tam ESLint `FAIL`
  (`5` hata). Ş3 dışı `discover-page.tsx:534,567,722,734` için `react-hooks/refs`; Ş3 dışı
  `events/mutations.ts:1` için `consistent-type-imports`.
- `pnpm --filter @wizards/web test`: `ENV BLOCKED`; iki tam koşu da bütün-suite özeti
  üretmeden asıldı. Eski koşunun kalan alt süreci
  `mobile/app/releases/route-logic.test.ts`, temiz yeniden koşunun kalan alt süreci
  `mentions/[mentionId]/context/route-logic.test.ts` idi. Son koşu CPU ilerlemesi olmadan
  yedi dakikadan uzun bekletilip kontrollü kesildi; bu nedenle tam kapı için PASS/FAIL iddiası
  yok.
- İstenen `typecheck && lint && test` zinciri ilk `typecheck` hatasında durur. Ayrı lint/test
  koşuları yalnız kapıları bağımsız sınıflandırmak için yapıldı.
- `graphify update .`: `PASS`; `31181` düğüm, `73325` kenar, `1357` community.

## Sınırlar

- Referans HTML'den ölçü gerektiren UI değişikliği yoktu; ölçü tahmini yapılmadı.
- `graphify query` yalnız gezinme içindi; gerçek kaynak, Prisma şeması ve testlerle doğrulandı.
- Commit/push yok.

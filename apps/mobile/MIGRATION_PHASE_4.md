# Whispr Mobile - Faz 4 migrasyon kaydı

## Teslim edilen sözleşmeler

Faz 4, mevcut web davranışını değiştirmeden mobile namespace üzerinden güvenli mobil parite sağlar. M1 tek Expo development build ve `expo-clipboard` kapanışını; M2 sunucu oluşturma/katılma, davet, UploadThing tek-kullanımlık claim ve avatar/sunucu simgesini; M3 ise bağlamsal sunucu, kanal ve üye yönetimini tamamlar.

Mobil API envanteri:

- `PATCH|DELETE /api/v1/mobile/servers/[serverId]`
- `POST|PATCH|DELETE /api/v1/mobile/servers/[serverId]/categories/[categoryId]`
- `POST|PATCH|DELETE /api/v1/mobile/servers/[serverId]/channels/[channelId]`
- `GET /api/v1/mobile/servers/[serverId]/members?limit=50&cursor=[cursor]`
- `GET /api/v1/mobile/servers/[serverId]/roles`
- `PATCH /api/v1/mobile/servers/[serverId]/members/[memberId]/roles`
- `DELETE /api/v1/mobile/servers/[serverId]/members/[memberId]`
- `DELETE /api/v1/mobile/channels/[channelId]/history`
- M2 medya claim uçları ile `profile-avatar` ve `server-icon` amaçları.

## Ekran, sorgu ve cache haritası

- `MobileServerSettingsScreen`: kesin `workspace(serverId)` sorgusu; sunucu adı, simge, kategori/kanal girişleri ve isim yazarak silme.
- `MobileChannelSettingsScreen`: aynı route-context `serverId` ile kanal düzenleme, silme ve yalnız TEXT kanallar için geçmiş temizleme.
- `MobileServerMembersScreen`: cursor sayfalı `workspaceMembers(serverId)`, yalnız genişletilen yetkili üye için `workspaceRoles(serverId)`.
- Tüm mutasyonlar yalnız kesin bootstrap/workspace/member/role/channel-message anahtarlarını etkiler; global prefix invalidation kullanılmaz.
- Socket köprüsü 350 ms içinde tek timer bucket ile yalnız aktif üyeler, arkadaşlar veya olayın kendi workspace anahtarını yeniler.

## Veritabanı, deploy ve geri alma

Bu fazın medya bölümü eklemeli `MobileMediaUpload` migrasyonunu kullanır. Railway deploy öncesi `pnpm --filter @wizards/db db:migrate:deploy` çalıştırılır; uygulanmamış migration varsa deploy durur. Geri alma için uygulama kodunu önce önceki UAT commit'ine döndürün, geçerliliği dolmuş claim'lerin normal cleanup süresini bekleyin ve yalnız onaylı bir Prisma rollback prosedürüyle eklemeli tabloyu kaldırın; shared UAT verisini ad-hoc SQL ile silmeyin.

Medya akışı UploadThing Expo istemcisi -> tek kullanımlık completion -> claim'dir. Claim id, storage key, bearer token, davet kodu, parola veya ham upload URL'si ekran görüntüsüne, Maestro kanıtına ya da repoya yazılmaz.

## Doğrulama ve UAT

Yerel doğrulama: `pnpm --filter @wizards/mobile typecheck`, mobile contract/component testleri, `quality:check`, Expo dependency check ve moderate seviye audit. Cihaz kanıtı `.maestro/phase4-server-management.yml` ile üretilir; yalnız şu iki redacted hedef kabul edilir:

- `artifacts/mobile/phase4/closure/light-server-management`
- `artifacts/mobile/phase4/closure/dark-server-management`

UAT doğrulaması liveness/readiness için 200 ve anonim `/api/v1/mobile/servers/not-a-real-server/members` isteği için 401 bekler. Upload, native share chooser veya 2FA/claim içeriği görünürken ekran görüntüsü alınmaz.

## Bilinçli kapsam sınırları

Bu çalışma, web'in tam rol CRUD'una (create/update/delete + izin matrisi) göre bilinçli bir daralmadır; tam web rol CRUD paritesi değildir.

Rol CRUD + izin hiyerarşisi mobilde ertelendi.

Mobil yalnızca mevcut rollerin atama/kaldırma yetkisini ve yetkili üyeyi sunucudan atma (kick) işlemini sunar; sunucunun rol hiyerarşisini veya yetki sınırlarını genişletmez. Rol atama/kaldırma ve kick uçlarında web'in “kim kimi atayabilir veya sunucudan atabilir?” authz kontrolü servis katmanında birebir korunur.

Mobilde rol oluşturma/düzenleme/silme, rol sıralama, izin matrisi, kanal permission override'ları, rol hiyerarşisi hesabı ve kanal/kategori reorder UI yoktur. Capability alanları yalnız görünürlüğü belirler; her authz kararı web servis katmanında kalır.

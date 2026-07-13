# Whispr Mobile - Faz 5 devir notu

## Korunacak Faz 4 sözleşmesi

Faz 5, `ServerSettings`, `ServerMembers` ve `ChannelSettings` typed protected rotalarını korumalı; route-context `serverId` hiçbir zaman yalnız cache satırından çıkarılmamalıdır. Sunucu ayrıntısı `workspace(serverId)`, üyeler `workspaceMembers(serverId)`, atanabilir roller `workspaceRoles(serverId)` ve mesaj geçmişi `channelMessages(channelId)` kesin cache anahtarlarıyla kalmalıdır.

M3 realtime köprüsü `MOBILE_REALTIME_REFRESH_DEBOUNCE_MS === 350` ve mevcut timer-source bucket'larını korur. Bir timer yalnız kesin query key listesi invalidate eder: aktif olmayan settings/membership olayı kendi workspace'ini; aktif sunucu olayı ayrıca aktif üye listesini; presence olayı arkadaşlar ve aktif üye listesini yeniler. Workspace root prefix'i üye veya rol cache'ine yazmak için kullanılmaz.

Sunucu/kanal/üye yönetimi Zod doğrulamalı mobile route-logic sözleşmeleri üzerinden yapılır. Destructive işlemler ortak confirmation sheet ile duplicate submit korumasına sahiptir. Sunucu silme mevcut tam adı ister; category/channel silme, kick ve rol kaldırma onay ister; geçmiş temizleme yalnız TEXT kanalında görünür. `MobileMediaUpload`/UploadThing Expo istemcisi tek-kullanımlık claim akışıyla profile avatar ve server icon için kullanılmaya devam eder.

## Faz 5'e ertelenenler

Bu çalışma, web'in tam rol CRUD'una (create/update/delete + izin matrisi) göre bilinçli bir daralmadır; tam web rol CRUD paritesi değildir.

Rol CRUD + izin hiyerarşisi mobilde ertelendi.

Mobil yalnızca mevcut rollerin atama/kaldırma yetkisini ve yetkili üyeyi sunucudan atma (kick) işlemini sunar; sunucunun rol hiyerarşisini veya yetki sınırlarını genişletmez. Rol atama/kaldırma ve kick uçlarında web'in “kim kimi atayabilir veya sunucudan atabilir?” authz kontrolü servis katmanında birebir korunur.

Ek kapsam dışı alanlar: rol sıra değiştirme, kanal/kategori sıra değiştirme, kanal permission matrix/override, davet yönetiminin tam listesi/iptali, rol tabanlı toplu işlem ve mobilde authz hesaplamasıdır. Faz 5 bunlardan birini ele alırsa web servis authz testlerini ve mobile API rate-limit/zod sözleşmesini birlikte genişletmelidir.

## UAT ve işletim notu

Maestro faz 4 akışı oluşturduğu `Phase4 Maestro UAT` sunucusunu akış sonunda kendi mobil silme arayüzüyle temizler. Kanıt yalnız light/dark server-management görüntüleridir; davet, native share chooser, token, claim id, upload URL, parola ve 2FA sırları asla görüntülenmez veya commit edilmez.

Railway UAT deploy'unda `db:migrate:deploy` sonrası web build başarılı olmalı; `/api/health` ve `/api/health?ready=1` 200, anonim mobile members route 401 dönmelidir. Faz 5 önce bu korumalı erişim davranışını ve M3 cleanup testlerini tekrar çalıştırmalıdır.

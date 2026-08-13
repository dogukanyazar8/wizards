# 06 — DM/grup: yetki, yayın DTO'su, üyelik yarışı

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 04 landed (grup çağrısı çıkarma yolu orada eklendi; bu prompt aynı çıkarma işlemine kilit ekliyor).

## Sorun

Grup yazma yolları, eylemi yapan kişi için render edilmiş nesneyi herkese yayınlıyor; katılımcı DTO'su başkalarının özel sayaçlarını taşıyor; üye çıkarma işlemi kilitsiz olduğu için grup yönetilemez hâle gelebiliyor; bir soket olayı hiç yetki sormuyor.

## Kapsam

### 1. Grup DTO'su aktörün görüş açısını herkese yayınlıyor

`apps/web/src/lib/dm/group-service.ts:881` · `apps/web/src/lib/dm/service.ts:719`, `:731`, `:742`, `:744`, `:617` · `group-realtime.ts:29`

`mapConversation(updated, actorId, …)` sonucu tüm üyelere emit ediliyor. `lastMessage` aktörün geçmiş tabanına göre hesaplanıyor — "Hiç" geçmişiyle katılan üye göremeyeceği mesajı satırda görüyor (2c §7 ihlali). Ayrıca aktörün `role`, `notifyLevel`, `pinnedAt` alanları herkesin cache'ine düşüyor.

Yap: iki seçenek, **birini** seç.

- (a) Alıcı başına render et — `groupRemoveMemberRoute`'un `broadcastViewerId` deseni zaten var, onu genelleştir.
- (b) Görüş-nötr bir yayın payload'ı çıkar: `lastMessage`, `role`, `notifyLevel`, `pinnedAt`, `pinnedMessage.dismissed` alanları olmadan.

(b) daha ucuz ve daha güvenli — istemci zaten kendi görüşünü ayrı okuyor. (a) N katılımcı için N render demek. ISP açısından da (b) doğru: yayın olayının ihtiyacı olan arayüz, tekil okumanınkinden dar.

### 2. Katılımcı DTO'su başkalarının özel sayaçlarını gösteriyor

`apps/web/src/lib/dm/service.ts:434`, `:678` · `:1243` · `group-realtime.ts:34`

`unreadCount`, `mentionCount`, `muted` tüm roster için haritalanıyor. Herhangi bir grup üyesi, bir diğerinin grubu sessize alıp almadığını ve kaç mesajının okunmadığını okuyabiliyor. Soketle de toptan yayılıyor.

Yap: `mapDMParticipantWithPresence` viewer'ı bilsin; `userId !== viewerId` olan katılımcıda üç alanı sıfırla (veya alanları tamamen bırak — tip değişikliği maliyeti hangisi düşükse).

### 3. Üye çıkarma işlemi kilitsiz

`apps/web/src/lib/dm/group-service.ts:664`, `:935`, `:949` · `:376` (kardeş yol kilit alıyor)

`writeRemovedMember` üyelik advisory lock'ını almıyor ve "son üye çıkınca grubu sil" ile "son yönetici" testleri işlem dışındaki bir anlık görüntüden okunuyor. İki eşzamanlı ayrılma: grup silinmiyor, sıfır katılımcılı `GROUP_DM` kalıyor. OWNER ve tek ADMIN aynı anda ayrılırsa sahiplik **ayrılmakta olan üyeye** devrediliyor — grup kalıcı olarak yönetilemez.

Yap: işlemin ilk ifadesi `serializeGroupMembershipWrite(tx, conversationId)`; roster'ı kilit içinde yeniden oku; silme ve yönetici sayımı kararlarını o okumadan ver.

### 4. `dm:message:delivered` yetkisiz ve sınırsız harita

`apps/web/src/lib/socket/handlers/dm.ts:266`, `:135` · `apps/web/src/lib/dm/service.ts:1483`

Katılımcı kontrolü yok. Tek kısıt saldırganın verdiği `conversationId` ile anahtarlanmış bir `Map`; taze id'lerle döngü tabanı atlıyor. Her olay nested join'li bir Postgres okuması yapıyor ve haritaya asla temizlenmeyen giriş ekliyor.

Yap: handler'ı `isDMParticipant` ile kapıla (DB'ye gitmeden önce); tabanı `userId` bazlı Redis rate limit'e çevir — `checkDMMessageRateLimits` deseni zaten var. Per-socket `Map`'i kaldır.

### 5. `dm:call:leave` yetki kontrolünü çıkışın önüne koyuyor

`apps/web/src/lib/socket/handlers/dm.ts:389`, `:394`

Çağrı sırasında çıkarılan veya engellenen kullanıcı "kapat"a bastığında FORBIDDEN alıyor ve roster'da hayalet kalıyor; sonraki çağrıda `shouldRingParticipant` onu çaldırmıyor. Disconnect temizliği zaten kapısız `leaveGroupCall` çağırıyor.

Yap: `leaveGroupCall` ve `joinedCallConversationIds` temizliğini yetki kontrolünden **önce** yap. Çıkmak her zaman güvenli.

### 6. Grup çağrısı roster'ı atomik değil

`apps/web/src/lib/dm/group-call-state.ts:215`, `:195`

Redis read-modify-write; aynı tur içinde iki kabul birbirini siliyor. Modülün yorumu bu yarışı "kabul edilmiş" sayıyor ama kabul edilen sonuç iddia edilenden kötü: roster'ı boşaltan bir çıkış eşzamanlı katılanı da siliyor ve düzeltecek olay yok.

Yap: read-apply-write'ı Lua script'e al veya konuşma başına `SET NX PX` kilidi kullan (`acquireVoiceJoinLocks` deseni var). Yorumu gerçeğe göre güncelle.

### 7. Tek engelli üye tüm grubu kilitliyor

`apps/web/src/lib/dm/message-send-service.ts:242` · `apps/web/src/lib/dm/blocking.ts:36` · `apps/web/src/lib/friends/helpers.ts:20`

1:1 için yazılmış engel kapısı grup DM'inde tüm roster'a uygulanıyor ve engel iki yönlü eşleşiyor. 32 kişilik grupta tek bir engel ilişkisi her gönderimi `403 BLOCKED` yapıyor.

Yap: `GROUP_DM`'de roster geneli engel iddiasını atla (1:1'de kalsın). Alternatif olarak engellileri teslimattan çıkar ama gönderimi reddetme. **Karar kullanıcıya sorulmalı** — hangi davranış ürün açısından doğru: engellenen kişi grup mesajını görsün mü?

## Yapılmayacak

- Yeni grup izin seviyesi.
- Grup DTO'sunu baştan tasarlama.
- İstemci tarafında grup ekranlarına dokunma.
- Engelleme semantiğini 1:1'de değiştirme.

## Kabul kriterleri

1. Yayınlanan grup nesnesi görüş-bağımlı hiçbir alan taşımıyor (veya alıcı başına render ediliyor).
2. Katılımcı listesinde viewer dışındaki hiçbir kayıtta gerçek `unreadCount`/`mentionCount`/`muted` yok.
3. Eşzamanlı iki ayrılma: ya grup siliniyor ya da hayatta kalan bir yöneticisi oluyor; sıfır katılımcılı grup kalmıyor.
4. `dm:message:delivered` katılımcı olmayan soketten reddediliyor ve per-socket harita büyümüyor.
5. Çağrıdan çıkarılmış kullanıcı "kapat" ile roster'dan çıkabiliyor.
6. 32 kişilik grupta bir engel ilişkisi gönderimi engellemiyor.

## Testler

- Yayın payload'ı: görüş-bağımlı alanların yokluğu.
- Roster maskesi: viewer dışı kayıtlarda sıfır.
- Üyelik yarışı: iki eşzamanlı `writeRemovedMember` — sahte kilit ile sıralandığını ve kararın kilit içindeki okumadan verildiğini iddia et.
- `dm:message:delivered`: katılımcı olmayan reddi.
- Grup gönderiminde engel: reddedilmediği.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

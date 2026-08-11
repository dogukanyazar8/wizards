# Paket kapanışı — Grup sohbetleri 2a–2f

Beş faz tamamlandı. Branch `uat`, **commit edilmedi**.
Bu dosya paketin tek kabul belgesi: `PROMPT.md` §11.3'ün onu (21–30) ve `05-faz5-2d-2e-2f.md` §G'nin on iki paket kriteri (P1–P12), her biri **nerede karşılandığı** ve **hangi kanıtla** doğrulandığı yazılarak.

---

## §11.3 kabul kriterleri (21–30)

| #   | Kriter                                                                                             | Sonuç | Nerede / kanıt                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 21  | Grup sohbeti DM balon sistemini kullanır; kanalın düz satır düzeni sızmaz                          | ✅    | Ayrı grup sohbet ekranı **yok**: `dm-conversation-screen.tsx` tek yüzey, aktarım `DMChatMessageList`. Grup yalnız koşullu dallar ekliyor. `mobile-group-2d.test.tsx` grup akışını balon testID'leriyle (`mobile-dm-message-bubble-*`) doğruluyor              |
| 22  | Gönderen adı yalnız grubun ilk balonunda, sabit renkte; ardışıkta tekrar yok, avatar hizası kaymaz | ✅    | 2d testi: iki ardışık mesajda **bir** `mobile-group-sender-name`; iki farklı üyede iki farklı renk; `mobile-dm-message-avatar-spacer-m1` + `mobile-dm-message-author-avatar-m2` (4 test)                                                                      |
| 23  | 2d başlığında sesli arama var, görüntülü **yok**; görüntülü yalnız 2e'den                          | ✅    | 2d testi: `mobile-group-chat-voice-call` var, `mobile-dm-video-call-button` **yok**. 2e testi: `mobile-group-info-action-video` `onStartVideoCall` çağırıyor                                                                                                  |
| 24  | Başlıkta en fazla iki ikon butonu; uzun ad kırpılmıyor (tek satır + `…`)                           | ✅    | Başlıkta tam iki `Pressable` (telefon + `⋯`). 2d testi 40 karakterlik adla `numberOfLines === 1` ve butonların yerinde kaldığını doğruluyor                                                                                                                   |
| 25  | Okundu bilgisi yalnız son giden balonun altında, avatar yığını + `n kişi okudu`, dokunulabilir     | ✅    | 2d testi 5 senaryo: tek satır, sıfır okuyanda çizilmiyor, `Herkes okudu`, başkası son konuştuğunda yok, dokununca okuyanlar sheet'i açılıyor                                                                                                                  |
| 26  | Grup kurma iki adım; adım göstergesi, `3/32` sayacı ve İleri'deki sayı aynı durumu gösterir        | ✅    | Faz 4, `mobile-group-2b-2c.test.tsx` (16 test) — sayaç, çubuklar ve buton rozeti tek `GroupCreateState`'ten                                                                                                                                                   |
| 27  | Ad boş bırakılabilir; ipucu canlı üretilir ve oluşan grubun adıyla aynı                            | ✅    | Faz 3 `packages/types/src/group-name.ts` tek kural; ipucu ve sunucu adı aynı fonksiyondan, web + mobil iki tarafta da testli                                                                                                                                  |
| 28  | Davet bağlantısı varsayılan kapalı; açılmadan kod üretilmez; 2f aynı durumu gösterir               | ✅    | Faz 2 `GroupInvite.enabled` default `false` + `setGroupInviteEnabled` testleri. 2f testi: kapalıyken `mobile-group-invite-url` yok, açıkken var. Web testi aynı iddiayı `dm-group-invite-url` üzerinden tekrar ediyor                                         |
| 29  | Bildirim kademesi 2f'de seçilir, 2a'daki sessiz görünümüyle tutarlı                                | ✅    | 2f testi radyoyu ve `setNotifyLevel` yazmasını doğruluyor; 2a satırının sessiz görünümü Faz 4 karar 2 gereği **yalnız** `notifyLevel`'dan sürülüyor (`mobile-group-2a.test.tsx`)                                                                              |
| 30  | İzinler bloğu yetkisize gösterilmez; ayrılma onay ister, son yönetici için devir ister             | ✅    | 2f testi: üye görünümünde `mobile-group-permissions-card` **render edilmiyor**; ayrılma onay sheet'i açıyor; son yönetici için devir sheet'i açılıyor ve seçim yapılmadan `onLeave` çağrılmıyor. Web testi aynısını `dm-group-permissions` için tekrar ediyor |

---

## Paket kriterleri (P1–P12)

| #   | Kriter                                                                                                                                  | Sonuç | Nerede / kanıt                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Beş ekran de 390×844'te taşmıyor; ekran görüntüleriyle fark tespit edilemiyor                                                           | ⚠️    | Ölçüler HTML'den token'landı ve `scaleMobileMessagingMetric` ile 390pt çerçeveden gerçek ekrana ölçekleniyor; her ekran `ScrollView` gövdesinde. **Piksel karşılaştırması yapılmadı** — RN bu ortamda render edilemiyor, cihaz testi kullanıcıda (madde 1–14) |
| P2  | `apps/mobile/src/app` altında grup ekranlarına ait hex literal yok                                                                      | ✅    | `grep -rE "#[0-9A-Fa-f]{6}" apps/mobile/src/app` → **0 satır**; `mobile-design-contract` testi de aynı kuralı koşuyor (bu fazda bir ihlal yakaladı ve `GROUP_AVATAR_COLORS[0]` ile kapatıldı)                                                                 |
| P3  | Tüm metinler `copy.*`; `tr`/`en` anahtar sayıları eşit                                                                                  | ✅    | 2414 = 2414, eksik anahtar **yok**; `mobile-locale-preferences` + `mobile-copy-parity` testleri zorluyor. Faz 5 15 yeni anahtar × 2 dil ekledi                                                                                                                |
| P4  | Sunucuda dört izin de zorlanıyor; socket yolu guard'ı atlamıyor                                                                         | ✅    | Faz 1: `assertGroupPermission` tek kapı; `message-send-service.ts:196` `sendMessage`'ı **serviste** kontrol ediyor, yani HTTP ve socket yolları aynı guard'dan geçiyor. `group-permissions.test.ts` dört izni de kapsıyor                                     |
| P5  | Geçmiş penceresi beş okuma yolunda filtreleniyor                                                                                        | ✅    | Faz 1: `requireDMParticipant` `historyFromAt` döndürüyor; `service.ts` içinde 9 kullanım (liste, thread ana + yanıtlar, arama, önizleme). `resolveHistoryFloor` testli                                                                                        |
| P6  | Kaybolan mesaj purge worker'ı koşuyor; süresi dolmuş mesaj hem sorguda hem olayla kayboluyor                                            | ✅    | Faz 2: `startDisappearingMessageWorker` `apps/web/server.ts:6`'da; sıra **sil → yay**, 13 test. İstemcide `dm:message:expired` → `removeMobileExpiredMessages`                                                                                                |
| P7  | Davet kodu tahmin edilemez; önizleme ve katılma uçlarında rate limit var                                                                | ✅    | Faz 2: `crypto.randomBytes`, 12 karakter, 32 harfli alfabe (modulo sapması sıfır). `group-invite:preview` 20/dk, `group-invite:join` 5/dk + mobil aynaları                                                                                                    |
| P8  | Grup çağrısı 3+ katılımcıyla kuruluyor, süregelen çağrıya katılınabiliyor                                                               | ✅    | Faz 2: LiveKit `dm:<id>` odası 3 ve 32 kişide testli; `dm:call:join`/`leave`/`state` socket'te. Faz 5: mobil `Katıl` banner'ı + `emitDMCallJoin` + `GET .../call` açılış durumu (2d testi)                                                                    |
| P9  | Mesaj yazı boyutu ayarı grup gövdesini ölçekliyor; saat/ad/alıntı sabit kalıyor                                                         | ✅    | Grup gövdesi `MessageBodyText` — okuyucunun `mobile-message-typography` ayarını okuyan aynı bileşen. Ad/saat/alıntı `theme.groupChat`'in sabit punto tokenlarından (`senderFontSize`, `timeFontSize`, `replyQuote.*`)                                         |
| P10 | Koyu temada gelen balonda gölge yok; grup token grubu iki temada da eksiksiz                                                            | ✅    | `themes.ts:1796` koyu `messageBubbleIn: MESSAGING_FLAT_ELEVATION`. `theme.groupChat` 43 alt grup, iki temada aynı anahtar kümesi — Faz 3'ün yaprak-yolu karşılaştırma testi ve `mobile-theme-contract` zorluyor                                               |
| P11 | Web'de grup ayarları, izinler, roller, davet bağlantısı ve kaybolan mesajlar yönetilebiliyor; yetkisiz kullanıcı aynı kısıtları görüyor | ✅    | `dm-group-settings-panel.tsx` beşini de yönetiyor; `dm-group-details-panel.tsx` rolleri. `dm-group-settings-panel.test.tsx` 13 test — üye görünümünde izin bloğu, davet anahtarı, rol düğmesi ve çıkarma düğmesi **yok**                                      |
| P12 | Web ve mobil aynı girdide aynı grup adını, aynı yetki kümesini ve aynı davet bağlantısını üretiyor                                      | ✅    | Üç kural da `packages/types`'ta tek yerde: `buildGroupNameFromMembers` (Faz 3), `getGroupCapabilities` + `getGroupMemberActions` (Faz 5 §H taşıması, 11 test), `buildGroupInviteDisplayUrl` (Faz 2). İki istemci de bunları çağırıyor                         |

**Özet: 29 ✅ / 1 ⚠️.** Tek uyarı P1 ve nedeni ölçüm değil ortam: bu depoda RN ekranı render edilip piksel karşılaştırması yapılamıyor. Ölçüler HTML satır numaralarıyla token'landı; görsel doğrulama cihaz test listesinin işi.

---

## Fazların bıraktığı katman

| Faz | Ne bıraktı                                                                                                  | Kapı |
| --- | ----------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Şema (4 enum, 16 kolon), `group-permissions.ts` tek yetki kapısı, DTO alanları, 7 uç × 2 platform           | ✅   |
| 2   | Davet bağlantısı, kaybolan mesajlar + purge worker, grup çağrısı durumu (Redis), `/g/[code]` web sayfası    | ✅   |
| 3   | `theme.groupChat` (43 grup), 91 kopya anahtarı, 17 saf model fonksiyonu, istemci + rota + 8 realtime yaması | ✅   |
| 4   | 2a gruplu liste, 2b üye seç, 2c grup bilgileri + web kurma diyaloğu                                         | ✅   |
| 5   | 2d sohbet, 2e bilgi, 2f ayarlar, grup çağrısı girişi, davet önizlemesi, web yönetim panelleri               | ✅   |

## Paket sonu test durumu

| Paket                    | Öncesi (paket başı) | Sonrası  |
| ------------------------ | ------------------- | -------- |
| `@wizards/types`         | 269                 | **325**  |
| `@wizards/web`           | 2269                | **2442** |
| `@wizards/mobile` (node) | 1758                | **1900** |
| `@wizards/mobile` (jest) | 1237                | **1288** |

Typecheck: mobil ✅, web ✅. Lint: web ✅.

## Kapanışta açık kalanlar

1. **Üç migration koşulmadı** (Faz 1 `group_dm_v2`, Faz 2 `group_invite_disappearing`, Faz 4 `user_allow_group_invites`). Cihaz testinden önce koşulmalı — `allowGroupInvites` kolonu olmadan arkadaş listesi 500 döner.
2. **P1 görsel doğrulaması** cihazda yapılacak.
3. 05 raporundaki yedi "bilinen boşluk" (medya sayacı, `groupMembers` ölü anahtarı, web okundu avatarları, web `historyVisibility` satırı, davet 429 göstergesi).
4. Paketin tamamı **commit edilmedi**.

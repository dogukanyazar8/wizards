# Faz 4 raporu — 2a gruplu liste, 2b üye seç, 2c grup bilgileri

Branch `uat`, **commit edilmedi**.
**Kapı tuttu:** eski tek dosyalık `screens/group-create-screen.tsx` silindi, yerini `screens/group-create/` altındaki üç dosya aldı; ondan arta kalan stil, kopya ve test artıkları da temizlendi (aşağıda ölü kod listesi).

Faz başında sorulan üç veri boşluğunun cevabı (kullanıcı, 2026-08-11) bu fazın kapsamını üç noktada genişletti; hepsi §A'nın "eksik alan bulursan dur ve sor" kuralıyla soruldu:

| Soru                               | Karar                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| 2c'nin davet toggle'ı nasıl gider  | **Sunucuya alan eklendi** — `GroupDMCreateRequestSchema.inviteEnabled`          |
| 2b'nin "Grup davetlerine kapalı"sı | **Gerçek gizlilik ayarı** — `UserSettings.allowGroupInvites` + uç + ayar satırı |
| F2'nin web bahsetme sayacı         | **`mentionCount` web DTO'suna eklendi**                                         |

---

## Yapılanlar

### C — 2a, gruplu sohbet listesi

- `apps/mobile/src/app/screens/group-chat.styles.ts` **(yeni, 640 satır)**: 2a/2b/2c'nin **tüm** stilleri, yalnız `theme.groupChat`'tan. Kendi sayfası, çünkü `dm-screen.styles.ts` `theme.messaging`'ten kuruluyor ve 1a/1b/1c'nin çizdiği şey o; ikisini tek dosyada karıştırmak bir satırın yarısını bir token grubunda, yarısını ötekinde bırakmanın yolu (Faz 3 karar C1). Ölçek çarpanı mesajlaşma sayfasıyla aynı (`scaleMobileMessagingMetric`), yani 390pt çerçeve gerçek ekrana aynı biçimde oturuyor.
- `screens/dm-inbox.tsx`:
  - `DMInboxFilterChips` **(yeni)** — dört çip, yatay kaydırma, aktif çip mürekkep. Sayaçlar `getConversationFilterCounts` ile, yani çipin üstündeki sayı ile çipin açtığı listenin uzunluğu **aynı yordamdan** geliyor.
  - `GroupAvatarPairMark` **(yeni)** — 46px alan, iki 30/r11 karo, alttaki karo satır zemini renginde 2.5px ring (HTML 68 vs 83: ring rengi sabit değil, satırın zemini). `+N` kararı `getGroupAvatarPair`'de (§11.0.7).
  - `DirectMessageConversationCard` yeniden yazıldı: grup çifti, `· N`, üstü çizili çan, `@N` + okunmamış rozet **yan yana**, tik/medya/mikrofon önizleme başları, BOT çipi, sabitlenen satır zemini, uzun basış.
  - `DirectMessageListCard` yeniden yazıldı: arama → çip → sıralama → **SABİTLENEN bölümü + liste**, `getItemType` üç tip (`section`/`group`/`dm`), filtreye özgü boş durum.
  - `DMInboxConversationsPane` **(yeni)** — çip + liste + sheet'i tek yerde topluyor; kabuk hangi sekmenin açık olduğuyla ilgileniyor, sekmenin neyden yapıldığıyla değil.
- `app/features/use-mobile-conversation-row-actions.ts` **(yeni)** — 2a §5'in üç yazması (sabitle / sessize al / gizle). Seçili satır **id ile** tutuluyor: refetch nesneyi değiştiriyor, kopya tutmak sheet'i bayat bir sabitleme durumuyla bırakırdı.
- `app/features/use-mobile-forward-targets.ts` **(yeni)** — iletme hedefleri projeksiyonu, kabuktan çıktı.
- `app/mobile-group-chat-model.ts`: `getConversationFilterCounts` ve `splitPinnedConversations` **(yeni, ikisi de testli)**.
- `screens/dm-screen.tsx`: çip durumu (`useMobileConversationFilter`), satır sheet'i, çevrimiçi şeridinin kaldırılması (K6).

### D — 2b, üye seç

`screens/group-create/member-step.tsx` **(yeni)**: arama (ad **ve** kullanıcı adı), seçilen üye çipleri, `SIK MESAJLAŞTIKLARIN` (V9, `getFrequentContacts`), `TÜM ARKADAŞLAR · N`, 42/r15 avatar + çevrimiçi noktası, 24/r9 seçim kutusu, davete kapalı satır (opaklık .55 + kilit + dokunulamaz), sınırda donan satırlar, alt çubuk + sayaç rozeti.

### E — 2c, grup bilgileri

`screens/group-create/identity-step.tsx` **(yeni)**: 72/r24 avatar + kamera düğmesi, beş renk karesi (çift halka), `GRUP ADI` + `18/32`, odak halkası, canlı ipucu (`buildGroupNameHint`), `AÇIKLAMA — isteğe bağlı` + `0/120`, `ÜYELER N` + `Düzenle`, üye şeridi (**Sen** + üyeler + kesikli **Ekle**), `KATILIM` kartı (üye ekleyebilir / davet bağlantısı / geçmiş penceresi), alt çubuk.

`screens/group-create/group-create-screen.tsx` **(yeni)**: iki adımın kabuğu — durum, başlık (sayaç + iki çubuk), sınır uyarısı, çıkış onayı, gönderim.

### F2 — web paritesi

- `components/dm/group-create-dialog.tsx` genişletildi: renk karesi şeridi, ad sayacı, **aynı** canlı ipucu (`buildGroupNameFromMembers`), açıklama + sayacı, `KATILIM` üçlüsü, davete kapalı satır (pasif + kilit + açıklama). Mobil pikselleri kopyalanmadı (K5) — mevcut web dili.
- `components/dm/dm-sidebar.tsx`: sabitlenen bölüm başlığı, `@N` rozeti okunmamış rozetinin solunda, sessiz görünümü artık `notifyLevel` ile.
- `components/friends/friends-sidebar.tsx`: satır projeksiyonu `mentionCount`/`pinnedAt` taşıyor, `isMuted` otoriteden okunuyor.
- 20 yeni i18n anahtarı × 2 dil.

### Kullanıcı kararlarının getirdiği arka uç işi

- `packages/db/prisma/schema.prisma` + `rebaseline-migrations/20260811180000_user_allow_group_invites` **(yeni)**: `UserSettings.allowGroupInvites Boolean @default(true)`.
- `lib/dm/group-service.ts`: `GroupMemberEligibility` üçüncü bir yargı kazandı (`closed`); `toGroupEligibilityMap` dördüncü parametre alıyor; `assertGroupMembersEligible` `GROUP_INVITES_CLOSED` (403) fırlatıyor — **engel** ve **arkadaş değil**den sonra, çünkü üçünün en hafifi.
- `loadGroupEligibility` ikinci bir okuma yapıyor ama yalnız **kapalı** satırları çekiyor: normal durumda boş dönen bir sorgu.
- `api/v1/dm/groups/route-logic.ts`: `inviteEnabled` işaretliyse grup kurulduktan hemen sonra, **aynı istek içinde** `setGroupInviteEnabled` çağrılıyor. Bayrak konuşma yazıcısına hiç ulaşmıyor (testle sabit): davet ayrı bir satır, konuşmanın alanı değil.
- Arkadaş yükleri (`friends/queries.ts` + `friends/service.ts`) `allowsGroupInvites` taşıyor; `DMParticipantDTO` `mentionCount` taşıyor (kolon zaten vardı, okuyan yoktu).
- Ayar uçları: mobil `privacy.groupInvites`, web `allowGroupInvites`. Mobil ayar ekranına **Grup davetleri** satırı eklendi (mevcut politika sheet'i deseniyle, `Herkes`/`Hiç kimse`).

---

## Bağlayıcı kararlar

1. **2a'nın satırı 1a'nın satırıdır.** Grup satırı için ayrı bileşen yok (§H); tip ayrımı `DirectMessageConversationCard` içinde. Bunun sonucu: `@N` + okunmamış çifti ve `notifyLevel` ile sürülen sessiz görünümü **1:1 satırlarda da** geçerli — 2a'nın kuralları 1a'nın üstüne ekleniyor, yanına değil.
2. **Sessiz görünümünün tek kaynağı `notifyLevel`.** `muted` okunmuyor. `Yalnız bahsetmeler` de soluk ad + çan çiziyor: satır "her mesaj bildirilmiyor" diyor, "hiç bildirilmiyor" değil.
3. **Çip sayacı ile çip listesi aynı yordamdan.** `getConversationFilterCounts` çiplerin süzdüğü yüklemlerle sayıyor; `Okunmamış` bu yüzden sayacı sıfır ama okunmamış bahsetmesi olan satırı da sayıyor (§C2'nin "unreadCount > 0" ifadesinden sapma, S1).
4. **Çip sayaçları aramadan bağımsız.** Sayılar gelen kutusunu anlatıyor; arama kutusuna yazarken sayıların oynaması sayıyı anlamsız kılardı.
5. **`SIK MESAJLAŞTIKLARIN` arama açıkken çizilmez** ve `TÜM ARKADAŞLAR` o üç kişiyi tekrar listelemez; başlıktaki sayı yine tüm arkadaş sayısı (ekran görüntüsünde de 12 yazarken 3 satır görünüyor).
6. **Davet bağlantısı oluşturma isteğinde gider, istemci iki çağrı yapmaz.** İkinci çağrı düşerse grup davetsiz kalırdı ve kullanıcı bunu ancak 2f'de fark ederdi.
7. **`allowGroupInvites` hem istemcide hem sunucuda.** İstemci reddediyor (satır pasif), sunucu yine de kontrol ediyor: picker güvenilir girdi değil.
8. **Toggle uygulamanın ortak anahtarı.** 2c'nin davet anahtarı `components/kit/toggle.tsx`; ekranların kendi track/thumb'ını çizmesi depo sözleşmesiyle yasak (`mobile-design-contract`).

---

## Sapmalar

| #   | Sapma                                                                                        | Gerekçe                                                                                                                                                                                                  | Kullanıcıya soruldu                   |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| S1  | `Okunmamış` sayacı `unreadCount > 0 \|\| mentionCount > 0` sayıyor (§C2 yalnız ilkini diyor) | Çipin sayısı ile çipin açtığı listenin uzunluğu aynı olmak zorunda; Faz 3'ün `getConversationFilterPredicate`'i bahsetmeyi okunmamış sayıyor ve o yüklem testliydi                                       | Hayır — iki sayının çelişmesi hatadır |
| S2  | Sessiz grup satırında `· N` **ve** çan birlikte                                              | HTML 107 sessiz satırda üye sayacını çizmiyor, C3 ise "grup satırında `· N`" diyor; ikisi çelişiyor, ikisini de uyguladım                                                                                | Hayır                                 |
| S3  | Davet anahtarı 46×28/thumb 24 (HTML 261: 44×26/thumb 20)                                     | Ortak kit toggle'ı; ekranın kendi anahtarını çizmesi `mobile-design-contract` tarafından yasak. 2px fark                                                                                                 | Hayır — depo sözleşmesi               |
| S4  | Basılı durumda 150ms geçiş yok, yalnız `scale(.97)` (reduce motion'da opaklık)               | RN `Pressable` stil geçişi animasyonlamaz; 150ms için her satıra bir Reanimated değeri gerekirdi. Ölçek ve reduce-motion davranışı §F.6'ya uygun                                                         | Hayır                                 |
| S5  | 2a satırının **taban** tipografisi hâlâ `theme.messaging`                                    | 2a "1a'nın üzerine eklenenler"; taban satırı yeniden token'lamak 1a/1b/1c'yi regresyona açardı. Eklenen her şey (`theme.groupChat`) ayrı sayfada. İki grubun bu alanlardaki değerleri zaten birebir aynı | Hayır                                 |
| S6  | 2c'de `Herkes`, 2f'de `Tüm üyeler` (aynı `ALL` seviyesi)                                     | İkisi de handoff'ta açıkça yazılı (HTML 260 vs 437); tek anahtara indirmek bir yüzeyin ötekini sessizce ezmesi olurdu. Yalnız farklı olan değere ikinci anahtar açıldı                                   | Hayır — tasarım kaynağı               |
| S7  | Seçili renk karesinin çift halkası iki katmanla çiziliyor                                    | RN'de ikinci bir `box-shadow` halkası yok; iç halka karenin kendi kenarı (zemin tonunda), dış halka sarmalayıcı. Çizilen sonuç aynı                                                                      | Hayır                                 |
| S8  | `DMOnlineStrip` **silindi** (yalnız 2a'dan kaldırılması bekleniyordu)                        | K6 şeridi 2a'dan kaldırıyor; bileşenin başka üretim çağıranı yoktu (1b/1c'nin çevrimiçi bölümü `friends-hub.tsx` içinde kendi kodu). Kaldırıp bırakmak ölü kod olurdu                                    | Hayır — K6'nın doğrudan sonucu        |
| S9  | Kapsam üç noktada arka uca taştı (şema kolonu, uç, DTO alanı)                                | Üçü de §A gereği soruldu ve kullanıcı bu yönde karar verdi                                                                                                                                               | **Evet** — üç sorunun üçü de          |
| S10 | `mobile-design-contract` testinin bir iddiası güncellendi                                    | `styles.dmConversationGroupBadge` iddiası, 2a'nın rozeti çapraz avatar çiftiyle değiştirmesiyle anlamını yitirdi; yerine `mobile-dm-group-avatar-pair` sabitlendi                                        | Hayır — sözleşme davranışı takip eder |
| S11 | 1a'nın iki testi güncellendi                                                                 | (a) bahsetme rozeti artık okunmamış rozetini gizlemiyor, (b) sessiz görünümü `notifyLevel` ile sürülüyor. İkisi de 2a §5 / C4'ün getirdiği kural değişikliği                                             | Hayır — spesifikasyon değişikliği     |
| S12 | Arama yer tutucusu `Kişi, mesaj veya kanal ara` → `Kişi, grup veya mesaj ara`                | HTML 55 / C1.4                                                                                                                                                                                           | Hayır — tasarım kaynağı               |

---

## Kapı sonucu

| Komut                                                                    | Sonuç                                |
| ------------------------------------------------------------------------ | ------------------------------------ |
| `cd apps/mobile && npx jest component-tests/mobile-group-2a.test.tsx`    | ✅ 16/16                             |
| `cd apps/mobile && npx jest component-tests/mobile-group-2b-2c.test.tsx` | ✅ 16/16                             |
| `pnpm --filter @wizards/mobile typecheck`                                | ✅ temiz                             |
| `pnpm --filter @wizards/mobile test`                                     | ✅ 1864/1864 (öncesi 1860)           |
| `pnpm --filter @wizards/web test`                                        | ✅ 2420/2420 (öncesi 2411)           |
| `cd apps/mobile && npx jest`                                             | ✅ 1260/1260, 133 suite — ek kontrol |
| `pnpm --filter @wizards/types test`                                      | ✅ 314/314 (öncesi 308) — ek kontrol |
| `pnpm --filter @wizards/web typecheck`                                   | ✅ temiz — ek kontrol                |
| `pnpm --filter @wizards/web lint`                                        | ✅ temiz — ek kontrol                |
| `graphify update .`                                                      | ✅ 24767 düğüm, 58335 kenar          |

### §I kontrol listesi

- [x] Eski tek-dosya `group-create-screen.tsx` iki adım dosyasıyla değişti; ondan arta kalan **6 stil**, **3 kopya anahtarı** ve eski test dosyası da silindi.
- [x] Web diyaloğu ve mobil akış aynı girdide aynı grup adını üretiyor — ikisi de `buildGroupNameFromMembers`, iki tarafta da testli.
- [x] 2a/2b/2c ekran görüntüleriyle karşılaştırıldı; fark listesi aşağıda (boş değil, sapmalar S2/S3/S4/S6/S7 ile aynı satırlar).
- [x] `apps/mobile/src/app` altında hex literal **sıfır** (`grep -rE "#[0-9A-Fa-f]{6}"` → 0 satır; yorumlardaki hex'ler de temizlendi, çünkü sözleşme tarayıcısı dosyayı bütün olarak okuyor).
- [x] `reduce motion` açıkken sınır sayacı yanıp sönmüyor (tek renk değişimi) ve basılı ölçek yerini opaklığa bırakıyor.

---

## Ekran görüntüsü karşılaştırması — fark listesi

**Yöntem:** RN ekranı bu ortamda render edilemediği için karşılaştırma, uygulanan değerlerin `Whispr Mesajlaşma Redesign.dc.html` satır satır ölçüleriyle ve üç PNG ile **okunarak** eşleştirilmesiyle yapıldı. Piksel farkı ölçen bir karşılaştırma **yapılmadı** — cihaz testi kullanıcıda.

### 2a — `2a-mesajlar-gruplu-liste.png`

| Öğe                                                | Durum                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Başlık, segment, arama pill'i                      | Aynı (1a'dan geliyor); placeholder metni güncellendi (S12)                                        |
| Filtre çipleri h30/r11, gap 7                      | Aynı; aktif çip `#1E2235`, sayaçlar indigo 11/800                                                 |
| Çevrimiçi şeridi                                   | **Yok** — K6                                                                                      |
| `SABİTLENEN` başlığı + iğne                        | Aynı                                                                                              |
| Sabitlenen satır zemini beyaz                      | Aynı; alt karo ringi de beyaz                                                                     |
| Çapraz çift avatar 46/30/r11/ring 2.5              | Aynı                                                                                              |
| `+N` ikinci karo                                   | Aynı (§11.0.7: gizlediği üyeyi de sayıyor, HTML 104'ün `+3`'ünden farkı Faz 3'te karara bağlandı) |
| `· 6` üye sayacı                                   | Aynı — **sessiz satırda da çiziliyor (S2)**                                                       |
| Yazıyor: 3 yeşil nokta + 13/700                    | Aynı                                                                                              |
| `@2` + `12` rozet çifti, gap 4                     | Aynı                                                                                              |
| Sessiz: soluk ad, üstü çizili çan, `#C9CDE3` rozet | Aynı                                                                                              |
| `Sen:` + çift tik, medya ikonu, BOT çipi           | Aynı                                                                                              |
| Saç çizgisi `margin-left:79`                       | Aynı                                                                                              |
| Dock + home indicator                              | Uygulama kabuğu, bu fazın dışında                                                                 |

### 2b — `2b-yeni-grup-uye-sec.png`

| Öğe                                                                    | Durum                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Beyaz başlık, `Üye seç`, `Adım 1 / 2 · en fazla 32 kişi`, sağda `3/32` | Aynı                                                                          |
| İki 3px adım çubuğu                                                    | Aynı                                                                          |
| Arama h42/r14                                                          | Aynı                                                                          |
| Seçilen üye çipleri h34/r12 + 22/r8 avatar                             | Aynı                                                                          |
| `SIK MESAJLAŞTIKLARIN` / `TÜM ARKADAŞLAR · 12`                         | Aynı; arama açıkken ilk bölüm çizilmiyor (karar 5)                            |
| Satır: 42/r15 avatar + 12px nokta + 24/r9 kutu                         | Aynı                                                                          |
| `dy · 2 sa önce görüldü`                                               | Aynı — çevrimdışı satırda son görülme, çevrimiçi satırda yalnız kullanıcı adı |
| Davete kapalı satır (.55 + kilit)                                      | Aynı                                                                          |
| Alt çubuk h50/r16 + `rgba(255,255,255,.22)` rozet                      | Aynı; 0 seçimde `#D5D9EA` ve pasif                                            |

### 2c — `2c-yeni-grup-bilgileri.png`

| Öğe                                                         | Durum                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Başlık + `Adım 2 / 2 · 3 üye seçildi`, iki çubuk dolu       | Aynı                                                                    |
| 72/r24 avatar + 28/r10 kamera düğmesi                       | Aynı                                                                    |
| `GRUP RENGİ` + beş 28/r10 kare                              | Aynı; seçili halka iki katmanla (S7)                                    |
| `GRUP ADI` + `18/32`, h48/r15, odak halkası                 | Aynı                                                                    |
| Canlı ipucu (kalın kısım `#6B7194`)                         | Aynı                                                                    |
| `AÇIKLAMA — isteğe bağlı` + `0/120`, h62/r15                | Aynı                                                                    |
| `ÜYELER 3` + `Düzenle`, 46/r16 şerit, `Sen`, kesikli `Ekle` | Aynı                                                                    |
| `KATILIM` kartı üç satır                                    | Aynı; **`Üye ekleyebilir` değeri `Herkes` (S6)**, toggle 2px büyük (S3) |
| Alt çubuk `Grubu oluştur`                                   | Aynı                                                                    |

---

## Cihaz test listesi (kullanıcı koşacak)

> **Önce:** Faz 1, Faz 2 ve bu fazın migration'ları hâlâ koşulmadı. `allowGroupInvites` kolonu olmadan arkadaş listesi 500 döner (Prisma bilinmeyen kolon seçiyor). Sıra: `pnpm --filter @wizards/db exec prisma migrate deploy` (ya da `migrate dev`), sonra sunucuyu yeniden başlat.

1. Mesajlar sekmesini aç → başlık, segment ve arama bandının yüksekliği üç sekmede de **aynı**; Sohbetler'de arama altında çip şeridi var, Arkadaşlar/İstekler'de yok.
2. `Gruplar` çipine dokun → yalnız gruplar kalıyor; çipin üstündeki sayı listedeki satır sayısıyla **aynı**. Uygulamayı tamamen kapat, aç → aynı çip **ilk karede** aktif (Tümü'ye düşüp sonra atlamamalı).
3. `Okunmamış` çipini seç, bir sohbeti okunmuş yap → hem sayaç hem liste anında düşüyor.
4. Bir çip seç, sonra aramaya bir şey yaz → sayaçlar **oynamıyor**, liste süzülüyor.
5. Bir sohbete uzun bas → sheet açılıyor (`Sabitle` / `Sessize al` / `Sohbeti gizle`); **açılırken sohbet açılmıyor**.
6. `Sabitle` → satır anında SABİTLENEN bölümüne taşınıyor. Uygulamayı yeniden başlat → orada kalıyor.
7. Uçağı aç, tekrar `Sabitle` → satır geri dönüyor ve bir hata toast'ı çıkıyor (iyimser geri alma).
8. Bir grubu sessize al → adı soluklaşıyor, yanında üstü çizili çan çıkıyor, okunmamış rozeti grileşiyor; `Sessiz` çipinde görünüyor.
9. Başka cihazdan gruba mesaj at → yazıyor etiketi (`Ayşegül yazıyor…`), rozet ve saat canlı güncelleniyor; **liste yeniden yüklenmiyor** (yama).
10. 3+ üyeli bir grupta ikinci karo `+N` gösteriyor; sabitlenen satırda karo ringi beyaz, normal satırda liste tonunda.
11. Kalem FAB → `Üye seç`. Hiçbir şey seçmeden geri → **soru sormadan** çıkıyor. Bir kişi seç, geri → `Grup oluşturmaktan vazgeçilsin mi?` soruyor.
12. Bir kişi seç → `İleri` hâlâ pasif; ikinci kişiyi seç → aktif ve üstünde `3` yazıyor.
13. Çipten birini çıkar → listedeki kutusu da boşalıyor.
14. Arama kutusuna hem ad hem kullanıcı adı yaz → ikisi de eşleşiyor; arama açıkken `SIK MESAJLAŞTIKLARIN` bölümü kayboluyor.
15. 31 kişi seç, 32.'ye dokun → seçilmemiş satırlar soluk ve dokunulamaz, sayaç kırmızıya iki kez yanıp sönüyor. Ayarlar → Erişilebilirlik → Hareketi azalt açıkken tekrar dene → **yanıp sönme yok**, yalnız renk değişiyor.
16. Ayarlar → Hesap → Gizlilik → **Grup davetleri** → `Hiç kimse`. Başka bir hesapla o kişiyi gruba eklemeye çalış → satır soluk, kilitli ve dokunulamaz.
17. 2. adımda renk karesi değiştir → 72px avatar anında o renge dönüyor; kamera düğmesiyle görsel yükle → renk şeridi yerini `Görseli kaldır`a bırakıyor, kaldırınca geri geliyor.
18. Adı boş bırak → ipucu satırı seçili üyelerin adlarını canlı gösteriyor. `Grubu oluştur` → **oluşan grubun adı ipucudaki metnin birebir aynısı**.
19. Ada 32 karakter yaz → sayaç `32/32` ve daha fazlası yazılamıyor; açıklamaya 120 karakter yaz → `120/120`.
20. `Düzenle` → 1. adıma dönüyor, seçim ve girilen ad/açıklama/renk duruyor.
21. `Davet bağlantısı` açık işaretleyerek grup oluştur → grup kurulur kurulmaz 2f'de/`GET .../invite` yanıtında bağlantı **dolu** geliyor. Kapalı bırakıp oluştur → bağlantı yok.
22. `Üye ekleyebilir` → `Yöneticiler`, `Yeni üyeler geçmişi görür` → `Hiç` seç, oluştur → 2f'de aynı değerler görünüyor.
23. Oluşan grup sohbet listesinin **en üstünde**.
24. Web'de Mesajlar → grup oluştur diyaloğu: aynı iki adım, renk şeridi, sayaçlar, `KATILIM` üçlüsü; ad boşken ipucu **mobildekiyle aynı metni** veriyor.
25. Web sohbet listesinde sabitlenen sohbet ayrı başlık altında, bahsetme rozeti okunmamış rozetinin solunda, sessiz sohbette çan.

---

## Bilinen boşluklar

- **Üç migration hâlâ koşulmadı** (Faz 1, Faz 2, bu faz). Bu faz şemaya tek kolon ekledi.
- **`GroupInfo`/`GroupSettings`/`GroupMembers`/`GroupInvitePreview` hâlâ boş yer tutucu.** 2d–2f Faz 5'in işi; 2a'nın sheet'i ve 2c'nin `KATILIM` kartı o ekranlara yönlendirmiyor, kendi değerlerini yazıyor.
- **`mobile-group-details-screen.tsx` ve `GroupDetails` rotası duruyor.** Ona bağlı dokuz eski kopya anahtarı (`groupCreateNameHint`, `groupCreateNameLabel`, `groupOwnerBadge`, `groupSaveAction`, `groupMembersTitle`, `groupCreateMinimumHint`, `groupCreateLimitReached`, `groupCreatePhotoAction`, `groupHideChatHint`) de o ekranla birlikte Faz 5'te ölmeli.
- **2a'nın medya önizlemesi sunucunun `lastMessage.text`'ini basıyor.** İkon ve `Atakan: ` öneki tasarımdaki gibi; `3 görsel` cümlesini üreten `messagesPreviewPhotos` anahtarı hazır ama satır metnini sunucu belirliyor, bu yüzden bugün eklenmedi.
- **`groupCreateStep1Subtitle` "en fazla 32 kişi" diyor**, sayaç ise seçilebilir tavanı (31) değil konuşma tavanını gösteriyor — tasarımın kendi ifadesi, kasıtlı.
- **Grup ikonu yükleme akışı 2c'de var ama `pickAndUploadMobileGroupIcon` hâlâ Faz 5 öncesi yolu kullanıyor**; konuşma henüz yokken yüklenen URL, POST kabul edene kadar atıl (web'de de öyle).
- **Web'de `allowGroupInvites` ayarı için arayüz yok** — uç ve payload hazır, mobilde satır var; web ayar paneline satır eklenmedi (2a–2f tasarımında karşılığı yok).
- **`graphify-out/` dosyaları bu fazda yeniden üretildi**; commit'e dâhil edilip edilmeyeceği kullanıcının kararı.

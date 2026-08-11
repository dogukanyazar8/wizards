# Faz 3 raporu — Mobil temel katman: token, kopya, model, istemci, rota

Branch `uat`, **commit edilmedi**.
**Kapı tuttu: `src/app/screens/` altında bu fazdan tek satır değişiklik yok.** `git diff --stat -- apps/mobile/src/app/screens/` yedi dosya listeliyor; yedisi de oturum başındaki `git status` çıktısında zaten vardı (Sunucular 6a-6f fazlarından kalan, commit edilmemiş iş). Yeni rotalar `src/navigation/` ve `src/dm/` altına kaydedildi.

## Yapılanlar

### B1 — `theme.groupChat` token grubu

- `apps/mobile/src/design/mobile-group-chat-metrics.ts` **(yeni)**: 43 alt grubun **tüm ölçüleri**. Sayılar palet bloklarında değil burada, çünkü iki temada birebir aynı — `theme.groupChat`, bu nesnenin açık ya da koyu renk bloğuyla birleşimi. Bir radius'un tek evi var, light/dark bu konuda anlaşmazlığa düşemez.
- `apps/mobile/src/design/palette.ts`: `redesignGroupChatLight` / `redesignGroupChatDark` **(yeni)** — yalnız renk.
- `apps/mobile/src/design/themes.ts`: `createGroupChatTokens` + `MobileGroupChatTokens` (`ReturnType`, elle yazılmış üçüncü bir kopya yok) + `MobileTheme.groupChat` + üç yeni elevation (`groupChatPrimaryAction`, `groupChatComposerAction`, `groupChatCameraButton`).
- Parametre tipi `MobileGroupChatColors`: her renk yaprağı `string`'e genişletilmiş tek şekil. Koyu bloğun unuttuğu bir anahtar, `createGroupChatTokens(redesignGroupChatDark)` çağrısında **derleme hatası** — koyu temada açık renk çizen bir ekran değil.
- Balon/tepki/mention/okundu tokenları `groupChat` içinden yeniden dışa vuruldu (C1): grup ekranı `theme.messaging`'e bakmaz.

**40 yerine 43 alt grup.** Tabloya ek olarak `surfaces` (ekran/kart zemini + saç çizgisi, §1.10), `sectionLabel` (HTML 242/250/258/398/405/431/444'teki büyük harf bölüm başlıkları + sayaç + "Tümü"/"Düzenle" bağlantısı) ve `dayDivider` (HTML 301 `BUGÜN`) yazıldı; üçü de tablodaki gruplardan hiçbirine girmiyordu ve satır numaraları verilmiş HTML bloklarından okundu.

### B2 — Kopya

`apps/mobile/src/locale/mobile-copy.ts`: **91 yeni anahtar** × 2 dil. Mevcut 13 anahtar yeniden kullanıldı (aşağıda), `groupDisappearing*` dördünün değeri güncellendi.

Tasarımdaki Türkçe metinler birebir; İngilizce çeviri. `mobile-copy-parity` ve `mobile-locale-preferences` testleri anahtar eşitliğini zaten zorluyor, üstüne bu fazın kendi testi yer tutucu eşitliğini, emoji yokluğunu ve "İngilizce değer Türkçenin kopyası değil" kuralını da sabitliyor.

### B3 — Saf model

- `apps/mobile/src/app/mobile-group-chat-model.ts` **(yeni, React'siz)**: 17 dışa açık fonksiyon + filtre kalıcılığı yardımcıları.
- `apps/mobile/scripts/mobile-group-chat-model.test.ts` **(yeni)**: 66 test, her fonksiyon en az bir sınır durumuyla (0 okuyan, 1/2/3+ yazan, boş ad, sınır aşımı, bozuk depo, bilinmeyen renk).
- **Ad türetme tek yerde:** `packages/types/src/group-name.ts` **(yeni, yaprak modül)** → `buildGroupNameFromMembers(names, locale)`. `buildGroupNameHint` bunu çağırıyor, web'in `getGroupConversationTitle`'ı da. Aynı girdi iki tarafta aynı çıktıyı veriyor; testle sabit.

### B4 — Filtre kalıcılığı

`apps/mobile/src/app/features/use-mobile-conversation-filter.ts` **(yeni)** — `use-mobile-workspace-filter.ts` deseninin aynısı, ikinci ekseni yok (sohbet listesinde tek çip şeridi var). Okuma senkron, yazma gecikmeli, sürüm ref'i yavaş disk okumasının kullanıcının az önce dokunduğu çipi ezmesini engelliyor. Parse/serialize/set saf fonksiyonlar modelde ve testli. Yeni depolama katmanı yok.

### B5 — İstemci, query anahtarları, invalidation

`apps/mobile/src/dm/mobile-group-client.ts`: **11 yeni fonksiyon** (B5'in on tanesi + `fetchMobileGroupInvite`, çünkü Faz 2 S5'teki `GET .../invite` olmadan ayarlar sayfası başkasının açtığı daveti gösteremez).

Query anahtarları: `groupDetails`, `groupMembers`, `groupMedia`, `groupInvite`, `groupInvitePreview`, `groupCallState`.

`MOBILE_GROUP_INVALIDATIONS` — B5'in tablosu tek yerde, ekran kendi listesini uyduramıyor. `useMobileGroupSettingsMutations`: bildirim kademesi ve sohbet sabitleme **iyimser** (anahtar dokunulduğu anda dönüyor), hata olursa yakalanan tam anlık görüntüye geri alınıyor. Toast çağıranın işi — hangi cümlenin gösterileceğini yalnız ekran bilir.

### B6 — Rotalar

`MobileRootStackParamList`: `GroupCreate` artık `{ step?: "identity" | "members" } | undefined` (mevcut `navigate("GroupCreate")` çağrıları bozulmadı), + `GroupInfo`, `GroupSettings`, `GroupMembers`, `GroupInvitePreview`.

Deep link `/g/<code>` → `GroupInvitePreview`: `mobile-deep-links.ts` güvenli önek listesine `/g` eklendi (eşleşme `=== "/g"` ya da `/g/…`, `/games`'i yutmaz), `mobile-linking.ts`'e hem `config.screens` girdisi hem `resolveMobileRoutePathIntent` dalı, `mobile-navigation-ref.ts`'e switch dalı. `/invite/<code>` **dokunulmadı**; sunucu daveti hâlâ `parseMobileDeepLink` içinde command intent olarak erken talep ediliyor, testle sabit.

Yer tutucular `apps/mobile/src/dm/mobile-group-route-placeholders.tsx` **(yeni)** — dördü de tek satır `null`, stil yok. `screens/` altına konmadılar ki kapının `git diff --stat` kontrolü boş kalsın.

### B7 — Realtime köprüsü

- Sekiz yeni olay: `dm:group:settings|role|pin|invite`, `dm:conversation:notify|pin`, `dm:message:expired`, `dm:call:state`.
- `packages/types/src/mobile.ts`: yedi yeni olay şeması (`dm:call:state` mevcut `GroupCallStateDTOSchema`'yı kullanıyor). Her biri `group-realtime.ts`'in yaydığının birebir aynısı — bir olay sunucunun göndermediği bir alanı tohumlayamaz.
- `mobile-realtime-contract.ts`: sekizi de `isMobileRealtimeGroupPatchEvent` ile **sıfır refresh kaynağına** eşleniyor.
- `realtime-query-bridge.ts`: `applyGroupPatchEvent` her olayı **önbelleğe yazarak** cevaplıyor.
- `apps/mobile/src/query/mobile-group-cache.ts` **(yeni, saf)**: beş yama fonksiyonu; hepsi önbellek yoksa girdiyi olduğu gibi döndürüyor.

İki bilinçli istisna, ikisi de `invalidate`:

- `dm:group:invite` **kodu taşımıyor** (Faz 2 karar 2). Yama, sunucunun kasten esirgediği bir `code` uydurmak zorunda kalırdı; onun yerine davet okuması geçersiz kılınıyor.
- `dm:group:pin` sabitlenen mesaj akıştaki satırlardan biri olduğu için açık akışı geçersiz kılıyor; `groupDetails` yamalanıyor.

### Payload genişletmesi (kullanıcı kararı, aşağıda S1)

`MobileBootstrapDMConversationSummarySchema` + `avatarPair`, `overflowCount`, `notifyLevel`, `pinnedAt` (hepsi `default`'lu — aynı şema 1:1 satırları da taşıyor). `/api/v1/mobile/dm` DTO'dan dolduruyor; bootstrap `notifyLevel`/`pinnedAt`'i `select`'e ekliyor ve çifti zaten yüklü 4 katılımcıdan + `_count`'tan kuruyor. **Ek sorgu yok.** `memberCount`/`onlineCount` eklenmedi: satır zaten `participantCount` taşıyor ve `onlineCount` yalnız 2d/2e başlığında var, orası `groupDetails`'ten okuyacak.

## Bağlayıcı kararlar

1. **Grup adı türetmesi `packages/types/src/group-name.ts`'te tek yerde.** Web `getGroupConversationTitle` artık **zorunlu** `locale` parametresi alıyor; yeni bir çağıran sessizce yanlış son ayracı seçemez.
2. **`theme.groupChat` = ölçü + renk birleşimi.** Ölçü `mobile-group-chat-metrics.ts`'te, renk palette'te. Bir alt grupta aynı ad iki tarafta olamaz — sığ birleşme birini sessizce yutar (bkz. S3) ve bunu bir test kalıcı olarak yasaklıyor.
3. **Büyük harf bölüm başlıkları kopyada büyük harfle yazılır**, `textTransform` ile büyütülmez: RN cihaz yereliyle büyütür ve "Bildirimler" Türkçe olmayan bir telefonda "BILDIRIMLER" olur.
4. **Sekiz grup olayı yama uygular, hiç refetch etmez** — `getMobileRealtimeRefreshSources` üçü için de boş dizi döner ve sözleşme testi bunu sabitler.
5. **`groupDetails` ≠ `dmDetails`.** Yeni anahtar, mevcut 1:1 detay okumasının üstüne binmiyor; o okuma ve ekranı Faz 5'te ölecek. Tek anahtar iki şekil = mesajlaşma send-storm hatasının aynısı.
6. **`groupCreateNameHint` dokunulmadı**, canlı ipucu yeni `groupCreateNameHintTemplate` anahtarına yazıldı (S2).
7. **Yetkisiz eylem menüde görünmez** (`getMemberSheetActions` boş dizi döner, pasif satır değil).
8. **Sahip moderasyon hedefi değildir**: `getMemberSheetActions` `OWNER` hedefine promote/demote/remove vermez; grup yalnız açık devirle el değiştirir.

## Sapmalar

| #   | Sapma                                                                                             | Gerekçe                                                                                                                                                                                                                                                                           | Kullanıcıya soruldu                      |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| S1  | Mobil sohbet listesi payload'ı bu fazda genişletildi (`packages/types` + iki web rotası)          | B5'in iyimser yazması ve B7'nin `dm:conversation:notify/:pin → dmConversations satır patch` sözleşmesi, satır `notifyLevel`/`pinnedAt` taşımadan **yazılamıyordu**; `avatarPair` de sunucuda üretiliyor ve satır 4 katılımcıyla sınırlı olduğu için istemcide yeniden türetilemez | **Evet** — "Faz 3'te genişlet" seçildi   |
| S2  | `groupCreateNameHint` yerine yeni `groupCreateNameHintTemplate`                                   | Mevcut anahtarı `{names}` şablonuna çevirmek, onu ham basan iki canlı ekranda (`group-create-screen.tsx`, `mobile-group-details-screen.tsx`) Faz 4/5'e kadar literal `{names}` gösterirdi. Eski anahtar o ekranlarla birlikte ölür                                                | Hayır — görünür regresyon önlendiği için |
| S3  | Palet renk anahtarlarına `Color` soneki (37 anahtar: `tileRingColor`, `dotColor`, `iconColor`, …) | `theme.groupChat` sığ birleşme; `tileRing` hem 2.5px genişlik hem `#F6F7FB` renk olamaz — biri sessizce kayboluyordu. Çakışma testi bunu kalıcı olarak yasaklıyor                                                                                                                 | Hayır — adlandırma                       |
| S4  | 43 alt grup (tabloda 40)                                                                          | `surfaces`, `sectionLabel`, `dayDivider` tablodaki hiçbir gruba girmiyordu ama HTML'de ölçüleri var (satır 242/250/258/301/398/405/431/444)                                                                                                                                       | Hayır — HTML kaynak                      |
| S5  | Ölçüler `tokens.ts`'e değil yeni `mobile-group-chat-metrics.ts`'e                                 | `tokens.ts` CRLF; LF içerik eklemek dosyayı karışık satır sonlu yapardı. Ayrıca `mobile-messaging-scale.ts` gibi konu bazlı bir tasarım modülü zaten depo deseni                                                                                                                  | Hayır                                    |
| S6  | `fetchMobileGroupInvite` eklendi (B5 listesinde yoktu)                                            | Faz 2 S5 `GET .../invite` ucunu açtı; onsuz 2f, başkasının açtığı daveti görmek için toggle atmak zorunda kalırdı                                                                                                                                                                 | Hayır — uç zaten var                     |
| S7  | `groupCallState` query anahtarı eklendi (B5 listesinde yoktu)                                     | `dm:call:state` yaması bir yere yazılmak zorunda; Faz 2 karar 8 istemcinin roster'ı türetmesini yasaklıyor, yani payload bütün olarak saklanıyor                                                                                                                                  | Hayır                                    |
| S8  | `groupDisappearing*` dört anahtarın değeri büyük harfe çevrildi (`kapalı` → `Kapalı`)             | 2f'in değer sütunu ayar adını başlı başına basıyor. İki ayrı anahtar kümesi (cümle içi + satır) aynı dört pencerenin iki kaynağı olurdu; sistem cümlesi "…mesajları Kapalı olarak ayarladı" olarak okunuyor ve testi güncellendi                                                  | Hayır                                    |
| S9  | `GroupInviteJoinResponseSchema` `packages/types`'a eklendi                                        | Katılma gövdesi `alreadyMember` + `conversation` taşıyor; `GroupDMConversationResponseSchema` `.strict()` ve reddediyor. Mobilde `zod` doğrudan bağımlılık değil, yani şema paylaşılan pakette olmak zorundaydı                                                                   | Hayır                                    |
| S10 | Web'de üç bileşen + iki test dosyası değişti                                                      | `getGroupConversationTitle` zorunlu `locale` aldı (bağlayıcı karar 1). Üçü de `useI18n().locale`'i zaten elinde tutuyordu                                                                                                                                                         | Hayır — derleme zorunluluğu              |

## Kapı sonucu

| Komut                                                                                | Sonuç                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------- |
| `cd apps/mobile && node --test --import tsx scripts/mobile-group-chat-model.test.ts` | ✅ 66/66                                |
| `pnpm --filter @wizards/mobile typecheck`                                            | ✅ temiz                                |
| `pnpm --filter @wizards/mobile test`                                                 | ✅ 1860/1860 (öncesi 1758)              |
| `pnpm --filter @wizards/types test`                                                  | ✅ 308/308 (öncesi 300)                 |
| `pnpm --filter @wizards/web test`                                                    | ✅ 2411/2411 (öncesi 2409) — ek kontrol |
| `pnpm --filter @wizards/web typecheck`                                               | ✅ temiz — ek kontrol                   |
| `cd apps/mobile && npx jest`                                                         | ✅ 1237/1237, 132 suite — ek kontrol    |
| `pnpm --filter @wizards/web lint`                                                    | ✅ temiz — ek kontrol                   |
| `graphify update .`                                                                  | ✅ 24678 düğüm, 58048 kenar             |

### §E kontrol listesi

- [x] `git diff --stat` içinde `src/app/screens/` altında render değişikliği **yok** — listelenen yedi dosya oturum başındaki `git status` ile birebir aynı (önceki fazların işi).
- [x] `theme.groupChat` hem `lightTheme` hem `darkTheme` içinde, aynı anahtar kümesiyle — yaprak yolu karşılaştırmasıyla testli; ayrıca mevcut `mobile-theme-contract` testinin tüm tema şekil eşitliği kontrolü de kapsıyor.
- [x] Kopya: `tr` ve `en` anahtar sayıları eşit — `mobile-locale-preferences` (tüm sözlük) + bu fazın grup anahtarı, yer tutucu ve emoji testleri.
- [x] Model fonksiyonlarının her biri en az bir sınır durumuyla testli.
- [x] `buildGroupNameHint` ile sunucu adı türetmesi aynı girdide aynı çıktıyı veriyor — iki tarafın da çağırdığı `buildGroupNameFromMembers` testli, web `group-presentation` testi yeni çıktıyı sabitliyor.

## Koyu tema: türetilenler ve sorulanlar

### Türetilen (§B1 eşleme tablosu + §0.2, hiçbiri uydurma değil)

| Açık                                                              | Koyu                                      | Kaynak                                     |
| ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| Ekran `#F6F7FB`                                                   | `#12141F`                                 | §B1 tablo                                  |
| Kart/başlık/composer `#FFFFFF`                                    | `#1B1E2C`                                 | §B1 tablo                                  |
| Gelen balon `#FFFFFF` + gölge                                     | `#1E2235`, gölge yok                      | §B1 tablo                                  |
| `#F1F2F9` / `#ECEEF7` / `#E4E7F3` alan-çip zemini                 | `rgba(255,255,255,.07)`                   | §B1 tablo                                  |
| `#F0F1F8` / `#E9EBF4` / `#EAECF5` / `#E7E9F4` / `#E4E6F2` ayırıcı | `rgba(255,255,255,.07)`                   | §B1 tablo                                  |
| Metin `#1E2235` / `#6B7194` / `#9AA0BC`                           | `#F2F3FA` / `rgba(…,.55)` / `rgba(…,.45)` | §B1 tablo                                  |
| `#3A3F5C` üçüncül metin                                           | `rgba(255,255,255,.65)`                   | §0.2, `redesignMessagingDark.textTertiary` |
| `#8A90B0` büyük harf etiket                                       | `rgba(255,255,255,.42)`                   | §0.2, `groupLabel`                         |
| `#767CA0` okunmuş saat                                            | `rgba(255,255,255,.45)`                   | §0.2, `listTime`                           |
| `#A2A8C3` / `#C0C5DC` sayaç, chevron, kilit                       | `rgba(255,255,255,.45)`                   | meta rütbesi                               |
| Giden balon                                                       | değişmez                                  | §B1 tablo                                  |
| Gönderen adı 5'li palet + 5 grup rengi                            | değişmez                                  | §B1 tablo (kimlik)                         |
| Çevrimiçi metni `#1B8A55`                                         | `#4ADE80`                                 | §B1 tablo                                  |
| Çevrimiçi noktası `#22C55E`                                       | değişmez                                  | §0.2                                       |
| Vurgu **dolgusu** `#4F46E5`                                       | değişmez                                  | §0.2 (giden balon kuralı)                  |
| Vurgu **glifi/etiketi** `#4F46E5`                                 | `#A5A8FF`                                 | §0.2 R3, `accentText`                      |
| `#EEF0FE` yumuşak vurgu zemini                                    | `#2A2F45`                                 | §0.2 R5, `accentSoft`                      |
| `#DC4E5F` / `#FCE9E9` / `#B0455A` tehlike                         | `#FF7A88` / `rgba(220,78,95,.16)`         | §0.2 kayıt sil butonu                      |
| `#C77A2B` / `#FEF0E8` sahip çipi                                  | `#FFD1A3` / `#2A2F45`                     | §0.2 avatar satırı                         |
| `#8A90B0` / `#F0F1F8` nötr tint                                   | `#C9CCD9` / `#2A2F45`                     | §0.2 avatar satırı                         |
| `#D5D9EA` toggle kapalı, boş kutu kenarı                          | `rgba(255,255,255,.18)`                   | §0.2 R6, `toggleOff`                       |
| `#C9CDE3` kesikli "Ekle", meta ayracı                             | `rgba(255,255,255,.28)`                   | §0.2 R6, `sliderStop`                      |
| Tepki (benim) `#EEF0FE`/`#C7CBF5`/`#4F46E5`                       | `#2E2C63`/`#4F46E5`/`#C3C0FF`             | §0.2                                       |
| Tepki (diğer) `#FFFFFF`/`#E4E6F2`/`#6B7194`                       | `#242838`/`rgba(…,.07)`/`rgba(…,.6)`      | §0.2                                       |
| Halka rengi (satır zemini)                                        | o temadaki satır zemini                   | HTML 68 vs 83'ün kendi kuralı              |
| Odak halkası `rgba(79,70,229,.12)`                                | değişmez                                  | marka halkası, giden balonla aynı mantık   |
| Nötr yüzey gölgeleri                                              | düşer; iki marka gölgesi kalır            | §0.3                                       |

### Sorulan (tabloda karşılığı yoktu)

| Token                               | Açık                         | Koyu                                                         | Karar                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aktif filtre çipi (2a)              | zemin `#1E2235`, metin beyaz | zemin `#4F46E5`, metin beyaz                                 | **Kullanıcı seçti.** Koyu temada `#1E2235` gelen balon rengi; mürekkep çip `#1B1E2C` yüzeyden ayrışmıyordu. §0.2'nin "giden balon değişmez" mantığı: seçili durum marka dolgusudur                |
| Sessiz okunmamış rozeti (2a)        | zemin `#C9CDE3`, metin beyaz | zemin `rgba(255,255,255,.18)`, metin `rgba(255,255,255,.55)` | **Kullanıcı seçti.** İkisi de mevcut token (`toggleOff` + §0.2 ikincil metin); soluk-nötr kontrol rütbesi açık temayla aynı kalıyor                                                               |
| 2a/2d avatar çiftinin ikinci karosu | —                            | —                                                            | **Kullanıcı seçti.** HTML kendi içinde çelişiyordu (satır 67/119 iki baş harf, satır 104 `+3`); §11.0.7 uygulandı: gizlenen üye varsa ikinci karo `+N` olur ve rozet yerini aldığı üyeyi de sayar |

## Cihaz test listesi (kullanıcı koşacak)

**Bu fazda ekran yok**, ama iki davranış cihazda gözlenebilir:

1. Uygulamayı aç → Mesajlar sekmesi → liste eskisi gibi çiziliyor, hiçbir satır boşalmıyor (payload dört alan büyüdü, mevcut satırlar bozulmamalı).
2. Grubu olan bir hesapla `whispr://g/ABCDEFGHJKLM` linkini aç → uygulama **boş bir ekran** açar ve geri tuşu Mesajlar'a döner (yer tutucu; gerçek önizleme Faz 5).
3. `whispr://invite/<sunucu-kodu>` linkini aç → **eskisi gibi** sunucu davet akışı açılır, grup ekranı değil.
4. Web'de adsız bir gruba gir → başlık artık `Selin, Kaan` yerine `Selin ve Kaan` yazıyor (§4.4; İngilizce arayüzde `Selin and Kaan`).

## Bilinen boşluklar

- **`GroupDetails` rotası ve `mobile-group-details-screen.tsx` duruyor.** 2e'nin karşılığı `GroupInfo`; eski rota, ekranı ve ona bağlı `dmDetails` okuması Faz 5'te silinecek. Şu an ikisi yan yana ve `dmDetails` hâlâ eski şekli taşıyor.
- **Yer tutucu ekranlar boş.** `GroupInfo`/`GroupSettings`/`GroupMembers`/`GroupInvitePreview` `null` render ediyor; bir kullanıcı deep link ile oraya düşerse beyaz ekran görür. Faz 5'e kadar bunlara giden tek yol elle yazılmış bir deep link.
- **`groupDetails` / `groupMembers` / `groupMedia` okuması yok.** Anahtarlar ve yamaları var, okumayı Faz 5 yazacak; o zamana kadar yamalar önbellek boş olduğu için no-op.
- **`groupMembers` önbellek şekli varsayımsal** (`{ members: [{ userId, role }] }`). Faz 5 roster'ı `groupDetails.participants`'tan okumaya karar verirse bu anahtar kullanılmadan kalır ve silinir.
- **Bootstrap `avatarPair`'i ilk 4 katılımcıdan kuruyor.** `_count` gerçek toplamı verdiği için `overflowCount` doğru; ama 4'ten fazla üyesi olan bir grupta ilk iki _diğer_ üye her zaman ilk 4'ün içinde olduğundan bu güvenli. `/mobile/dm` listesi tam DTO'dan doluyor.
- **Eski kopya anahtarları duruyor:** `groupCreateNameHint`, `groupCreateNameLabel`, `groupOwnerBadge`, `groupCreateSubmitAction`, `groupCreateTitle`, `groupCreateMinimumHint`, `groupCreatePhotoAction`, `groupSaveAction`, `groupMembersTitle`. Hepsi Faz 4/5'te ölen iki ekrana ait; o ekranlar silinince bu anahtarlar da silinmeli.
- **`mobile-copy.ts` ve `mobile-group-chat-metrics.ts` prettier ile biçimlendi**; `mobile-sunucular-model.ts` gibi bu fazın dokunmadığı bazı dosyalar depoda hâlâ biçimlenmemiş durumda (mevcut durum, bu fazın işi değil).
- **Faz 1 ve Faz 2 migration'ları hâlâ koşulmadı**; bu faz şema değiştirmedi.

### Yeniden kullanılan mevcut kopya anahtarları (yeni anahtar açılmadı)

`groupCreateMembersStepTitle` (2b başlık), `groupCreateIdentityStepTitle` (2c başlık), `groupCreateNextAction` (İleri), `groupCreateCounter` (`3/32`), `groupCreateLimitReached`, `groupAddMemberAction` (Üye ekle), `groupRemoveMemberAction` (Gruptan çıkar), `groupHideAction` (Sohbeti gizle), `groupLeaveAction` (Gruptan ayrıl), `groupLeaveConfirmTitle`, `messageBotBadgeLabel` (BOT çipi), `groupDisappearing*` (dördü, değeri güncellendi).

# Faz 5 raporu — 2d grup sohbeti, 2e grup bilgisi, 2f ayarlar ve izinler

Branch `uat`, **commit edilmedi**. Paketin son fazı.
**Kapı tuttu:** §I'nın yedi komutu yeşil, §G'nin 30 kriteri tek tek doğrulandı (tablo `00-paket-kapanis.md`'de).

Faz başında sorulan üç boşluğun cevabı (kullanıcı, 2026-08-11) bu fazın şeklini üç noktada belirledi:

| Soru                       | Karar                                                                            |
| -------------------------- | -------------------------------------------------------------------------------- |
| 2e/2f grubu neyle okuyacak | **İki yeni GET + mobil aynası** — `/dm/groups/[id]` ve `/dm/groups/[id]/call`    |
| 2e'nin `Ara` eylemi        | **2d'ye arama paneli bağlandı** — mevcut `MessageSearchPanel`, yeni altyapı yok  |
| D3 web paritesinin şekli   | **Mevcut panel genişledi + ayrı ayarlar paneli** — `dm-group-settings-panel.tsx` |

---

## Yapılanlar

### Sunucu — iki okuma ucu (kullanıcı kararı)

Faz 3 `groupDetails` ve `groupCallState` anahtarlarını açmış ama okumayı bu faza bırakmıştı. Bu faz onları yazdı:

- `api/v1/dm/groups/route-logic.ts`: `groupReadRoute` (`GET .../groups/[id]` → `{ conversation }`) ve `groupCallStateRoute` (`GET .../groups/[id]/call` → `{ callState }`). İkisi de DI'lı, ikisi de testli.
- **Okuma, yazmaların cevapladığı şeklin aynısını döndürüyor.** 2e/2f'in çizdiği her kontrol — dört izin satırı, rol çipleriyle roster, sabit kart, bildirim kademesi, iki pencere — o DTO'nun bir alanı; ikinci ve dar bir gövde aynı kolonların başka bir isimle tekrarı olurdu ve realtime yamaları zaten bu şekli önbelleğe yazıyor.
- Çağrı okuması `readGroupCallState` + `toGroupCallStateDTO`; kapı **üyelik** (`requireDMParticipant`), izin değil — bir çağrı gruptaki herkese görünür, sessize almış üyeye de (Faz 2 karar 9). Redis'ten önce kapı çalışıyor, testle sabit.
- Mobil aynalar aynı fazda (`00 §3.3`): `mobileGroupReadRoute`, `mobileGroupCallStateRoute`, ikisi de gövdeyi paylaşılan şemayla yeniden ayrıştırıyor.
- Yeni rate limit kovası `dm:group:read` / `mobile:dm:group:read` — 120/dk. Okuma kovası `update`'ten geniş: grup ekranları yazılmaktan çok açılıyor.

**Neden bir uç gerekliydi:** 2e ve 2f kendi rotaları, yalnız `conversationId` taşıyorlar. Deep link ya da geri gezinme ile açıldıklarında mesaj önbelleği sıcak olmayabilir. Banner içinse `dm:call:state` yalnız **geçişlerde** yayınlanıyor — çağrı başlarken çevrimdışı olan bir okuyucu grubu boşmuş gibi görürdü.

### B — 2d, grup sohbeti

**Ayrı bir grup sohbet ekranı yazılmadı** (§B / §H). Aktarım, balonlar, gruplama, kaydırarak yanıt ve uzun basış menüsü `dm-chat-primitives`'te kaldı; kriter 21 böylece iki dosyanın anlaşmasıyla değil **inşaatla** tutuyor.

- `components/group-chat-primitives.tsx` **(yeni, 430 satır)**: başlık (38px çapraz çift + `6 üye · ● 3 çevrimiçi` + **tam iki** buton), çağrı banner'ı, sabitlenmiş şerit, izin bilgi şeridi, yazıyor kapsülü, gönderen adı, okundu yığını. Hepsi `theme.groupChat`.
- `components/group-management-sheets.tsx` **(yeni)**: `⋯` menüsü, okuyanlar sheet'i, üye eylemleri sheet'i ve **`GroupLeaveFlow`** — ayrılma + devir. Dört sheet'in de iki çağıranı var; "bu izleyici neyi yapabilir" sorusunun ikinci bir kopyası Faz 3 karar 7'nin yasakladığı sapma olurdu.
- `dm-chat-primitives.tsx`: satıra beş **ilkel** prop eklendi (`senderColor`, `showSenderName`, `showReadReceipt`, `replyAccentColor`, `groupMembers` + `onOpenReaders`). Hepsi `areDMChatMessageRowPropsEqual`'a girdi — nesne prop'u eklemek her mesajın memo'sunu kırardı. Renk haritası ve okundu satırının **hangi balona** ait olduğu listede bir kez hesaplanıyor; satır kendi başına karar veremez, çünkü karar tüm akışa bakar.
- `dm-conversation-screen.tsx`: grup dalı `group ? … : …`. Bire bir sohbet tam olarak eskisi gibi çiziliyor.
- `screens/dm-conversation-shell.tsx` **(yeni)**: grup bağlamı + arama paneli. `dm-screen.tsx` mesajlar sekmesinin kabuğu ve mimari testin 245 satır bütçesinde kalıyor — kabuk **hangi** yüzeyin ekranda olduğuna, bu dosya o yüzeyin **neyden yapıldığına** karar veriyor.
- `features/use-mobile-group-chat.ts` **(yeni)**: `groupDetails` + `groupCallState` okumaları, yetenekler, `@` adayları, sabit şerit durumu, çağrı banner'ı — 2e ve 2f'in açıldığı **aynı anahtar**, yani başlık, şerit ve iki yönetim ekranı bir izin ya da rol konusunda anlaşmazlığa düşemiyor.
- `@` önerileri: composer zaten `mentionCandidates` alıyordu; kaynak grubun roster'ı oldu. `@everyone` **yok** (§B4).
- Grup çağrısı: `emitDMCallJoin` (realtime istemci + provider), `joinOngoingCall` (çağrı feature'ı), `setMobileDirectCallJoiner` (köprü). Banner `dm:call:join` gönderiyor ve mevcut ses odası yüzeyi açılıyor — yeni çağrı ekranı yok.

### C — 2e, grup bilgisi

`screens/group-info/group-info-screen.tsx` **(yeni)** + `group-members-screen.tsx` **(yeni)**. İkisi de sunum bileşeni: konuşma, medya sayfası ve yetenek cevapları prop olarak geliyor, böylece bileşen testinde query client olmadan bütün olarak render ediliyorlar.

- Kimlik (80/r26), dört hızlı eylem, sabitlenmiş kart (sabit yoksa **kart yok**), medya şeridi (üç ek + `+N`), üye kartı (ilk dört) + `Tümü`.
- `Davet et` yetkisi olmayana **gizleniyor**, pasif değil; kalan üç kutu eşit yayılıyor.
- Kalem yalnız `canEditInfo`'da. Bastığında **2c'nin kimlik bloğu `edit` kipinde** açılıyor: `identity-step.tsx`'e `mode` prop'u eklendi ve edit kipinde üye şeridi ile `KATILIM` kartı çizilmiyor — 2e zaten roster'ı listeliyor, izinler 2f'in.
- `Tümü` roster'ı kartın **ilk dördünün devamı**: ikisi de `getGroupMemberRows` okuyor, ikinci bir sıralama yok.

### D — 2f, grup ayarları ve izinler

`screens/group-settings/group-settings-screen.tsx` **(yeni)**.

- Bildirim radyoları (üç kademe), izinler bloğu + `YÖNETİCİ` çipi, gizlilik kartı (davet / kaybolan / gizle), ayrı tehlike kartı.
- **İzinler bloğu yetkisize hiç render edilmiyor** (§11.3/30) — pasif değil, yok. Testle sabit.
- Kaybolan mesaj: seçim sheet'i → **onay sheet'i**, ve V6'nın uyarısı yazmadan **önce** görünüyor. Onay verilmeden istek gitmiyor.
- Davet: kapalıyken bağlantı metni yok (K2); açıkken satır `Kopyala` / `Paylaş` / `Bağlantıyı yenile` sheet'ini açıyor.
- Ayrılma: son yönetici için önce devir sheet'i; seçilen üye **aynı DELETE isteğine** biniyor (V8), iki çağrı değil.

### D3 — Web paritesi

- `components/dm/dm-group-details-panel.tsx` genişletildi: rol çipleri (sahip altın / yönetici indigo), `SEN` etiketi, açıklama, sabitlenmiş mesaj kartı, ve `getGroupMemberActions`'tan sürülen üye eylemleri.
- `components/dm/dm-group-settings-panel.tsx` **(yeni)**: 2f'in tamamı, mevcut web tasarım dilinde. Bilgi panelinin altına `children` olarak monte ediliyor.
- `chat-area.tsx` + `message-list.tsx` + `message-item.tsx`: gönderen adı rengi, sabitlenmiş mesaj şeridi ve okundu satırı.
- `lib/dm/client.ts`: yedi yeni istek (grup okuma, ayarlar, rol, davet oku/aç/yenile, bildirim kademesi) — hepsi mobilin çağırdığı **aynı** uçlar.
- `hooks/use-group-conversation.ts`: beş yeni yazma + davet okuması; `leave` artık `transferOwnershipTo` taşıyor.

### §H'nin zorladığı taşıma

`getGroupCapabilities` ve `getMemberSheetActions` `apps/mobile`'dan **`packages/types/src/group-dm-settings.ts`**'e taşındı (`getGroupMemberActions` adıyla). Web panelleri aynı iki soruyu sorunca kural tek eve indi; mobil model onları kendi adlarıyla yeniden dışa vuruyor, yani beş ekran ve 106 model testi tek modül okumaya devam ediyor. `packages/types` bu iki fonksiyon için kendi 11 testini kazandı.

---

## Bağlayıcı kararlar

1. **Grup okuması, yazmanın cevabıyla aynı şekildir.** `GET /dm/groups/[id]` tam `DMConversationDTO` döner; 2d'nin başlığı, 2e, 2f ve GroupMembers hepsi `groupDetails` anahtarını okur. İkinci bir "grup özeti" şekli açan kod incelemede reddedilir.
2. **Çağrı roster'ı istemcide türetilmez** (Faz 2 karar 8, değişmedi). Yeni GET stored roster'ı bütün olarak verir; banner yalnız onu okur.
3. **Okundu satırının sahibi listedir, satır değil.** `resolveGroupReadReceiptMessageId` tüm akışa bakar; satıra yalnız `showReadReceipt: boolean` iner.
4. **Yetki kuralı `packages/types`'ta tektir.** İki istemci `getGroupCapabilities`/`getGroupMemberActions` çağırır; birinde `role === "OWNER"` diye elle karar veren kod sapmadır.
5. **Yetkisiz eylem yoktur, pasif değildir** — üç yüzeyde de (mobil sheet, mobil 2f bloğu, web paneli), üçü de testli.
6. **Devir ayrılmaya biner.** Tek `DELETE`, `transferOwnershipTo` gövdede. İki istek yükseltmeyi ayrılmadan ayırırdı.
7. **Kaybolan mesaj değişimi onay ister ve uyarıyı yazmadan önce gösterir** (V6).
8. **`navigation.replace` yok** — davet önizlemesi de `navigate` kullanıyor (10g / Faz 4 kuralı).

---

## Sapmalar

| #   | Sapma                                                                                             | Gerekçe                                                                                                                                                                                                                               | Kullanıcıya soruldu                    |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| S1  | İki yeni GET ucu (§A'da yoktu)                                                                    | 2e/2f ve çağrı banner'ı okumasız çalışamıyordu; Faz 3 anahtarları açıp okumayı bu faza bırakmıştı                                                                                                                                     | **Evet** — "İki GET + mobil aynası"    |
| S2  | 2d'ye mesaj arama paneli bağlandı; `mobile-product-app` ve `use-mobile-messaging-feature` değişti | V5 `Ara`yı grup içi arama diyor ve DM yüzeyinde panel hiç bağlı değildi                                                                                                                                                               | **Evet** — "2d'ye paneli bağla"        |
| S3  | Web'de 2f ayrı panel, ayrı rota değil                                                             | K5 mevcut web dilini şart koşuyor; ayrı sayfa yeni bir gezinme deseni demekti                                                                                                                                                         | **Evet** — "Mevcut panel + ayrı panel" |
| S4  | 2d/2e/2f stilleri `group-chat.styles.ts`'e eklendi (§C/§D ekran başına `.styles.ts` diyordu)      | Faz 4 karar C1 paket için tek sayfa açtı; `settingsCard`, `sectionLabel`, `pinnedStrip` üç ekranın ortağı ve ikinci bir sayfa aynı token grubunu ikinci kez önbelleğe alırdı                                                          | Hayır                                  |
| S5  | Toggle 46×28/thumb 24 (§D2 44×26/20 istiyor)                                                      | Faz 4 S3/karar 8 ile aynı: `mobile-design-contract` ekranın kendi track'ini çizmesini yasaklıyor, kit tek anahtar taşıyor. 2px                                                                                                        | Hayır — depo sözleşmesi                |
| S6  | Grup balonu gövdesi hâlâ `theme.messaging`'ten                                                    | §B "tek sohbet yüzeyi sahibi" diyor ve kriter 21 balon sisteminin **aynısı** olmasını istiyor. Grubun eklediği her şey (`theme.groupChat`) ayrı; Faz 4 S5 ile aynı gerekçe                                                            | Hayır                                  |
| S7  | 2e medya sayacı ilk sayfadan                                                                      | Ekler ucu **mesaja** göre sayfalıyor ve toplam taşımıyor; dört kutuluk şerit için sayım ucu açmak §2'nin yasakladığı uç olurdu. Tek sayfayı aşan konuşmada sayı eksik kalıyor — bilinen boşluk olarak yazıldı                         | Hayır                                  |
| S8  | `GroupInvitePreview` ekranı yazıldı (§A'nın B/C/D listesinde yoktu)                               | K2 "public önizleme, deep link ile katılma"yı paket kapsamına koymuştu ve Faz 3 rotayı `null` render eden bir yer tutucuya bağlamıştı. Paketi, ayarların dağıttığı bir bağlantının arkasında beyaz ekranla kapatmak teslim sayılmazdı | Hayır — kapsamın tamamlanması          |
| S9  | Faz 3'ün "yer tutucuya kayıtlı" rota testi, "gerçek konteynerlere kayıtlı"ya çevrildi             | Yer tutucular ve `mobile-group-route-placeholders.tsx` silindi; iddia davranışı takip etti                                                                                                                                            | Hayır                                  |
| S10 | Web bilgi/ayar panellerinde `permissions` yoksa K4'ün "sahip yönetir"i uygulanıyor                | `getGroupCapabilities` izin kümesi yokken 1:1 dalına düşüp hepsini açıyor. Faz 1 öncesi yazılmış bir grup payload'ı için bu "herkese izin" demek olurdu; eksik izin kümesi eski payload'dır, izin değil                               | Hayır                                  |
| S11 | `getGroupCapabilities`/`getMemberSheetActions` `packages/types`'a taşındı                         | §H "yetki mantığını web için ikinci kez yazma, `packages/types` tek kaynak" diyor                                                                                                                                                     | Hayır — §H                             |
| S12 | `mobile-product-app.tsx` arama prop'ları tek nesneye indi                                         | Üç prop iki sekmede de aynı; mimari testin 520 satır bütçesi altında kalmanın yolu tekrarı kaldırmaktı, bütçeyi yükseltmek değil                                                                                                      | Hayır                                  |
| S13 | `ChatMessage` şemasına `readReceipt` eklendi                                                      | Web aktarımı okundu satırını ikinci bir okuma olmadan çizebilsin diye; alan opsiyonel ve kanalda hiç bulunmuyor                                                                                                                       | Hayır                                  |

---

## Kapı sonucu

| Komut                                                                    | Sonuç                                |
| ------------------------------------------------------------------------ | ------------------------------------ |
| `cd apps/mobile && npx jest component-tests/mobile-group-2d.test.tsx`    | ✅ 18/18                             |
| `cd apps/mobile && npx jest component-tests/mobile-group-2e-2f.test.tsx` | ✅ 21/21                             |
| `pnpm --filter @wizards/mobile test`                                     | ✅ 1900/1900 (öncesi 1864)           |
| `pnpm --filter @wizards/mobile typecheck`                                | ✅ temiz                             |
| `pnpm --filter @wizards/web test`                                        | ✅ 2442/2442 (öncesi 2420)           |
| `pnpm --filter @wizards/web typecheck`                                   | ✅ temiz                             |
| `graphify update .`                                                      | ✅ 24912 düğüm, 58945 kenar          |
| `cd apps/mobile && npx jest`                                             | ✅ 1288/1288, 134 suite — ek kontrol |
| `pnpm --filter @wizards/types test`                                      | ✅ 325/325 (öncesi 314) — ek kontrol |
| `pnpm --filter @wizards/web lint`                                        | ✅ temiz — ek kontrol                |

Toplam diff (graphify çıktısı hariç): **81 dosya, +4371 / −2150**.

### Ölü kod temizliği

- `src/dm/mobile-group-details-screen.tsx` **silindi** (Faz 3/4 raporlarının duyurduğu gibi).
- `src/dm/mobile-group-route-placeholders.tsx` **silindi**.
- `component-tests/mobile-group-details.test.tsx` **silindi**.
- `GroupDetails` rotası ve `GroupDetailsScreenContainer` **silindi**; iki navigasyon testinin mock'u dört yeni konteynere çevrildi.

---

## Bilinen boşluklar

- **Üç migration hâlâ koşulmadı** (Faz 1, Faz 2, Faz 4). Bu faz şema değiştirmedi. Cihaz testinden önce koşulmalı.
- **2e medya sayacı ilk sayfanın uzunluğu** (S7). Tek sayfayı aşan bir konuşmada `MEDYA VE DOSYALAR` sayısı ve `+N` eksik kalır; doğru toplam için ekler ucunun bir sayım alanı kazanması gerekir.
- **`groupMembers` query anahtarı ve `patchMobileGroupMemberList` kullanılmıyor.** Roster `groupDetails.participants`'tan okunuyor (Faz 3'ün öngördüğü çıkış). İkisi de bir sonraki temizlikte silinebilir; bu fazda dokunulmadı çünkü realtime köprüsü hâlâ ikisini de yazıyor ve testleri var.
- **Web'de "yeni üyeler geçmişi görür" (historyVisibility) arayüzü yok** — 2f mobilde de bu satırı taşımıyor (tasarımda 2c'de), web ayar paneline eklenmedi.
- **Web'de okundu yığını avatarsız**: sayı satırı var, 16px yüzler yok. Mobil handoff'un pikselleri web'e taşınmıyor (K5) ve web satırının kendi ritmi var.
- **2e'nin `Ara`sı sohbete dönüp paneli açar**; grup bilgisi ekranının içinde ikinci bir arama yüzeyi yok (kullanıcı kararı).
- **`GroupInvitePreview` rate limit'i sunucuda** (20/dk önizleme, 5/dk katılma); istemci tarafında geri sayım göstergesi yok — 429 geldiğinde ekran boş önizleme gösterir.

---

## Cihaz test listesi (kullanıcı koşacak)

> **Önce:** üç migration hâlâ koşulmadı (Faz 1, Faz 2, Faz 4). Sıra:
> `pnpm --filter @wizards/db exec prisma migrate deploy`, sonra sunucuyu yeniden başlat.
> `allowGroupInvites` kolonu olmadan arkadaş listesi 500 döner.

1. **Gönderen kimliği.** İki cihazdan aynı gruba art arda yaz → her kişinin adı grubun **ilk** balonunda ve kendi renginde çıkıyor; aynı kişinin ikinci balonunda ad tekrar etmiyor ve balon sola kaymıyor. Kendi mesajında ad ve avatar hiç yok.
2. **Okundu bilgisi.** Bir mesaj gönder, ikinci cihazda aç → gönderen tarafta **yalnız son** giden balonun altında yüz yığını + `1 kişi okudu` beliriyor. Üçüncü cihaz da açınca sayı artıyor; herkes okuyunca `Herkes okudu`. Yığına dokun → okuyanlar listesi açılıyor. Karşı taraf yeni mesaj yazınca satır kayboluyor.
3. **Sabitlenmiş şerit.** Bir mesajı sabitle → iki cihazda da başlığın altında `SABİTLENMİŞ` şeridi çıkıyor. Bir cihazda çarpıya bas → **yalnız orada** gizleniyor, diğerinde duruyor. Başka bir mesaj sabitle → gizleyen cihazda da geri geliyor.
4. **Bahsetme.** Composer'a `@` yaz → grup üyeleri listeleniyor, `@everyone` **yok** ve kendi adın da yok. Birini seç, gönder → pil giden balonda beyaz saydam, karşı tarafta indigo; karşı tarafın sohbet listesinde `@1` rozeti çıkıyor.
5. **Bildirim kademesi.** `⋯ → Grup ayarları → Yalnız bahsetmeler` → normal mesajda bildirim gelmiyor, seni etiketleyen mesajda geliyor. Mesajlar listesinde grubun adı soluklaşıyor ve üstü çizili çan çıkıyor.
6. **İzin kapısı.** Yönetici hesapta `İZİNLER → Mesaj gönderebilir → Yöneticiler` → normal üyenin cihazında composer yerine `Bu grupta yalnız yöneticiler mesaj gönderebilir` şeridi çıkıyor. Aynı üye hesapla `Grup ayarları`nı aç → `İZİNLER` bloğu **hiç görünmüyor** (soluk değil, yok).
7. **Davet bağlantısı.** `GİZLİLİK → Davet bağlantısı` anahtarını aç → alt satırda `<host>/g/<kod>` beliriyor. Satıra dokun → `Kopyala` / `Paylaş` / `Bağlantıyı yenile`. Bağlantıyı başka bir hesapta aç → grup önizlemesi (ad, avatar, **üye sayısı**; üye listesi yok) ve `Katıl` çalışıyor. `Bağlantıyı yenile` → eski bağlantı artık açılmıyor.
8. **Kaybolan mesajlar.** `Kaybolan mesajlar → 24 saat` → önce `Değişiklik yalnız yeni mesajlara uygulanır` uyarısı ve onay isteniyor; onaylayınca sohbete bir sistem satırı düşüyor. Yeni mesaj süre damgası taşıyor, eski mesajlar taşımıyor.
9. **Grup çağrısı.** Başlıktaki telefona bas → diğer iki cihaz çalıyor. Biri katılsın; **üçüncü** cihazda başlığın altında `2 kişi görüşüyor · Katıl` banner'ı görünüyor. `Katıl`'a bas → ses odasına giriyor ve banner sayısı 3 oluyor. Herkes çıkınca banner kayboluyor.
10. **Görüntülü giriş noktası.** 2d başlığında görüntülü arama butonu **olmadığını** doğrula. `Grup bilgisi → Görüntülü` → görüntülü çağrı başlıyor.
11. **Üye yönetimi.** `Grup bilgisi → Tümü` → roster sahip, yöneticiler, sonra üyeler sırasında. Bir üyeye dokun → `Yönetici yap` var; yönetici yaptıktan sonra tekrar dokun → `Yöneticiliği al` var. Aynı işlemi normal üye hesapla dene → sheet'te yalnız `Mesaj gönder` ve `Profili gör` çıkıyor.
12. **Ayrılma ve devir.** Tek yönetici olduğun bir gruptan `Gruptan ayrıl` → önce devir listesi açılıyor ve seçim yapılmadan ayrılma **tamamlanmıyor**. Bir üye seç → ayrılma tamamlanıyor ve o üye yönetici olarak görünüyor.
13. **Koyu tema + yazı boyutu.** Koyu temaya geç → beş ekran da okunaklı, gelen balonda gölge yok. Ayarlar → Görünüm → Mesaj yazı boyutu `En büyük` → grup balonunun **gövdesi** büyüyor; gönderen adı, saat ve yanıt alıntısı sabit kalıyor.
14. **Web paritesi.** Aynı grubu web'den aç → sağ panelde kimlik, rol çipleri, sabitlenmiş mesaj kartı ve altında bildirim/izin/davet/kaybolan/ayrıl bölümleri. İzni web'den değiştir → mobilde anında yansıyor (ve tersi). Yönetici olmayan bir hesapla web'i aç → izin bloğu ve yetkisiz üye eylemleri **görünmüyor**. Sohbette gönderen adı rengi, sabitlenmiş şerit ve `n kişi okudu` satırı çiziliyor.

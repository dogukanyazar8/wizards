# Ş13 — Üyeler ve Moderasyon · Davetler · Etkinlikler · Tehlike bölgesi

> Dalga 5. Kaynak: `docs/prompts/whispr-sunucu/14-dalga5-s13-uyeler-davetler-etkinlikler-tehlike.md`.
> Otorite: `design/Sunucu.dc.html` inline `style` > `SPEC-SUNUCU.md` §8.6–§8.9 > `PROMPT.md`.
> Bağımlılık: Ş0 · Ş1 (sahiplik devri) · Ş2 (ban/timeout/filtre) · Ş3 (davet) · Ş9 (pencereler) ·
> Ş11 (ayarlar kabuğu). Paralel: **Ş11 ve Ş12 aynı anda koştu** (§0). Kararlar: **K3**, K11, K12.
> Dal: `uat`. Tarih: 2026-08-25.

---

## 0. Şeride başlarken bulunan gerçek — Ş11 kabuğu şerit sürerken doğdu

Şerit başladığında `components/shell/server-settings-overlay.tsx` (70 KB, altı sekme) hâlâ
yerindeydi ve `components/shell/server-settings/` **yoktu**. Bölümler yazılırken Ş11 K4'ü
uyguladı: eski dosyayı sildi, `server-settings/` altında kabuğu, `section-props.ts` sözleşmesini,
dokuz `lazy` girdisini ve dört bölüm için **iskelet** dosyaları (`sections/{members,invites,
events,danger}-section.tsx`, her biri kendi `Skeleton`'ını döndürüyor) açtı.

Bu yüzden Ş13 iki kez yerleşti:

1. Gövdeler önce `server-settings/<ad>-section.tsx` altında yazıldı (o an tek var olan yol).
2. Ş11'in kabuğu göründükten sonra dördü de `sections/` altına taşındı, iskeletlerin yerini aldı
   ve **Ş11'in prop sözleşmesine** (`ServerSettingsSectionProps`) uyarlandı.

Sözleşme "genişletilebilir ama daraltılamaz" diyordu; Ş13 iki alan ekledi (§3.1). Ş11'in
`channels`/`roles` için açtığı üst dizin köprüleri (`server-settings/channels-section.tsx`)
Ş13'ün dördü için **yazılmadı**: gövdeler tek yolda (`sections/`) duruyor ve kabuk oradan
`lazy` yüklüyor; ikinci bir yol yalnız ölü dosya olurdu.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                                                                     | Satır | İş                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `components/shell/server-settings/sections/members-section.tsx`                                           | 1 177 | §8.6 + K3: arama · 7 çip · sayaç · rol menüsü · moderasyon menüsü · yasaklılar · ban penceresi                    |
| `components/shell/server-settings/sections/invites-section.tsx`                                           | 763   | §8.7 + K3: üç çip grubu · canlı özet · mevcut davetler · QR · arkadaş daveti · bekleyenler                        |
| `components/shell/server-settings/sections/events-section.tsx`                                            | 485   | §8.8: iki sekme · kart · boş durum                                                                                |
| `components/shell/server-settings/sections/danger-section.tsx`                                            | 641   | §8.9: sahiplik devri · sunucu silme (**yalnız sahip**)                                                            |
| `components/shell/server-settings/section-parts.tsx`                                                      | 314   | `SectionLabel` · `ChipRadioGroup` · `CollapsibleList` · `CollapsibleEmpty` · `SectionCardTitle` · `OwnerOnlyChip` |
| `components/shell/server-settings/sections/members-invites-events-danger.test.tsx`                        | 787   | 38 test (negatif testler dâhil)                                                                                   |
| `lib/servers/member-moderation.ts`                                                                        | 234   | 7 çip sırası · 6 zaman aşımı süresi · 7 silme penceresi · menü kapıları · rozet/rol seçimi                        |
| `lib/servers/settings-invites.ts`                                                                         | 186   | Hedef kanal çipleri · özet parçaları · gövde · `3 / 25` · kalan süre                                              |
| `lib/servers/settings-events.ts`                                                                          | 111   | İki sekmenin ayrımı · tarih kutusu · saat aralığı · düğme kapıları                                                |
| `lib/servers/viewer-permissions.ts`                                                                       | 84    | İzleyicinin yetki kümesi (istemci türetmesi)                                                                      |
| `lib/servers/danger-zone.ts`                                                                              | 77    | Aday listesi · alt satır · iki düğmenin aktiflik kuralı                                                           |
| `lib/servers/{member-moderation,settings-invites,settings-events,viewer-permissions,danger-zone}.test.ts` | 706   | 60 test                                                                                                           |

**Toplam yeni: 5 565 satır, 98 yeni test.**

### 1.2 Düzenlenen dosyalar

| Dosya                                                          | Ne değişti                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/servers/metrics.ts`                                       | K3 yüzeylerinin ölçüleri (`moderationMenu*`, `collapsible*`, `invitesQr*`, `invitesSecondary*`), `inviteModal.qrBoxSize`, `invitesCodeGap`, `eventsToolbarGap`, `eventsTitleGap`, `eventsCancelledOpacity`, `dangerOwnerChipBackgroundAlpha` |
| `lib/servers/event-form.ts`                                    | `toServerEventFormState` (düzenlemenin ters yönü) + `buildServerEventUpdatePayload`                                                                                                                                                          |
| `lib/workspace/client.ts`                                      | `workspaceQueryKeys.serverInvites` · `serverPendingInvites`                                                                                                                                                                                  |
| `lib/store.ts`                                                 | `inviteModal.tab` (`link \| friends \| null`), `serverEventModal.eventId`; iki açıcının imzası                                                                                                                                               |
| `lib/locale/messages/tr.ts` · `en.ts`                          | **+123 anahtar** `server.settings.{members,invites,events,danger}.*` (TR/EN eşit; EN'de 8 `_one` biçimi, TR karşılıkları §4.7)                                                                                                               |
| `components/servers/modals/create-event-modal.tsx`             | `eventId` prop'u; düzenlemede form etkinlikten **türetilir**, `PATCH` yolu                                                                                                                                                                   |
| `components/servers/modals/channel-invite-modal.tsx`           | `initialTab` prop'u; `QR_BOX_SIZE` sözlükten okunuyor                                                                                                                                                                                        |
| `components/shell/workspace-modals.tsx`                        | İki pencereye yeni prop; `modalKey` sekmeyi de ayırt ediyor                                                                                                                                                                                  |
| `components/shell/server-settings/section-props.ts`            | `currentUserId` + `permissions` (Ş11 sözleşmesinin genişlemesi)                                                                                                                                                                              |
| `components/shell/server-settings/server-settings-overlay.tsx` | `currentUserId` prop'u; yetki kümesi bir kez türetilip dokuz bölüme geçiyor                                                                                                                                                                  |
| `components/shell/wizards-shell.tsx`                           | Kaplamaya `currentUserId={currentUser.id}`                                                                                                                                                                                                   |

**Yeni uç yazılmadı, migration yazılmadı.** Hepsi Ş1–Ş3'te hazırdı.

### 1.3 Tüketilen uçlar

| Metot                      | Yol                                                                 | Nerede                                       |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| `GET`                      | `servers/[serverId]/members?q&filter`                               | Üye listesi + `N / M` sayacı                 |
| `PATCH`                    | `servers/[serverId]/members/[memberId]/roles`                       | Rol menüsü                                   |
| `DELETE`                   | `servers/[serverId]/members/[memberId]`                             | Çıkarma                                      |
| `PATCH`                    | `servers/[serverId]/members/[memberId]/timeout`                     | Zaman aşımı ver/kaldır (`until: null`)       |
| `POST`                     | `servers/[serverId]/members/[memberId]/ban`                         | Ban (sebep + silme penceresi)                |
| `GET` · `DELETE`           | `servers/[serverId]/bans` · `bans/[userId]`                         | Yasaklılar listesi + kaldırma                |
| `GET` · `POST` · `DELETE`  | `servers/[serverId]/invites[?pending=1]` · `invites/[inviteId]`     | Davetler + bekleyenler                       |
| `GET` · `PATCH` · `DELETE` | `servers/[serverId]/events[?includePast=true]` · `events/[eventId]` | Etkinlikler                                  |
| `POST`                     | `servers/[serverId]/transfer-ownership`                             | Sahiplik devri                               |
| `DELETE`                   | `servers/[serverId]`                                                | Sunucu silme                                 |
| `PATCH`                    | `servers/[serverId]`                                                | `allowMemberAdds` (Ş11'in taslağı üzerinden) |

Ş2 §5'in **TODO 4**'ü (`GET .../bans` yanıtını tüketen yüzey yok) ve Ş3 §4'ün **TODO 4**'ü
(`renderInviteQr` kutu ölçüsünü çağırandan bekliyor) bu şeritte kapandı.

---

## 2. Kabul kriterleri → karşılıkları

| Kriter                                                 | Karşılık                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arama + 7 çip listeyi **gerçekten** süzüyor            | Süzme sunucuda: `fetchWorkspaceServerMembers(serverId, { q, filter })`; sorgu anahtarı çipi ve aramayı taşıyor. Test: `member-moderation.test.ts` çip sırası + bileşen testi yedi etiketi arıyor |
| Sayaç `N / M üye` canlı                                | `memberCounts.filtered / total` yanıttan; test `1 / 12 üye` ile süzülmüş ≠ toplam durumunu kilitliyor                                                                                            |
| Sahibin çıkarma düğmesi pasif ve nedenli               | `aria-disabled` + `cursor:not-allowed` + `opacity .3` + `sr-only` neden metni; test dördünü de arıyor                                                                                            |
| Zaman aşımı ver/kaldır çalışıyor                       | Menüde altı süre; `resolveTimeoutUntil` ISO'yu kuruyor, kaldırma `until: null`                                                                                                                   |
| Yasakla/yasağı kaldır çalışıyor                        | Ban penceresi (sebep + 7 pencere), `Yasaklılar (N)` listesinde `Yasağı kaldır`                                                                                                                   |
| Sahibe uygulanamıyor                                   | `listMemberModerationActions` sahip hedefinde **boş dizi** döner → satırda menü düğmesi hiç çizilmez. Test: `server-settings-member-menu-m-owner` DOM'da yok                                     |
| Zaman aşımlı üyede warning çipi                        | `Zaman aşımında · 2 saat`; süresi geçmiş kolonda çip yok                                                                                                                                         |
| Yasaklılar listesi doğru                               | Katlanır; kapalıyken satırlar DOM'da yok, açıkken kullanıcı · sebep · kim · ne zaman · kaldır                                                                                                    |
| Üç çip grubu özet satırına yansıyor                    | `# welcome-chat · 7 gün · 25 kullanım`; `Sınırsız` seçilince sayı yerine metin                                                                                                                   |
| Davet oluşuyor · kopyala · iptal                       | `createServerInvite` / `clipboard` / `revokeServerInvite`                                                                                                                                        |
| QR · arkadaş daveti · bekleyenler **gerçek**           | Satır başına QR paneli (`renderInviteQr`), `Arkadaş seçerek davet` Ş9 penceresini arkadaş sekmesinde açıyor, `Bekleyen davetler (N)` `?pending=1`'den                                            |
| "Yakında" çipi kalmadı                                 | Test: `Mobil eşitliği için sonraki özellikler` **yok**; §8.6'nın bilgi notu da yok                                                                                                               |
| Etkinlikler: iki sekme, kart, düzenle/iptal, boş durum | `selectServerEventsForTab` tek listeden ayırıyor; `Düzenle` aynı pencereyi dolu açıyor                                                                                                           |
| **Tehlike bölgesi yalnız sahibe** (negatif test)       | `DangerSection` sahip değilse `null` döner — **kanca çağrılmadan**. İki negatif test: düz üye ve **yönetici** için `renderToStaticMarkup === ""`                                                 |
| Devir: iki koşul tamam olmadan pasif                   | `canTransferOwnership`; alt satır üç durumu sırayla söylüyor                                                                                                                                     |
| Silme: metin birebir eşleşmeden pasif                  | `canDeleteServer`; büyük/küçük harf, ön/son ek, içerideki fazladan boşluk reddediliyor                                                                                                           |
| Başarıda yönlendirme + ray güncellemesi                | `closeServerSettings()` → `servers` sorgusu geçersiz → `router.push("/")`                                                                                                                        |
| Yeni hex yok                                           | Test: dört bölümün birleşik HTML'inde `#rrggbb` ve `rgb()/rgba()` **sıfır**                                                                                                                      |
| typecheck / lint / test yeşil                          | §5                                                                                                                                                                                               |

---

## 3. Tasarım kararları (gerekçeleriyle)

### 3.1 İzleyicinin yetkileri sözleşmede yok, bu yüzden istemcide **türetiliyor**

00 §5 net: yetkisi olmayana bölüm **hiç render edilmez**. Ama `WorkspaceServerDetail` izleyicinin
yetki bitlerini taşımıyor — yalnız `accessLevel`, `isAdmin`, `isOwner`. §8.6/§8.7/§8.8 ise üç ayrı
bite göre yüzey gizliyor (`BAN_MEMBERS`, `MANAGE_INVITES`, `MANAGE_EVENTS`).

Sözleşmeye alan eklemek yerine (mobil projeksiyonu ve dört uç testini birden ilgilendirirdi)
`lib/servers/viewer-permissions.ts` detayda **zaten olan** iki listeyi birleştiriyor:
`detail.roles` yetki anahtarlarını, `detail.members` izleyicinin rollerini taşıyor. Üç kural
sunucu tarafındaki `resolveServerPermissions` ile aynı: sahip her şeyi yapar · `ADMINISTRATOR`
her biti açar · geri kalan rollerin birleşimidir ve `@everyone` **her zaman** sayılır.

`@everyone` neden `detail.roles`'tan okunuyor da üye rozetinden değil: üye satırındaki `roles`
bir **rozet** listesi (`id`/`name`/`color`), yetki taşımıyor; ve varsayılan rol bazı
projeksiyonlarda satıra hiç girmiyor. Rozetten okumak herkese açık yetkileri sessizce düşürürdü.

Küme "ne çizilecek" sorusunu yanıtlar, "ne yapılabilir" sorusunu değil — **kapı yine uçta
kapanır**.

### 3.2 Üç yetki kapısı da **kancalardan önce**

`DangerSection`, `InvitesSection` ve `EventsSection` iki parçalı: dışarıdaki bileşen yalnız
kapıyı okuyup `null` ya da içerideki gövdeyi döndürüyor.

İki nedeni var ve ikincisi daha önemli:

1. Yetkisiz kullanıcı için üç mutation, iki sorgu ve bir router aboneliği hiç kurulmuyor.
2. **Negatif test sağlayıcı ağacı olmadan koşuyor.** Erken dönüş gövdenin içinde olsaydı
   "hiç render edilmiyor" iddiasını ölçmek için `QueryClientProvider` + router + store kurmak
   gerekirdi; o ağaç kurulduğunda test artık kapıyı değil, sahte bağlamı ölçerdi.

### 3.3 Zaman aşımı süreleri menüde, ayrı pencerede değil

Ş2 §5 TODO 2 listeyi UI şeridine bırakmıştı. Şerit dosyası altı süreyi parantez içinde veriyor
(`60 sn · 5 dk · 10 dk · 1 sa · 1 gün · 1 hafta`) — yani süre bir **seçim**, bir form değil.
Menüye `ZAMAN AŞIMI` başlığı altında altı satır kondu; ikinci bir pencere açmak tek tıklık bir
kararı iki tıklık yapardı. Ban ise sebep + silme penceresi istiyor, o yüzden **pencere** oldu.

### 3.4 Süzme sunucuda, "şimdi" tek yerde

Yedi çip ve arama `q` + `filter` ile uca gidiyor (Ş2 §3.1: sayfa boyu 100'de kesiliyor,
istemcide saymak 101. üyeden sonra yalan söyler). Arama 220 ms geciktiriliyor.

`nowMs` render başına bir kez okunuyor ve 30 sn'de bir tazeleniyor. Her satır kendi
`Date.now()`unu çağırsaydı aynı listedeki iki çip farklı saniyeleri gösterebilirdi — ve
`react-hooks/purity` kuralı render sırasında `Date.now()` çağrısını zaten reddediyor (§4.6).

### 3.5 İki sekme **tek** istekten türüyor

Etkinlik ucu filtresiz çağrıldığında yalnız `SCHEDULED`/`ACTIVE` döndürüyor; `?includePast=true`
her durumu. İki ayrı istek atmak iki ayrı gerçek üretirdi: `İptal et`e basılan etkinlik birinci
listeden düşüp ikincisine girmek zorunda ve iki istek arasında **ikisinde de görünmezdi**. Bu
yüzden tek istek + `selectServerEventsForTab`.

`COMPLETED` hiçbir sekmede yok ve bu SPEC'in kararı: segment iki etiket taşıyor. Geçmiş bir
etkinlik `Yaklaşan` altında dursaydı sekme adı yalan söylerdi.

### 3.6 `Düzenle` aynı pencereyi açar — ve form **türetilir**

`CreateEventModal` `eventId` alıyor. Düzenlemede form durumu bir efektte kopyalanmıyor;
taban her render'da etkinlikten hesaplanıyor (`toServerEventFormState`) ve kullanıcı ilk tuşa
bastığı anda `override` devralıyor. Efektle kopyalamak hem bir kademe geç doldururdu hem de
`react-hooks/set-state-in-effect` kuralını çiğnerdi.

Pencere ayrı bir "tek etkinlik" ucu **açmıyor**: bölüm listeyi `includePast` ile tam okuyor,
pencere aynı sorgu anahtarını paylaşıyor.

### 3.7 QR ölçüsü sözlüğe girdi

Ş3 §3.5 bunu bilerek ertelemişti: o an tasarımda QR'ın ölçüsü yoktu, yalnız kesikli bir çip
vardı. K3 çipi kaldırıp **iki** gerçek yüzey açtı (pencere ve §8.7 satırı) ve ikisi aynı kutuyu
çizmek zorunda; `132` bu yüzden `inviteModal.qrBoxSize` oldu ve iki yüzey de oradan okuyor.

### 3.8 `Arkadaş seçerek davet` kopyalanmadı

Hedefli davet akışı (arkadaş listesi, `NOT_FRIENDS` kapısı, `Gönderildi` durumu) Ş9'un
penceresinde uçtan uca yazılı. Bölüme ikinci bir kopya çıkarmak iki yüzeyin ilk sapmada
ayrışması demekti; düğme mağazadaki `openInviteModal(serverId, { tab: "friends" })` ile
pencereyi doğrudan arkadaş sekmesinde açıyor. K11 buna izin veriyor: ayarlardan açılan pencere
ayarları kapatmaz, üstüne çizilir.

### 3.9 `allowMemberAdds` Ş11'in taslağından geçiyor

Anahtarın kendi `PATCH`'ini yazmak, aynı sunucu satırını iki yerden yazan iki mutation demekti
ve başlıktaki `Değişiklikler kaydedildi` göstergesi birini hiç görmezdi. Satır `draft.allowMemberAdds`
okuyor, `patch({ allowMemberAdds })` yazıyor (K12'nin "tek kaynak" kuralı).

---

## 4. SPEC / prompt'tan sapmalar

| #   | Sapma                                                                                                                               | Gerekçe                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Mesaj silme penceresi seçenekleri uydurulmadı ama SPEC'te de yok.** `Silme · 1 saat · 6 saat · 12 saat · 24 saat · 3 gün · 7 gün` | Şerit dosyası "sebep + mesaj silme penceresi" diyor, liste vermiyor. Üst sınır sözleşmeden geliyor (`ServerBanSchema.deleteMessageSeconds` ≤ 604 800). `Silme` seçilirse alan gövdeye **hiç konmuyor** — `0` göndermek aynı sonucu verirdi ama "seçim yapılmadı" ile "sıfır saniye seçildi" ayrımı audit metadata'sında kaybolurdu |
| 2   | **Rol açılır düğmesi ile kesikli `+ Rol` düğmesi aynı menüyü açıyor.**                                                              | Tasarım iki düğme çiziyor ama tek bir rol listesi var; ikisine iki ayrı liste vermek aynı gerçeğin iki kopyası olurdu. Düğmeler görsel olarak referanstaki gibi ayrı duruyor                                                                                                                                                       |
| 3   | **Rol düğmesi rolü olmayan üyede `Rol yok` yazıyor, `@everyone` yazmıyor.**                                                         | `selectPrimaryRoleName` varsayılan rolü eliyor: herkesin taşıdığı bir rolü satırda yazmak bilgi taşımaz                                                                                                                                                                                                                            |
| 4   | **Presence noktası ikili.** `IDLE`/`DND` de `success` çiziliyor.                                                                    | SPEC §8.6 tablosu yalnız `çevrimiçi`/`çevrimdışı` veriyor ve referans veri dizisi `online` boolean'ı taşıyor (`dc.html:2650`). Üçüncü bir ton uydurmak tasarımın vermediği bir ayrım olurdu                                                                                                                                        |
| 5   | **İptal edilmiş kartın opaklığı `0.6`.**                                                                                            | Referans `opacity:{{ e.op }}` yazıyor ama veri dizisi yalnız `'1'` üretiyor — `İptal edilen` sekmesi demo veride boş. Tam opak bıraksak iki sekme aynı görünürdü; değer `settingsSections.eventsCancelledOpacity` altında ve **yalnız** orada                                                                                      |
| 6   | **`İptal edilen` sekmesindeki kartta `Düzenle` yok.**                                                                               | Uç `CANCELLED` bir satırı geri getirmiyor; düzenlenebilir görünen ama kaydedilemeyen bir kart en kötü hâl. `canEditServerEvent` bunu kilitliyor                                                                                                                                                                                    |
| 7   | **TR sözlüğüne 8 `_one` biçimi eklendi.**                                                                                           | `lib/locale/core.ts` "Türkçede `_one` yazılmaz" diyor, ama `messages.test.ts` iki dosyanın **anahtar kümesini** birebir eşit tutuyor. Mevcut sözlükteki düzen de böyle (`server.channel.userLimit.option_one` TR'de var ve tabanla aynı metni taşıyor); yeni anahtarlar aynı düzeni izliyor                                        |
| 8   | **Yasaklılar ve bekleyen davetler için ölçü referansta yok.**                                                                       | K3 yüzeyleri; SPEC onları kesikli çiple gösteriyordu. Satırlar `membersRow*`/`invitesRow*` ölçülerini yeniden kullanıyor, yalnız katlanır başlık için yeni ölçü açıldı (`settingsSections.collapsible*`) ve blok parity denetimine **girmiyor** — HTML'de eşleşecek satır yok, gerekçe sözlükteki yorumda                          |
| 9   | **Moderasyon menüsünün kabuğu `sidebar.menu*`'dan okunuyor.**                                                                       | Referansın tek menüsü sunucu menüsü; ikinci bir menü dili üretmek iki menüyü ilk düzenlemede ayrıştırırdı. Yeni olan yalnız genişlik, dikey kayma ve bölüm başlığı                                                                                                                                                                 |
| 10  | **Ş13'ün dört bölümü için üst dizin köprüsü yazılmadı.**                                                                            | Ş11 `channels`/`roles` için köprü açmıştı (iki yol bir süre birden arandı). Ş13'ün gövdeleri tek yolda (`sections/`) ve kabuk oradan `lazy` yüklüyor; ikinci yol ölü dosya olurdu                                                                                                                                                  |
| 11  | **`section-props.ts` iki alanla genişledi** (`currentUserId`, `permissions`).                                                       | Sözleşme "genişletilebilir ama daraltılamaz" diyor. §8.6'nın "kendine uygulanamaz" kuralı ve §8.9'un "sahip dışındaki üyeler" listesi izleyiciyi bilmeden verilemez                                                                                                                                                                |
| 12  | **`Sunucuyu sil` mağazadaki onay penceresini kullanmıyor.**                                                                         | SPEC §8.9 onay kutusunu **bölümün içine** koyuyor. `onOpenDeleteServer` prop'u sözleşmede duruyor (Ş11 kenar çubuğu menüsü için kullanıyor), tehlike bölümü kendi kutusuyla `DELETE`'i doğrudan çağırıyor                                                                                                                          |

Renk sapması **yok**: yeni hex, yeni tema sınıfı ve yeni token üretilmedi; bileşen testi
dört bölümün birleşik çıktısında `#rrggbb` ve `rgb()` aramasını sıfırla kilitliyor.

---

## 5. Doğrulama çıktısı

| Komut                                              | Sonuç                                     |
| -------------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @wizards/types test`                | ✅ **529 test**, 0 fail                   |
| `pnpm --filter @wizards/db test`                   | ✅ **146 test** (+ 25 şema testi), 0 fail |
| `pnpm --filter @wizards/web typecheck`             | ✅                                        |
| `pnpm --filter @wizards/web lint`                  | ✅ 10 config testi + `eslint .` temiz     |
| `pnpm --filter @wizards/web test` (üç parti, §5.1) | ✅ **6 930 test**, 0 fail                 |

### 5.1 Web süiti üç partide koştu

Ş2 §6.2'nin notu hâlâ geçerli: `run-node-tests.mjs` bu makinede tek çağrıda ilerlemeyi kesiyor.
Aynı dosyalar aynı bayraklarla üç partide sorunsuz koştu.

| Parti                                                                | Test                       | Sonuç      |
| -------------------------------------------------------------------- | -------------------------- | ---------- |
| `src/lib`                                                            | 4 167 (4 166 pass, 1 skip) | ✅         |
| `src/components`                                                     | 1 815                      | ✅         |
| `src/app` · `src/hooks` · `src/store` · `src/scripts` · `middleware` | 949                        | ✅         |
| **Toplam**                                                           | **6 931**                  | **0 fail** |

> `DATABASE_URL` verilmeden koşturulan parti 25 dosyada
> `DATABASE_URL is required for the PostgreSQL Prisma adapter.` ile düşüyor — runner değişkeni
> kendisi koyuyor, elle parti koşturan da koymalı. Bu 25 kırık Ş13'e ait değil ve değişken
> verildiğinde sıfırlanıyor.

### 5.2 Ş13'ün kendi testleri

```
src/lib/servers/member-moderation.test.ts                                   25/25 ✅
src/lib/servers/settings-invites.test.ts                                    14/14 ✅
src/lib/servers/settings-events.test.ts                                     12/12 ✅
src/lib/servers/danger-zone.test.ts                                          9/9  ✅
src/lib/servers/viewer-permissions.test.ts                                   6/6  ✅
src/components/shell/server-settings/sections/
  members-invites-events-danger.test.tsx                                    38/38 ✅
```

Negatif testler (00 §5):

| Test                                                  | Ne kilitliyor                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `**sahip olmayana hiç render edilmez**`               | `DangerSection` düz üye için `renderToStaticMarkup === ""`                                      |
| `yönetici bile olsa çizilmez`                         | `isAdmin: true` + tam yetki kümesi, `isOwner: false` → yine `""`; iki düğme metni de DOM'da yok |
| `MANAGE_INVITES yoksa bölüm hiç render edilmez`       | `InvitesSection` → `""`                                                                         |
| `MANAGE_EVENTS yoksa bölüm hiç render edilmez`        | `EventsSection` → `""`                                                                          |
| `sahibin satırında moderasyon menüsü düğmesi hiç yok` | `server-settings-member-menu-m-owner` DOM'da yok, `m-admin` var                                 |

### 5.3 Ş13'ün açtığı ve kapattığı 4 kırık

| Kırık                                                                   | Neden                     | Ne yapıldı                                                                                      |
| ----------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `messages.test.ts` — EN'de 8 `_one` anahtarı TR'de yok                  | Yeni çoğul biçimleri      | TR karşılıkları eklendi (sapma 7)                                                               |
| `server-settings-shell.test.tsx` — `currentUserId` eksik                | Prop sözleşmesi genişledi | Ş11'in testi iki render çağrısında alanı verecek şekilde güncellendi (Ş11 aynı anda güncelledi) |
| `react-hooks/purity` — `invites-section` render'da `Date.now()`         | Kalan süre hesabı         | `useState(() => Date.now())` + 30 sn'lik aralık                                                 |
| `react-hooks/set-state-in-effect` — ban penceresi ve etkinlik penceresi | Efektte durum sıfırlama   | Ban penceresi hedef kimliğiyle `key`leniyor; etkinlik formu türetiliyor (§3.6)                  |

### 5.4 Koşulamayan

- **E2E parity matrisi** (`e2e/specs/design/server-parity.spec.ts`) — Ş13 satırının `testId`'si
  (`server-settings-danger`) artık DOM'da **var**, ama sekiz gövde (4 çözünürlük × 2 tema) hâlâ
  `test.fixme`. Açmak tohumlanmış bir sunucu ve Playwright koşusu gerektiriyor; bu makinede
  doğrulanamayan bir test yazmak yerine satır Ş14'e bırakıldı (Ş3 §4 ve Ş9 ile aynı karar).
- **Tarayıcı doğrulaması** — Ş11 ve Ş12 aynı ağaçta hâlâ yazıyordu (§0); dev sunucusunu
  kaldırmak yarım bir kabuğu ölçmek olurdu. Dört bölümün render'ı SSR testleriyle kapsandı.

---

## 6. Sonraki şerit için notlar

1. **`ServerSettingsSectionProps` iki alan büyüdü** (`currentUserId`, `permissions`). Kaplamayı
   render eden her yeni çağıran `currentUserId` vermek zorunda; `wizards-shell` veriyor.
2. **Yetki kapısı yazan bölüm kapıyı kancalardan önce koysun** (§3.2). Gövdenin içine konmuş bir
   erken dönüş, negatif testi sahte bir sağlayıcı ağacına mahkûm eder.
3. **`workspaceQueryKeys.serverInvites` bekleyen listenin de önekidir.** Tek
   `invalidateQueries` çağrısı ikisini birden yakalar; bekleyen listeye ayrı bir geçersizleştirme
   yazan şerit iki kez tazeler.
4. **Ban ucu üye kimliği, ban kaldırma kullanıcı kimliği alır** (Ş2 §4 sapma 1). Yasaklılar
   listesindeki satırda `memberId` **yoktur** — üyelik silinmiştir.
5. **`server:settings:updated` dışında soket olayı yok.** Ban, zaman aşımı ve rol atama sonrası
   yüzey sorguyu geçersizleştiriyor; başka bir istemcide açık duran üye listesi kendiliğinden
   tazelenmez (Ş2 §5 TODO 5 hâlâ açık).
6. **Davet kullanım sayacı canlı değil** (Ş3 §4 TODO 1). Düz bir bağlantı harcandığında davet
   yöneticisine hiçbir şey gitmiyor; `3 / 25` ancak yeniden okumayla değişiyor. Şerit yeni olay
   açmadı — kapsamı "yeni uç yazılmaz" diyor. Karar Ş14'e kalıyor: ya `server:settings:updated`
   sunucu odasına genişletilir, ya çip bilerek pasif kabul edilir.
7. **Zaman aşımının üst sınırı hâlâ yok** (Ş2 §5 TODO 3). UI en fazla 1 hafta öneriyor ama uç
   serbest ISO alıyor; sınır isteyen sözleşmeye koymalı.
8. **Ses kanalında zaman aşımı hâlâ uygulanmıyor** (Ş2 §5 TODO 1, Ş7'nin açık ucu). Zaman aşımlı
   üye metin gönderemiyor ama sesli kanalda mikrofonunu açabiliyor; §8.6'nın çipi bu farkı
   anlatmıyor.
9. **`create-event-modal` artık düzenleme de yapıyor.** Pencereye alan ekleyen şerit, formun
   `override ?? türetilmiş taban` düzenini bozmasın: `setState` ile taban kopyalamak düzenlemede
   bir kademe geç doldurur.

# Dalga 3 kapısı · Ş11 — Parity, a11y, kırılım, performans, güvenlik · kapanış raporu

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** paket kapandı. Commit atılmadı.

Bu rapor on iki şerit raporunun üstüne yazılıyor ve paketi kapatıyor. İki şeyi ayrı tutuyor:
**ölçtüğüm** şeyler ve **ölçemediğim** şeyler. İkincisi az değil ve hepsi aşağıda adıyla yazılı.

---

## 0. Kapılar — ne koştu, ne koşmadı

| Kapı                                        | Sonuç                                                    |
| ------------------------------------------- | -------------------------------------------------------- |
| `pnpm --filter @wizards/web typecheck`      | **exit 0**, 0 hata                                       |
| `pnpm --filter @wizards/web test`           | **exit 0** · 8355 test · 8352 geçti · 0 hata · 3 atlandı |
| `pnpm --filter @wizards/types test`         | **623 / 623**                                            |
| `pnpm --filter @wizards/db test`            | **158 / 158**                                            |
| `npx eslint` (dokunulan 12 dosya)           | temiz                                                    |
| `npx prettier --check` (dokunulan 12 dosya) | temiz (`--write` uygulandı)                              |
| `pnpm --filter @wizards/web e2e`            | **KOŞULMADI** — gerekçe aşağıda                          |
| `pnpm --filter @wizards/web e2e:a11y`       | **KOŞULMADI** — aynı gerekçe                             |

**Taban:** koşuya başlarken 8344 test / 8341 geçti / 0 hata / 3 atlandı, exit 0. Bitişte
8355 / 8352 / 0 / 3, exit 0. Fark **+11 test**, hepsi bu şeridin yazdığı testler; tabandan
düşen test yok, kırılan test yok.

Son sayı **nihai ağaçtan** alındı: tam süit son değişiklikten sonra bir kez daha koştu
(`TEST_EXIT=0`). İlk doğrulama koşusu asıldı ve sebebi testler değildi — §9'a bakın.

### e2e neden koşmadı

`pnpm --filter @wizards/web e2e:check-env` üç zorunlu koşulu karşılamadığını söyleyip
**exit 1** verdi:

```
- E2E_TEST_MODE must be "true" before Playwright can reset test data.
- E2E_DATABASE_URL or DATABASE_URL is required for Playwright reset/seed operations.
- E2E_TEST_PASSWORD is required and must be generated locally/inside CI.
  Hint: Do not add fallback passwords to source code.
```

Ayrı bir e2e veritabanı, çalışan bir sunucu ve **yerelde üretilmesi gereken** bir test parolası
istiyor. Üçünü de bu oturumda kurmadım; parolayı uydurmak preflight'ın açıkça yasakladığı şey.
Dolayısıyla §2'nin durum matrisi, §3'ün axe taraması ve §4'ün altı çözünürlüklü matrisi
**hiçbir tarayıcıda çalıştırılmadı**. Yazdığım iki spec dosyası `typecheck`ten geçiyor ve
kullandıkları her `data-testid` bileşen kaynağında **tek tek doğrulandı**, ama çalıştırılmadılar.
Bunu "geçti" diye okumayın.

**Sonuç olarak bu raporun parity bölümü piksel karşılaştırması değil**, kaynak + ölçü sözlüğü +
`Mesajlar.dc.html` inline değeri karşılaştırmasıdır. 22 PNG ile ekran görüntüsü karşılaştırması
yapılmadı.

---

## 1. 22 ekranın parity durumu

Sütunlar: **nasıl doğrulandı** ve **sonuç**. "Statik" = kaynak, `MESSAGES_METRICS` ve
`Mesajlar.dc.html` üçlü karşılaştırması. Hiçbiri tarayıcıda açılmadı.

### §1–§14 (ekran 01–12) — yalnız doğrulama, düzeltme yapılmadı (kapsam kuralı)

| #   | Ekran              | Nasıl  | Sonuç                                                                      |
| --- | ------------------ | ------ | -------------------------------------------------------------------------- |
| 01  | Arkadaşlar · Tümü  | statik | **geçti** — sapmalar `SPEC_DEVIATIONS`'ta kayıtlı, yenisi çıkmadı          |
| 02  | Bekleyen istekler  | statik | **geçti**                                                                  |
| 03  | Engellenenler      | statik | **geçti**                                                                  |
| 04  | Arkadaş ekle       | statik | **geçti**                                                                  |
| 05  | DM sohbeti         | statik | **geçti**                                                                  |
| 06  | Grup sohbeti       | statik | **geçti**                                                                  |
| 07  | Thread paneli      | statik | **açık kaldı** — §2 tek-yuva kuralı (aşağıda A1)                           |
| 08  | Mesaj arama        | statik | **açık kaldı** — A1 + dört `TODO(api)` (A6)                                |
| 09  | Yeni grup · adım 1 | statik | **geçti**                                                                  |
| 10  | Yeni grup · adım 2 | statik | **geçti**                                                                  |
| 11  | Anket oluştur      | statik | **geçti** — `message-poll.tsx` iki arbitrary `rounded-[…rem]` taşıyor (A5) |
| 12  | Boş durum          | statik | **geçti**                                                                  |

### §15–§17 (ekran 13–22) — bulunan sapma düzeltildi

| #   | Ekran                                   | Sonuç                                                                                                                                   |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | DM `...` menüsü                         | **sapma düzeltildi (2) · açık kaldı (2)** — presence alt satırı ve iki ölü satır düzeltildi; `Kullanıcıyı engelle` ve `Bildir` hâlâ ölü |
| 14  | Grup `...` menüsü                       | **açık kaldı** — dört satır ölü, `Sabitlenen mesajlar` sayaçsız (A2)                                                                    |
| 15  | Kullanıcı profili · Genel               | **sapma düzeltildi (2)** — ikon 15→16, kapat düğmesinin adı                                                                             |
| 16  | Kullanıcı profili · Genel (kaydırılmış) | **sapma düzeltildi (1)** — önizleme sınırı sözlükten okunuyor                                                                           |
| 17  | Kullanıcı profili · Medya               | **geçti** — `mediaTileIconSize` 18 doğru; sıçrama maddesi §4'e ait (D6)                                                                 |
| 18  | Kullanıcı profili · Ayarlar             | **geçti** — `dangerIconSize` 16 doğru; sebep seçici maddesi ürün eksiği (D6/D11)                                                        |
| 19  | Grup profili · Genel                    | **sapma düzeltildi (2)** — ikon 15→16, kapat adı; `pinIconSize` 13 doğru                                                                |
| 20  | Grup profili · Üyeler                   | **açık kaldı** — üye satırı tıklanamaz (D5)                                                                                             |
| 21  | Grup profili · Ayarlar                  | **açık kaldı** — ayrılma/silme sonrası rota değişmiyor (D12)                                                                            |
| 22  | Üye ekle penceresi                      | **açık kaldı** — süre kalıcı değil (D9), aday satırında son görülme yok (D7)                                                            |

### Düzeltilen altı sapma — tek tek

1. **§15.1 · ikon-only aksiyon düğmesinin ikonu 15px'ti, `dc.html` 16 çiziyor.**
   `dc.html` L970/L990 birincil düğmeyi **15**, L972/L974/L992/L994 ikon düğmelerini **16**
   çiziyor; sözlükte tek bir `actionIconSize` vardı ve ikisini birden yönetiyordu (07-rapor
   §6.1.2 bunu bilerek kabul etmişti). Sözlüğe `profilePanel.actionIconButtonIconSize: 16`
   eklendi, `profile-panel-identity.tsx` ikon düğmelerinde onu okuyor. **Ekran 15 ve 19.**

2. **§15 · panelin kapat düğmesi `Paneli kapat` diyordu.** Sözlükteki
   `messages.profile.close` ("Profili kapat") ölüydü (07-rapor §6.2). `MessagesSidePanel`
   opsiyonel bir `closeLabel` prop'u aldı; verilmezse eski etiket. Thread ve arama panelinin
   davranışı **birebir aynı** kaldı. **Ekran 15, 16, 17, 18, 19, 20, 21.**

3. **§17 · DM menüsünün alt satırı her zaman `Çevrimdışı` diyordu.** `presence` prop'u
   bağlanmamıştı ve bileşen varsayılan olarak `offline`a düşüyordu — başlıkta `Çevrimiçi`
   yazan biri, iki santim yanında açılan menüde çevrimdışı görünüyordu. Sayfa artık
   `toMessagesPresence(otherParticipant?.status)` geçiriyor; dönüşüm sohbet rayıyla **aynı**
   yardımcıdan. **Ekran 13.**

4. **§17 · `Okunmadı olarak işaretle` satırı ölüydü.** `useDMConversations.markAsUnread`
   bağlandı (rayın satır menüsüyle aynı mutasyon; ikinci bir istemci açılmadı). Başarıda
   `messages.toast.markedUnread`, hatada `actionFailed`. **Ekran 13.**

5. **§17 · `Arşivle` satırı ölüydü.** `useDMConversations.hideConversation` bağlandı.
   Başarıda toast **ve** `/messages`e dönüş: arşivlenen sohbet raydan düşüyor ama konuşma
   sorgusunun önbelleği dolu kaldığı için sayfa açık kalıyordu — kullanıcı artık listede
   olmayan bir sohbete bakardı. **Ekran 13.**

6. **§15.3.5 · `MUTUAL_FRIEND_PREVIEW_LIMIT` sözlüğü kopyalıyordu.** Dalga 0
   `profilePanel.mutualFriendPreviewLimit: 4` kaydını açmıştı; bileşen paralel koşu yüzünden
   kendi `= 4` sabitini taşıyordu (08-rapor §5.6, açık madde). Aynı sayının iki evi kapandı.
   **Ekran 16.**

Altısının da testi var (§8).

---

## 2. §1–§14'te bulunup **kapsam dışı** bırakılanlar

Bunlar bu paketin kapsamı değil (00 §2). Bulundu, yazıldı, düzeltilmedi.

**A1 — İki sağ panel aynı anda açık kalabiliyor. En ağır bulgu.**
SPEC §2 ve K5 "thread · arama · profil **tek yuva**" diyor. Reducer bu kuralı doğru uyguluyor
ve `messages-screen.ts`'in 34 testi onu doğruluyor — ama kuralın geçerli olduğu eksende
**yalnız profil** yaşıyor. Thread ve arama `ChatArea`'nın kendi `useState`'lerinde
(`selectedThread`, `showSearch`, `chat-area.tsx:449` ve `:487`); `ChatArea` arama açarken
sayfanın reducer'ına hiçbir şey bildirmiyor. 1360'ta profil paneli varsayılan açık olduğu için
başlıktaki arama ikonuna basmak **iki paneli yan yana** çiziyor: 340 + 330 = 670px, ana alana
`730 − 670 = 60px` kalıyor ve sözlük `mainMinWidthWithPanel: 390` diyor.

Kapatması `ChatArea`'ya bir `onSidePanelChange` prop'u ve `DMConversationPage`'in o haberi
`closePanel`e çevirmesi. `components/chat/**` §1–§14'ün ve benim yazma listemde değil.
**Tahmin: 3–4 saat.**

Ek kanıt: mevcut `e2e/specs/design/messages-parity.spec.ts` bu durumu zaten yakalardı —
`conversation-search` durumunda `page.locator("[data-messages-side-panel]").boundingBox()`
iki eşleşmeyle Playwright strict-mode ihlali verirdi. Matris koşulamadığı için sessiz kaldı.

**A2 — `railDrawerBelow: 960` sözlükte var, hiçbir bileşen okumuyor.**
`MESSAGES_METRICS.layout.railDrawerBelow` yalnız `metrics.test.ts` ve `mentions/metrics.test.ts`
içinde geçiyor. Ürün rayı 960'ta drawer'a taşımıyor; kabuğun `md:hidden` (768) eşiği devrede.
Görev tanımının §4 tablosundaki "<960 sohbet rayı drawer'a taşınıyor (`MobileDrawerTrigger`)"
satırı üründe **karşılıksız**: `MobileDrawerTrigger` kabuğun çalışma alanı çekmecesidir
(`server-rail.tsx:482`), sohbet rayınınki değil. **Tahmin: ölçmek 1 saat, uygulamak 1 gün.**

**A3 — Sağ panel yuvası için iki farklı eşik.**
Thread ve arama `sidePanelOverlayBelow: 1100`'ü okuyor (`chat-area.tsx:343`); profil paneli
kabuğun `shouldUseInfoDrawer` eşiğini (`RESPONSIVE_BREAKPOINTS.supportPanel = 1280`)
paylaşıyor (`dm-conversation-page.tsx`). Aynı yuva, iki sayı. 1100–1280 arasında arama paneli
yerleşik, profil paneli çekmece.

**Not: 1280 muhtemelen doğru olan sayı, 1100 değil.** K3 gezinme panelini 280'de tuttu;
74 + 280 + 276 = 630px sabit kolon demek. 1100'de ana alana 470px kalıyor, 330'luk panelden
sonra 140px — `mainMinWidthWithPanel` 390 diyor. Yani sözlükteki 1100, SPEC'in 228'lik nav
paneli varsayımından geliyor. Karar §1–§14'ün; ikisinin **aynı** sayı olması gerektiği kesin.
**Tahmin: karar 1 saat, uygulama 1 saat.**

**A4 — Dört ölü ihracat hâlâ ölü** (07-rapor §6.4, doğrulandı — her biri yalnız kendi
dosyasında geçiyor): `getDmStatusDotClass` / `getDmStatusKey` (`components/dm/dm-conversation.tsx`),
`GroupIconField` (`components/dm/group-icon-field.tsx`), `useGroupConversationMutations`
(`hooks/use-group-conversation.ts`), `fetchDMMutualServers` + `dmQueryKeys.mutualServers`
(`lib/dm/client.ts`). Repoda ölü-ihracat kapısı yok, `lint` ve `typecheck` şikâyet etmiyor.
**Tahmin: 1 saat.**

**A5 — `message-poll.tsx` iki arbitrary Tailwind değeri taşıyor** (`rounded-[0.3rem]`,
`rounded-[0.15rem]`). Kural 2 çıplak px yasaklıyor; bunlar `rem` ve ölçekle büyüyor, yani
kuralın ruhunu çiğnemiyorlar ama sözlükte karşılığı yok. §5.5, kapsam dışı. **Tahmin: 30 dk.**

**A6 — Mesaj arama panelinin dört `TODO(api)`'si.** `lib/messages/search-filters.ts:14,15,17,23`:
`İÇERİYOR` çipleri (`Dosya` / `Bağlantı` / `Görsel` / `Sabitlenmiş`) uçta karşılıksız, ve
`Yalnızca thread yanıtlarında ara` sorgunun şekli gereği **imkânsız** (dosyanın kendi yorumu
"eksik değil, imkânsız" diyor). §6.2, kapsam dışı. **Tahmin: çipler 1 gün; thread anahtarı
önce bir sorgu kararı ister.**

`components/messages/**` içinde §15–§17 dosyalarında **sıfır** çıplak px ve sıfır hex bulundu
(`grep -rnE '\[[0-9.]+(px|rem|em)\]|#[0-9a-fA-F]{3,8}'`). Kural 2 profil panelinde temiz.

---

## 3. Devredilen on üç açık — önem sırasıyla

Her madde: **hâlâ geçerli mi**, **kanıt**, **iş tahmini**.

### P1 — Gizlilik

**D1. `historyVisibility: "ALL"` grubunda temizlenen geçmiş yeni üyeye görünüyor.**
✅ Hâlâ geçerli. `resolveHistoryFloor` temizlemeden **sonra** katılan üyeye taban vermiyor
(`null` dönüyor), o da `toHistoryWindowFilter` üzerinden "sınırsız geçmiş" demek. Gerekçe
03-rapor §2'de, kod yorumunda da yazılı. Kapatması konuşma seviyesinde bir
`DMConversation.historyClearedAt` kolonu + migration + `resolveHistoryFloor`'un iki kaynağın
**büyüğünü** alması. Listedeki tek **veri sızıntısı**; bir yönetici "geçmişi temizledim"
dedikten sonra davet ettiği kişi o geçmişi görüyor.
**Tahmin: 0,5–1 gün** (migration + servis + üç kip için test).

### P2 — Ürünün yalan söylediği yerler

**D12. `Gruptan ayrıl` / `Grubu sil` sonrası rota değişmiyor.**
✅ Hâlâ geçerli. `profile-tab-settings.tsx` içinde `useRouter` / `replace(` **hiç geçmiyor**
(10-rapor §5.10). Kullanıcı silinmiş bir sohbetin sayfasında kalıyor. Doğru evi
`DMConversationPage` (bu tur `Arşivle` için tam olarak bu yapıldı — emsal kodda duruyor:
`archiveConversation`). Sekmeye bir `onLeft` / `onDeleted` kancası, sayfada `router.replace`.
**Tahmin: 2 saat.**

**D2 (menü). §17'nin altı satırı hâlâ ölü — bu turda dördü kapandı, altısı kaldı.**
✅ Hâlâ geçerli (kısmen kapandı). `ConversationMoreMenu` satırları **her koşulda** çiziyor:
`onClick={handlers[entry.action]}` `undefined` gelirse satır ekranda durur ve hiçbir şey yapmaz
(`conversation-more-menu.tsx:634`). Bu tur `onMarkUnread`, `onArchive` bağlandı ve `presence`
düzeltildi. Bağlanmayanlar:

| Satır                 | Prop                         | Neden bu turda bağlanmadı                                                                             |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Kullanıcıyı engelle` | `onBlockUser`                | onay diyaloğu + mutasyon `profile-tab-settings.tsx`'te zaten var; ikinci kopya ikinci otorite demek   |
| `Bildir`              | `onReportUser`               | aynı                                                                                                  |
| `Geçmişi temizle`     | `onClearHistory`             | aynı                                                                                                  |
| `Gruptan ayrıl`       | `onLeaveGroup`               | aynı                                                                                                  |
| `Grubu sil`           | `onDeleteGroup`              | aynı                                                                                                  |
| `Sabitlenen mesajlar` | `onOpenPins` + `pinnedCount` | pin yüzeyi `ChatArea`'nın içinde (`setPinnedSheetOpen`); sayfaya taşımak `chat-area.tsx`'e prop ister |

Doğru kapatma: yıkıcı beşlisi için `profile-danger-actions.tsx`'in onay + mutasyon yüzeyini
dışa açıp menüden tetiklemek (iki yüzey **tek** mutasyonu paylaşsın), pin için `ChatArea`'ya
`onOpenPins` / `pinnedCount` köprüsü. Bu turda yeni test bağlamayı kaynaktan kilitliyor
(`dm-conversation-page-bindings.test.ts`), yani bir sonraki bağlama sessizce eksik kalamaz.
**Tahmin: yıkıcı beşli 4 saat, pin 1 saat.**

**D10. Ayarlar ekranının `settings.row.g6` satırı hâlâ eşlenmemiş.**
✅ Hâlâ geçerli. `components/settings/sections/account/account-surface.ts:139` `TODO(api)`
yorumuyla `g6`yı `unmapped` listesine atıyor; kullanıcı o anahtarı çevirdiğinde sunucuya
**hiçbir şey gitmiyor**, yerel olarak `true` varsayılıyor. Profil panelinin gizlilik kartı
ise gerçek kolonu okuyup yazıyor (`MESSAGING_PRIVACY_QUERY_KEY`, ilk web tüketicisi).
İki yüzey aynı tercihi iki farklı değerde gösterebiliyor. Ayrıca `Yazıyor göstergesi` satırı
Ayarlar ağacında **hiç yok**, oysa kolon (`showTypingIndicator`, K9) ve uç var.
**Tahmin: 2 saat** (g6'yı `updateMessagingPrivacyRequest`'e bağla + ağaca bir satır ekle).

**D9. `GroupInvite.expiresAt`'i yazan yol yok.**
✅ Hâlâ geçerli. `TODO(api)` yorumu `add-members-modal.tsx:339`'da duruyor.
`GroupInviteSettingsRequestSchema` `{ enabled: boolean }` `.strict()`; `upsertInvite`'ın girdi
tipi `expiresAt` taşımıyor; kolon yalnız **okunuyor**. §16'nın `7 gün` · `1 gün` · `Süresiz`
segmenti görsel olarak SPEC'e uygun ama davranışı bir istemci tercihi — sayfa yenilenince
kayboluyor. Doğru düzeltme `PATCH …/invite` gövdesine bir `expiresAt` alanı; **rotate değil**
(rotate yapıştırılmış her kopyayı öldürür). **Tahmin: 3 saat.**

**D5. `onSelectMember` bağlanmadı — üye satırları tıklanamaz.**
✅ Hâlâ geçerli. `conversation-profile-panel.tsx` kancayı gövdeye **iletiyor** (Ş5'in borcu
kapanmış, testi de var), ama `dm-conversation-page.tsx`'in `profilePanelProps`'unda
`onSelectMember` **yok**. Ş7 bilerek "kanca yoksa satır `button` değil `div`" diye yazmış,
yani ölü hedef yok — ama §15.4'ün "üyeye tıkla" davranışı da yok. Kapatması bir **kullanıcı
kapsamlı** profil yüzeyi ister; panel bugün sohbet kapsamlı (`conversationId` → DM profil ucu).
**Tahmin: 4 saat** (kullanıcı profil paneli kolu + rota kararı).

**D11. `Bildir` sebep seçmiyor, `reason: "other"` gönderiyor.**
✅ Hâlâ geçerli — `profile-tab-settings.tsx:515`. Tasarımda sebep seçici **yok** (`dc.html`
L1276 tek satır), sözlükte de beş sebebin karşılığı yok. Moderasyon tarafında her bildirim
"diğer" olarak düşüyor, yani triyaj sinyali kayboluyor. Kapatması önce beş i18n anahtarı,
sonra bir seçici. **Tahmin: 2 saat.**

**D6. Medya karosundan mesaja sıçrama `<1280` çekmecesinde örtünün arkasına düşüyor.**
✅ Hâlâ geçerli. `profile-tab-media.tsx:102` `openMessage`'ı `jumpToMessageInDocument`'a
düşürüyor ve sayfa `onOpenMessage` vermiyor; dar görünümde panel mesaj listesinin **üstünde**
bir çekmece, dolayısıyla sıçrama görünmüyor. İki doğru cevaptan biri: çekmece
`onOpenMessage`'ta kapansın, ya da karolar dar görünümde sıçramasın. Birincisi daha iyi.
**Tahmin: 1 saat.**

**D4. Sohbet rayının DM avatarı hâlâ gri.**
✅ Hâlâ geçerli. `ConversationRowDTOSchema` (`packages/types/src/messages-screen.ts:411`)
karşı taraf kimliği taşımıyor; `tileColor` yalnız grup swatch'ı ve 1:1'de `null`.
`toConversationRow` karşı tarafı zaten buluyor (presence'ı ondan türetiyor) ama DTO'ya
koymuyor. §15.1'in "karo rengi sohbet rayındaki tile rengiyle aynı kaynaktan gelir" cümlesi
bugün **tek yönlü** doğru: panel doğru kaynağı okuyor, ray okumuyor.
Kapatması `ConversationRowDTO`'ya bir `tint: ProfileTintSchema` (ya da `counterpartId`) alanı,
sonra ray satırının DM kolunda `profileTintSurface` / `profileTintForeground`.
**Tahmin: 2 saat.**

**D7. `InviteCandidateDTO.lastSeenAt` yok.**
✅ Hâlâ geçerli. Şema tam olarak altı alan taşıyor: `initials, name, presence, statusText,
tint, userId` (`messages-screen.ts:853`). §16'nın `2 saat önce görüldü` / `Dün 23:10` /
`3 gün önce` satırları çizilemiyor; satır bugün `statusText ?? presence sözcüğü` basıyor.
Servis tarafı hazır — `redactPresenceCollectionForViewer`'ın üçüncü argümanı zaten yerinde
(11-rapor §6.3). **Tahmin: 2 saat.**

### P3 — Araç ve borç

**D2b. `privacy-service.test.ts` açık handle bırakıyor — teşhis YANLIŞTI, düzeltildi.**
✅ Hâlâ geçerli, ❌ **sebebi devir notunda yazan şey değil.** Ölçtüm:

```
node --import tsx --test src/lib/account/privacy-service.test.ts   → timeout (exit 124, 90 sn)
node --import tsx --test src/lib/admin/capabilities.test.ts        → exit 0
node --import tsx --test src/lib/auth/utils.test.ts                → exit 0
```

Yani `prisma` import eden her test asılmıyor; bu dosyaya özgü. Ama sebep **60 saniyelik
gizlilik önbelleği zamanlayıcısı değil**: `createMessagePrivacyCache`
(`lib/messages/typing-visibility.ts:100`) hiç zamanlayıcı kurmuyor, tembel bir TTL
karşılaştırması yapıyor. `unref()` edilecek bir şey yok.

Gerçek sebep, açık kalan kaynağı sorarak bulundu:

```
ACTIVE_RESOURCES=["PipeWrap","PipeWrap","TCPSocketWrap"]
```

Bir **TCP soketi** — zamanlayıcı değil. Kaynağı: testin `anonymizeAccount("user-1", …)`
çağrıları (`privacy-service.test.ts:322` ve `:380`); `anonymizeAccount` içeride `getRedis()`
çağırıyor ve o da tembel bir ioredis istemcisi kuruyor (`lib/redis.ts:75-84`), istemci hiç
kapanmıyor. Modülü **yalnız import etmek** temiz çıkıyor (ölçüldü), yani sızıntı testin
gövdesinde.

**Ve bu sızıntı bu paketten önce de vardı:** `git show HEAD:…privacy-service.test.ts` içinde
`anonymizeAccount(` zaten **iki kez** geçiyor. Ş4 dosyaya yalnız ~102 satır gizlilik testi
ekledi. Yani madde Dalga 1'in değil, kod tabanının.
Doğru kapatma: `getRedis`'i `AnonymizeAccountDependencies`'e bir seam olarak eklemek (fonksiyon
zaten bir `dependencies` argümanı alıyor) ya da testte `after()` ile `quit()` çağırmak.
**Tahmin: 1 saat.**

**D3. `route-contract.test.ts` takma adlı `route-logic` import'unu yakalamıyor.**
✅ Hâlâ geçerli, ve sayı doğru: tarama **10** rota buldu.

```
admin/servers/route.ts · admin/servers/[serverId]/route.ts ·
admin/servers/[serverId]/recount/route.ts · mobile/account/badges/route.ts ·
mobile/account/sessions/route.ts · mobile/account/sessions/[sessionId]/route.ts ·
mobile/account/sessions/revoke-others/route.ts · users/me/badges/route.ts ·
users/[userId]/badges/route.ts · mobile/users/[userId]/badges/route.ts
```

`readRouteContractSource` (`route-contract.test.ts:1476-1496`) mantık dosyasını
`path.resolve(routeDirectory, spec + ".ts")` ile arayıp `existsSync` ile süzüyor; takma ad
hiçbir zaman çözülmez ve **sessizce elenir**. Aynı göreli-yol çözümü `:1285` ve `:1320`'de
de var (rate-limit ve parser analizi). **Bugünkü patlama yarıçapı sıfır:** on rotanın onu da
kendi `route.ts` metninde bir kimlik kapısı çağırıyor, o yüzden süit yeşil — ama **kanıtla
değil, şansla** yeşil. Biri `dependencies.authenticate()` kalıbına geçerse sayımdan düşer ve
hiçbir test kırılmaz. Dalga 1'in on iki ucunun **hiçbiri** etkilenmiyor (üçü de göreli yol
kullanıyor, gerekçesi dosya başında yazılı).
Doğru kapatma: dosyanın zaten kurduğu `ts.Program`'ı (`:1500-1513`, tsconfig `paths` ile)
bu birleştirme adımında da kullanmak. **Tahmin: 2 saat.**

**D8. `Sohbeti dışa aktar` satırı gizli — ürün karşılığı yok.**
✅ Hâlâ geçerli ve **karar doğru**. `GET /api/v1/users/me/data-export` hesabın tamamını verir,
`conversationId` parametresi almaz. Satır pasif değil, **hiç** çizilmiyor: yapamadığı bir şeyi
vaat eden gri bir satır da kullanıcıya o özelliğin var olduğunu söyler. Geri gelmesi tek prop
(`onExportConversation`); `messages.more.dm.export` ve `messages.toast.exportStarted`
anahtarları sözlükte duruyor. **Tahmin: özellik istenirse 1 gün; bugünkü hâli için 0.**

**D13. Kalan `TODO(api):` işaretleri — sayıldı, §15–§17'de yalnız iki tane.**
✅ Doğrulandı, sayılarla. `apps/web/src` genelinde **52** `TODO(api)` var; Mesajlar'ın
yüzeylerinde (`components/messages`, `components/dm`, `lib/dm`, `lib/messages`) **6** tanesi:

| Konum                                                 | Hangi bölüm          | Durum                                                |
| ----------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| `add-members-modal.tsx:339`                           | §16                  | = **D9** (`GroupInvite.expiresAt` yazılamıyor)       |
| `privacy-settings-card.tsx:37`                        | §15.5                | = **D10**'a işaret ediyor (`account-surface.ts:139`) |
| `lib/messages/search-filters.ts:14,15,17,23` (4 adet) | **§6.2 mesaj arama** | §1–§14, **kapsam dışı**                              |

Yani §15–§17'de kalan iki `TODO(api)` zaten D9 ve D10; üçüncü bir açık yok. Dört tanesi
mesaj arama panelinin (`İÇERİYOR` çipleri uçta karşılıksız, "yalnızca thread yanıtlarında ara"
sorgu şekli gereği imkânsız) ve bu paketin kapsamında değil — **§1–§14 bulgusu olarak
kayda geçiyor** (bkz. §2, ekran 08).

Kalan 46'sı Etkinlikler, Ayarlar, Keşfet, Masaüstü ve Sunucu paketlerinin.

Ayrıca **`TODO(rate-limit)` sıfır** — Ş2'nin ve Ş10'un istediği üç kova
(`dm:group:clear-history` 10/saat, `dm:group:delete` 5/saat, `dm:group:candidates` 60/dk)
`api-rate-limit.ts`'e girmiş ve doğrulandı. **Tahmin: 0.**

---

## 4. Performans — ölçülen ve ölçülemeyen

Görev §5'in altı maddesinden **ikisi** ölçüldü, biri yapısal olarak doğrulandı, üçü
ölçülemedi. Tarayıcı ve React Profiler gerektiren hiçbir ölçüm yapılmadı.

| Madde                                                            | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seçilmeyen sekmenin sorgusu koşmuyor                             | ✅ **Doğrulandı** — bir `enabled` bayrağıyla değil **montajla**: `ProfileTabGeneral` varyanta göre iki ayrı bileşenden birini çiziyor, DM sorgusu grup kolunda hiç kurulmuyor. Testi `queryCache.find(...) === undefined` ile kilitliyor (`profile-tab-general.test.tsx`).                                                                                                                                                                                                                                                                                      |
| Medya ızgarası `loading="lazy"`                                  | ✅ **Doğrulandı** — `profile-media-grid.tsx:109`. 18 karo iddiası zaten yanlış: ızgara hiçbir koşulda `PROFILE_MEDIA_PREVIEW_COUNT = 6` karodan fazlasını **çizmiyor**, `+12` bir örtü. Yani ilk boyada 6 `<img>` var ve altısı da lazy.                                                                                                                                                                                                                                                                                                                        |
| Toast zamanlayıcısı unmount'ta temizleniyor                      | ✅ **Doğrulandı** — `use-conversation-toast.test.ts` sahte saatle 8 test; bağımlılık kaydın **kendisi**, `null` kayıt zamanlayıcı kurmuyor, efektin dönüşü `clearTimeout`. Süit hiç gerçek zamanlayıcı kurmadığı için bu dosya izole koşuda handle bırakmıyor.                                                                                                                                                                                                                                                                                                  |
| Ray ve mesaj listesi `Skeleton` davranışı                        | ✅ **Bozulmadı** — `messages-rail.test.tsx` ve `message-list-skeleton.test.tsx` tam süitte yeşil.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Profil paneli açılışı mesaj listesini yeniden render **etmiyor** | ❌ **ÖLÇÜLEMEDİ.** React Profiler tarayıcı ister. Yapısal not: ne `ChatArea` (`chat-area.tsx:286`) ne `MessageList` (`message-list.tsx:139`) `React.memo` ile sarılı ve `MessageList` derleyici memoizasyonundan **açıkça çıkıyor** (`"use no memo"`, `:162`). `reactCompiler: true` (`next.config.ts:107`) açık, yani garanti tamamen React Compiler'ın `ChatArea` içindeki `<MessageList …>` JSX'ini önbelleğe almasına ve prop'ların referansça sabit kalmasına bağlı. Bu iddia ancak Profiler'la kanıtlanır. **Ölçülmedi diye okuyun, "geçti" diye değil.** |
| Menü açılışı ana iş parçacığını 16 ms'ten uzun bloke etmiyor     | ❌ **ÖLÇÜLEMEDİ.** Performance API ölçümü tarayıcı ister. Yapısal not: `ConversationMoreMenu` hiçbir istek atmıyor, hiçbir React Query anahtarına dokunmuyor, sayaçları prop olarak alıyor (11-rapor §6.8) — yani açılışta veri işi yok.                                                                                                                                                                                                                                                                                                                        |

---

## 5. Erişilebilirlik

`e2e:a11y` **koşulamadı** (bkz. §0). Statik olarak doğrulanan:

| Kural                                                                                         | Sonuç                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anahtarlar gerçek `role="switch"` + `aria-checked`                                            | ✅ `privacy-settings-card.tsx:188,199`                                                                                                                                     |
| Bildirim kartları `radiogroup` + `radio`                                                      | ✅ `notification-choice-cards.tsx:130,141,167`                                                                                                                             |
| `KİMLER ÜYE EKLEYEBİLİR` segmenti `radiogroup`                                                | ✅ `profile-tab-settings.tsx:267,284,312`                                                                                                                                  |
| Davet süre segmenti `radiogroup`                                                              | ✅ `invite-link-box.tsx:185,198,212`                                                                                                                                       |
| Menü `role="menu"`, satırlar `menuitem*`                                                      | ✅ `context-menu.tsx:178,224`; seçici `menuitem` + `menuitemradio` + `menuitemcheckbox`                                                                                    |
| Alt menü süre satırları `menuitemradio` + `aria-checked`                                      | ✅ `mute-submenu.tsx:180,190`                                                                                                                                              |
| Aday listesi `listbox` / `option`                                                             | ✅ `add-members-modal.tsx:649`, `invite-candidate-row.tsx:87`                                                                                                              |
| Toast `role="status"` + `aria-live="polite"`                                                  | ✅ `conversation-toast.tsx:157,161`; kapat düğmesi `aria-label` taşıyor                                                                                                    |
| Presence noktasının metin karşılığı                                                           | ✅ `PresenceDot` kendi `sr-only` metnini taşıyor; profil paneli `profile-panel-presence-label`                                                                             |
| Panel yerleşikken `complementary`, çekmecede `dialog` + `aria-modal`                          | ✅ `messages-side-panel.tsx:136,151`                                                                                                                                       |
| `Esc` sırası bir tuş bir katman                                                               | ✅ **kaynakta** — menü açıkken `window`a **capture** fazında dinleyici kuruluyor ve `Esc`i `stopPropagation` ile durduruyor (11-rapor §6.2). Tarayıcıda doğrulanmadı.      |
| `prefers-reduced-motion`                                                                      | ✅ anahtar topuzu `motion-safe:transition-[left]`, toast `usePrefersReducedMotion`, anket çubuğu `motion-safe:transition-[width]`, çekmece `motion-reduce:transition-none` |
| Kapat düğmesinin adı panele özel                                                              | ✅ **bu turda düzeltildi** (§1.2)                                                                                                                                          |
| Kontrast (koyu **ve** açık tema, danger satır, muted alt metin, `Aktif` pill'i, seçili sekme) | ❌ **ÖLÇÜLEMEDİ** — axe taraması koşmadı. Bileşenler yalnız token kullanıyor ve yeni renk açılmadı, ama bu kontrastın geçtiğini kanıtlamaz.                                |
| Tam klavye turu (başlık → menü → alt menü → panel → sekmeler → modal)                         | ❌ **ÖLÇÜLEMEDİ** — spec yazıldı, koşulmadı.                                                                                                                               |

`e2e/specs/a11y/messages-a11y.spec.ts`'e üç blok eklendi (profil paneli + menü + alt menü axe
taraması iki temada, ARIA rol sözleşmesi, menü kapanınca odağın tetikleyiciye dönmesi). Hepsi
`typecheck`ten geçiyor ve kullandıkları `data-testid`'lerin tamamı kaynakta doğrulandı —
**ama hiçbiri çalıştırılmadı.**

---

## 6. Güvenlik gözden geçirmesi — Dalga 1'in **her** ucu tek tek

12 uç incelendi. **Kritik bulgu yok: eksik kimlik kapısı yok, eksik hız sınırı yok,
istemciden okunan rol yok, PII sızıntısı yok.**

| #   | Uç                                  | Kimlik | Kova                                                     | zod                                                            | Sunucu tarafı yetki                                                                            | Denetim                                                                | Yanıt kapısı                                                      |
| --- | ----------------------------------- | ------ | -------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `dm/[id]/profile` GET               | ✅     | `dm:conversation:read` 120/60                            | ✅ (param şeması `.strict()` değil)                            | ✅ katılımcı, 403; `GROUP_DM` reddi                                                            | —                                                                      | ✅ `.strict()`                                                    |
| 2   | `mobile/dm/[id]/profile` GET        | ✅     | `mobile:dm:details` 60/60                                | ✅                                                             | ✅ ortak gövde                                                                                 | —                                                                      | ✅ `.strict()`                                                    |
| 3   | `dm/groups/[id]/profile` GET        | ✅     | `dm:group:read` 120/60                                   | ✅ `.strict()`                                                 | ✅ `requireGroupProfileContext`                                                                | —                                                                      | ⚠️ **şema ile yeniden parse edilmiyor**                           |
| 4   | `dm/groups/[id]/members` GET        | ✅     | `dm:group:read`                                          | ✅ `.strict()`, limit ≤ 250                                    | ✅ aynı kapı                                                                                   | —                                                                      | ⚠️ **`GroupMemberPageSchema` çalışma zamanında hiç uygulanmıyor** |
| 5   | `dm/groups/[id]/history` DELETE     | ✅     | **`dm:group:clear-history` 10/saat**                     | ✅ `.strict()`                                                 | ✅ **`assertGroupAdmin`** (`group-permissions.ts:178`), bağlam **DB satırından** (`toContext`) | ✅ `AdminAuditLog` · `DM_GROUP_HISTORY_CLEARED` · **aynı transaction** | ✅ yalnız `{ clearedAt }`                                         |
| 6   | `dm/groups/[id]` DELETE             | ✅     | **`dm:group:delete` 5/saat**                             | ✅ `.strict()`                                                 | ✅ **`assertGroupOwner`** (`:186`); `ADMIN` → 403 `NOT_GROUP_OWNER`                            | ✅ `AdminAuditLog` · `DM_GROUP_DELETED` · aynı transaction             | ✅ 204                                                            |
| 7   | `mobile/dm/groups/[id]/profile` GET | ✅     | `mobile:dm:group:read`                                   | ✅                                                             | ✅                                                                                             | —                                                                      | ✅ `.strict()`                                                    |
| 8   | `dm/[id]/attachments` GET           | ✅     | `dm:attachments` 120/60                                  | ✅ `.strict()`, limit ≤ 50                                     | ✅ `requireDMParticipant` **servisin ilk satırında**                                           | —                                                                      | ✅ `.strict()`                                                    |
| 9   | `users/me/privacy` GET+PATCH        | ✅     | `user:privacy:read` 120/60 · `user:privacy:update` 30/60 | ✅ `.partial()` `.strict()`i koruyor (zod 4.4.3'te doğrulandı) | ✅ yalnız oturumun `userId`si                                                                  | —                                                                      | ✅ `.strict()` + `Cache-Control: no-store`                        |
| 10  | `mobile/account/privacy` GET+PATCH  | ✅     | ⚠️ ikisi de `mobile:account:settings` 60/60              | ✅                                                             | ✅                                                                                             | —                                                                      | ✅ `.strict()`                                                    |
| 11  | `users/[userId]/report` POST        | ✅     | **`users:report` 5/10 dk**                               | ✅ `.strict()`, `details` ≤ 500                                | ✅ `reporterId` yalnız oturumdan; self-report 400, eksik özne 404                              | —                                                                      | ✅ `.strict()` = yalnız `{ reportId }`                            |
| 12  | `dm/[id]/mute` PATCH                | ✅     | `dm:mute` 60/60                                          | ✅ gövde `.strict()`                                           | ✅ `requireDMParticipant` yazmadan önce                                                        | —                                                                      | ⚠️ yanıt şemasız                                                  |

### Görev §6'nın üç özel sorusu

**`historyFromAt` üç kipin üçünde de uygulanıyor mu — hem sayfada hem toplamda?**
✅ **Evet, ve yapı gereği.** Taban tek yerde uygulanıyor: `buildSharedItemsMessageWhere`
(`lib/dm/shared-media.ts:339-354`) `toHistoryWindowFilter`ı `buildKindFilter(input.kind)`
dalının **dışında**, `:351`'de yayıyor — yani kipten bağımsız. Sayfa sorgusu `:419`, sayaç
sorgusu `:462` aynı `historyFromAt`i alıyor (`:384`'te birlikte iletiliyor); `link` toplamı
`:468`, `media`/`file` toplamı `:477-481` aynı `scope`u kullanıyor. Değer
`requireDMParticipant`'tan, yani sunucudan. Sızıntı yolu bulunamadı.

**Yönetici eylemleri sunucuda yeniden doğrulanıyor mu?**
✅ Evet. İkisi de bağlamı **DB satırından** kuruyor (`toContext`, `group-service.ts:850`);
istemcinin `role` alanı karara hiç girmiyor. Uçlar zaten gövdesiz. Ayrıca `route-contract.test.ts`
gövdesiz mutasyon rotalarını `BODYLESS_MUTATING_METHOD_PATHS` altında kayıt zorunda tutuyor
ve ikisi de kayıtlı. **İstemciyi kapatıp uca doğrudan istek atma testi yapılmadı** (sunucu
koşmuyor); yetki kapısı kaynaktan ve testlerden doğrulandı.

**Rapor ucunun hız sınırı gerçekten dar mı?**
✅ Dar. `users:report` = **5 / 600 sn**, `mobile:users:report` ile birebir aynı. Dosyadaki
308 kovanın içinde **24. ve 26. en sıkı** — en sıkı %8'in içinde. Karşılaştırma:
`dm:group:delete` 5/saat (4.), `dm:group:clear-history` 10/saat (12.), dosyanın tabanı
`user:data-export` / `user:delete` 3/saat.

### Beş uyarı (hiçbiri kritik değil)

1. ⚠️ **ORTA — `dm/groups/[id]/profile` ve `…/members` yanıtlarını çalışma zamanında
   doğrulamıyor.** Dalga 1'in diğer **her** okuması `.strict()` bir şemadan geçiyor; bu ikisi
   yalnız tip seviyesinde. `GroupMemberPageSchema` var ve hiç kullanılmıyor. Aynı profil
   çağrısının **mobil ikizi** parse ediyor — yani garanti istemciye göre değişiyor. Bugün
   sömürülebilir değil (iki gövde de alan alan elle kuruluyor, hiç spread yok), ama paketin
   her yerde güvendiği `.strict()` yedeği burada yok. **Tahmin: 30 dk.**
2. ⚠️ Düşük — `DMConversationParamsSchema` `.strict()` değil (`lib/dm/types.ts:77`); 1, 2, 8 ve
   mute uçları onu kullanıyor. Next.js rota segmenti yalnız tanımlı anahtarı üretir, risk düşük;
   paketin kendi kuralıyla tutarsızlık.
3. ⚠️ Düşük — mobil gizlilik **PATCH**'i okuma kovasını paylaşıyor (60/60), web yazma kovası
   30/60. Aynı kolonlar için mobil yazma yolu 2× gevşek.
4. ⚠️ Düşük — mute PATCH yanıtı şemasız (`Response.json({ ...state, success: true })`).
   Bugün yalnız boolean + ISO tarih dönüyor, korumasız.
5. ⚠️ Düşük/gizli — D3'ün takma ad kör noktası. Kimlik sayımının kendisi bundan etkileniyor.

---

## 7. `SPEC_DEVIATIONS` güncelliği

**Liste güncel; bu turda kayıt eklenmedi ya da çıkarılmadı, ve bu doğru.**

- `SPEC_DEVIATIONS` dizisi **HTML ile SPEC arasındaki sayısal** çelişkileri taşıyor
  (`{ field, html, spec }`). §15–§17 turunda böyle bir çelişki **çıkmadı** (01-rapor Ş0.1):
  HTML'in verdiği her ölçü SPEC'in verdiğiyle tutuyor. Dizideki 31 kayıt §1–§14'ün.
- Şeritlerin "kayda geçmeli" dediği üç madde (`pinIconSize` 15↔13, `mediaTileIconSize` 20↔18,
  `dangerIconSize` 15↔16) **sapma değildi, sözlük hatasıydı** — sözlük HTML'den farklı bir
  değer taşıyordu. Üçü de bu tur öncesinde ana oturumda düzeltilmiş: bugün sözlük 13 / 18 / 16
  diyor ve `dc.html` L1084 / L1136 / L1247 ile birebir. Bir sapma kaydı yazmak yanlış olurdu:
  sapma iki **otorite** arasındadır, sözlük bir otorite değil bir kopyadır. Yerine
  `metrics.test.ts` üçünü birden kilitleyen bir test aldı.
- Bu turun eklediği `actionIconButtonIconSize` de sapma değil: `dc.html` iki farklı ikon
  boyutu çiziyor ve sözlükte tek kayıt vardı; eksik olan kayıt tamamlandı.
- Sayıya dökülemeyen beş madde dosya başındaki düzyazı listesinde duruyor (K2'nin şifreleme
  satırı, toast'ın yeri, `Süresiz` toast metni, bölüm etiketi harf aralığı, ölü `priv.media`
  alanı) ve hepsi hâlâ geçerli.
- `metrics.test.ts`'in üç koruyucusu ("her sapma gerçekten bir sapmadır", "sözlük her sapan
  alanda HTML değerini taşır", "aynı alan iki kez kaydedilmez") yeşil.

Şeritlerin raporlarında "SPEC_DEVIATIONS'a yazılmalı" diye bırakılan **metin/davranış**
sapmaları (Ş3'ün `SharedLinkDTO.title` kaynağı, Ş7'nin bağlantı satırı ve `7 d` kısaltması,
Ş10'un süre segmenti ve `WindowCloseButton`) diziye **yazılmadı** — dizi sayısal, onlar değil.
Hepsi kendi şerit raporlarında kayıtlı ve bu raporun §3'ünde toplandı.

---

## 8. Bu şeridin dokunduğu dosyalar

| Dosya                                                         | Ne                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/lib/messages/metrics.ts`                                 | `profilePanel.actionIconButtonIconSize: 16` (yeni kayıt)                                        |
| `src/lib/messages/metrics.test.ts`                            | 3 yeni test — ikon-only/birincil ayrımı, ikonun kutusuna sığması, üç ikon ölçüsünün HTML kilidi |
| `src/components/messages/profile-panel-identity.tsx`          | ikon-only düğme yeni kaydı okuyor                                                               |
| `src/components/messages/profile-panel-identity.test.tsx`     | 1 yeni test                                                                                     |
| `src/components/messages/messages-side-panel.tsx`             | opsiyonel `closeLabel` prop'u (geriye dönük uyumlu)                                             |
| `src/components/messages/conversation-profile-panel.tsx`      | `closeLabel={t("messages.profile.close")}`                                                      |
| `src/components/messages/conversation-profile-panel.test.tsx` | 1 yeni test                                                                                     |
| `src/components/messages/profile-mutual-lists.tsx`            | önizleme sınırı sözlükten                                                                       |
| `src/components/dm/dm-conversation-page.tsx`                  | `onMarkUnread` · `onArchive` · `presence` bağlandı; arşivde `/messages`e dönüş                  |
| `src/components/dm/dm-conversation-page-bindings.test.ts`     | **yeni** — 6 test, bağlamayı kaynaktan kilitliyor                                               |
| `e2e/specs/messages/messages-profile-state.spec.ts`           | **yeni** — §2 durum bütünlüğü, 7 test + 1 `fixme`                                               |
| `e2e/specs/a11y/messages-a11y.spec.ts`                        | §15–§17 yüzeyleri için 3 blok eklendi                                                           |

`packages/**`, `apps/mobile/**`, `lib/dm/**`, `lib/locale/**`, `components/chat/**`,
`components/settings/**` — **hiçbirine yazılmadı**.

### Bilerek yazılan tek `fixme`

`messages-profile-state.spec.ts` içindeki _"arama açılınca profil paneli yuvayı boşaltır"_
testi `test.fixme` ile işaretli. Kural doğru (K5), ürün bugün uymuyor (A1) ve düzeltmesi
benim yazma listemin dışındaki bir dosyada. Kuralı hiç yazmamak, kuralın olmadığını iddia
etmek olurdu; yeşil bir gate uğruna kırmızı bırakmak da e2e'yi kullanılamaz yapardı. A1
kapandığında `fixme` kalkar ve test kuralın bekçisi olur.

---

## 9. Eş zamanlı düzenleme notu ve bir ölçüm tuzağı

Bu oturum boyunca paket dışından iş akmaya devam etti (`settings/**`, `lib/desktop/**`,
`lib/shortcuts/**`, `e2e/helpers/**`). Raporladığım hiçbir kırmızı bu dosyalardan gelmedi —
tam süit koşuları **exit 0** verdi ve aradaki tek fark benim eklediğim 11 test.

### Dördüncü ölçüm tuzağı: makinede asılı kalmış eski koşucular

06-rapor üç ölçüm tuzağı kaydetmişti. Dördüncüsü bu turda çıktı ve kaydedilmeye değer.

Doğrulama koşum, önceki yeşil koşunun özeti bastığı **tam aynı satırda** (12306,
`channel thread lifecycle` bittikten sonra) asıldı ve on üç dakika hiçbir çıktı üretmedi.
Sebep testler değildi:

```
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*run-node-tests*' }
→ PID 38132  11:12  node scripts/run-node-tests.mjs
→ PID 12032  11:26  node scripts/run-node-tests.mjs
→ PID 36436  19:50  node scripts/run-node-tests.mjs   ← benimki
```

Makinede sabahtan kalma **iki zombi süit koşucusu** vardı (11:12 ve 11:26, saatlerdir açık,
başka bir işin artığı). Kendi koşumu öldürdüm (`TEST_EXIT=127` o yüzden — bir test hatası
değil, benim SIGKILL'im), ikisine **dokunmadım**: benim işim değiller.

**Kural:** tam süit asılırsa önce `Get-CimInstance Win32_Process` ile kaç `run-node-tests.mjs`
koştuğuna bak. Asılan koşuyu "kırmızı" diye raporlamak da, öldürülmüş bir koşunun `127`sini
"hata" diye okumak da yanlış olur.

---

## 10. Paket kapandı — geriye kalan

**Kapatılması en acil üç madde, sırayla:**

1. **D1** — temizlenen geçmişin yeni üyeye sızması (gizlilik, migration ister).
2. **A1** — iki sağ panelin aynı anda açık kalması (§2'nin merkezî kuralı, 1360'ta ölçülebilir
   bir düzen kırılması).
3. **D2** — §17 menüsünün altı ölü satırı (kullanıcı tıklar, hiçbir şey olmaz).

**Ve bir kez daha, çünkü bu raporun en önemli cümlesi:**
**`e2e` ve `e2e:a11y` koşulmadı.** 22 ekranın hiçbiri tarayıcıda açılmadı, hiçbir ekran
görüntüsü karşılaştırılmadı, axe hiç çalışmadı, altı çözünürlüklü ölçek matrisi hiç
ölçülmedi. Bu raporun parity, a11y ve kırılım bölümleri **kaynak seviyesinde** doğrulamadır.
Paketi "görsel olarak doğrulandı" diye devretmiyorum.

---

## Kapanış sonrası düzeltme — ana oturum

**İki sağ panelin aynı anda açılabilmesi kapsam dışı bırakılmıştı; geri alındı ve düzeltildi.**

Ş11 bu maddeyi §1–§14 dosyası (`chat-area.tsx` kendi `useState`'ini tutuyor) olduğu için rapora
yazıp geçti. Sınıflandırma yanlıştı: **çakışmayı §15 doğurdu.** Bu paketten önce sağ yuvada tek
bir sahip vardı; profil paneli ikinci sahibi ekledi. K5 ("panel tek yuvadır: profil açılırken
thread ve arama kapanır") ve PROMPT'un kabul kriteri ("aynı anda iki panel açık kalmıyor") bu
paketin kendi şartları. 1360'ta görünür sonuç: 340 + 330 = 670px panel, ana alana **60px**
kalıyor — sözlük 390 istiyor.

Çözüm iki yönlü bir sözleşme, tek sahip icat etmeden:

- `MessagesScreenState.sidePanelCloseRequestId` (yeni) — `openProfile` her seferinde artırır.
  Sayaç, bayrak değil: profili iki kez açmak iki kez görülmeli (`searchRequestId` ile aynı kalıp).
- `ChatArea.sidePanelCloseRequestId` — değişince thread ve aramayı bırakır. İlk render'da
  koşmaz (ref ile ilk değer tohumlanıyor); koşsaydı açılışta hiçbir şey kapatmadan bir
  render harcardı.
- `ChatArea.onSidePanelOpen` — thread ya da arama açıldığında çağrılır; sayfa `closePanel`
  gönderir. Kapatma iki yönde de simetrik.

`packages/types` testine üç kaydırıcı eklendi: sinyal her `openProfile`'da artar, `setProfileTab`
arttırmaz (sekme değiştirmek yuvayı yeniden almak değildir), `openThread` profili yuvadan düşürür.

Ş11'in `test.fixme` olarak bıraktığı e2e sen aryosu artık gerçek bir davranışı tarif ediyor —
e2e koşulabildiğinde `fixme` kaldırılmalı.

### Düzeltme sonrası kapı (ana oturumun kendi ölçümü)

| Kapı                                   | Sonuç                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm --filter @wizards/web typecheck` | **0 hata**                                                                                |
| `pnpm --filter @wizards/web test`      | **exit 0** · 8352 geçti · 0 hata · 3 atlandı                                              |
| `pnpm --filter @wizards/types test`    | 626 / 626                                                                                 |
| `pnpm --filter @wizards/db test`       | 158 / 158                                                                                 |
| `e2e` / `e2e:a11y`                     | **KOŞULMADI** — `e2e:check-env` ayrı bir veritabanı ve yerel üretilmiş bir parola istiyor |

**e2e koşulmadığı için şu üçü hiç doğrulanmadı:** 22 ekranın piksel karşılaştırması, axe
taraması, ve 1360→3840 ölçek matrisi. Rapordaki parity/a11y/kırılım bölümleri **kaynak
seviyesi** doğrulamadır; tarayıcıda tek bir ekran açılmadı.

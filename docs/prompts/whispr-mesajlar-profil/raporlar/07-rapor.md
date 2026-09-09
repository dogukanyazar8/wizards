# Dalga 2 · Ş5 — Profil paneli kabuğu, kimlik bloğu, sekmeler · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** bitti, kapı yeşil. Commit atılmadı.

## Kapı

| Komut                                                 | Sonuç                         |
| ----------------------------------------------------- | ----------------------------- |
| Ş5'in üç test dosyası (`--test-force-exit`)           | **65 / 65** · 0 hata · exit 0 |
| `+ audit-budget` `+ messages-side-panel`              | 86 / 86                       |
| `+ components/dm/*.test.tsx` `+ lib/messages/metrics` | 59 / 59                       |
| `pnpm --filter @wizards/web typecheck`                | **0 hata**                    |
| `eslint` (yeni + değişen 8 dosya)                     | temiz                         |

Tam süit **koşulmadı** (kardeş şeritler aynı anda koşuyordu). `MESSAGES_AUDIT_BUDGET`
`components/messages` ve `components/dm` için `{ copy: 0, token: 0 }` diyor ve öyle kaldı —
yeni dosyaların hiçbirinde renk/font/metin kaçağı yok.

---

## 1. Sekme gövdesi prop sözleşmesinin son hâli

Ş7'nin bıraktığı iki satırlık borç kapandı. Sözleşme **beş** alan:

```ts
type ProfileTabProps = {
  conversationId: string;
  variant: "dm" | "group";
  onToast?: ((toast: ConversationToast) => void) | undefined;
  onAddMembers?: (() => void) | undefined;
  onSelectMember?: ((userId: string) => void) | undefined;
};
```

**Tipin kanonik evi `components/messages/profile-tab-members.tsx`.** Panel onu
`SharedProfileTabProps` adıyla import ediyor, iki kancayı ekleyip `ProfileTabProps` olarak
yeniden dışa veriyor. Yeniden **tanımlamadım**: `profile-tab-general.tsx`,
`profile-tab-members.tsx` ve `profile-tab-settings.tsx` bugün üçü de aynı şekli ayrı ayrı
`export type ProfileTabProps` diye taşıyor (medya sekmesi members'tan okuyor) — dördüncü bir
kopya, altıncı alan eklendiğinde üç dosyanın sessizce eski şekilde kalması demekti.
**Dalga 3'e devir:** üç bildirimi tek eve indirin.

Panel dört gövdeye de **aynı** dört kancayı geçiriyor (`<Body conversationId onAddMembers
onSelectMember onToast variant />`). Yalnız `uyeler`e geçmek cazipti — bugün ikisini de o
kullanıyor — ama sözleşme sekme başına ayrışsaydı beşinci sekmeyi yazan kişi hangi kancayı
alacağını gövdenin adına bakarak tahmin etmek zorunda kalırdı.

**Bu iletim DOM'da iz bırakmıyor.** Ş7 `Üye ekle` düğmesini bilerek _yetkiye_ göre çiziyor,
kancanın varlığına göre değil; yani kancayı iletmeyi unutmak markup'ta hiçbir fark yaratmaz ve
düğme sessizce ölü kalır. Markup'a bakan bir test bunu **asla** yakalayamaz, o yüzden sözleşme
kaynaktan taranıyor (`conversation-profile-panel.test.tsx` → "dört kanca da gövdeye iletilir";
emsal `settings-a11y.test.tsx`).

`onSelectMember` **bugün bağlanmadı** ve bu bilinçli: "üye satırına tıkla → o kişinin profili"
bir _kullanıcı_ profili yüzeyi ister, panel ise sohbet kapsamlı (`conversationId` → DM profil
ucu). Ş7'nin sözleşmesi gereği kanca yokken satırlar tıklanabilir çizilmiyor — ölü hedef yok.
**Dalga 3'e devir.**

---

## 2. `messages-side-panel` genişlik varyantı

```ts
export type MessagesSidePanelVariant = "default" | "profile";
// <MessagesSidePanel variant="profile" />  → sidePanel.profileWidth (330)
// varsayılan                               → sidePanel.width        (340)
```

Kök öğe `data-variant="default" | "profile"` taşıyor: ölçünün kaza eseri değişmesi testte tek
satırla yakalanabilsin diye. `sidePanel.width` **değişmedi** (tuzak 10); testi iki genişliği
aynı anda ölçüyor.

Kabuğa **başka hiçbir prop eklenmedi**. Bunun bir bedeli var, aşağıda §6.2.

---

## 3. Eski üç panelden taşınan ve düşürülen davranışlar

`dm-details-panel.tsx` (498), `dm-group-details-panel.tsx` (390),
`dm-group-settings-panel.tsx` (320) ve iki test dosyası silindi. Tek tüketicileri
`dm-conversation-page.tsx`'ti; `dm-details-panel.test.tsx` diye bir dosya hiç yoktu.

### Taşınanlar (yeni panelin testinde)

| Eski iddia                         | Nereden                                 | Yeni karşılığı                                                                                                                           |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "2f ayrı rota değil, aynı yüzey"   | `dm-group-settings-panel.test.tsx`      | Ayarlar bir **sekme**; sekme bir `button`, `a href` değil (ayrı sayfaya çıkmaz)                                                          |
| 1:1 panelinin karşı taraf koruması | `dm-details-panel` `participant` prop'u | İki katman: sayfa konu yokken paneli hiç bağlamıyor (`hasSubject`), panel DM'de üyeler gövdesini dört sekmenin **hiçbirinden** üretmiyor |
| "counts every member" (`3 üye`)    | `dm-group-details-panel.test.tsx`       | Sayaç kimlik bloğunun alt satırı (`profile-panel-meta`, `5 üye · 3 çevrimiçi`)                                                           |

### Ş7/Ş8'e geçenler (yeni panelin testinde **yok**, gerekçesiyle)

Bu iddiaların doğruladığı kontroller artık başka bir dosyada çiziliyor; testin de o dosyada
olması gerekir, yoksa kırıldığında yanlış şeridi suçlar.

- **Yetki kapıları** — sahip düzenleyiciyi/foto alanını/ekle-çıkar düğmelerini görür, düz üye
  görmez (`dm-group-name-input`, `dm-group-add-member`, `dm-group-remove-*`,
  `dm-group-role-toggle-*`, "viewer kendine kontrol göremez"). → **Ş7** (üyeler sekmesi).
- **Rol rozetleri** (`dm-group-role-owner` / `-admin`). → **Ş7**.
- **Bildirim üçlüsü + izin satırları + davet bağlantısı + kaybolan mesaj uyarısı**
  (`dm-group-notify-*`, `dm-group-permission-*`, `dm-group-invite-*`). → **Ş8** (ayarlar
  sekmesi) ve davet kartı Ş7'de.
- **Sabitlenen kart** (`dm-group-pinned-card`). → **Ş6** (genel sekmesi, `profile-pinned-list`).
- **`ORTAK SUNUCULAR` bloğunun grupta çizilmediği.** → **Ş6**; artık yapısal olarak imkânsız
  (grup kolu o bölümü hiç üretmiyor).

### Düşürülenler (gerekçeli)

1. **Paylaşılan ek özetinin React Query önbelleğinden türetilmesi** ve onun boş hâli
   (`dm-shared-media`, `dm-shared-files`, `DmSharedMedia`, `DmSharedFiles`,
   `useCachedDmMessages`, `SharedMediaTile`, `SharedFileRow`). K11 gereği kalktı: önbellek
   sayfalanmış ve eksikti, panel 18 medya + `+12` örtüsü istiyor. Yerine Ş3'ün gerçek ucu ve
   Ş7'nin medya sekmesi geldi. `lib/dm/details.ts` **silinmedi** (mobil ayrıntı yanıtı
   kullanıyor, 04-rapor).
2. **`DmProfileCard`'ın üç kısayol karosu** (`Profil` / `Ara` / `Sessize al`). İkisi
   `disabled title="Yakında"` idi. `Ara` işlevi başlığın arama ikonuna, `Sessize al` §17'nin
   menüsüne (Ş9) ve ayarlar sekmesine (Ş8) taşındı; §15.1 bu satırda üç **başka** aksiyon
   tarif ediyor (`Mesaj gönder` + sesli + görüntülü) ve tasarım kazandı.
3. **`DmConversationShortcuts`** (`Sohbette ara` satırı). §15 böyle bir bölüm tanımlamıyor;
   aynı eylem sohbet başlığında zaten var. Panelde ikinci bir kopyası artık yok.
4. **`Whispr kullanıcısı` / `@kullanıcı` bilgi satırları.** §15.1 kolonu `@handle`'ı ad
   altında bir kez yazıyor; ikinci satır tekrardı.

---

## 4. Sohbet rayının DM avatarı — dokunulmadı, gerekçesi

**Sonuç: `messages-rail-row.tsx` değişmedi.** Prompt'un koşulu gerçekleşti.

`ConversationRowDTO` (`packages/types/src/messages-screen.ts` L411) karşı taraf kimliğini
**taşımıyor**: `id` konuşma kimliği, `initials`/`name` görüntü adı, `tileColor` yalnız grup
swatch'ı. Rayın DM satırı bugün `HomeAvatar` çiziyor ve o da DS `Avatar`'ın gri
`--surface-soft/0.72` fallback'ini kullanıyor.

`lib/messages/rail-presentation.ts` `toConversationRow` içinde karşı taraf katılımcısını zaten
buluyor (presence'ı ondan türetiyor, L112) — yani veri **elinde**, DTO'ya konmuyor. Doğru
düzeltme `ConversationRowDTO`'ya bir `counterpartId` (ya da doğrudan `tint: ProfileTint`)
alanı eklemek; `packages/types/**` benim yazma listemde değil ve kolon uydurmadım.

**Dalga 3'e devir:** ray tinti `ConversationRowDTO`'ya bir alan ister. Alan geldiğinde dokunuş
tek dal: satırın `swatch` kolu grup için nasıl renkli karo çiziyorsa, DM kolu da
`profileTintSurface(row.tint)` / `profileTintForeground(row.tint)` ile aynısını çizsin. Ölçü,
düzen, hover ve presence noktası değişmez. Bu gelene kadar SPEC §15.1'in "karo rengi sohbet
rayındaki tile rengiyle aynı kaynaktan gelir" cümlesi **tek yönlü** doğru: panel doğru kaynağı
okuyor, ray hâlâ gri.

---

## 5. `DMConversationPage` — K14

- Reducer `DMConversationPage`'de, `key={conversationId}`'nin **üstünde**. İçerik bileşeni her
  sohbette baştan kuruluyor (mevcut davranış), ama §12 "panel durumu sohbet değişince korunur"
  diyor — reducer aşağıda olsaydı açık profil paneli her geçişte kapanırdı.
- `isDetailsDrawerRequested` → `state.detailsDrawerOpen`, `searchRequestId` →
  `state.searchRequestId`. İki `useState` **silindi**, yenisi açılmadı.
- Başlangıç durumu `panel: "profile"`: bugünkü davranış da buydu (geniş görünümde ayrıntı
  paneli hep yerleşikti). Değişen tek şey artık kapatılabiliyor olması.
- `view` ve `role` eksenleri konuşma kaydı gelince tek geçişle reducer'a bildiriliyor
  (`openConversation`, `setRole`).
- `openProfile`/`togglePanel` thread ve aramayı reducer'da kapatıyor; bileşende **ikinci bir
  kapatma çağrısı yok**.
- Yerleşik kolon `!shouldMountInfoDrawer`, çekmece `shouldMountInfoDrawer` ile kapılı — ikisi
  aynı anda **hiç** çizilmiyor. Eşiği CSS'e (`xl:hidden`) bırakmadım: saklanan bir panel yine
  de çizilir ve çizildiği anda seçili sekmenin sorgusu koşar; dar görünümde aynı veri iki kez
  çekilirdi (kural 7). Kırılım noktası (`shouldUseInfoDrawer`, 1280) **değişmedi**.
- Çekmece sarmalayıcısı artık `role="dialog"` / `aria-modal` **taşımıyor**; ikisi de panelin
  ortak kabuğundan geliyor (`overlay`). Eskiden sarmalayıcı diyaloğu iddia ediyordu ama focus
  tuzağı yoktu; şimdi tuzak, `Esc` ve açılışta odak gerçekten var. Sarmalayıcının kendi `Esc`
  dinleyicisi silindi (kabuk zaten yapıyor).
- Sesli/görüntülü arama düğmeleri **çalışıyor**: sayfa `useDMCallActions()` ile aynı global
  store'a bağlanıyor (`ChatArea`'nın kullandığı). Makine kopyalanmadı.
- `Mesaj gönder` paneli kapatıyor — `dc.html` L969'da düğmenin `onClick`'i `closePanel`.
- `Üye ekle` `openModal({ kind: "invite" })` gönderiyor. Modal Ş10'da gelecek; eksen bugünden
  reducer'da, böylece modal geldiğinde bağlanacağı yer yeni bir `useState` olmuyor.
- `onToast` `showToast` gönderiyor; §17'nin şeridini Ş9 çizecek, durum şimdiden yerinde.
- **Bağlanmayan tek şey grup kimlik bloğunun hızlı `Sessize al` ikonu**: §17'nin süre alt
  menüsü Ş9'un ve süresiz/süreli ayrımı olmadan bir tık yalan söylerdi. Düğme pasif çiziliyor,
  gizlenmiyor (eski panelin `Yakında` emsali).

---

## 6. Kayda geçen sapmalar ve borçlar

### 6.1 Ölçü/görünüm

1. **Başlığın alt kenarı `--border/0.5`, §15 `0.45` diyor.** Ortak kabuğun değeri; thread ve
   arama da onu kullanıyor. K5 kabuğu paylaşmayı seçtiği için sapma bilerek kabul edildi.
2. **İkon düğmelerinin ikonu 15px, `dc.html` 16px.** `profilePanel` sözlüğünde tek bir
   `actionIconSize: 15` var (birincil düğmenin ölçüsü) ve sözlük Dalga 0'da donduruldu.
   1px'lik fark için ikinci bir kayıt uydurmadım.
3. **Rol pill'inin tacı `1em`, `dc.html` 12px.** Pill metni 11.5 olduğu için ikon 11.5px
   çiziliyor. §8.2.3 ikonu satırın metniyle birlikte büyütmeyi zaten istiyor; çıplak 12 yazmak
   yerine oran seçildi.
4. **Grup karosunun gölgesi karonun kendi rengini alıyor**, `dc.html`'deki sabit `--primary`
   değil. Tasarım örneği primary swatch'lı bir grup; sabitlenseydi turuncu bir grubun altında
   mor bir hâle kalırdı.
5. **Ad satırının harf aralığı `-0.02em` bileşende yazılı.** `var(--w-track)`'ün değeri; sözlük
   harf aralığı taşımıyor ve bu bir renk token'ı değil (emsal: `lib/discover/metrics.ts`).

### 6.2 `messages.profile.close` kullanılmıyor

Kapat düğmesinin etiketi ortak kabuktan geliyor: `messages.panel.close` → **"Paneli kapat"**.
Sözlükteki `messages.profile.close` ("Profili kapat") bu yüzden **ölü**. Kabuğa `closeLabel`
prop'u eklemek "yalnız genişlik varyantı" mandatımın dışındaydı; anahtarı silmedim.
**Dalga 3'e devir:** ya kabuk bir etiket prop'u alsın, ya anahtar düşsün.

### 6.3 `messages.profile.*` içinde presence adı yok

Durum pill'i ve noktanın `sr-only` karşılığı Ana Sayfa'nın etiketlerini okuyor
(`home.presence.online/idle/dnd`, `home.friends.offline`). `messages.profile.a11y.presence`
("Durum: {status}") bir `{status}` bekliyor ama onu dolduracak dört adı sözlüğün profil ağacı
taşımıyor. Anahtar **eklemedim** (Dalga 0 sözlüğü dondurdu); iki ağaç arasında bir bağ
kurulduğu için kayda geçiyor.

### 6.4 Silinen panellerin arkasında kalan ölü ihracatlar

Sahiplenmediğim dosyalarda; **dokunmadım**, `typecheck` ve `lint` ikisinden de şikâyet etmiyor
(repoda ölü-ihracat kapısı yok):

- `components/dm/dm-conversation.tsx` → `getDmStatusDotClass`, `getDmStatusKey` (tek okuyanı
  `dm-details-panel`'di). Aynı dosyanın başındaki yorum hâlâ silinmiş `dm-details-panel`'i
  işaret ediyor.
- `components/dm/group-icon-field.tsx` → `GroupIconField` (tek okuyanı grup ayrıntı paneliydi).
- `hooks/use-group-conversation.ts` → `useGroupConversationMutations` (tek okuyanı sayfaydı;
  mutasyonlar artık Ş7/Ş8'in sekmelerinde).
- `lib/dm/client.ts` → `fetchDMMutualServers` + `dmQueryKeys.mutualServers` (ortak sunucular
  artık `UserProfilePanelDTO` içinde geliyor).

**Dalga 3 QA'ine devir:** dördü de ya bir tüketici bulur ya silinir.

---

## 7. Kardeş şeritlerin bilmesi gereken beş şey

1. **Panel medya karosunun `jumpToMessageInDocument` çağrısını engellemiyor** ve engellemeyecek.
   **Karar: panel açık kalır.** §12 panel durumunu koruyor; 1360'ta 330'luk panel ile mesaj
   listesi yan yana duruyor, yani sıçrama panelin yanında görünür ve kullanıcının istemediği
   bir kapanma yaşanmaz. **Uyarı:** dar görünümde (<1280) panel bir çekmece ve mesaj listesinin
   **üstünde**; orada sıçrama görünmez kalıyor. Ş11 parity kapısı bunu ölçmeli, düzeltmesi ya
   çekmecenin `onOpenMessage`'ta kapanması ya da karoların dar görünümde sıçramaması olur.
   Sekme sözleşmesine `onOpenMessage` **eklemedim**: medyaya özgü bir kanca dört gövdeye
   birden yayılırdı.
2. **Kimlik bloğu ile `Genel` sekmesi aynı sorgu anahtarını paylaşıyor** (`dmProfileQueryKeys.
profile` / `groupProfileQueryKeys.panel`) ve `staleTime` ikisinde de
   `DM_PROFILE_PANEL_STALE_TIME_MS`. React Query dedupe ettiği için tek istek gidiyor. Bir uç
   ekleyip farklı bir tazelik penceresi verirseniz aynı panelde iki farklı anda yenilenen iki
   başlık olur.
3. **Kimlik hâli makinesi `hasProfile` > `isError` sırasını uyguluyor**
   (`resolveProfileIdentityState`): elde veri varken arkadan gelen bir yenileme hatası paneli
   hataya düşürmez. Bir sekme kendi hatasını çiziyorsa aynı sırayı izlesin.
4. **Hata hâli sunucu render'ında DOM'dan sorulamıyor.** React Query v5, önbelleğe elle
   `status: "error"` yazılsa bile (`cache.build` + `query.setState`, `errorUpdatedAt` dolu
   olsa da) SSR'de iyimser `pending` döndürüyor — deneyip ölçtüm. Hata dallarını saf bir
   çözücü + tek başına çizilebilen küçük bir bileşen olarak ayırın; markup'tan sormaya
   çalışmayın.
5. **`ProfileTabProps` üç dosyada üç kez tanımlı** (§1). Panel members'ınkini genişletiyor.
   Yeni bir alan eklerken üçünü birden güncellemeniz gerekir — ya da Dalga 3'te tek eve indirin.

---

## Açık kalan

- `onSelectMember` bağlanmadı (§1) — Dalga 3.
- Grup hızlı sessize alma ikonu pasif (§5) — Ş9.
- Ray tinti `ConversationRowDTO`'ya alan istiyor (§4) — Dalga 3.
- `messages.profile.close` ölü (§6.2) — Dalga 3.
- Dört ölü ihracat (§6.4) — Dalga 3 QA.
- Dar görünümde medya sıçraması (§7.1) — Ş11 parity.

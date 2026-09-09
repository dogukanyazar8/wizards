# Dalga 2 · Ş7 — Üyeler ve Medya sekmeleri · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** şerit bitti, kendi kapısı yeşil. Commit atılmadı.

## Kapı

Kardeş şeritler aynı anda koştuğu için tam süit koşulmadı; yalnız bu şeridin on dosyası.

```
cd apps/web && DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests" \
  node --import tsx --test --test-force-exit \
  src/components/messages/profile-tab-members.test.tsx \
  src/components/messages/profile-invite-link-card.test.tsx \
  src/components/messages/profile-tab-media.test.tsx \
  src/components/messages/profile-media-grid.test.tsx \
  src/components/messages/profile-file-row.test.tsx
```

| Ölçüm                                  | Sonuç                                   |
| -------------------------------------- | --------------------------------------- |
| Yeni testler                           | **66 / 66** geçti (15 süit), exit **0** |
| `npx eslint` (10 dosya)                | temiz                                   |
| `npx prettier --write`                 | uygulandı                               |
| `pnpm --filter @wizards/web typecheck` | bu şeridin dosyalarında **sıfır** hata  |

Typecheck çıktısında kalan iki hata bu şeridin değil: `components/dm/dm-conversation-page.tsx`
`(244,18)` ve `(287,10)` — `variant: string` `ProfilePanelVariant`'a atanmıyor. Ş5'in şu an
yazmakta olduğu dosya.

Çıplak px yok, yeni hex yok (`grep -nE '\[[0-9.]+px\]|#[0-9a-fA-F]{3,8}'` beş bileşende sıfır
eşleşme). Yeni i18n anahtarı **yazılmadı**: Dalga 0'ın `messages.profile.*` bloğu yetti.

## Landed

| Dosya                                                      | Satır   | Ne                                                           |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| `apps/web/src/components/messages/profile-tab-members.tsx` | 494     | §15.4 sekme gövdesi + yetki kapısı + gruplama + durum satırı |
| `…/profile-tab-members.test.tsx`                           | 19 test |                                                              |
| `…/profile-invite-link-card.tsx`                           | 302     | §15.4 davet kartı + kopyalama + oluşturma satırı             |
| `…/profile-invite-link-card.test.tsx`                      | 13 test |                                                              |
| `…/profile-tab-media.tsx`                                  | 289     | §15.5 üç bölüm, üç paralel sorgu                             |
| `…/profile-tab-media.test.tsx`                             | 10 test |                                                              |
| `…/profile-media-grid.tsx`                                 | 198     | 3 kolon ızgara + `+N` örtüsü                                 |
| `…/profile-media-grid.test.tsx`                            | 9 test  |                                                              |
| `…/profile-file-row.tsx`                                   | 329     | dosya satırı + bağlantı satırı + ortak zaman biçimi          |
| `…/profile-file-row.test.tsx`                              | 15 test |                                                              |

**`lib/messages/format-file-size.ts` yazılmadı** (prompt'un düzeltmesi): karşılığı Ş3'ün
`lib/dm/shared-media-client.ts` içindeki `formatSharedFileSize(bytes, locale)`. Sahiplenme
listesinin dışına çıkılmadı; ortak dosyaların (`metrics.ts`, `tr.ts`, `en.ts`,
`messages-screen.ts`, `lib/dm/*`) hiçbirine yazılmadı.

---

## 1. Hangi medya görüntüleyici — ve neden o değil

**Kullanılan:** `lib/messages/jump-to-message.ts` → `jumpToMessageInDocument(messageId)`.
Karo (ve dosya satırının gövdesi) mesajın kendisine atlıyor; ekin gerçek görüntüleyicisini
mesaj listesindeki `components/chat/message-attachments.tsx` açıyor.

**Kullanılmayan:** `components/chat/image-lightbox.tsx` (`ImageLightbox`). Denendi ve
**reddedildi**, gerekçe tek satırda: `image` prop'u `MessageAttachment | null` istiyor ve o şema
üç zorunlu alan taşıyor — `filename`, `contentType`, `size: z.number().int().positive()` —
`SharedMediaItemDTO` **üçünü de taşımıyor** (alanları: `attachmentId, createdAt, height, kind,
messageId, thumbnailUrl, url, width`). Lightbox başlığı `formatAttachmentSize(image.size)`
basıyor, yani uydurulmuş bir `size` doğrudan ekranda **yanlış bir sayı** olurdu (`0 B`).
`filename` URL'den, `contentType` uzantıdan türetilebilirdi; `size` türetilemez.

İkinci gerekçe: `ImageLightbox` bir `<img>` çiziyor. **Video** karosunun ürün genelinde bir
görüntüleyicisi yok (`message-attachments.tsx` videoyu satır içi `<video>` ile çiziyor), yani
lightbox seçilseydi iki karo tipi iki farklı davranışa ayrılırdı.

**Bunu kapatmak isteyen için tek yol:** `SharedMediaItemDTOSchema`'ya `filename`,
`contentType`, `sizeBytes` eklemek — Ş3'ün DTO'su, bu şeridin yazma listesinde değil. Ayrı iş
olarak önerilir; o gün `ProfileMediaGrid.onOpen` imzası değişmeden lightbox'a bağlanabilir,
çünkü karo zaten `onOpen(item)` çağırıyor ve hedefi **tüketici** seçiyor.

## 2. Prop imzaları — Ş5, Ş9 ve Ş10'un bağlayacağı yüzey

```ts
// profile-tab-members.tsx
export type ProfileTabProps = {
  conversationId: string;
  onToast?: ((toast: ConversationToast) => void) | undefined;
  variant: "dm" | "group";
};

export type ProfileTabMembersProps = ProfileTabProps & {
  now?: Date | undefined; // test tohumu
  onAddMembers?: (() => void) | undefined; // Dalga 3 Ş10 → §16 modalı
  onSelectMember?: ((userId: string) => void) | undefined; // Ş5 → panelin özne değişimi
};

// profile-tab-media.tsx
export type ProfileTabMediaProps = ProfileTabProps & {
  now?: Date | undefined;
  onOpenMessage?: ((messageId: string) => void) | undefined; // varsayılan: jumpToMessageInDocument
};
```

`ProfileTabProps` yalnız `profile-tab-members.tsx` içinde **bir kez** tanımlı;
`profile-tab-media.tsx` onu re-export ediyor. Ş5 kendi panelinde ikinci bir kopya tanımlamış
(`conversation-profile-panel.tsx:69`); ikisi yapısal olarak aynı, `ComponentType<ProfileTabProps>`
ataması derleniyor. **Birleştirilirse** iki tanımdan biri silinmeli — sapma değil, tekrar.

### Ş5'in borcu — iki satır, yoksa `Üye ekle` ölü buton

`conversation-profile-panel.tsx:254` gövdeyi şöyle çağırıyor:

```tsx
<Body conversationId={conversationId} onToast={onToast} variant={variant} />
```

`ConversationProfilePanelProps` `onAddMembers`'ı **zaten taşıyor** ama gövdeye geçirmiyor. İki
şey gerekiyor:

1. `ProfileTabProps`'a `onAddMembers?: (() => void) | undefined` ve
   `onSelectMember?: ((userId: string) => void) | undefined` eklenmeli;
2. `<Body … onAddMembers={onAddMembers} onSelectMember={…} />`.

Bu yapılmazsa `Üye ekle` butonu **çiziliyor ama hiçbir şey yapmıyor**. Buton bilerek yetkiye
göre kapatıldı, kancaya göre değil: bir üyenin `ADMINS` grubuna kimse ekleyememesi bir yetki
gerçeği (buton çizilmez), kancanın bağlanmamış olması ise bir kurulum hatası — ve bir özelliği
sessizce yok etmektense görünür bırakmak Ş11'in yakalayabileceği tek biçim. Üye **satırı** ters
kararla çalışıyor: `onSelectMember` yoksa satır `button` değil `div` olarak çiziliyor, yani
klavye turunda cevapsız bir durak açılmıyor.

### Ş9'un borcu — `tone: "danger"` başka bir cümle basmalı

Kopyalama reddedilince `onToast({ kind: "inviteCopied", tone: "danger" })` gidiyor.
`ConversationToastKindSchema` Dalga 0'da donduruldu ve **`copyFailed` diye bir kip yok**;
`@wizards/types` bu şeridin yazma listesinde değil. Bu yüzden hata, aynı kipin danger tonuyla
taşınıyor.

**Toast şeridi `tone === "danger"` gördüğünde `messages.toast.inviteCopied` basmamalı** —
kırmızı bir "Davet bağlantısı kopyalandı" doğrudan yalandır. Hazır ve iki sözlükte de bulunan
karşılık: **`chat.message.copyFailed`** (`Kopyalanamadı.` / `Copy failed.`). Alternatif, kipi
`@wizards/types` içinde büyütmek — o da Ş9'un ya da ana oturumun kararı.

Kopyalama mantığı bileşenden ayrı, saf bir fonksiyonda (`copyInviteLink(url, clipboard, onToast)`)
duruyor ve iki testi var (reddedilen pano, hiç olmayan pano) — bu süitin render'ı sunucu tarafı
olduğu için bir tık üretemiyor, oysa sınanması gereken şey tam olarak reddedilme yolu.

## 3. Sanallaştırma kararı: yok, ve bilerek

Ne üye listesi ne de medya ızgarası sanallaştırıldı.

- **Medya ızgarası** hiçbir koşulda `PROFILE_MEDIA_PREVIEW_COUNT = 6` karodan fazlasını
  çizmiyor. Sanallaştırma altı düğüm için ölçüm efekti, referans yönetimi ve bir kaydırma
  konteyneri getirirdi; ızgaranın kendi konteyneri yok, panel gövdesiyle birlikte kayıyor.
- **Üye listesi** için üst sınır `GROUP_DM_MAX_PARTICIPANTS = 250` ve ilk sayfa 50 satır
  (Ş2 §6). Sekme açılışında DOM'a giren 50 satırlık bir liste 330px genişliğinde bir panelde
  ölçülebilir bir maliyet değil. Daha ötesi **istek üzerine** geliyor: `Daha fazla` satırı
  `nextCursor`'a bakıyor, yani en kötü durumda kullanıcı beş kez tıklayarak 250 satıra ulaşıyor.
- Sanallaştırılmış bir liste ayrıca `MessagesSidePanel`'in focus tuzağını ve `Esc` davranışını
  ölçüm penceresine bağlardı: kaydırılmamış bir satır DOM'da olmadığı için sekme turunda da
  yok olurdu.

Ölçüt açık: liste tek bir kaydırıcıda **binlerce** satıra çıkabildiğinde sanallaştırma gerekir.
Bu panel 250'de duruyor ve o 250'yi ancak beş açık tıklamayla getiriyor.

## 4. Kardeş şeritlerin bilmesi gereken sürprizler

1. **`SharedMediaItemDTO` süre alanı taşımıyor.** Prompt "video karoları süre rozetiyle
   ayrılır" diyor; DTO'da `duration` yok ve Ş3 böyle bir kolon açmadı. Uydurulmuş bir `0:00`
   ürünün bilmediği bir sayı olurdu, o yüzden ayırt edici işaret **oynat simgesi** oldu
   (`data-testid="profile-media-tile-video"`). Süre istenirse Ş3'ün DTO'suna alan gerekir.
2. **`+N` örtüsü son karoya biniyor, altıncıya değil.** `mediaOverlayIndex: 6` altı karo
   varken zaten son karodur. Sayfa kısa döndüğünde (Ş3 §7.4) örtü **çizilen** karo sayısına
   göre borçlanıyor: `getSharedMediaOverlayCount(total, tiles.length)` — Ş3'ün yardımcısının
   ikinci parametresi tam bunun için var. İki karo çizilip `total = 18` iken doğru cevap `+16`,
   `+12` değil. Test bunu ayrıca sabitliyor.
3. **Medya ızgarası kendi kendini dolduruyor, tavanla.** Bir sayfa sıfır öğe + dolu imleçle
   dönebildiği için ızgara `loaded < 6 && hasNextPage` iken bir sayfa daha istiyor;
   `MEDIA_AUTO_FILL_PAGE_MAX = 5` tavanı var (`shouldAutoFillMediaGrid` saf ve dışa açık).
   Tavan olmasa, geçmişi temizlenmiş bir sohbet altı kare için kendi başına kadar sayfalardı.
4. **Süresi dolmuş davet = davet yok.** Kart, `expiresAt` geçmişte kalmışsa oluşturma satırına
   düşüyor. Ölü bir bağlantı kopyalatmak, hatayı gönderenin göremediği bir tarayıcıda,
   yapıştırdıktan **sonra** patlatır.
5. **Davet oluşturma mevcut istemciyi kullanıyor:** `setGroupInviteEnabledRequest(id, true)`
   (`lib/dm/client.ts`), başarınca `groupProfileQueryKeys.panel(id)` geçersiz kılınıyor. Yeni
   uç yazılmadı, `lib/dm/client.ts` **değiştirilmedi**.
6. **Üye sayaçları `total`'dan türüyor.** `GroupMemberPage.total` bütün roster; katman başına
   sayaç yok. `ÜYE {m}` = `total - yükleniyönetici`, `YÖNETİCİ {n}` = yüklenen yönetici satırı —
   ve **ikisi de** ancak yöneticiler bittiğinde (bir `MEMBER` satırı görüldüğünde ya da liste
   tamamen yüklendiğinde) basılıyor. Öncesinde sayaç hiç çizilmiyor: yanlış bir sayı, sayısız
   bir başlıktan kötü.
7. **`ProfileSectionLabel.count` `string` alıyor**, `number` değil (rozet sayacı kesir olduğu
   için). Sayaç yokken prop hiç geçirilmemeli — `count={undefined}` ile `exactOptionalPropertyTypes`
   altında derlenmiyor, o yüzden bu şerit `{...(x ? { count } : {})}` kalıbını kullanıyor.
8. **Dosya indirmesi korumalı uca bakıyor:** `/api/v1/attachments/{attachmentId}/download`
   (`ImageLightbox`'ın da kullandığı uç). `SharedFileDTO.url` CDN adresi ve **çapraz kaynak**,
   yani `download` özniteliğini yok sayardı — dosya indirilmek yerine sekmede açılırdı.
9. **Uzantı etiketi locale'siz büyütülüyor.** `"fig".toLocaleUpperCase("tr")` → `FİG`. Panelin
   geri kalanı Türkçe kuralıyla büyütüyor (`ProfileSectionLabel` CSS ile); uzantı **büyütmemeli**.
   Test bunu koruyor.
10. **`ProfileTabMedia` `variant`'ı hiç okumuyor.** 1:1 ve grup aynı ucu kullanıyor ve
    katılımcılık kontrolü servisin ilk satırında (Ş3 §7). Prop sözleşmede duruyor, davranışa
    girmiyor.
11. **`formatSharedTimestamp` `profile-file-row.tsx` içinde yaşıyor** ve hem ızgara hem üye
    satırı oradan okuyor. Doğal yeri `lib/messages/*` olurdu; o klasör bu şeridin yazma
    listesinde değil. Birleştirme yapılacaksa taşınacak fonksiyon bu.

## 5. Kayda geçmesi gereken sapmalar

`metrics.ts` bu şeridin dosyası olmadığı için `SPEC_DEVIATIONS` listesine yazılmadı; ana oturum
uygun görürse ekler.

1. **`profilePanel.mediaTileIconSize = 20`, `dc.html` `L1136` `width="18"` çiziyor.** Otorite
   sırası HTML'i üste koyuyor ama değer Dalga 0'ın sözlüğünde ve bu şerit oraya yazamıyor;
   sözlük kullanıldı. Fark yalnız boş karonun yer tutucu simgesinde görünür (görsel varsa simge
   hiç çizilmez).
2. **Bağlantı satırının alt cümlesi `host` değil, şemasız URL.** Prompt "host satırı" diyor;
   SPEC §15.5 `whispr.app/changelog` ve `figma.com/file/kritik` basıyor, yani host **+ yol**.
   SPEC izlendi (`toLinkDisplayUrl`); çıplak bir alan adında iki değer zaten aynı dizedir.
3. **`{süre} geçerli` EN'de `7 d` okuyor.** `home.time.days` = `{count} gün` / `{count} d`.
   Dalga 0 `messages.profile.invite.duration*` diye bir anahtar açmadı ve sözlük bu şeridin
   dosyası değil. TR tarafı SPEC'le birebir (`7 gün geçerli · Herkes üye ekleyebilir`); EN
   kısaltması bir kozmetik borç.
4. **Video karosu süre rozeti yerine oynat rozeti taşıyor** (sürpriz #1).
5. **`Daha fazla` satırı `messages.friends.action.more` anahtarını kullanıyor.** Dalga 0
   `messages.profile.*.loadMore` açmadı; anahtar `messages.*` ad alanında ve iki sözlükte de
   var (`Daha fazla` / `More`).
6. **Kopyalama hatası `inviteCopied` kipini danger tonuyla taşıyor** (§2, Ş9'un borcu).

## Açık kalan

1. **Ş5:** `ProfileTabProps` + `<Body …>` iki satırı (§2). Bu yapılmadan `Üye ekle` ölü buton,
   üye satırları da tıklanamaz.
2. **Ş9:** danger tonlu `inviteCopied` için `chat.message.copyFailed` eşlemesi (§2).
3. **Ana oturum / ayrı iş:** `SharedMediaItemDTO`'ya `filename` + `contentType` + `sizeBytes`
   eklenirse medya karosu doğrudan `ImageLightbox` açabilir (§1).

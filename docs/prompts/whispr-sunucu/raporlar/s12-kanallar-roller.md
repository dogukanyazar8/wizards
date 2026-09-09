# Ş12 — Kanallar ve Kategoriler · Roller ve Yetkiler

> Şerit: `13-dalga5-s12-kanallar-roller.md` · SPEC-SUNUCU §8.4, §8.5 · Dal `uat` · 2026-08-25
> Bağımlılık: Ş0 (sözlük + `permission-groups.ts`), Ş8 (`PermissionGroupCard`, `ToggleRow`),
> Ş11 (ayarlar kabuğu). Ş11 ve Ş13 **aynı anda** koştu; §5 bunun izlerini anlatıyor.

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                                                     | Satır | İş                                                                     |
| ----------------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------- |
| `apps/web/src/components/shell/server-settings/sections/channels-section.tsx`             |   933 | §8.4 — üst çubuk, kategori kartı, kanal satırı, sürükleme, silme onayı |
| `apps/web/src/components/shell/server-settings/sections/roles-section.tsx`                |   987 | §8.5 — rol listesi, taslak akışı, yetki grupları, silme kartı          |
| `apps/web/src/components/shell/server-settings/sections/channels-roles-sections.test.tsx` |   425 | 27 SSR testi (ölçü, kapı, taslak durumları)                            |
| `apps/web/src/lib/servers/role-color.ts`                                                  |   115 | Altı swatch ↔ `Role.color` köprüsü                                     |
| `apps/web/src/lib/servers/role-editor.ts`                                                 |   237 | Taslak modeli, sıralama, hazır ayar eşlemesi, korunan rol guard'ları   |
| `apps/web/src/lib/servers/role-editor.test.ts`                                            |   177 | 26 birim testi                                                         |
| `apps/web/src/lib/servers/channel-ordering.ts`                                            |   138 | Sıralamanın saf çekirdeği (düğme + sürükleme tek yük)                  |
| `apps/web/src/lib/servers/channel-ordering.test.ts`                                       |   149 | 12 birim testi                                                         |
| `apps/web/src/lib/servers/channel-access.ts`                                              |    50 | Erişim çipi ton eşlemesi                                               |
| `apps/web/src/lib/servers/section-parity.s12.test.ts`                                     |   206 | 16 parity testi (sözlük ↔ `Sunucu.dc.html`)                            |

**Toplam yeni: 3417 satır.**

### Düzenlenen dosyalar

| Dosya                                              | Değişiklik                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/servers/metrics.ts`              | 4 ikon ölçüsü eklendi: `channelsHandleGlyphSize` 13 · `channelsActionGlyphSize` 14 · `channelsRowIconGlyphSize` 16 · `rolesCreateButtonGlyphSize` 14. Bölümün geri kalan ölçüsü Ş0'da hazırdı, tek sayı eklenmedi. |
| `apps/web/src/lib/locale/messages/tr.ts` · `en.ts` | 46 yeni anahtar (`server.settings.channels.*` 21 · `server.settings.roles.*` 25) + 4 çoğul (`_one`) çifti.                                                                                                         |

### Uçlar ve mağaza

Yeni uç **yazılmadı**. Bölümler mevcutları kullanıyor:

- `POST /servers/[id]/channels/reorder` · `POST /servers/[id]/categories/reorder`
- `DELETE /servers/[id]/categories/[categoryId]`
- `GET /channels/[id]/permissions`
- `POST /servers/[id]/roles` · `PATCH /servers/[id]/roles/[roleId]` · `DELETE …`
- Pencereler mağazadan: `openCategoryModal` · `openChannelModal` · `openDeleteChannelDialog`

---

## 2. 18 yetkinin `WorkspacePermissionKey` eşlemesi

Şeridin istediği tablo. Kaynak `lib/servers/permission-groups.ts` (Ş0 yazdı, Ş12 doğruladı ve
tükettiği hâliyle burada kayda geçiriyor). **Yeni anahtar üretilmedi**; 18 satır mevcut 25
anahtarın 17'sinden + 1 `alwaysOn` satırdan oluşuyor.

|   # | Grup         | SPEC satırı                     | `WorkspacePermissionKey`             |
| --: | ------------ | ------------------------------- | ------------------------------------ |
|   1 | Genel        | Kanalları görüntüle             | `VIEW_CHANNEL`                       |
|   2 | Genel        | Mesaj gönder                    | `SEND_MESSAGES`                      |
|   3 | Genel        | Geçmişi oku                     | **yok — `alwaysOn`** (aşağıdaki not) |
|   4 | Genel        | Bağlantı ekle                   | `USE_GIFS`                           |
|   5 | Genel        | Emoji kullan                    | `ADD_REACTIONS`                      |
|   6 | Ses ve Medya | Sese bağlan                     | `CONNECT_VOICE`                      |
|   7 | Ses ve Medya | Konuş                           | `SPEAK`                              |
|   8 | Ses ve Medya | Kamera aç                       | `USE_VIDEO`                          |
|   9 | Ses ve Medya | Ekran paylaş                    | `STREAM`                             |
|  10 | Ses ve Medya | Dosya yükle                     | `ATTACH_FILES`                       |
|  11 | Moderasyon   | Mesaj sil                       | `MANAGE_MESSAGES`                    |
|  12 | Moderasyon   | Üye çıkar                       | `KICK_MEMBERS`                       |
|  13 | Moderasyon   | Üye sustur                      | `TIMEOUT_MEMBERS`                    |
|  14 | Moderasyon   | Davetleri yönet                 | `MANAGE_INVITES`                     |
|  15 | Yönetim      | Kanalları yönet                 | `MANAGE_CHANNELS`                    |
|  16 | Yönetim      | Rolleri yönet                   | `MANAGE_ROLES`                       |
|  17 | Yönetim      | Sunucuyu yönet                  | `MANAGE_SERVER`                      |
|  18 | Yönetim      | **Yönetici** (`yalnızca sahip`) | `ADMINISTRATOR`                      |

**`Geçmişi oku` neden bitsiz:** `PermissionBits` 25 anahtar taşıyor ve hiçbiri "mesaj geçmişini
oku" değil. `CLEAR_CHANNEL_HISTORY` geçmişi **siler** (Genel grubu `Üye` ön ayarında tamamen
açık olduğu için her üyeye veri silme yetkisi verirdi), `MENTION_EVERYONE` ise `@herkes` hakkı
verirdi. Satır `alwaysOn` çizildi: anahtar açık, `aria-disabled`, nedeni ekran okuyucuya
söyleniyor. Sayaca **dâhil** — SPEC'in `14 yetki seçili` örneği Genel 5 + Ses 5 + Moderasyon 4
toplamıdır, yani bu satır sayılıyor (`role-editor.test.ts` bunu doğruluyor).

**Görünmeyen 7 anahtar** (`BAN_MEMBERS`, `CLEAR_CHANNEL_HISTORY`, `DEAFEN_MEMBERS`,
`MENTION_EVERYONE`, `MOVE_MEMBERS`, `MUTE_MEMBERS`, `VIEW_AUDIT_LOG`, `MANAGE_EVENTS`) rolde
duruyorsa **korunur**: `togglePermission` ve `applyRolePreset` yalnız 18 satırı yazar.
Ekranda görünmeyen bir yetkiyi kaydederken düşürmek, kullanıcının hiç dokunmadığı bir ayarı
sessizce silmek olurdu.

**Hazır ayarlar:** `Üye` = Genel · `Moderatör` = Genel + Ses ve Medya + Moderasyon ·
`Admin` = hepsi **eksi** `ADMINISTRATOR` (tasarımın kendi cümlesi).

---

## 3. SPEC'ten sapmalar

### S1 — Hazır ayar çipi ada değil, yetki setine bakar

Referans (`Sunucu-referans.html`) çipi `const on = rName === label` ile işaretliyor: adı `Admin`
olan ama tek yetkisi olmayan bir rol de işaretli görünürdü. Bu bir demo kısayolu. Üründe çip,
görünen 18 satırın **tam olarak** o ön ayarın kümesine eşit olmasıyla işaretleniyor
(`matchRolePreset`). Gösterge bu hâliyle yalan söylemiyor.

### S2 — Kanal satırında yukarı/aşağı düğmesi yok; klavye alternatifi tutamak

Tasarımda kanal satırı `tutamaç · ikon · ad · erişim çipi · düzenle · sil` taşıyor; yukarı/aşağı
yalnız **kategori** şeridinde var. 00 §8 sürükle-bırak listeleri için klavye alternatifini
zorunlu tutuyor. Tasarımda olmayan iki düğme eklemek yerine tutamak gerçek bir `button` yapıldı
ve dnd-kit `KeyboardSensor` + `sortableKeyboardCoordinates` bağlandı: tutamağa `Tab` ile
odaklanılır, `Space` kaldırır, ok tuşları taşır. Kategori sırası hem düğmeyle hem sürüklemeyle
değişir ve **aynı** yükü üretir (`channel-ordering.test.ts` bunu doğruluyor).

### S3 — Erişim çipi kanal başına bir okumayla besleniyor, yanıt gelene kadar boş

`WorkspaceChannel.permissionPreset` sözleşmede duruyor ama üründe onu **yazan yok** (0 üretici).
Ön ayar `deny` maskelerinden türetiliyor ve o maskeler `detail` içinde yok; tek kaynak
`GET /channels/[id]/permissions`. Bölüm `useQueries` ile kanal başına bir okuma yapıyor
(bölüm `lazy`, tipik sunucuda ~10 istek, `staleTime` 60 sn). Yanıt gelene kadar çip **boş**
(iskelet) çizilir. `channel.locked`'tan tahmin yürütmek çipi kısa süreliğine yalancı yapardı —
`locked` tek başına `LOCKED_VISIBLE` ile `ROLE_GATED`'ı ayırt etmiyor. Bkz. TODO(api) T1.

### S4 — Kategorisiz kanallar için tasarımda olmayan bir kart

SPEC'in üç kategorisi de dolu; üründe `detail.ungroupedChannels` var ve boş değilse o kanallar
hiçbir kartta görünmezdi (yani ayarlardan silinemez, düzenlenemez olurlardı). Kategorisiz
kanallar `Kategorisiz` başlıklı sahte bir kartta çiziliyor: sürükleme tutamağı ve `+ kanal ekle`
var, **yeniden adlandırma / silme / yukarı-aşağı yok** (ortada bir kategori kaydı yok). Metin
yeni anahtar değil, `server.modal.channel.noCategory` yeniden kullanıldı.

### S5 — Korunan rolde panel salt okunur, `Rolü sil` yerine guard rozeti

SPEC §8.5 her seçili rol için düzenlenebilir bir panel çiziyor. Üründe `role-service.ts`
korunan rolleri (varsayılan · yönetilen · yüksek yetkili) hem `PATCH` hem `DELETE` için
`403 PROTECTED_ROLE` ile reddediyor. Panel bunu bilerek çiziyor: girdi/swatch/anahtar kilitli,
`Rolü sil` kartının açıklaması "bu rol korunuyor" metnine dönüyor, başlığın altına guard rozeti
(`Sistem rolü` / `Güvenli rol`) düşüyor. Kapıyı yalnız uçta bırakmak kullanıcıyı her dokunuşta
boş bir hataya göndermek olurdu. Guard'ların kendisi eski `server-settings-overlay.tsx`'ten
**taşındı** (yeniden yazılmadı), metinleri `server.settings.roles.guard.*` altına geçti.

### S6 — Rol adı `onBlur`'da, kalan alanlar anında yazılır

SPEC ayrı bir `Kaydet` düğmesi çizmiyor; kabuğun `Değişiklikler kaydedildi` göstergesi var.
Renk · etiketlenebilirlik · yetki anahtarı **anında** `PATCH` atıyor; ad `onBlur`'da. Her tuş
vuruşunda `PATCH` atmak 32 karakterlik bir ad için 32 istek demekti.

### S7 — Rol satırının üye sayısı yüklü üye sayfasından sayılıyor

`@everyone` satırı `detail.server.memberCount` okur (K12: kenar çubuğuyla tek kaynak). Kalan
roller `detail.members` üzerinden sayılır ve bu bir **sayfa**dır; sunucu 100+ üyeliyse sayı
eksik kalabilir. Rol başına üye sayısı veren bir uç yok. Bkz. TODO(api) T2.

### S8 — Renk swatch'ı için tamsayı tablosu

`Role.color` bir `Int` kolonu; tasarımın altı swatch'ı ise **token** adı taşıyor. `role-color.ts`
köprüyü tek yerde kuruyor: ekranda her zaman `hsl(var(--token))` (yani kullanıcının paleti ve
teması geçerli), veritabanında `globals.css`'in **temel** paletinden türetilmiş sabit bir
tamsayı. Palete göre değişen bir sayı kaydetmek, temasını değiştiren kullanıcının kayıtlı rol
renklerini de değiştirirdi. Tanınmayan bir tamsayı (ürünün eski rol paleti, bot rolleri) sRGB'de
en yakın swatch'a düşer — tasarımda olmayan yedinci bir swatch açmak yerine.

| Ton         | `globals.css` (`:root`) | `Role.color` |
| ----------- | ----------------------- | -----------: |
| `textMuted` | `220 11% 46%`           |   `0x687182` |
| `info`      | `199 89% 48%`           |   `0x0DA2E7` |
| `success`   | `154 60% 42%`           |   `0x2BAB74` |
| `warning`   | `39 90% 56%`            |   `0xF4AD2A` |
| `danger`    | `352 84% 60%`           |   `0xEF435A` |
| `primary`   | `235 86% 65%`           |   `0x5966F3` |

### S9 — Yetki kapısı `viewer-permissions.ts`'ten

Şerit "bu bölüm yalnız `MANAGE_CHANNELS` yetkisi olana render edilir" diyor. Ş13 paralelde
`lib/servers/viewer-permissions.ts` yazdı ve ortak prop sözleşmesine `permissions` ekledi;
bölüm kendi "yönetici" tanımını üretmek yerine onu okuyor (`viewerCan`). Roller bölümü aynı
kuralı `MANAGE_ROLES` ile uyguluyor — şerit metninde yazmıyor ama 00 §5'in genel kuralı bu ve
kapı `Yönetici` satırıyla aynı davranışı gerektiriyor.

**Sapma yok denecek yerler:** ölçüler, renk tonları, metinler, `212/1fr`, 4 grup / 18 satır,
`5/5 · 5/5 · 4/4 · 0/4`, taslak akışının tamamı ve `Herkese açık = success` SPEC'le birebir.

---

## 4. TODO(api)

| #      | Konu                                | Bugün                                         | Gerekli                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T1** | Kanal erişim ön ayarı               | Kanal başına `GET /channels/[id]/permissions` | `WorkspaceChannel.permissionPreset` sözleşmede var ama **hiçbir üretici doldurmuyor**. `listWorkspaceServer` projeksiyonu `derivePreset`i çağırıp alanı doldurursa bölümdeki `useQueries` bloğu tamamen silinir ve çipin boş hâli ortadan kalkar. Bileşen alanı zaten **önce** okuyor (`channel.permissionPreset ?? sorgu`), yani uç geldiği gün istemci değişikliği gerekmez. |
| **T2** | Rol başına üye sayısı               | `detail.members` (sayfa) üzerinden sayım      | `GET /servers/[id]/roles` yanıtına `memberCount` eklenmeli; yoksa 100+ üyeli sunucuda rol satırındaki sayı eksik kalır. `@everyone` etkilenmez (`server.memberCount` okur).                                                                                                                                                                                                    |
| **T3** | `Admin` ön ayarıyla oluşturulan rol | `POST /roles` kabul ediyor                    | `createRole` `isProtectedRole` denetimi yapmıyor, `updateRole`/`deleteRole` yapıyor. `Admin` ön ayarıyla oluşturulan rol (`MANAGE_ROLES` + `MANAGE_SERVER` taşır) **oluşturulduğu anda** korunan role dönüşür ve bir daha düzenlenemez/silinemez. Panel bunu doğru çiziyor (guard rozeti) ama ürün kuralı tuhaf; kararı Ş14 ya da bir sonraki paket vermeli.                   |
| **T4** | Kategori/kanal silme onayı          | `ui/modal.tsx`                                | Onay pencereleri Ş8'in `ServerModalShell` diline değil, eski `Modal` bileşenine yaslanıyor (kenar çubuğunun bugünkü davranışıyla aynı). Ş14 pencere dilini birleştirecekse bu iki yer de listeye girsin.                                                                                                                                                                       |

---

## 5. Doğrulama çıktısı

```
pnpm --filter @wizards/web typecheck   → temiz (0 hata)
pnpm --filter @wizards/web lint        → Ş12 dosyalarında 0 hata
pnpm --filter @wizards/web test        → 6932 test / 1613 suite · pass 6929 · fail 0 · skip 3
```

Şeridin kendi testleri, ayrı ayrı koşuldu:

| Dosya                              |                 Test |
| ---------------------------------- | -------------------: |
| `role-editor.test.ts`              |                   26 |
| `channel-ordering.test.ts`         |                   12 |
| `section-parity.s12.test.ts`       |                   16 |
| `channels-roles-sections.test.tsx` |                   27 |
| **Toplam**                         | **81** — hepsi yeşil |

**Not:** paket testi koşarken Ş11/Ş13 aynı dosyalara paralel yazıyordu; ara koşularda onların
dosyalarından gelen 3 kırmızı görüldü (`server-settings-shell.test.tsx` prop eksiği ve iki
sözlük kapısı: `server.settings.invites.*_one` / `server.settings.members.timeout.*_one`
anahtarları EN'de olup TR'de yoktu). Ş12'nin eklediği 4 çoğul çifti iki dilde de yazıldı; şerit
kapanırken **tüm** paket yeşildi, o üç kırmızı da kapanmıştı.

E2E koşulmadı: `server-parity.spec.ts` Ş14'ün işi ve ayarlar kabuğu Ş11'de daha yeni kapandı.

---

## 6. Sonraki şerit için not

1. **Bölüm dosyalarının yolu `sections/` oldu.** Dalga 5 başlarken Ş11 kendi üç bölümünü
   `server-settings/sections/`, Ş13 ise `server-settings/` altına yazıyordu; Ş12 bir süre iki
   yolda birden köprü dosyası tuttu. Kabuk (`server-settings-overlay.tsx`) `sections/`'ı içe
   aktarıyor; köprüler silindi. Yeni bölüm buraya yazılır.

2. **Bölümün prop sözleşmesi tek:** `section-props.ts` → `ServerSettingsSectionProps`, ve her
   bölüm `export default` **vermek zorunda** (`React.lazy` sınırı). Ş12 bölümleri taslak
   alanlarını (`draft`/`patch`/`flush`) kullanmıyor — sıra, rol ve silme kendi uçlarına yazıyor,
   `PATCH /servers/[id]` gövdesine değil.

3. **Onay pencereleri yığına girmeli.** `ui/modal.tsx` `z-[80]` ile ayarların üstünde çiziliyor
   ama `useLayerStack`e kaydolmazsa tek `Esc` dinleyicisi en üstteki katman diye **ayarları**
   görür ve iki yüzey birden kapanır. Ş12 iki onay penceresini de `kind: "modal"` ile kaydetti;
   `ui/modal.tsx` kullanan her yeni yüzey aynısını yapmalı.

4. **`react-hooks/refs` tuzağı.** dnd-kit'in `useSortable` dönüşü ref taşıyor; `sortable.attributes`
   gibi bir erişim lint'te "render sırasında ref okuma" sayılıyor. Alanlar **kanca çağrısında**
   çözülmeli (`const { attributes, listeners, setNodeRef, transform, transition } = useSortable(...)`).
   `channel-sidebar.tsx` zaten böyle yazılmış; yeni sürüklenebilir yüzeyler de öyle yazılsın.

5. **`set-state-in-effect` de kapıda.** "Seçili kayıt listeden düştü, ilkine dön" gibi durumlar
   `useEffect` + `setState` ile yazılırsa lint kırmızı verir. Ş12 rol seçimini durumda **kimlikle**
   tutup görüntüyü render sırasında türetiyor (`editing.key` eşleşmiyorsa ilk rol). Aynı desen
   `server-settings-overlay.tsx` ve `use-server-settings-draft.ts`'in bugünkü iki hatasını da
   kapatır.

6. **Çoğul kuralı iki yönlü.** `messages.test.ts` anahtar kümelerinin **birebir** eşit olmasını
   istiyor, `core.ts` ise "TR'de `_one` yazılmaz" diyor. Doğrusu: `_one` iki dosyaya da yazılır,
   TR'de değeri taban anahtarla aynıdır (`server.channel.userLimit.option_one` bunun örneği).

7. **`Rolü sil` ile "rolü düzenle" aynı kapıdan geçiyor.** Ş13 üyelere rol atarken
   `getAssignableRoles` benzeri bir filtre kuracaksa `role-editor.ts` → `isProtectedRole` /
   `canDeleteRole` fonksiyonlarını kullanmalı; eski `server-settings-overlay.tsx`'teki kopyalar
   K4 ile silindi.

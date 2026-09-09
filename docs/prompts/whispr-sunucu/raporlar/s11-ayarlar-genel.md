# Ş11 — Sunucu ayarları kabuğu + Genel · Görünürlük · İçerik (Dalga 5)

> Dal: `uat` · Kaynak: `design_handoff/design_handoff_sunucu/`
> (otorite: `Sunucu.dc.html` inline `style` > `Sunucu-referans.html` > `SPEC-SUNUCU.md` > `PROMPT.md`)
> Bağımlılık: Ş0 (sözlük + sözleşme) · Ş1 (`iconColor`, `slowModeDelay`) · Ş8 (ortak parçalar, `useLayerStack`)
> Paralel koşanlar: **Ş12, Ş13 — aynı çalışma ağacında, aynı anda** (bkz. §6)
> Karar: **K4** (eski dosya silindi) · **K7** · **K11** · **K12**

---

## 0. Ön koşul — `server-settings-overlay.tsx` davranış envanteri (R4)

Silinen dosya: `apps/web/src/components/shell/server-settings-overlay.tsx`, **1539 satır**, altı sekme
(`overview · roles · members · invites · events · danger`).

### 0.1 Mutation'lar ve invalidate edilen query key'ler

| #   | Mutation               | Uç / istemci çağrısı                                        | `onSuccess` invalidate / setQueryData                                                                                                                                                                                                                               | Taşındığı yer                                                        |
| --- | ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `updateMutation`       | `updateServerRequest` (`PATCH /servers/:id`)                | `setQueryData` → `workspaceQueryKeys.server(id)` · `setQueryData` → `workspaceQueryKeys.servers` (10 alanlık kısmi birleştirme) · `invalidate` → `serverProfileQueryKeys.profile(id)` · `invalidate` → `server(id)` · `invalidate` → `servers` · `router.refresh()` | **Ş11** → `use-server-settings-draft.ts` (aynı beş çağrı, aynı sıra) |
| 2   | `saveRoleMutation`     | `createWorkspaceRoleRequest` / `updateWorkspaceRoleRequest` | `invalidateServerDetail()` = `server(id)` + `servers`                                                                                                                                                                                                               | **Ş12** (§8.5)                                                       |
| 3   | `deleteRoleMutation`   | `deleteWorkspaceRoleRequest`                                | `invalidateServerDetail()`                                                                                                                                                                                                                                          | **Ş12** (§8.5)                                                       |
| 4   | `memberRolesMutation`  | `updateWorkspaceMemberRolesRequest`                         | `invalidateServerDetail()`                                                                                                                                                                                                                                          | **Ş13** (§8.6)                                                       |
| 5   | `revokeInviteMutation` | `revokeServerInvite`                                        | `invalidate` → `server(id)`                                                                                                                                                                                                                                         | **Ş13** (§8.7)                                                       |
| 6   | `kickMemberMutation`   | `kickMemberRequest`                                         | `invalidate` → `server(id)`                                                                                                                                                                                                                                         | **Ş13** (§8.6)                                                       |

`ServerEventsPanel` kendi `useQuery`/`useMutation`'larını taşıyordu (`workspaceQueryKeys.serverEvents`);
Ş11 bu anahtarı **menü sayacı** için okumaya devam ediyor, panelin kendisi Ş13'ün.

### 0.2 Yetki guard'ları

| Guard                                                                                                 | Eski yer                              | Yeni yer                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `detail.server.isOwner` → `Yönetici` hazır ayarı pasif                                                | `ROLE_PERMISSION_PRESETS[].ownerOnly` | **Ş12** — `PermissionGroupCard` `isOwner` **render kapısı** (Ş8)                                      |
| `detail.server.isOwner` → `ELEVATED_ROLE_KEYS` çipleri pasif                                          | rol yetki ızgarası                    | **Ş12**                                                                                               |
| `isProtectedRole(role)` = `isDefault \|\| managed \|\| isElevatedRole` → `Düzenle`/`Sil` hiç çizilmez | rol kütüphanesi                       | **Ş12** (`lib/servers/role-editor.ts`)                                                                |
| `getRoleGuardCopy(role)` → `systemRole` / `safeRole` rozeti + ipucu                                   | rol kütüphanesi                       | **Ş12**                                                                                               |
| `isElevatedRole(role)` → `Admin` rozeti                                                               | rol kütüphanesi                       | **Ş12**                                                                                               |
| `getAssignableRoles(roles, isOwner)`                                                                  | üye rol atama                         | **Ş13** (§8.6)                                                                                        |
| `detail.server.isOwner && member.accessLevel !== "OWNER"` → `At` düğmesi                              | üye satırı                            | **Ş13** (§8.6)                                                                                        |
| `detail.server.isOwner` → `Sunucuyu sil` düğmesi **pasif** (`disabled`)                               | tehlike sekmesi                       | **Ş11 + Ş13** — artık **satır hiç render edilmiyor** (00 §5), `selectServerSettingsSections(isOwner)` |
| `isCommunityServer` → `isPublic`/`discoverable` gövdeden düşürülür                                    | `updateMutation`                      | **Ş11** — `stripAdminOwnedFields()`                                                                   |
| **(yoktu)** overlay'i açma kapısı                                                                     | —                                     | **Ş11 eklendi** — `isAdmin \|\| isOwner` değilse overlay hiç render edilmiyor                         |

**Yeni kapı gerekçesi:** eski dosyada overlay'in kendisinde yetki kontrolü **yoktu**; yalnız üç çağrı
yeri (`channel-sidebar`, `server-member-panel`, `wizards-shell`) `canManage` ile gizliyordu. Üç kapı
tek bir mağaza eylemini (`openServerSettings`) koruyordu; dördüncü bir çağrı yeri açılsa kapı
delinirdi. 00 §5 bunu bileşenin kendisinden istiyor.

### 0.3 `data-testid`'ler ve e2e sözleşmesi

| testid                                        | Eski kullanım                                                                      | Durum                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `server-settings-overlay`                     | `attachments.spec.ts` (görünür/gizli), `design/server-parity.spec.ts` (Ş11 satırı) | **Korundu** — kaplamanın kökü                                                         |
| `server-settings-close-button`                | `attachments.spec.ts`                                                              | **Korundu** — `31×31` kapatma düğmesi                                                 |
| `server-media-gifs-toggle`                    | `attachments.spec.ts`                                                              | **Korundu**, satır artık `div`; tıklanabilir anahtar `…-toggle-switch`                |
| `server-media-files-toggle`                   | `attachments.spec.ts`                                                              | Aynı                                                                                  |
| `server-settings-save-overview`               | `attachments.spec.ts`                                                              | **Silindi** — SPEC §8'de `Kaydet` düğmesi yok (§2.1)                                  |
| `server-settings-overview-saved`              | `attachments.spec.ts`                                                              | **Silindi** → `server-settings-saved-indicator` (`data-state="saving\|saved\|error"`) |
| `server-settings-is-public-toggle`            | (e2e'de yok)                                                                       | **Korundu**                                                                           |
| `server-settings-discoverable-toggle`         | (e2e'de yok)                                                                       | **Korundu**                                                                           |
| `server-settings-visibility-community-notice` | (e2e'de yok)                                                                       | **Korundu**                                                                           |

`e2e/specs/attachments/attachments.spec.ts` "server media settings disable GIFs and file uploads…"
testi yeni akışa göre yeniden yazıldı: `İçerik` bölümüne geç → iki anahtarı tıkla → her birinde
`server-settings-saved-indicator[data-state="saved"]` bekle → kapat.

### 0.4 Bağlı i18n anahtarları

`serverSettings.*` ağacı **113 anahtar** taşıyordu. Ş11 bunlardan **94'ünü sildi** (okuyan kalmadı);
`serverSettings.events.*` (**19 anahtar**) kaldı çünkü `components/servers/server-events-panel.tsx`
onları hâlâ okuyor ve o dosya §8.8'in, yani **Ş13**'ün işi. İki sözlük dosyasına da nedenini yazan
bir yorum bloğu kondu.

Ayrıca `workspace.media.*`, `workspace.messages.*`, `workspace.members.*` anahtarları eski
`Genel Bakış` sekmesinde kullanılıyordu; `workspace-modals.tsx` onları **hâlâ** kullandığı için
silinmedi. Yeni yüzeyler `server.settings.*` altında kendi metinlerini taşıyor (SPEC'ten birebir).

### 0.5 Taşınamayan davranışlar (gerekçeli)

| #   | Davranış                                                     | Neden burada değil                                                                                                                                                                                |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `allowMemberAdds` anahtarı (`workspace.members.allowAdds`)   | SPEC §8.6'nın satırı (`Üyeler kullanıcı ekleyebilir`) — **Ş13**. Alan taslakta ve `PATCH` gövdesinde duruyor, yalnız yüzeyi Ş13'te                                                                |
| 2   | Rol oluşturma/düzenleme/silme, yetki ızgarası, hazır ayarlar | §8.5 — **Ş12**                                                                                                                                                                                    |
| 3   | Üye rol atama, `At`                                          | §8.6 — **Ş13**                                                                                                                                                                                    |
| 4   | Davet kopyalama / iptal                                      | §8.7 — **Ş13**                                                                                                                                                                                    |
| 5   | `ServerEventsPanel`                                          | §8.8 — **Ş13**                                                                                                                                                                                    |
| 6   | `Sunucuyu sil` (`onOpenDeleteServer`)                        | §8.9 — **Ş13**. Prop kabuktan bölüme geçiyor (`section-props.ts`), kabuk onu kaybetmedi                                                                                                           |
| 7   | `Genel Bakış`ın `Erişim` kartı (`accessLevel` + üye rozeti)  | SPEC §8.1'de karşılığı yok. Bilgi kayboldu değil, **yer değiştirdi**: erişim seviyesi §8.6'nın üye rozetinde, üye sayısı sol kolonun sunucu kartında ve profil önizlemesinde                      |
| 8   | Mesaj karakter limitinin `range` girdisi + sayı kutusu       | SPEC §8.3 üç çipli `OptionChipGroup` istiyor (`2B · 250 · 40.000`). Serbest sayı girişi tasarımda yok; kayıtlı ara bir değer varsa çip listesine **başa** ekleniyor (`selectMessageLimitOptions`) |
| 9   | `Silinen mesaj bildirimi` `<select>`'i                       | Aynı gerekçe — SPEC yedi çip veriyor                                                                                                                                                              |

**1–6 kalıcı kayıp değil, dalga içi devir.** Ş12 ve Ş13 bu paketle **aynı dalgada** koşuyor ve
raporun yazıldığı anda ikisi de kendi bölüm dosyalarını doldurmuş durumda (§6).

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                              | Satır | İş                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/servers/server-settings-model.ts`                             | 224   | Saf kararlar: 9 bölüm listesi, sahip kapısı, K12 sayaçları, görünürlük rozeti, **`applyServerVisibilityPatch`**, `diffServerSettings`, `stripAdminOwnedFields`, K7 seçenek listeleri |
| `lib/servers/server-settings-model.test.ts`                        | 212   | **19 test** — bölüm sırası, sahip kapısı, sayaç kaynağı, görünürlük kapısının beş dalı, gövde farkı                                                                                  |
| `lib/servers/section-parity.s11.test.ts`                           | 186   | **13 test** — Ş11'in eklediği 30 sözlük kaydı ↔ referans HTML                                                                                                                        |
| `components/shell/server-settings/server-settings-overlay.tsx`     | 605   | Kabuk: kaplama · 262 kolon · sunucu kartı · 9 menü satırı · başlık çubuğu · `lazySection` haritası · `SaveIndicator`                                                                 |
| `components/shell/server-settings/settings-primitives.tsx`         | 265   | `SettingsCard` · `SettingsCardLabel` · `SettingsFieldHeader` (sayaç + %85 warning) · **`SettingsToggleRow`** · `SettingsGlyph`                                                       |
| `components/shell/server-settings/section-skeletons.tsx`           | 218   | Dokuz bölümün **ayrı** iskeleti (PROMPT §11)                                                                                                                                         |
| `components/shell/server-settings/section-props.ts`                | 45    | Dokuz bölümün tek prop sözleşmesi                                                                                                                                                    |
| `components/shell/server-settings/use-server-settings-draft.ts`    | 283   | Taslak + iki ritimli otomatik kaydetme + gerçek `saveState`                                                                                                                          |
| `components/shell/server-settings/sections/general-section.tsx`    | 526   | §8.1 — ikon kartı (76 + 6 swatch + yükle/kaldır), form kartı, canlı profil önizlemesi                                                                                                |
| `components/shell/server-settings/sections/visibility-section.tsx` | 109   | §8.2 — üç satır + `DiscoveryTagPicker`                                                                                                                                               |
| `components/shell/server-settings/sections/content-section.tsx`    | 149   | §8.3 — iki anahtar + üç `OptionChipGroup`                                                                                                                                            |
| `components/shell/server-settings/server-settings-shell.test.tsx`  | 355   | **17 test** — yetki kapısı, dosya sözleşmesi, iki bölümün render'ı                                                                                                                   |

**Toplam yeni: 3177 satır** (1000'i test).

Ayrıca dokuz bölümün **iskelet** dosyası `sections/` altında oluşturuldu; altısı (§8.4–§8.9)
`lazy + Skeleton` yer tutucusuydu ve Ş12/Ş13 aynı oturumda içlerini doldurdu.

### 1.2 Düzenlenen dosyalar

| Dosya                                                    | Ne değişti                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `components/shell/server-settings-overlay.tsx`           | **`git rm` — 1539 satır silindi** (K4)                                                                           |
| `components/shell/wizards-shell.tsx`                     | Tek satır: import yolu `shell/server-settings/`                                                                  |
| `components/servers/shared/server-icon-swatches.tsx`     | `variant="create" \| "settings"` — §7.1 `26`, §8.1 `27`; **bileşen kopyalanmadı** (Ş10 sınırı)                   |
| `components/servers/modals/modal-focus-contract.test.ts` | K11 testinin okuduğu yol yeni klasöre                                                                            |
| `lib/servers/metrics.ts`                                 | Aşağıdaki 12 kayıt                                                                                               |
| `lib/locale/messages/{tr,en}.ts`                         | **+56 anahtar** `server.settings.*` (3'ü çoğullu, taban + `_one` + `_other`), **−94 anahtar** `serverSettings.*` |
| `eslint.config.mjs`                                      | `src/components/shell/server-settings/**` arbitrary-px kuralına alındı                                           |
| `e2e/specs/attachments/attachments.spec.ts`              | Kaydet düğmesi yerine `server-settings-saved-indicator` akışı                                                    |

### 1.3 Sözlüğe eklenen ölçüler

Hepsi referansın inline `style` (ya da `SET_NAV`/`row()` üreticisinin) değerinden; hepsi
`section-parity.s11.test.ts` ile kilitli.

`settings.{serverNameLineHeight 1.2, menuActiveAlpha .14, visibilityChipBackgroundAlpha .16}` ·
`settingsSections.{generalUploadGap 7, generalUploadGlyphSize 14, generalRemoveBorderAlpha .35,
generalLabelGap 8, generalShortNameLetterSpacing .06, generalNoteLineHeight 1.45,
generalNoteBackgroundAlpha .7, generalProfileIconRowGap 12, visibilityIconGlyphSize 17,
visibilityIconBackgroundAlpha .16, visibilityTitleLineHeight 1.2}`

**Yazılmayan** ölçüler (bilerek): `Salt okunur` çipi kendi kaydını almadı — `settings.visibilityChip*`
ile birebir aynı kutu (`2px 7px` `r6` `9.5px`) ve iki kayıt iki ayrı çip demekti. Aynı gerekçeyle
§8.1'in sayacı `modal.counterFontSize`'ı, %85 eşiği `modal.counterWarnRatio`'yu okuyor.

---

## 2. SPEC'ten sapmalar

### S1 — Ad sayacı `0/48` değil `0/64` **(şerit dosyasının açıkça istediği sapma)**

SPEC §8.1 `Sunucu adı` sayacını `0/48` yazıyor. Sözleşme `UpdateServerFieldsSchema.name`
`z.string().trim().min(2).max(64)` (`packages/types/src/workspace.ts:437`). Ş0 raporunda aksi bir
karar yok (`s0-sozlesme.md` yalnız rol adını 48→32 daraltmış). Sözleşme otorite: sayaç **`0/64`**,
`maxLength={64}`. 48'de kesen bir alan, uçtan geçen ve mobilde görünen bir adı reddederdi.

### S2 — §8.2/§8.3'ün anahtar satırı `ToggleRow` **değil**

Şerit dosyası §4'te "İki `ToggleRow`" diyor. Referans (`Sunucu.dc.html` → `visRows` ve
`contentRows`) bunu doğrulamıyor: o satır `13px 15px` `r16` `surface-card`, solda `32 r11` tonlu
ikon, başlığın yanında çip yuvası. `ToggleRow` ise §7.6'nın `12px 14px` `r14` `surface-base`
satırı ve **ikon taşımıyor** — sözlüğün `toggleRow` ile `settingsSections.visibilityRow*` diye iki
ayrı kayıt tutması da bu yüzden.

Çözüm: yeni `SettingsToggleRow` (§8.2/§8.3'e özel), **anahtarı ortak** (`ServerToggleSwitch`,
`toggleRow.switch*` = `40×22` knob `16`). İkinci bir anahtar uygulaması iki ayrı `aria` davranışı
demek olurdu; Ş8'in S1 sapması aynı kararı vermişti.

### S3 — `Kaydet` düğmesi yok, otomatik kaydetme var

SPEC §8'in başlık çubuğunda yalnız success noktalı `Değişiklikler kaydedildi` göstergesi var;
§8.1–§8.3'te hiçbir yerde kaydet düğmesi yok (§8.5'in taslak çubuğu ayrı, o Ş12'nin). Şerit dosyası
da "gösterge gerçek mutation durumundan; sahte gecikme yok" diyor. Yani bölümler kendiliğinden
kaydediyor.

İki ritim: anahtar/çip/swatch **anında**, metin alanları **700 ms gecikmeli** ve `blur`'da hemen.
Her tuş vuruşunda `PATCH` atmak `authorizationRevision`'ı şişirir ve Ş1'in
`requiresChannelPermissionMetadataInvalidation`'ı izin önbelleğini her harfte düşürürdü.

Gösterge SPEC'in tek durumundan **üç** duruma çıktı (`saving` muted · `saved` success ·
`error` danger). Aynı kutu, aynı ölçü, renk tokendan. Tek durum bırakmak, başarısız bir yazmayı
sessizce yeşil göstermek olurdu.

### S4 — Menü sayacı yüklenmeden `0` yazmıyor

SPEC menü satırlarına sabit sayılar veriyor (`10 · 5 · 5 · 2 · 2`). Üründe dördü `detail`'den
geliyor ama **etkinlik sayısı ayrı uçtan** (`GET /servers/:id/events`). Sorgu dönene kadar çip hiç
çizilmiyor; `0` yazmak etkinliği olan bir sunucuda yalan olurdu.

### S5 — `Tehlike bölgesi` satırı sahibe **çizilmiyor**, pasifleştirilmiyor

SPEC satırı her zaman danger renginde gösteriyor. 00 §5 "yetkisi olmayana **hiç render edilmez**"
diyor ve eski dosya bunun tersini yapıyordu (düğme `disabled`, altında "Sahip Yetkisi Gerekli").
Sahip olmayan yöneticide satır artık menüde yok; açık bölüm `danger` iken sahiplik düşerse
`resolveVisibleSection` `Genel`'e döndürüyor (testli).

### S6 — `lazy` sınırı hem varsayılan hem adlı dışa aktarımı kabul ediyor

`React.lazy` varsayılan dışa aktarım bekler. Ş12/Ş13 kendi bölümlerini adlı dışa aktarımla yazdı
(gövdelerini ayrıca `…SectionView` olarak açıp kabuksuz test edebilmek için). Kabuk `lazySection()`
ile ikisini de kabul ediyor ve ad bulunamazsa **yükleme anında** okunur bir hata atıyor;
`undefined` bir bileşeni React'e vermek "Element type is invalid" diye bambaşka bir yerde patlardı.

Sapma yok denecek diğer her şey (ölçüler, metinler, renk tokenları) referansla birebir.

---

## 3. TODO(api)

| #   | Konu                                                                                                                                                                                                                       | Durum         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | **Yok.** Ş11'in üç bölümü de gerçek uca yazıyor: `PATCH /api/v1/servers/:serverId`. Yeni uç açılmadı.                                                                                                                      | —             |
| 2   | Ş1'in 5 numaralı TODO'su (`iconColor` + sunucu geneli yavaş mod UI'sı) **kapandı**: swatch `iconColor`'a, çip grubu `slowModeDelay`'e yazıyor.                                                                             | Kapandı       |
| 3   | `components/servers/server-events-panel.tsx` artık **hiçbir yerden import edilmiyor** (eski overlay'in tek tüketicisiydi). Ş13 §8.8'i yeniden yazdığında dosya ve `serverSettings.events.*` (19 anahtar) birlikte gitmeli. | **Ş13**       |
| 4   | `components/shell/server-feature-toggle.tsx` ve `server-icon-field.tsx` duruyor — `workspace-modals.tsx` hâlâ kullanıyor. Sunucu **düzenleme** kipi §8.1'e taşındığında ikisi de silinebilir.                              | Ş14 / ayrı iş |

Mock kalmadı.

---

## 4. Doğrulama çıktısı

```
pnpm --filter @wizards/types test      →  529 test, 0 fail
pnpm --filter @wizards/db test         →  146 test (+25 şema), 0 fail
pnpm --filter @wizards/web typecheck   →  EXIT=0
pnpm --filter @wizards/web lint        →  Ş11 dosyalarında 0 hata
pnpm --filter @wizards/web test        →  6932 test, 6927 pass, 2 fail, 3 skipped
```

Ş11'in kendi paketi tek tek koşturuldu:

```
server-settings-model.test.ts        19/19  ✅
section-parity.s11.test.ts           13/13  ✅
server-settings-shell.test.tsx       17/17  ✅
modal-focus-contract.test.ts (yol)    +     ✅
shared-parts.test.tsx (swatch)        +     ✅
parity.test.ts                        +     ✅
                                     ------
                                     114/114 ✅
```

Yeni hex araması temiz:

```
rg "#[0-9a-fA-F]{3,8}" components/shell/server-settings/** lib/servers/server-settings-model.ts
→ 0 eşleşme
```

### Kalan iki kırmızı Ş11'in değil

`pnpm --filter @wizards/web test`'in iki hatası da `locale/messages.test.ts`'in anahtar parity
kapısı ve ikisi de **Ş13'ün** yazdığı, henüz TR karşılığı girilmemiş anahtarlar:
`server.settings.invites.expiry.{day,hour,minute}_one`. Ş11'in eklediği 56 anahtar iki dilde eşit
(aynı test yeşil doğruluyor: "her çoğul biçiminin taban anahtarı iki dilde de var" ✅).

Aynı şekilde `lint`'in üç hatası Ş9 (`create-event-modal.tsx`) ve Ş13
(`invites-section.tsx`, `members-section.tsx`) dosyalarında.

### Koşulamayan

- `pnpm --filter @wizards/web e2e:a11y` ve `playwright test e2e/specs/design/server-parity.spec.ts`
  — e2e ortamı (DB + oturum) bu oturumda yok. `attachments.spec.ts`'in yeniden yazılan testi
  tipten geçiyor ama tarayıcıda sürülmedi.
- **Tarayıcı doğrulaması yarım.** `http://localhost:3000` derleniyor ve giriş sayfası konsol
  hatasız açılıyor; ayarlar kaplamasına ulaşmak oturum açmayı gerektiriyor ve parola girmek bu
  oturumun sınırları dışında. Kaplamanın kendisi tarayıcıda **sürülmedi**.

---

## 5. Sonraki şerit için not

1. **Prop sözleşmesi `section-props.ts`.** Genişletilebilir, daraltılamaz. Ş13 oturum içinde
   `currentUserId` ve `permissions` ekledi; kabuk ikisini de geçiriyor.
2. **Kaydetme kabuğun işi, bölümün değil.** Bölüm `patch()` (anında) ya da `patchDeferred()` +
   `flush()` (metin) çağırır; `PATCH` gövdesini, farkı, topluluk kapısını ve göstergeyi
   `use-server-settings-draft.ts` kurar. Bölümün içinde ikinci bir `updateServerRequest`
   çağrısı, iki ayrı `saveState` demek olur.
3. **Görünürlük kapısı tek fonksiyonda.** `applyServerVisibilityPatch(current, patch)` hem taslağı
   hem gövdeyi üretir. `discoverable: true` göndermek istiyorsan önce `isPublic` açık olmalı;
   fonksiyon aksi hâlde sessizce `false`'a indirir ve bu **kasıtlı** (00 §6).
4. **Menü sayaçları `resolveServerSettingsCounts`'tan.** Üye sayısı `server.memberCount`
   (K12 — ray ile tek kaynak), üye listesinin uzunluğu **değil**; liste sayfalı.
5. **`ServerIconSwatches` artık iki varyantlı.** `variant="settings"` `27 r9`, varsayılan `create`
   `26 r9`. İkisini eşitleme — `section-parity.s11.test.ts` eşitliği hata sayıyor.
6. **`serverSettings.*` neredeyse öldü.** Kalan tek blok `serverSettings.events.*` (19 anahtar) ve
   tek tüketicisi `server-events-panel.tsx`. Ş13 §8.8'i bitirince ikisi birlikte silinmeli.
7. **Ölçü sözlüğü.** Yeni bir sayı yazmadan önce `settings` ve `settingsSections` altında ara:
   §8'in çoğu kutusu Ş0'da zaten var. Aynı sayının ikinci kaydı, iki yüzeyin sessizce ayrışmasıdır.
8. **`lazySection` adı kontrol ediyor.** Bölüm dosyanın dışa aktarım adını değiştirirsen kabuktaki
   ikinci argümanı da değiştir; hata yükleme anında ve okunur çıkar ama derleme onu yakalamaz.

---

## 6. Paralel koşma notu (kayda geçiyor)

Ş11, Ş12 ve Ş13 **aynı çalışma ağacında eşzamanlı** koştu. Temas noktaları:

| Dosya                                                                                | Kim ne yaptı                                                                                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `sections/{channels,roles}-section.tsx`                                              | Ş11 iskeletini yazdı, **Ş12** doldurdu                                                                                                       |
| `sections/{members,invites,events,danger}-section.tsx`                               | Ş11 iskeletini yazdı, **Ş13** doldurdu                                                                                                       |
| `section-props.ts`                                                                   | Ş11 yazdı, Ş13 `currentUserId` + `permissions` ekledi                                                                                        |
| `server-settings-overlay.tsx`                                                        | Ş11 yazdı; Ş13 `currentUserId`/`permissions` prop'larını geçirdi, Ş11 `lazySection`'ı ekledi (S6)                                            |
| `section-skeletons.tsx` · `settings-primitives.tsx` · `use-server-settings-draft.ts` | Yalnız Ş11                                                                                                                                   |
| `lib/servers/parity.test.ts`                                                         | Dokunulmadı — Ş11 kendi parity kapısını `section-parity.s11.test.ts` olarak ayırdı (Ş12 de `section-parity.s12.test.ts` ile aynısını yapmış) |

Rapor yazıldığı anda `typecheck` yeşil, `lint` ve `test` yalnız Ş9/Ş13'ün henüz kapatmadığı beş
maddede kırmızı. Ş11'in dosyalarında sıfır hata.

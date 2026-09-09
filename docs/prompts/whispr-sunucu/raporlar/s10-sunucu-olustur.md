# Ş10 — Sunucu oluştur (940) · rapor

> Dal: `uat`. Kaynak: `design_handoff/design_handoff_sunucu/` (`Sunucu.dc.html` satır 944–1140
> ve 2202–2400 nihai otorite). Şerit dosyası: `11-dalga4-s10-sunucu-olustur.md`.
> Bağımlılık: Ş0 ✅ · Ş1 ✅ · Ş8 (**aynı anda koştu** — bkz. §6).

---

## 0. Sorulan sorunun cevabı — erişim alanları sözleşmeye eklendi mi?

**Evet, eklendi.** `PATCH` yolu kullanılmadı.

Şerit dosyası iki yol veriyordu ("tercih edilen çözüm sözleşmeye eklemektir — Ş0 raporuna
bakılır"). Ş0 raporunda `CreateServerSchema`'ya erişim alanı eklendiğine dair bir kayıt yok ve
kodda da yoktu; bu yüzden tercih edilen yol uygulandı.

`packages/types/src/workspace.ts` → `CreateServerSchema` **beş** alan kazandı:

| Alan                          | Tip                | Varsayılan      | Neden                   |
| ----------------------------- | ------------------ | --------------- | ----------------------- |
| `isPublic`                    | `boolean`          | `false`         | §7.4 `ERİŞİM` radyosu   |
| `discoverable`                | `boolean`          | `false`         | §7.4 `ERİŞİM` radyosu   |
| `tags`                        | `ServerTagsSchema` | yok (opsiyonel) | §7.5 `KEŞİF ETİKETLERİ` |
| `messageCharacterLimit`       | `250–40000`        | yok (opsiyonel) | §7.7 `Gelişmiş`         |
| `deletedMessageNoticeMinutes` | `5–10080`          | yok (opsiyonel) | §7.7 `Gelişmiş`         |

Gerekçe ve sınırlar:

- **Neden `PATCH` değil.** İki çağrı, kullanıcının `Keşfet'te listelensin` seçtiği sunucunun bir
  an için **özel** doğması demekti; ray yeni sunucuyu bu arada çizer. Ayrıca ikinci çağrının
  başarısızlığı, formu doğru dolduran kullanıcıya yanlış ayarlı bir sunucu bırakırdı.
- **Ayrıcalık kapısı bozulmadı.** `AdminCreateServerSchema` gate'i artık `type` ve
  `verificationLevel`: bir sunucunun `COMMUNITY` ya da doğrulanmış olması hâlâ yalnız admin
  yüzeyinden gelir. `isPublic`/`discoverable`'ı sahibin yazabilmesi yeni bir yetki değil —
  `UpdateServerFieldsSchema` ikisini **zaten** taşıyordu, yani sahip bunu oluşturduktan sonra
  yapabiliyordu.
- **Varsayılan `false`.** Alanı hiç göndermeyen istemci (eski mobil sürüm, admin dışı her çağrı)
  eskisi gibi özel sunucu oluşturur. K10 bozulmaz.
- **Değişmez kural serviste.** `discoverable: true` + `isPublic: false` gövdesi şemadan geçer ama
  `resolveVisibilityCreateData` onu `discoverable: false`'a indirir — `PATCH` tarafındaki
  `resolveVisibilityUpdateData`'nın birebir eşi. `.refine()` kullanılmadı: `AdminCreateServerSchema`
  bu nesneyi `.extend()`, `MobileServerCreateRequestSchema` `.omit()` ediyor ve `ZodEffects`
  ikisini de kırardı.
- **Bir hata da yol üstünde kapandı:** Ş0 `iconColor`'ı `CreateServerSchema`'ya eklemişti ama
  `buildServerCreateData` alanı **hiç okumuyordu** — swatch seçimi sessizce düşüyordu. Artık
  kolona yazılıyor.

`AdminCreateServerSchema` davranışı **değişmedi**: iki alanı kendi `default(false)`'ıyla tekrar
tanımlıyor ve `options` gövdeden önce geliyor (test edildi).

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                                   | Satır | İş                                                                                                                         |
| ----------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/servers/create-server-form.ts`                        | 259   | Formun saf modeli: erişim ↔ iki boole, kısa ad türetme, medya özeti, gelişmiş seçenek listeleri, ayak notu, `POST` gövdesi |
| `apps/web/src/lib/servers/create-server-form.test.ts`                   | 197   | 17 test                                                                                                                    |
| `apps/web/src/lib/servers/server-icon-tone.ts`                          | 64    | Ton → CSS değişkeni (`accent2` → `--accent-2`), deterministik türetme, `resolveServerIconTone`                             |
| `apps/web/src/lib/servers/server-icon-tone.test.ts`                     | 60    | 6 test                                                                                                                     |
| `apps/web/src/components/servers/modals/create-server-modal.tsx`        | 875   | 940 px pencere: iki kolonlu gövde, yedi form bloğu, ayak                                                                   |
| `apps/web/src/components/servers/modals/create-server-preview.tsx`      | 320   | 296 px canlı önizleme kolonu, üç kart                                                                                      |
| `apps/web/src/components/servers/modals/create-server-preview.test.tsx` | 118   | 11 render testi (hex sızıntı denetimi dâhil)                                                                               |
| `apps/web/src/components/servers/shared/server-icon-swatches.tsx`       | 112   | Altı swatch — **ortak parça**, Ş11 `Genel` bölümü buradan alacak                                                           |

### Düzenlenen dosyalar

| Dosya                                                                 | Değişiklik                                                                                                                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/workspace.ts`                                     | `CreateServerSchema` + 5 alan; `AdminCreateServerSchema` yorumu                                                                                                                               |
| `packages/types/src/workspace.test.ts`                                | 4 test eklendi/güncellendi (varsayılanlar, üç erişim kombinasyonu, gelişmiş sınırlar, gate'in yeni tanımı)                                                                                    |
| `apps/web/src/lib/workspace/server-service.ts`                        | `resolveVisibilityCreateData` (yeni, saf) · `buildServerCreateData` beş alanı + `iconColor`'ı yazar                                                                                           |
| `apps/web/src/lib/workspace/server-service.test.ts`                   | 8 test eklendi                                                                                                                                                                                |
| `apps/web/src/lib/workspace/client.ts`                                | `createServerRequest` gövde tipi genişledi                                                                                                                                                    |
| `apps/web/src/components/shell/workspace-modals.tsx`                  | Ray `+` → `CreateServerModal`; eski `serverModal` **yalnız düzenleme** kipine indi, ölü oluşturma dalı ve gezinme kolu silindi                                                                |
| `apps/web/src/lib/servers/metrics.ts`                                 | `createServer.access*` (18 kayıt) + `discoveryTagPicker.shared.suggestionChipSelectedBackgroundAlpha`                                                                                         |
| `apps/web/src/lib/servers/parity.test.ts`                             | 5 test eklendi (§7.4 radyo, §6.2↔§7.4 eşitliği, §7.7 çip grubu, §7.7↔§8.3 kasıtlı sapma, §7 önizleme kartları)                                                                                |
| `apps/web/src/components/servers/shared/option-chip-group.tsx`        | `advanced` varyantı + açıklamanın yeri varyanta bağlandı (§6.2 altta, §8.3/§7.7 üstte)                                                                                                        |
| `apps/web/src/components/servers/modals/server-modal-shell.tsx`       | `bodyClassName` · `bodyPaddingX` · `bodyStyle` (940'ın ızgara gövdesi için, katkısal)                                                                                                         |
| `apps/web/src/components/servers/modals/modal-focus-contract.test.ts` | `create-server-modal.tsx` sözleşmeye eklendi                                                                                                                                                  |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`                         | **90** yeni anahtar / dil (`server.create.*` 78 + var olan 1, `server.discoveryTags.*` 12); ağaçtaki toplam `server.create.*` 79, `server.discoveryTags.*` 18 ve iki dil anahtar bazında eşit |

---

## 2. Kabul kriterleri

| Kriter                                            | Durum                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Pencere 940; sol form + 296 önizleme              | ✅ `modalWidths.createServer` + `createServer.previewColumnWidth`, parity testli                                   |
| `<1024px` tek kolon, önizleme üstte               | ✅ `grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[…]` + `order-first lg:order-last`. **Tarayıcıda ölçülemedi** (§5) |
| 6 swatch (`iconColor`)                            | ✅ `ServerIconSwatches`, `26 r9`, seçilinin çerçevesi `2px foreground`                                             |
| Kısa ad otomatik türetme                          | ✅ `deriveCreateServerShortName`, referanstaki formül; kullanıcı yazınca bırakır                                   |
| `0/64` · `0/4` · `0/160` + %85 warning            | ✅ `isCounterWarning(len, max, modal.counterWarnRatio)`                                                            |
| 3 erişim radyosu, üç kombinasyon doğru gidiyor    | ✅ sözleşme yolu (§0), uçtan uca testli                                                                            |
| `DiscoveryTagPicker` **aynı** bileşen             | ✅ Ş8'in `components/servers/shared/discovery-tag-picker.tsx`'i, `variant="create"`                                |
| Keşfet dışı erişimde `opacity .6` + metin değişir | ✅ `disabled` + `lead` anahtarı değişiyor (**davranış farkı** — §3/S3)                                             |
| Üç anahtar varsayılan açık                        | ✅ `CREATE_SERVER_INITIAL_STATE`                                                                                   |
| `Gelişmiş` katlanır + özet canlı                  | ✅ `2B karakter · silinme bildirimi 60 dakika`                                                                     |
| Önizleme üç kartı canlı, boş durum metinleri      | ✅ 11 render testi                                                                                                 |
| Ad < 2 → pasif düğme + warning                    | ✅ `serverModalPrimaryButtonStyle(false)` (`surface-tertiary` · `text-muted` · `not-allowed` · gölge yok)          |
| Başarıda yeni sunucuya gidiliyor                  | ✅ `/channels/{serverId}/{channelId}`                                                                              |
| Yeni hex yok                                      | ✅ parity `hiçbir renk taşımaz` + render testinde satır içi `style` taraması                                       |
| typecheck / lint / test yeşil                     | ✅ §5                                                                                                              |

---

## 3. SPEC'ten sapmalar

| #      | Sapma                                                                                                     | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** | `Silinen mesaj bildirimi` varsayılanı **60 dakika**, K7'nin "SPEC'in 15'i yeni sunucuya" cümlesine rağmen | K7'nin 15'i SPEC **§8.3**'ün (ayarlar bölümü) varsayılanı. Oluşturma penceresinin tasarımı (`Sunucu.dc.html` satır 1840 `csDel: '60 dakika'`, kapalı özet `… silinme bildirimi 60 dakika`) 60 gösteriyor ve otorite sırası HTML'i üstte tutuyor. 60 aynı zamanda kolonun varsayılanı — yani hiçbir yeni sunucu bu yüzden fazladan alan göndermek zorunda kalmıyor. §8.3'ün 15'i Ş11'in işi. |
| **S2** | §7.7'nin dördüncü seçeneği `60 dakika`, §8.3'ün dördüncüsü `1 saat`                                       | Değer aynı (60), etiket farklı. Referans iki yüzeyde iki farklı metin yazıyor (satır 2387 ↔ 2558); her yüzey kendi etiketini kullanıyor.                                                                                                                                                                                                                                                    |
| **S3** | Keşfet dışı erişimde etiket bloğu yalnız **solmuyor**, girdi de kapanıyor                                 | Referansta `csTagOp` sadece opaklık değiştiriyor. Ş8'in ortak bileşeni `disabled` semantiğini seçti ve 00 §8 kapalı kontrolün `aria-disabled` + neden taşımasını istiyor. Ş10 ortak bileşeni çatallamadı; `server.create.tags.disabledReason` anahtarını ekledi.                                                                                                                            |
| **S4** | Kısa ad `toLocaleUpperCase("tr-TR")`, referansın `toUpperCase()`'i değil                                  | `"istanbul kulüp"` referansta `IK`, üründe `İK`. Türkçe bir üründe ray'de yanlış harf çizmek daha büyük hata. `Array.from` ile dolaşılıyor: `word[0]` bir emoji kısa adı yarım vekile bölerdi.                                                                                                                                                                                              |
| **S5** | Önizleme kartları yüklenmiş **görseli** gösteriyor                                                        | Referansta yükleme durumu yok (`csIconBg` her zaman ton). "Canlı önizleme" adını taşıyan bir kolonun yüklenmiş ikonu saklaması yanlış olurdu.                                                                                                                                                                                                                                               |
| **S6** | Swatch'ların erişilebilir adı renk adı değil **rol** adı ("Birincil renk", "Bilgi rengi"…)                | Referans `title="{{ c.title }}"` ile token adını yazıyor. Kullanıcı 23 paletten birini seçebiliyor; "mor" diyen bir etiket palet değişince yalan söylerdi.                                                                                                                                                                                                                                  |
| **S7** | `#fff` yerine `hsl(var(--primary-foreground))`                                                            | Referansın knob/ikon metni `#fff`; PROMPT §1 hex yasağı. Token iki temada da `0 0% 100%`.                                                                                                                                                                                                                                                                                                   |

Bunların dışında §7'de sapma yok.

---

## 4. TODO(api)

**Yok.** Pencerenin gönderdiği her alan gerçek bir kolona yazılıyor:

- `iconColor` → `Server.iconColor` (Ş0 kolonu, Ş1 `PATCH`'i, Ş10 `POST`'u)
- `isPublic` / `discoverable` → `Server.isPublic` / `Server.discoverable`
- `tags` → `Server.tags[]`
- `messageCharacterLimit` / `deletedMessageNoticeMinutes` → aynı adlı kolonlar
- `allowGifs` / `allowFileUploads` / `allowMemberAdds` → `Server.features[]` (`applyServerMediaSettings`)
- `iconUrl` → mevcut `serverIconUploader` (yeni yükleme yolu açılmadı)

Migration **gerekmedi**: beş alanın hepsinin kolonu zaten vardı.

---

## 5. Doğrulama çıktısı

```
pnpm --filter @wizards/types test     → 529 / 529  ✅ (fail 0)
pnpm --filter @wizards/db    test     → 146 / 146  ✅ (fail 0)
pnpm --filter @wizards/web typecheck  → temiz      ✅
pnpm --filter @wizards/web lint       → 10 / 10    ✅ (fail 0)
pnpm --filter @wizards/web test       → 6712 / 6715 ✅ (fail 0, skipped 3, 64.3 sn)
```

Şeridin kendi süitleri (`tsx --test`, dosya bazında):

```
src/lib/servers/create-server-form.test.ts        17 / 17  ✅
src/lib/servers/server-icon-tone.test.ts           6 /  6  ✅
src/lib/servers/parity.test.ts                    38 / 38  ✅
src/lib/workspace/server-service.test.ts          39 / 39  ✅
src/components/servers/modals/create-server-preview.test.tsx  11 / 11  ✅
src/components/servers/modals/modal-focus-contract.test.ts    10 / 10  ✅
```

Tam web süiti Ş8/Ş9 ile paylaşılan çalışma ağacında koştu: 1568 süit, **fail 0**. Atlanan 3 test
şeritten bağımsız, önceden de atlanan üçü.

**Koşulamayan:** tarayıcı doğrulaması. `pnpm --filter @wizards/web dev` ayağa kalktı ama
`/channels` oturumsuzken `/login`'e 307 veriyor ve pencereye ulaşmak gerçek bir hesapla giriş
yapmayı gerektiriyor. **940/296 kolon oranı ve `<1024px` tek-kolon kırılımı ekranda ölçülmedi;**
ikisi de yalnız sözlük + sınıf düzeyinde doğrulandı. Ş14'ün dört çözünürlük × iki tema
karşılaştırmasında bu iki ölçü **önce** bakılmalı.

---

## 6. Sonraki şerit için not

### 6.1 Ş8 ile paralel koşma — kimin dosyası kimde

Ş8, Ş9 ve Ş10 gerçekten **aynı anda** çalıştı ve `components/servers/` altındaki dosyalar koşu
sırasında birkaç kez el değiştirdi. Sonuç durumu:

- `toggle-row.tsx` — Ş10 bir sürüm yazdı, **Ş8 kendi sürümüyle ezdi**. Ş8'inki daha iyi
  (`size` varyantı, `ServerToggleSwitch` ayrı, `disabledReason` zorunlu). Ş10 onu kullanıyor.
- `discovery-tag-picker.tsx` ve `server-icon-swatches.tsx` — Ş10 yazdı, Ş8 `DiscoveryTagPicker`'ı
  kendi sürümüyle değiştirdi ve Ş10'un çağrı yerini kendisi yamadı. `server-icon-swatches.tsx`
  Ş10'da kaldı.
- `server-modal-shell.tsx` — Ş9 yazdı; Ş10 üç **katkısal** prop ekledi (`bodyClassName`,
  `bodyPaddingX`, `bodyStyle`). Mevcut çağıranlar etkilenmedi.
- `option-chip-group.tsx` — Ş8'in dosyası; Ş10 `advanced` varyantını ekledi **ve** açıklamanın
  yerini düzeltti (aşağıda).

### 6.2 Ş11'e devredilen üç şey

1. **`OptionChipGroup`'un `settings` varyantında açıklama çiplerin üstüne taşındı.** Ş8'in ilk
   hâli üç varyantta da altta çiziyordu; `Sunucu.dc.html` satır 1395 §8.3 için üstte, satır 853
   §6.2 için altta gösteriyor. `wizard` varyantı **değişmedi**. Ş11 §8.3'ü çizerken bunu
   yeniden "düzeltmesin".
2. **`DiscoveryTagPicker`'ın ayarlar-özel i18n anahtarları hâlâ yok:**
   `server.discoveryTags.{title,lead,helper,suggested,info}`. Ş10 yalnız kendi yüzeyinin
   koşulsuz çizdiklerini ekledi (`counter`, `inputLabel`, `group.*`). Ş11 kalan beşini eklemeden
   §8.2 ekranda ham anahtar gösterir.
3. **Swatch satırı kopyalanmayacak.** `components/servers/shared/server-icon-swatches.tsx`
   `toneLabel` prop'u alıyor; §8.1 kendi anahtar ağacını verip aynı bileşeni kullanır.

### 6.3 Ş11'in silmesi gereken ölü kod

`components/shell/workspace-modals.tsx` içindeki `serverModal` artık **yalnız** `mode === "edit"`
için açılıyor. §8.1 `Genel` bölümü indiğinde şunlar kalkar: eski `Modal` bloğu, `serverName` /
`serverShortName` / `serverDescription` / `serverIconUrl` / `serverAllow*` state'leri,
`serverMutation`, `ServerIconField`, `ServerFeatureToggle` ve `workspace.modal.server*` i18n
anahtarları. `openServerModal` çağrısı `wizards-shell.tsx:1389`'da yalnız `mode: "create"` ile
kaldı — `edit` kipini açan başka çağıran yok, yani bugün o pencereye ulaşan bir yol da yok.

### 6.4 İki tuzak

- **`metrics.ts` ile `SPEC_DEVIATIONS` arasındaki denetim gerçekten çalışıyor.** Sözlüğe konan
  her yarıçap `parity.test.ts`'in "merdiven" testinden geçiyor; `createServer.access*`'i eklerken
  bu yakalanabilirdi. Yeni ölçü ekleyen şerit önce o testi okusun.
- **`ui/modal` SSR'de `null` döner** (`useSyncExternalStore` sunucuda `false`). Bu yüzden
  `renderToStaticMarkup` ile bir pencerenin **gövdesi** test edilemez; Ş10 önizleme kolonunu ayrı
  bir bileşene ayırıp onu test etti. Aynı bölme Ş11–Ş13'te de gerekecek.

# Ş6 — Metin kanalı: başlık, sabitlenen çubuk, bildirim çipi (Dalga 3)

> Şerit dosyası: `07-dalga3-s6-metin-kanali.md`
> Okunanlar: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §3 (tamamı), `design/Sunucu.dc.html`.
> Bağımlılık: Ş0 · Ş4 · Ş5 — üçü de bitmişti. Dal: `uat`. Tarih: 2026-08-26.
> **Sıra dışı not:** şerit Dalga 3'ün değil, Ş14'ten **sonra** koştu (bkz. `s14-kapanis.md` §0).

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                           | Satır | İş                                                      |
| ----------------------------------------------- | ----- | ------------------------------------------------------- |
| `components/chat/server-channel-header.tsx`     | 318   | §3.1 başlık — saf sunum                                 |
| `lib/servers/channel-access-count.ts`           | 91    | `N üye erişebilir` adapteri + kanal/kategori bulucu     |
| `lib/servers/channel-pins.ts`                   | 37    | Kanal sabitlerini çubuğun okuduğu şekle çevirir         |
| `components/chat/server-channel-frame.test.tsx` | 341   | 25 test: başlık · çubuk · yazıyor · bestekâr sözleşmesi |

### 1.2 Ağır düzenlenen

| Dosya                                    | Değişiklik                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/chat/chat-area.tsx`          | Satır içi başlık bloğu (≈130 satır) `ServerChannelHeader`e devredildi; kanal sabit çubuğu bağlandı; eski bildirim açılırı + konumlandırıcısı + mutasyonu **silindi** |
| `components/messages/pinned-strip.tsx`   | `variant` prop'u (`dm` \| `server`); DM yolu **bit bit aynı**                                                                                                        |
| `components/chat/typing-indicator.tsx`   | §3.3 son maddesine göre yeniden yazıldı (47 → 91 satır)                                                                                                              |
| `components/chat/message-input.tsx`      | Kanal yolu tek satırlık düzene alındı; geometri `SERVER_METRICS.composer`dan                                                                                         |
| `lib/servers/metrics.ts`                 | `typing` grubu eklendi (§3.3 son maddesi referanstan)                                                                                                                |
| `lib/servers/parity.test.ts`             | `yazıyor` satırının parity bloğu (+1 test)                                                                                                                           |
| `e2e/specs/design/server-parity.spec.ts` | **Ş6 satırı açıldı**; `UNBUILT_SURFACES` listesi silindi                                                                                                             |
| `e2e/specs/a11y/server-a11y.spec.ts`     | Kapsam notu güncellendi (Ş6/Ş7 artık kapsam **içinde**)                                                                                                              |
| `lib/home/token-audit.ts`                | İzin listesine `fontFamily: DISPLAY_FONT` (bkz. §5)                                                                                                                  |

---

## 2. §3.3 denetimi — madde madde

Şerit dosyasının açık talebi: "`message-item.tsx` ve `message-list.tsx` SPEC §3.3'ün her
maddesini karşılıyor mu?" Ölçüldü, karşılamayan **iki** madde çıktı.

| §3.3 maddesi                                                  | SPEC      | Üründe                                                          | Sonuç             |
| ------------------------------------------------------------- | --------- | --------------------------------------------------------------- | ----------------- |
| Liste boşluğu `16px 0 8px`                                    | 16/0/8    | `messageList.paddingTop 16` · `paddingBottom 8`                 | ✅                |
| Satır arası `--m-gap: 11`                                     | 11        | Yoğunluk tercihinden (`density.ts` → `COMPACT.rowGap = 11`)     | ✅                |
| Satır dikey boşluğu `--m-pad: 5px`                            | 5         | Yoğunluk tercihinden (`COMPACT.rowPaddingY = 5`)                | ✅                |
| **Satır yatay boşluğu `24px`**                                | 24        | `messageList.rowPaddingX = 26`                                  | ❌ **sapma S3**   |
| Tarih ayracı `r999 primary/.14 1px primary/.3 600 10.5 .08em` | —         | `dividerChip*` birebir                                          | ✅                |
| Avatar 36                                                     | 36        | `avatarSize 36`                                                 | ✅                |
| Ad `600 14.5 Outfit`                                          | 14.5      | `authorFontSize 14.5`                                           | ✅                |
| Rol rozeti `danger/.14 r6 600 10`                             | r6/10     | `roleChip{Radius 6, FontSize 10}`                               | ✅                |
| Saat `500 11` muted                                           | 11        | `timeFontSize 11`                                               | ✅                |
| Gövde `14.5/1.55`                                             | 14.5/1.55 | `bodyFontSize 14.5` · `bodyLineHeight 1.55`                     | ✅                |
| Bahsetme `1px 5px r6 primary/.16`                             | —         | `mentionChip*` birebir                                          | ✅                |
| Dosya kartı `420 · 10/12 · r13 · ikon 34 r10 · indirme 30 r9` | —         | `attachment*` birebir                                           | ✅                |
| Tepkiler `h26 r999` + `26×26` kesikli `+`                     | —         | `reaction{Height 26, Radius 999, AddSize 26}`                   | ✅                |
| Kod parçası `2px 7px r7 500 13`                               | —         | `inlineCode*` birebir                                           | ✅                |
| Thread düğmesi `6px 11px r11` + avatar 20                     | —         | `threadStrip*` birebir                                          | ✅                |
| **Bahsedilen satırın şeridi `2.5px`**                         | 2.5       | `mentionStripeWidth = 3`                                        | ❌ **sapma S3**   |
| **Yazıyor: üç nokta solda, 5px, `1 → .6 → .3`**               | —         | Noktalar **sağdaydı**, `4px`ti, `animate-bounce` ile zıplıyordu | ❌ **düzeltildi** |

Yani on yedi maddenin **on dördü** zaten karşılanıyordu; biri (yazıyor göstergesi) bu şeritte
düzeltildi, ikisi (satır yatay boşluğu ve bahsetme şeridi) **bilerek** düzeltilmedi — gerekçe
sapma S3'te.

---

## 3. §3.1 başlık

Eski başlık Mesajlar paketinin dilindeydi: `min-h-11`, `rounded-[1rem]`, `gap-2`, `h-9 w-9`
ikon kutusu, sağda kaydırılabilir bir düğme rayı. §3.1'in `14px 20px` çerçevesi, `33×33 r11`
düğmeleri, `1×22` ayracı, kategori çipi ve bildirim çipi orada **yoktu**.

Yeni bileşen **saf sunum**: veri ve mutasyon `chat-area.tsx`te kaldı, prop olarak geliyor.
Ölçüler `SERVER_METRICS.textHeader`ten; bileşende çıplak sayı yok.

| §3.1 maddesi                                      | Karşılığı                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `#` ikonu 20 muted                                | `textHeader.iconSize`                                                                  |
| Ad `600 16.5 Outfit`                              | `nameFontSize` + `DISPLAY_FONT`                                                        |
| `PAYCORE` çipi                                    | `server-channel-category-chip` — kanalın kategorisinden (`resolveChannelCategoryName`) |
| Bildirim çipi (warning) yalnız iki durumda        | `notificationLevel === "all"` iken çizilmez                                            |
| Alt satır `<konu> · N üye erişebilir`             | `server-channel-subtitle`                                                              |
| Üç düğme `33 r11` + `1×22` ayraç + `Üyeler` (h33) | `server-channel-{search,notifications,pins,members}`                                   |
| Aktif düğme `primary/.16` + primary               | `actionActiveBackgroundAlpha` + `aria-pressed`                                         |
| **Zil rengi tercihe göre**                        | `all → --primary`, `mentions → --warning`, `muted → --danger`                          |

### Bildirim tercihi (§3)

Ş9 §5.2'nin devri kapandı: başlıktaki zil artık `chat-area`in **kendi** açılırını değil,
SPEC §6.4'ün 460 px'lik penceresini (`ChannelNotificationsModal`) açıyor. Eski açılır, onun
konumlandırıcısı (`getFloatingPanelPosition`, iki `useEffect`, `createRafThrottledCallback`
aboneliği) ve `notificationSettingsMutation` **birlikte** silindi — iki yerde iki bildirim
yüzeyi, ikisinin ilk düzenlemede ayrışması demekti.

Okuma tarafı yerinde: `notificationSettingsQuery` başlığın çipini ve zil rengini besliyor;
pencere kaydettiğinde aynı query key güncelleniyor, yani çip ve zil **anında** dönüyor.

---

## 4. §3.2 sabitlenen çubuk · §3.4 bestekâr

**Çubuk.** Şerit dosyası "yeni bileşen değil, varyant" dedi; `PinnedStrip` `variant` aldı.
Sunucu varyantı `8px 20px` boşluk, `surface-secondary/.7` zemin, `border/.4` alt kenar,
**warning** raptiye ve `11.5px` metin kullanıyor. DM varyantı bit bit aynı kaldı
(test: "DM varyantı değişmedi"). Sabitlenen yoksa çubuk çizilmiyor (`selectVisiblePin`).

**Bestekâr.** Kanal yolu artık Mesajlar paketinin **tek satırlık** düzenini kullanıyor;
geometri farkı tek yerde toplandı ve `SERVER_METRICS.composer`dan geliyor: kutu `9px 12px`
`r15`, dosya düğmesi `34 r11`, `Aa`/emoji/GIF `34 r11`, gönder `36 r12` + `0 8px 18px -12px
primary` gölge, dış boşluk `0 20px 18px`. Placeholder `#<kanal> kanalına yaz`.

**§4'ün "render edilmez" kuralı uygulandı:** sunucu `allowFileUploads` ya da `allowGifs`
kapalıyken ilgili düğme artık **pasif değil, hiç yok**. DM yolu etkilenmedi (orada bayraklar
her zaman açık geliyor).

---

## 5. SPEC'ten sapmalar

| #      | Sapma                                                                                 | Gerekçe                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** | **`N üye erişebilir` türetiliyor; `PRIVATE`/`ROLE_GATED` kanalda hiç yazılmıyor.**    | **TODO(api)** — kanala erişebilen üye sayısını veren uç yok, `permissionPreset`i dolduran üretici de yok (Ş12 T1). Ön ayar `locked` bayrağından türetiliyor (`workspace-modals.tsx`in kanal düzenleme kipiyle **aynı** varsayım); rol→üye eşlemesi istemcide eksik olduğu için gizli/role bağlı kanalda sayı **uydurulmuyor**, satır yalnız konuyu yazıyor |
| **S2** | **Sunucu varyantının çubuğunda kapatma düğmesi yok.**                                 | §3.2 çubuğu dört parçadan kuruyor (raptiye · sayı · özet · `Tümünü gör`) ve beşinci bir düğme çizmiyor. Yetenek kaybı değil: sabitler başlıktaki raptiye düğmesinden de açılıyor. DM şeridi kapatma düğmesini koruyor                                                                                                                                      |
| **S3** | **Satır yatay boşluğu 26 kaldı (SPEC 24), bahsetme şeridi 3 kaldı (SPEC 2.5).**       | İkisi de `MESSAGES_METRICS.messageList` altında ve **DM ile paylaşılıyor**. 00 §2.3 mesaj satırı dilini "hazır, yeniden çizilmez" ilan ediyor; PLAN "DM yüzeyleri kapsam dışı" diyor. Değiştirmek, dokunulmaması söylenen yüzeyi de kaydırırdı. İki tasarım paketi bu iki sayıda ayrışıyor; karar bir sonraki paketin                                      |
| **S4** | **`yazıyor` satırının yatay boşluğu varyanta bağlı** (DM 26, kanal 24).               | Satır üstündeki mesaj satırlarıyla hizalanmak zorunda ve S3 gereği iki paketin satırı farklı boşlukta. Tek sayı seçmek, ikisinden birinde satırı iki piksel kaydırırdı                                                                                                                                                                                     |
| **S5** | **`fontFamily: DISPLAY_FONT` token denetiminin **paylaşılan** izin listesine girdi.** | Kural değerin token'a bağlı olup olmadığına bakıyor; sabit `var(--font-display), sans-serif`e çıkıyor ve `typography.ts`in var oluş sebebi bu. Sabitin gerçekten bir token'a çıktığı `lib/servers/token-audit.test.ts`te ayrıca kanıtlanıyor. Liste sekizden dokuza çıktı, sayaç testi güncellendi                                                         |

Renk sapması **yok**: yeni hex, yeni `rgb()`, yeni tema sınıfı üretilmedi.

---

## 6. TODO(api)

| #   | Ne eksik                                                                           | Bugün ne oluyor                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Kanala erişebilen üye sayısı** — uç yok, `permissionPreset` de dolmuyor (Ş12 T1) | Herkese açık / kilitli kanalda sunucunun üye sayısı yazılıyor; gizli ve role bağlı kanalda satır yalnız konuyu taşıyor. Uç geldiği gün değişecek tek yer `lib/servers/channel-access-count.ts` |
| 2   | **Kanal sabitleri ile DM sabitleri iki ayrı uç** (Mesajlar karar #7)               | Çubuk tek bileşen; kanal yanıtı `lib/servers/channel-pins.ts` ile çevriliyor. Uç birleşirse çevirici silinir                                                                                   |

Bunun dışında mock kalmadı: başlık, çubuk, bildirim tercihi ve bestekâr gerçek uçlara bağlı.

---

## 7. Doğrulama çıktısı

```
pnpm --filter @wizards/types test      529 pass · 0 fail
pnpm --filter @wizards/db test         146 pass · 0 fail
pnpm --filter @wizards/web typecheck   exit 0
pnpm --filter @wizards/web lint        exit 0
pnpm --filter @wizards/web test        7141 pass · 0 fail · 3 skipped
```

Şeridin kendi testleri: `server-channel-frame.test.tsx` **25**, `parity.test.ts` +1 (48),
`server-screen-copy.test.ts` genişletildi (§3 cümleleri), `token-audit.test.ts` kapsamı büyüdü.

Parity matrisinin **Ş6 satırı açıldı**: `server-parity.spec.ts` → `SURFACES` içinde
`{ lane: "Ş6", testId: "server-text-channel" }`; dört çözünürlük × iki tema.

### Şeridin açtığı ve kapattığı iki kırık

1. **`lib/messages/audit-budget.test.ts`** kırıldı: yeni `server-channel-header.tsx`
   `components/chat` kapsamında ve `fontFamily: DISPLAY_FONT` dört sapma sayıldı. Sabit
   paylaşılan izin listesine gerekçesiyle eklendi (sapma S5); bütçe **0'da kaldı**.
2. **`lib/servers/parity.test.ts` kapsam kapısı** kırıldı: `typing` grubu sözlüğe eklenmiş ama
   parity bloğu yazılmamıştı. Ş14'ün açtığı kapı işini yaptı; blok eklendi.

### Koşulamayan

- `pnpm --filter @wizards/web e2e:a11y` ve `server-parity.spec.ts` — e2e ortamı yok
  (`E2E_TEST_PASSWORD` üretilmemiş, e2e veritabanı ayakta değil). Ş4 · Ş11 · Ş13 · Ş14 aynı
  duvara çarptı; kod yazıldı, tarayıcıda sürülmedi.

---

## 8. Kabul kriterleri

- [x] Başlık: ikon, ad, kategori çipi, bildirim çipi, alt satır, 3 ikon düğmesi + `Üyeler`
      düğmesi SPEC ölçülerinde; aktif düğme tonu doğru.
- [x] Bildirim tercihi değişince çip ve zil rengi anında değişiyor; sunucuya yazılıyor
      (pencere Ş9'un, okuma bu şeridin).
- [x] Sabitlenen çubuk yalnız sabit mesaj varken çiziliyor; `Tümünü gör` sheet'i açıyor;
      DM tarafındaki `PinnedStrip` kullanımı bozulmadı.
- [x] Bestekar ölçüleri SPEC'te; `allowGifs`/`allowFileUploads` kapalıyken düğmeler yok.
- [x] `N üye erişebilir` işaretli `TODO(api):` adapterden geliyor (sapma S1).
- [x] §3.3 denetimi yapıldı; bir madde düzeltildi, iki madde gerekçesiyle raporlandı (§2).
- [x] Yeni hex yok; typecheck/lint/test yeşil; parity spec'in metin kanalı bölümü açıldı
      (koşusu e2e ortamına bağlı).

---

## 9. Sonraki şerit için notlar

1. **`chat-area.tsx` artık bildirim yüzeyi taşımıyor.** Zil `openChannelNotificationsModal`
   çağırıyor; ikinci bir açılır eklemeyin.
2. **`PinnedStrip` iki varyantlı.** Yeni bir yüzey eklerken `variant` seçin; ölçüler
   `GEOMETRY` tablosunda ve iki paketin sözlüğünden okunuyor.
3. **Bestekârın kanal yolu `referenceComposer` düzenindedir.** `mode === "channel"` artık
   `serverComposer` demek; DM'e ait bir sınıfı değiştirmek kanalı da değiştirir.
4. **`fontFamily: DISPLAY_FONT` artık paylaşılan izin listesinde.** Yeni bir font sabiti
   açan, onu da listeye gerekçesiyle eklemek zorunda — yoksa `components/chat` bütçesi kırılır.
5. **S3'ün iki sayısı açık kaldı** (satır yatay boşluğu 26 vs 24, bahsetme şeridi 3 vs 2.5).
   İki tasarım paketi ayrışıyor; kararı veren, DM yüzeyini de ölçmek zorunda.

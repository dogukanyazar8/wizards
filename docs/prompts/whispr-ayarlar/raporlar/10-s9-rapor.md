# Ş9 — Bildirimler bölümü (Dalga 3) · rapor

**Dal:** `uat` · **Commit atılmadı.**
Kaynak prompt: `docs/prompts/whispr-ayarlar/10-dalga3-s9-bildirimler-bolumu.md`
Ortak bağlam: `00-ortak-baglam.md` · SPEC §5.4 · referans kare `screens/05-bildirimler-turler.png`

7 sekme · 14 grup · 50 satır · 2 özel blok · 5 paylaşılan anahtar. Paketin en kalabalık bölümü
ve paylaşılan anahtarların tamamı burada.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar (sahiplenilen)

| Dosya                                                                                         | Satır | İş                                                         |
| --------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------- |
| `sections/notifications/notification-prefs-bridge.ts`                                         | 557   | Satır anahtarı ↔ `NotificationPrefs` köprüsü (saf)         |
| `sections/notifications/notifications-tab-defs.ts`                                            | 85    | Ağacın çalışma zamanı türevi (48 saat, zaman dilimi, izin) |
| `sections/notifications/notifications-tab-body.tsx`                                           | 92    | Motor sürücülü gövde + satır kapısı                        |
| `sections/notifications/notifications-section-context.ts`                                     | 68    | Blokların ve sekmelerin okuduğu bölüm bağlamı              |
| `sections/notifications/notification-permission.ts`                                           | 83    | `Notification.permission` dış kutusu                       |
| `sections/notifications/notifications-section.tsx`                                            | 325   | Bölüm kökü: sorgular, değer kutusu, runtime, 7 sekme       |
| `sections/notifications/{general,surfaces,types,quiet-hours,sounds,panel,exceptions}-tab.tsx` | 20–29 | Yedi sekme                                                 |
| `blocks/notif-summary-block.tsx`                                                              | 109   | `Şu anki durum` üç kutulu özet                             |
| `blocks/exceptions-block.tsx`                                                                 | 392   | `Aktif istisnalar` listesi + düzey menüsü                  |
| `notifications/sound-preview.ts`                                                              | 119   | `Önizle` çaları + varlık eşlemesi                          |
| `public/sounds/call.mp3` · `call-whispr.mp3`                                                  | —     | Yeni çağrı sesi varlıkları                                 |
| 6 test dosyası                                                                                | 1 025 | **88 test, 26 suite, hepsi yeşil**                         |

Toplam 3 015 satır (test dâhil).

### 1.2 Dokunulan paylaşılan dosyalar (asgari)

| Dosya                                             | Değişiklik                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `rows/setting-custom-block.tsx`                   | **Yalnız kendi iki anahtarım** (`notifSummary`, `exceptions`) + iki import. Ek olarak ölü `makePlaceholder` silindi — §4.1 |
| `lib/settings/metrics.ts`                         | `SPEC_DEVIATIONS` #10; `blocks.notifSummary` dolgu düzeltmesi + ek ölçüler; `blocks.exceptions` ek ölçüler                 |
| `lib/settings/metrics.test.ts` · `parity.test.ts` | Sapma sayacı ve alan listesi (Ş10 ile birlikte 11'e ulaştı)                                                                |
| `lib/locale/messages/{tr,en}.ts`                  | 22 yeni anahtar (iki dilde)                                                                                                |
| `lib/locale/settings-screen-copy.test.ts`         | `pending` sayacı 224 → **250**                                                                                             |

**Hiç dokunulmadı:** `lib/settings/tree.ts`, satır motoru (`rows/*` — defter satırı hariç),
`lib/notifications/prefs-service.ts`, `prefs-policy.ts`, `lib/settings/exceptions-client.ts`.

---

## 2. Kritik kuralların karşılığı

### 2.1 Beş paylaşılan anahtar tek durum (tuzak #4)

`nd2`, `na5`, `na6`, `nq1`, `ns1` için **hiçbir hizalama kodu yazılmadı** — çünkü hizalama bir
davranış değil, bir kimlik meselesi. Bölüm kökü tek bir `SettingsValueStore` kurar; yedi sekme de
aynı kutudan okur ve ağaçtaki iki geçiş aynı `key`'i taşır. İkinci bir yerel state hiç doğmuyor.

Kanıt (`notifications-tab-body.test.tsx`): tek kutuya `nd2 = 2`, `na6 = true`, `nq1 = false`
yazılıyor; Genel · Yüzeyler · Sessiz saatler sekmeleri ayrı ayrı çiziliyor ve üç anahtarın da
`aria-checked` / seçili etiketi iki sekmede **aynı** çıkıyor.
`notification-prefs-bridge.test.ts` ayrıca beş anahtarın hiçbirinin `stateKey` taşımadığını
(yani ikinci bir kutuya bağlanmadığını) ağacı gezerek sabitliyor.

### 2.2 `np4` ≠ `na6` — regresyon testi

Üç ayrı testle kilitlendi:

- `toSettingsValues` — `panel.showContent = true`, `systemPreview = false` düzleştiğinde
  `np4 === true` ve `na6 === false`.
- `toNotificationPrefsPatch({ np4: true })` → `{ panel: { showContent: true } }`; `systemPreview`
  yamada **yok**.
- `toNotificationPrefsPatch({ na6: true })` → `{ systemPreview: true }`; `panel` yamada **yok**.
- Çizimde: `np4` yalnız Panel sekmesinde, `na6` yalnız Genel/Yüzeyler sekmelerinde ve iki
  açıklama birbirinden farklı.

### 2.3 İki etiket kümesi, tek `level` anahtarı (sapma #6)

`b1` ağaçtaki `Tüm bildirimler / Yalnız DM ve bahsetmeler / Kapalı` etiketleriyle çiziliyor ve
`NOTIF_LEVEL_BY_INDEX = ["all", "important", "off"]` üzerinden **aynı** `level` alanını yazıyor —
560 px penceredeki radyo kartlarının yazacağı alanla birebir aynı. Test, üç değerin de Ayarlar
kümesinden geldiğini ve `Yalnızca önemli` (560 px kümesi) dizesinin bu sekmeye **sızmadığını**
doğruluyor. İki metin de korunuyor; hiçbiri diğerine uydurulmadı.

### 2.4 Kilitli iki satır (tuzak #5)

`nt13` / `nt14` motorun `lockedToggle` yolundan geçiyor: `aria-disabled="true"`,
`cursor-not-allowed`, `data-locked="true"`, `Kilitli` pili. Tıklama `onChange` çağırmıyor
(`SettingToggle` erken dönüyor) **ve** `SettingsValueStore.setValue` kilitli anahtarı zaten
düşürüyor. Köprüde üçüncü bir kapı var: `toNotificationPrefsPatch` `nt13`/`nt14`'ü yamadan
çıkarıyor, yani sunucudan 400 alacak bir gövde hiç kurulmuyor.

Test: iki satıra `setValue(false)` + `flush()` → gönderilen yama listesi **boş**, değer `true`
kalıyor.

### 2.5 Özet kutusunun üç sayısı

Üçü de gerçek veriden:

| Kutu               | Kaynak                                                             |
| ------------------ | ------------------------------------------------------------------ |
| Açık bildirim türü | 14 açılabilir türün açık olanları **+ kilitli 2** / **16**         |
| Teslim kanalı      | `inApp` · `system !== "off"` · `push` · `email` → açık olanlar / 4 |
| Aktif istisna      | `GET /users/me/notification-exceptions` **uzunluğu** (Ş4)          |

İkinci sayaç kurulmadı. Tasarımdaki `9/15` ve `2/4` sabitlenmedi — test bu iki dizenin markup'ta
**bulunmadığını** ayrıca doğruluyor. Veri gelmeden sıfır değil tire (`—`) yazılıyor: yükleme
sırasında `0/16` yazmak "hiçbir türün açık değil" demekti.

### 2.6 Sessiz saat menüleri

48 seçenek (`00:00`…`23:30`, yarım saatlik adım). Tasarımdaki dörder seçenek örnek veri olarak
kabul edildi ve ağaçtaki liste çizimde kullanılmıyor. Izgaraya oturmayan gerçek bir değer
(`23:15` — başka bir istemciden gelebilir) listeye **sıralı** giriyor; düşürülseydi menü kullanıcıya
başka bir saati seçili gösterirdi. Varsayılanlar `23:00` / `08:00` sunucudan geliyor.

Gece aşan aralık: `nq1` alt metni artık sabit değil, `notif.quietHours.range` /
`rangeSecure` anahtarlarıyla gerçek başlangıç ve bitişten kuruluyor (`Her gün 23:00 – 08:00`,
Genel sekmesinde `· güvenlik bildirimleri hariç` ekiyle). Cümle ağaçtaki metnin aynısı; yalnız iki
saat interpolasyonla geliyor.

### 2.7 Çağrı sesi varlıkları

`public/sounds/call.mp3` (2,55 s) ve `call-whispr.mp3` (2,45 s) üretildi. Format mevcut altı
varlıkla birebir: **MPEG-1 Layer III · 44 100 Hz · 256 kbps · stereo**.

- `call.mp3` (Klasik): 440 + 480 Hz çift tonlu klasik zil, 0,9 s açık / 0,35 s kapalı, iki patlama.
- `call-whispr.mp3` (Whispr): D5 → A5 iki notalı yumuşak çan motifi (2,01× ve 3,02× kısmi
  harmonikler, üstel sönüm), iki kez.

Her ikisi de tıklama olmasın diye giriş/çıkış rampalı ve −1 dBFS'e normalize.

`Önizle` seçili profili ve seviyeyi gerçekten çalıyor; aynı anda tek önizleme (`pause()` +
`currentTime = 0`, öğe atılmıyor). Ses satırı kapalıyken de çalıyor ve bunu **açıklamıyor**.
Test sekiz varlığın sekizinin de diskte durduğunu doğruluyor.

`Tüm sesler → Varsayılana döndür` dört satırın on iki anahtarını ağaçtan okuyup tek yamada
gönderiyor (motorun 250 ms birleştirmesi); test tek istek çıktığını sabitliyor.

### 2.8 `ne1` kendi grubunda (sapma #9)

Motorun `ownGroupTitleKey` kuralı zaten bunu yapıyor; Ş9 hiçbir metin değiştirmedi. Test
`Aktif istisnalar` + `Varsayılanlar` başlıklarının ikisinin de çizildiğini ve satır metninin
(`Yeni istisnalar için geçici sessize alma`) değişmediğini doğruluyor.

### 2.9 `SPEC_DEVIATIONS` #10

```ts
{ field: "sounds.storage", html: "device", spec: "server" }
```

`Ses ayarları bu cihaza kaydedilir.` notu K3 (tipli kolon, sunucu saklama) ile çelişiyor. Metin
**korunuyor** — referans metniyle sözlüğü karşılaştıran `settings-screen-copy.test.ts` aksi hâlde
tek taraflı kırılırdı — davranış sunucu tarafında. `parity.test.ts` bu notun referansta
gerçekten durduğunu ayrıca doğruluyor.

---

## 3. Mimari kararlar

### 3.1 Bölüm kendi değer kutusunu kuruyor

Ş6 `write`'ı zorunlu bıraktı ve "hangi ucun hangi alanı yazdığı" eşlemesini motora koymadı
(Ş6 §2.1). Ş5 kabuğu `renderSection` yuvasını **bağlamadı** ve dört bölüm şeridinden hiçbiri o
dosyanın sahibi değil. Bu yüzden kutu bölüm kökünde kuruluyor: `NotificationsSection` tek
`SettingsValueStore` + tek runtime sağlıyor, yedi sekme onu tüketiyor.

`PATCH` **tam** nesne döndürüyor; yanıt `queryClient.setQueryData` ile önbelleğe yazılıyor ve
`store.applyRemote` ile kutuya geri düşüyor (uçuşta olan anahtarlar atlanarak). İki sekme arasında
gezinen kullanıcı bir an bile eski değeri görmüyor.

### 3.2 Ağaç okundu, türevi çalışma zamanında üretildi

`tree.ts` bu şeritte yazılmaz. Ama üç satırın seçenekleri çalışma zamanında bilinir (48 yarım
saat, hesabın zaman dilimi, izin durumu) ve bunlar ağaca yazılabilecek şeyler değil.
`deriveNotificationsTab` ağacın tanımını alıp yalnız üç alanı değiştiriyor
(`options`, `descriptionKey → descriptionData`, izne bağlı `badgeKey`/`tone`); satır sayısı, sırası
ve anahtarları **birebir korunuyor** ve bu bir testle sabitleniyor. Çizimi yine motor yapıyor
(`SettingsTabBody` herhangi bir `SettingsTabDef` çizebiliyor), yani satır markup'ı yazılmadı.

### 3.3 `np3` kapısı satırın dışında

`Görünme süresi` bir `segment`; Ş7'nin motora eklediği `runtime.disabledRows` yalnız `input` ve
`action` kontrollerini kapsıyor (`render-settings-tab.tsx:334` ve `:368`), segmenti kapsamıyor.
Motor bu şeritte yazılmadığı için kapı satırın **dışında** duruyor: satırı yine
`SettingsTreeRow` çiziyor, kapı `inert` + `aria-disabled` + kilitli opaklığıyla sarıyor.
`inert` seçildi çünkü `pointer-events:none` yalnız fareyi keserdi ve klavye kullanıcısı devre dışı
segmentin içinde dolaşmaya devam ederdi.

### 3.4 İki blok bağlamdan besleniyor

Blok sözleşmesi `{ data, row }` ve `data` bir `Record<string, string>`. İstisna listesi oraya
sığmıyor (ikon, kapsam, düzey, bitiş zamanı). Liste ayrı bir bağlamdan geliyor; `data` yalnız
**metin** taşımaya devam ediyor. Bağlamın boş olmayan bir varsayılanı var, böylece bloklar ve
sekmeler bölüm kökü olmadan da (yalıtılmış testler) anlamlı çiziliyor.

### 3.5 İzin `useSyncExternalStore` ile okunuyor

Sunucu `permission`'ı **her zaman** `unknown` gönderiyor (tarayıcının cevabı, saklanan kolon
değil). Değer küçük bir dış kutudan okunuyor; bir efekt içinde `setState` çağırmak ilk boyayı
`unknown` ile yapıp hemen bir tur daha render etmek olurdu (ve React derleyici kuralı bunu
reddediyor). `Kontrol et` / izin isteği sonrası `refreshNotificationPermission()` aboneleri uyarıyor.

---

## 4. Sapmalar ve açık uçlar

### 4.1 `makePlaceholder` silindi (defter dışı tek dokunuş)

Prompt "kayıt defterinde YALNIZ kendi 2 anahtarının satırını değiştir" diyor. İki satırı
değiştirdim; ama `notifSummary` ve `exceptions` defterdeki **son iki yer tutucuydu** ve doldukları
anda `makePlaceholder` ölü sembol hâline geldi — lint `no-unused-vars` ile kırmızı verdi. Ölü
fabrika ve `PLACEHOLDER_HEIGHTS` silindi; dosyanın kendi yorumu bunu zaten öngörüyordu
("yer tutucular bu kayıtla birlikte silinir"). Yirmi yuvanın yirmisinin de sahibi var.

### 4.2 `+{n} daha` → `İlk {count} istisna gösteriliyor`

Prompt `truncated` geldiğinde `+{n} daha` satırı istiyor. Ş4'ün sözleşmesi
(`NotificationExceptionList = { items, truncated }`) **toplam sayı taşımıyor**: `truncated` yalnız
"200'den fazla var" demek. `n` hesaplanamıyor ve uydurulamaz. Satır aynı koşulda ve aynı yerde
çiziliyor, metni gerçeği söylüyor: `İlk {count} istisna gösteriliyor`.

Kapatmak için Ş4'ün ucunun bir `total` alanı vermesi gerekir.

### 4.3 `na5` pili: izin verildiğinde **düşürülüyor**

Ağaç `na5`'i referansın durumuyla sabitliyor (`badgeKey = Engellendi`, `tone = danger`). Gerçek
izin `granted` olabilir ve o hâlde "Engellendi" yazmak ekranda bir yalan olurdu. Ağaç bu şeritte
yazılmadığı ve `İzin verildi` / `Doğrulanamadı` karşılıkları `settings.row.na5.*` altında
**bulunmadığı** için (dead-key testi yeni anahtara izin vermez), türev şunu yapıyor:

- `denied` → pil ve tehlike zemini **duruyor** (referansın hâli).
- `granted` / `prompt` / `unknown` → pil ve ton **düşüyor**; iki düğme kalıyor.

Pil yerine uydurma bir metin yazılmadı. Kalıcı çözüm Ş13'e: ağaç `na5`'e `badgeData` verirse
üç durum da kendi metnini alabilir.

### 4.4 Zaman dilimi listesi genişletiliyor

Ağaçtaki `nq4` üç seçenek taşıyor (`Europe/Istanbul · GMT+3`, `Europe/London`,
`America/New_York`). Hesabın dilimi bunların dışındaysa listeye ekleniyor; aksi hâlde
`Asia/Tokyo` kullanan bir hesap menüde `Europe/Istanbul` seçili görür ve menüye dokunmadan
kaydeden ilk hareket sessiz saatlerini dokuz saat kaydırırdı.

### 4.5 48 saat seçeneği i18n anahtarı değil

Saat etiketleri (`00:00`…`23:30`) sözlük anahtarı değil, doğrudan dize. `t()` bulamadığı anahtarı
kendisi döndürdüğü için çizim doğru; 48 ölü `settings.option.nq2.*` anahtarı üretmemek için
bilinçli seçim. Saatler rakam, çeviri gerektirmiyor. Ağaçtaki dört seçenek anahtarı yerinde
duruyor (dead-key testi yeşil), yalnız çizilmiyor.

### 4.6 `blocks.notifSummary` dolgusu düzeltildi

Sözlükte `cellPaddingY: 13, cellPaddingX: 14` yazıyordu; referansın inline `style`'ı
`padding:14px 15px`. Ölçü otoritesi referans olduğu için 14/15'e çekildi ve kutu artık bir piksel
dar çizilmiyor. `valueWeight` · `valueLineHeight` · `labelMarginTop` · `labelFontSize` ·
`labelLineHeight` eklendi (hepsi referanstan). `blocks.exceptions`'a da eksik alt ölçüler eklendi
(`nameLineHeight`, `levelLineHeight`, `untilPillLineHeight`, `editFontSize`, `editBorderAlpha`,
`removeBorderAlpha`, `removeIconSize`, `glyphSurfaceAlpha`, `removeHoverSurfaceAlpha`) — mevcut
değerlerin hiçbiri değişmedi, hepsi eklemeydi.

### 4.7 Motorda bir tuzak: `useSettingsRowRuntimeState` merdiveni

```ts
openSelect: overrides.openSelect ?? openSelect,
```

Kabuk (Ş5) merdiveni devraldığında `openSelect: null` (menü kapalı) geçirir ve `??` bunu **yerel
state'e düşürür** — devralma sessizce yarım kalır, iki kaynak yan yana yaşar. Ş9 bu yüzden
merdiveni **devralmadı**, yerel bıraktı; `SettingSelect` `Esc`'i zaten kendi içinde işliyor.
Ş13'e: devralma isteniyorsa `??` yerine `"openSelect" in overrides` kontrolü gerekir.

### 4.8 Bırakılan `TODO(api):`

| Yer                                    | Ne                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notifications-section.tsx` `onAction` | Masaüstünde işletim sistemi bildirim ayarlarını açan köprü yok; tarayıcıda böyle bir API yok. `Sistem ayarlarını aç` izin isteği gönderiyor (reddedilmişse anında `denied` dönüyor, kullanıcıyı yanıltmıyor). Ş10'un izin bloğu Tauri köprüsünü kurunca buraya bağlanır. |
| `exceptions-client.ts` (Ş4, okundu)    | Sunucu kapsamının web yazma ucu yok, kanal ucu `DEFAULT` yazamıyor. İki durum da `disabled` düğme + açıklama olarak yüzeye çıkarıldı; Ş9 yeni uç açmadı.                                                                                                                 |

---

## 5. Kabul kriterleri

| Kriter                                                                   | Durum | Kanıt                                                                                                                                     |
| ------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 7 sekme, 14 grup, 50 satır eksiksiz; sayım `tree.ts` ile uyuşuyor        | ✅    | `notifications-tab-body.test.tsx` — sayım ağaçtan okunuyor, her satırın `data-setting-row` / `data-setting-block` niteliği aranıyor       |
| 5 paylaşılan anahtar iki sekmede aynı değer                              | ✅    | Tek kutu + `stateKey` yokluğu + üç anahtarın iki sekmede aynı `aria-checked`/etiketi                                                      |
| `np4` ≠ `na6` (regresyon)                                                | ✅    | Üç ayrı test (düzleştirme, iki yönde yama, çizim)                                                                                         |
| Genel düzey menüsü ile 560 px radyo kartları aynı `level`, farklı etiket | ✅    | `NOTIF_LEVEL_BY_INDEX` + etiket sızmama testi                                                                                             |
| Kilitli iki satır tıklanamıyor, `aria-disabled`, sunucuya istek yok      | ✅    | Markup testi + kutu testi (yama listesi boş)                                                                                              |
| Ters mantıklı iki tür düz mantık gösteriyor                              | ✅    | `toNotificationPrefsPatch({ nt3:false, nt4:false })` → `{ mentionRole:false, mentionEveryone:false }`; çevirme `prefs-service`'te kalıyor |
| Özet kutusundaki üç sayı gerçek veriden                                  | ✅    | `summarizeNotificationPrefs` testleri + `9/15`/`2/4` sabitlenmedi testi                                                                   |
| Sessiz saat menüleri 48 seçenek; varsayılan `23:00`/`08:00`              | ✅    | `notifications-tab-defs.test.ts`                                                                                                          |
| Gece aşan aralık açıklamada doğru                                        | ✅    | `notif.quietHours.range` interpolasyonu + çizim testi                                                                                     |
| 4 ses satırı çalıyor; çağrı varlıkları eklendi; tek önizleme             | ✅    | `sound-preview.test.ts` (varlık varlığı diskten doğrulanıyor)                                                                             |
| `Varsayılana döndür` dört satırı sıfırlıyor                              | ✅    | Tek yamada 12 anahtar                                                                                                                     |
| `Paneli otomatik kapat` kapalıyken `Görünme süresi` `disabled`           | ✅    | `inert` + `aria-disabled` kapısı, iki yönlü test                                                                                          |
| İstisna listesi boşken boş durum; `truncated` alt satırı                 | ✅    | `exceptions-block.test.tsx` — metin §4.2'deki sapmayla                                                                                    |
| `ne1` kendi grubunda, metni değişmemiş                                   | ✅    | Başlık + satır metni testi                                                                                                                |
| `SPEC_DEVIATIONS` 10. kayıt                                              | ✅    | `metrics.ts` + `parity.test.ts`                                                                                                           |
| Açık/koyu temada referans kare karşılaştırması                           | ⛔    | **Koşulamadı** — §6                                                                                                                       |

---

## 6. Koşulamayan tek madde: referans kare karşılaştırması

`SettingsWindow`'un `renderSection` yuvasını **hiçbir şerit bağlamadı**: Ş5 kabuğu yuvayı açık
bıraktı, Ş7–Ş10'un dördü de kendi bölüm kökünü dışa veriyor ama `settings-window-route.tsx` hiçbirini
çağırmıyor. Bölüm bu yüzden üründe henüz erişilebilir değil ve tarayıcıda açılıp
`screens/05-bildirimler-turler.png` ile yan yana konamadı.

Yuvayı bağlamak Ş9'un dosyası değil. Bağlama tek satır olsun diye imza hazır:

```tsx
renderSection={(input) =>
  input.section.key === "notifications" ? renderNotificationsSection(input) : null
}
```

Yerine yapılan: 88 testin tamamı markup düzeyinde çizimi doğruluyor (satır sayısı, kilit
nitelikleri, kapı, oranlar, boş durumlar, ölçülerin sözlükten geldiği, markup'ta hex/rgb renk
bulunmadığı). Görsel karşılaştırma **Ş13'e** kalıyor.

---

## 7. Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Paket **paralel şeritlerle aynı çalışma ağacında** koşuyor (Ş7, Ş8, Ş10 aynı anda yazıyor), bu
yüzden kapı iki başlıkta raporlanıyor.

### Ş9 kapsamı — temiz

| Komut              | Sonuç                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| `typecheck`        | Ş9 dosyalarında **0 hata**                                                           |
| `lint`             | Ş9 dosyalarında **0 hata** (dokunulan paylaşılan dosyalar dâhil)                     |
| `test`             | Ş9'un 6 test dosyası: **88 test / 26 suite / 88 pass / 0 fail**                      |
| Paylaşılan kapılar | `settings-screen-copy` · `messages` · `metrics` · `parity`: **51 test, hepsi yeşil** |

### Ağaç genelinde kalan — başka şeritlerin

Son tam koşuda **5 953 testin 5 935'i yeşil**, kalan hatalar Ş9 dışında:

| Dosya                                 | Hata                                                                              | Sahibi                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `rows/render-settings-tab.test.tsx`   | `SettingsRowRuntime` literal'lerinde `disabledRows` eksik (2 tip hatası, 16 test) | Ş7 — `disabledRows` alanını motora bu şerit ekledi; testteki iki literale `disabledRows: {}` eklemek yeterli |
| `lib/settings/bootstrap*`             | `featuredContributor` eksik                                                       | Ş10 (koşu sırasında düzeltildi)                                                                              |
| `blocks/app-icon-grid-block.test.tsx` | `rel="icon"` iddiası                                                              | Ş8                                                                                                           |

Ş9 bu dosyaların sahibi değil ve prompt sahiplik sınırını bağlayıcı kıldığı için dokunulmadı.

---

## 8. Ş13 için not

1. `renderSection` yuvasını bağla (§6) ve dört bölümü de tak.
2. `useSettingsRowRuntimeState` merdiven devralma tuzağı (§4.7).
3. `na5` pilinin üç durumu için ağaçta `badgeData` (§4.3).
4. Ş4 ucuna `total` eklenirse `+{n} daha` gerçek sayıyı yazabilir (§4.2).
5. `parity.test.ts` genişletilirken `blocks.notifSummary` (14/15) ve `blocks.exceptions` alt
   ölçüleri referansa karşı doğrulanabilir hâle geldi (§4.6).

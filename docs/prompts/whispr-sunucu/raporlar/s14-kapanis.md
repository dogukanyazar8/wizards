# Ş14 — Ölçekleme · a11y · i18n · parity · temizlik (Dalga 6, kapanış)

> Şerit dosyası: `15-dalga6-s14-olcek-a11y-i18n-parity.md`
> Okunanlar: `00-ortak-baglam.md`, `PLAN.md` §3 (K1–K12), `PROMPT.md`, `SPEC-SUNUCU.md` §11–§12,
> `design/Sunucu.dc.html`, **13 rapor** (`s0` · `s1` · `s2` · `s3` · `s4` · `s5` · `s8` · `s9` ·
> `s10` · `s11` · `s12` · `s13`).
> Dal: `uat`. Tarih: 2026-08-25.

---

## 0. Şeride başlarken bulunan gerçek — **Ş6 ve Ş7 hiç koşmamış**

`raporlar/` altında **s6** (metin kanalı) ve **s7** (ses kanalı) raporu **yok**. Kod da bunu
doğruluyor, üç bağımsız kanıtla:

| Kanıt                         | Ölçüm                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `SERVER_METRICS` tüketicileri | `chat-area.tsx` ve `voice-channel-view.tsx` sözlüğe **hiç** dokunmuyor (`rg SERVER_METRICS` 54 dosya, ikisi yok) |
| `data-testid`                 | `server-text-channel` ve `server-voice-channel` DOM'da yok                                                       |
| Ş9 §5.2'nin devri             | "`chat-area`in bildirim menüsü Ş6'da silinmeli" — menü hâlâ duruyor (`chat-area.tsx:1221`)                       |

Bu, Ş14'ün kapatabileceği bir şey **değil**: iki şerit tasarımın iki büyük yüzeyini (mesaj
başlığı çipleri, sabitlenen çubuk, ses ızgarası, kamera varyantı, ekran paylaşımı sahnesi,
kontrol çubuğu) yeniden çiziyor ve bu bir "kapanış" işi değil, iki dalga işi. Ş14 bunun yerine
**envanteri kesin hâle getirdi**: parity matrisinde iki satır gerekçesiyle `test.fixme` kaldı,
kabul listesinde ilgili altı madde işaretlenmedi (§8).

Kalan **on üç** şeridin yüzeyleri eksiksiz; matris onların hepsini gerçekten ölçüyor.

> **2026-08-26 eki — Ş6 ve Ş7 koştu.** Bu raporun yazıldığı gün eksik olan iki şerit
> sonradan uygulandı: `raporlar/s6-metin-kanali.md` ve `raporlar/s7-ses-kanali.md`.
> Aşağıdaki §6.1 tablosunun iki `fixme` satırı **açıldı**, kabul listesindeki altı madde
> **işaretlendi** ve §9'un envanterine iki yeni satır girdi. Bu bölümün geri kalanı
> ölçümün o günkü hâli olarak duruyor: bir raporun değeri, neyin ne zaman eksik olduğunu
> söyleyebilmesinde.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                 | Satır | İş                                                                             |
| ----------------------------------------------------- | ----- | ------------------------------------------------------------------------------ |
| `apps/web/src/lib/servers/shell-layout.ts`            | 85    | §11'in dört kırılımı: `selectServerShellLayout` + `buildServerSingleColumnCss` |
| `apps/web/src/lib/servers/shell-layout.test.ts`       | 148   | Kırılım eşiklerinin iki yanı + kabuğun sözleşmesi (14 test)                    |
| `apps/web/src/lib/servers/server-screen-copy.test.ts` | 566   | İki dilde metin denetimi: 236 SPEC cümlesi + gömülü metin taraması (14 test)   |
| `apps/web/src/lib/servers/token-audit.test.ts`        | 136   | Token denetiminin sunucu kapsamı (6 test)                                      |
| `apps/web/e2e/specs/a11y/server-a11y.spec.ts`         | 234   | Sunucu ekranı a11y senaryosu (11 test, 2 tema)                                 |

### 1.2 Ağır düzenlenen

| Dosya                                                           | Değişiklik                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `components/shell/wizards-shell.tsx`                            | §11 kademeleri: `navPanelHidden` · `thirdColumnHidden` · `desktopColumnsHidden` ayrıldı; sütun genişliği kalan kolonlardan türüyor |
| `components/shell/server-settings/server-settings-overlay.tsx`  | `md:flex-row` → `data-server-single-column` + 1024 px medya sorgusu                                                                |
| `components/servers/modals/create-server-modal.tsx`             | Aynı kırılım; `lg:` (rem) yerine sözlükten gelen px                                                                                |
| `components/servers/modals/server-modal-shell.tsx`              | `bodyAttributes` prop (gövdeye `data-` tutamağı)                                                                                   |
| `components/shell/workspace-modals.tsx`                         | 754 → 575 satır; ölü sunucu **düzenleme** dalı silindi                                                                             |
| `components/shell/server-settings/sections/members-section.tsx` | İki satır menüsü katman yığınına bağlandı + dış tıklama kapatması                                                                  |
| `components/shell/server-menu.tsx`                              | Kapanışta odak tetikleyiciye döner                                                                                                 |
| `lib/servers/layer-stack.ts`                                    | Dördüncü katman türü `menu (75)`                                                                                                   |
| `lib/servers/parity.test.ts`                                    | 820 → 945 satır; üç kapsanmamış grup + iki kapsam kapısı                                                                           |
| `lib/home/token-audit.ts`                                       | `SERVER_TOKEN_AUDIT_SCOPE`, kapsam parametreli `collectTokenAuditFiles`, `font-family` kuralı düzeltmesi                           |
| `e2e/specs/design/server-parity.spec.ts`                        | 300 → 536 satır; 48 `fixme` gövdeye döndü, 9 bölüm + 4 kırılım eklendi                                                             |
| `lib/locale/messages/{tr,en}.ts`                                | **119** ölü anahtar silindi (her dilde)                                                                                            |

### 1.3 Silinen dosyalar

```
apps/web/src/components/servers/server-events-panel.tsx     (çağıranı yok; Ş13 §8.8 yerine geçti)
apps/web/src/components/shell/server-feature-toggle.tsx     (tek tüketicisi ölü düzenleme dalıydı)
apps/web/src/components/shell/server-icon-field.tsx         (aynı)
```

---

## 2. Dört kırılım (§11)

Şeridin başında **yalnız biri** uygulanmıştı.

| Kırılım                             | Şerit öncesi                                        | Şerit sonrası                                               |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| `<1400` sağ panel katman olur       | ✅ Ş5 uygulamıştı                                   | değişmedi                                                   |
| `<1200` gezinme paneli daralır      | ❌ sözlükte sayı vardı, **tüketicisi yoktu**        | `navPanelHidden`; ray + kanal çubuğu kolonda kalır          |
| `<1024` ayarlar/oluşturma tek kolon | ⚠️ ayarlar `md:` (768), oluşturma `lg:` (rem)       | ikisi de sözlükten gelen **px** medya sorgusu               |
| `<960` kanal çubuğu drawer'a        | ❌ tüketicisi yoktu (768'de kabuğun kendi `md:`'si) | `thirdColumnHidden`; içerik drawer'daki `NavigationPanel`de |

**K1 ile §11 çelişiyordu ve çözüldü (sapma S1, §5).** 00 §1 gezinme panelini "dokunulmaz" ilan
ediyor; §11 `<1200`'de "yalnızca ikonlar, 74px" istiyor. Panelin **kendisi** yeniden
çizilmedi — kabuk onu kolondan düşürüyor ve geriye zaten ikon-only, zaten 74 px olan **sunucu
rayı** kalıyor. Panel kaybolmuyor: `MobileDrawerTrigger` onu drawer'da açıyor.

`<960`'ta sütunun **tamamı** gizlenmiyor: §11 hiçbir eşikte rayı kaldırmıyor.
`desktopColumnsHidden = navCollapsed && !isServerColumnRoute` — tam gizleme yalnız sunucu
**dışındaki** rotaların 960 kırılımıdır (`08-faz7` §3, değişmedi).

**Neden `lg:` değil, px medya sorgusu.** Tailwind v4'ün `lg:`'i `64rem`'dir ve kabuk kökü 2K'da
24 px'e çıkarınca 1536 CSS px'e kayar. Bugünkü dört çözünürlükte sonuç aynı çıkıyor (ölçek
1360'ın altında ×1'de sabit), yani `lg:` **bugün** yanlış değil — ama sayı sözlükte değil
Tailwind'in temasında yaşıyordu ve 00 §3 "bileşende çıplak sayı yazılmaz" diyor. Eşik artık
`SERVER_METRICS.layout.modalSingleColumnBelow`.

### Dört çözünürlük

`selectServerShellLayout` 1360 · 1920 · 2560 · 3840'ta hiçbir kolonu düşürmüyor
(`shell-layout.test.ts` → "dört hedef çözünürlükte kompozisyon bölünmez"). 1360 tek istisna:
1400'ün altında olduğu için sağ panel orada zaten katmandır — bu §11'in ilk satırının kendisi,
Ş5 de aynı şeyi ölçüyor.

**Taşma/kırpma taraması tarayıcıda koşmadı** (§7). `expectNoOverflow` + `expectNoClippedText`
çağrıları parity matrisinin 73 gövdesine yazıldı; e2e ortamı olmadan sürülemedi.

---

## 3. Erişilebilirlik (§12)

### 3.1 Kapatılan üç eksik

| #   | Eksik                                                                                                                                                                                                                                         | Düzeltme                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Sunucu menüsü kapanışta odağı tetikleyiciye döndürmüyordu.** `triggerRef` yalnız dış tıklama için kullanılıyordu; `Esc`'ten sonra odak belgenin başına kaçıyordu.                                                                           | Sökülme etkisinde `trigger.current?.focus()` — `channel-search-popover.tsx`'in zaten kullandığı desen                                                                                                                             |
| A2  | **Ayarların içindeki satır menülerinde `Esc` yanlış katmanı kapatıyordu.** Üye satırının rol ve moderasyon menüleri katman yığınına kayıtlı değildi; `Esc` doğrudan **ayarlar kaplamasını** kapatıyor, kullanıcıyı bulunduğu yerden atıyordu. | Yığına dördüncü tür eklendi: `menu (75)`. `openLayer` `modal` gibi davranır — ayarları altta bırakır, ikinci menüyü kapatır. `Esc` artık önce menüyü kapatıyor                                                                    |
| A3  | **Aynı menülerde dış tıklama kapatması yoktu.**                                                                                                                                                                                               | `pointerdown` (capture) dinleyicisi. "Dışarı" bir kutu değil bir **rol** sorusu: `closest('[role="menu"], [aria-haspopup="menu"]')` — bölümün köküne `ref` takmak, başka bir satırın düğmesine basıldığında menüyü açık bırakırdı |

`layer-stack.test.ts` beş yeni test aldı (menü ayarları kapatmaz · `Esc` önce menüyü kapatır ·
iki menü aynı anda açık kalamaz · pencere menüyü kapatır · ayarsız menü yığını tek başına tutar).

### 3.2 Denetlenip **zaten yeşil** bulunanlar

| §12 maddesi                                                        | Durum          | Kanıt                                                                                                                                                                                               |
| ------------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tıklanabilir her satır gerçek `button`/`a`                         | ✅             | `server-a11y.spec.ts` → "ekran okuyucu adları bilgiyi renkten bağımsız taşır" ikon-only düğmeleri sayıyor                                                                                           |
| Anahtarlar `role="switch"` + `aria-checked`                        | ✅             | `toggle-row.tsx`, `channel-notifications-modal.tsx`, `settings-primitives.tsx`                                                                                                                      |
| Radyo grupları `role="radiogroup"` + ok tuşları                    | ✅             | `option-chip-group.tsx` · `server-icon-swatches.tsx` · `section-parts.tsx` · `danger-section.tsx` (yeni sahip) · `channel-notifications-modal.tsx` (bildirim) · `create-channel-modal.tsx` (erişim) |
| Pencerelerde `Esc` · focus tuzağı · ilk odak · tetikleyiciye dönüş | ✅             | `modal-focus-contract.test.ts` — altı pencere tek kabuktan geçiyor, kabuk dört davranışı taşıyor                                                                                                    |
| Okunmamış sayaçları okunabilir etiket                              | ✅             | `shell.channelItem.unreadCount` = "{count} okunmamış mesaj"                                                                                                                                         |
| Ses kartında "konuşuyor" metni                                     | ✅             | `channel-item.tsx:315` `sr-only` + `voice.sidebar.speaking`                                                                                                                                         |
| `prefers-reduced-motion` altında dalga durur                       | ✅             | `resolveVoiceStripLitBars(level, reducedMotion)` + `globals.css` tek blok                                                                                                                           |
| Devre dışı kontroller `aria-disabled` + neden                      | ✅             | 17 çağrı yeri; `Keşfet'te listele` (`discoverableRequiresPublic`), sahip satırı (`kick.ownerDisabled`), pasif birincil düğmeler                                                                     |
| Sürükle-bırak klavye alternatifi                                   | ✅ (gerekçeli) | §3.3                                                                                                                                                                                                |

### 3.3 Sürükle-bırak: alternatif **var**, kenar çubuğunda değil

Kenar çubuğunun dnd'si yalnız `PointerSensor` kullanıyor ve bilerek: satırın kendisi tutamak
(§2.4 — referansta ayrı tutamak yok), yani `KeyboardSensor` eklemek `Space`/`Enter`'ı kanalı
açmaktan **çalardı**. Klavye alternatifi tasarımın koyduğu yerde: Sunucu ayarları › Kanallar,
yukarı/aşağı düğmeleri + `KeyboardSensor` + `sortableKeyboardCoordinates` (Ş12 sapma S2), ve
iki yol **aynı** yükü üretiyor (`channel-ordering.test.ts`). 00 §8'in parantezi de bunu
söylüyor: "yukarı/aşağı düğmeleri tasarımda mevcut" — mevcut oldukları yer §8.4.

### 3.4 `e2e:a11y` — yazıldı, **koşulamadı**

`server-a11y.spec.ts` on bir senaryo taşıyor: kabuk · sunucu menüsü · arama popover'ı · sağ
panel · arama paneli · dokuz ayar bölümü · üç pencere (iki temada), artı üç davranış testi
(menü klavye turu, satır menüsünde `Esc` sırası, ikon-only düğmelerin adı). Koşmadı — §7.

---

## 4. i18n denetimi

### 4.1 `server-screen-copy.test.ts` (14 test, yeşil)

- **236 cümle** SPEC'ten birebir kopyalandı ve karakter karakter karşılaştırılıyor
  (§2.2 menü · §2.3 arama · §4.1–4.3 panel · §6.1–6.5 pencereler · §7 oluşturma ·
  §8 dokuz bölüm başlığı/açıklaması · §8.1–8.9 gövdeler).
- Sabit listenin **küçülmesi** de bir hata: `>= 200 anahtar` ve `>= 20 önek` alt sınırı var.
- İki dil: 579 `server.*` anahtarının hepsinin İngilizcesi var, tersi de doğru, boş değer yok,
  interpolasyon adları iki dilde aynı.
- Çoğul: yedi sayaç tabanının `_one` biçimi iki dilde kurulu, hepsi `{count}` taşıyor;
  `{count} üye` · `{count} yetki seçili` · `{filtered} / {total} üye` birebir.
- **`Yakında` yasak** (K3): 579 anahtarın hiçbiri `Yakında`/`sonraki fazda`/`Coming soon`
  taşımıyor. Koddaki üç "yakında" geçişi yalnız **kaldırıldığını** anlatan yorumlar.
- **Gömülü metin taraması**: paketin 10 yüzeyinde (43 dosya) yorum dışında Türkçe harf yok.

### 4.2 Silinen ölü anahtarlar — **119** (her dilde)

| Önek                     | Silinen | Kalan | Neden ölü                                                                                                                                                              |
| ------------------------ | ------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverSettings.*`       | **18**  | 0     | Son tüketicisi `server-events-panel.tsx`'ti; Ş13 §8.8'i `server.settings.events.*` ile yazınca dosya da anahtarlar da gitti. **Ş0 raporundaki liste tamamen kapandı.** |
| `workspace.modal.*`      | 75      | 25    | Eski kategori/kanal/davet/sunucu pencereleri (Ş8–Ş10 yeniden yazdı) + bu şeritte silinen düzenleme formu                                                               |
| `shell.channelSidebar.*` | 25      | 15    | Eski kenar çubuğu (Ş4 yeniden yazdı) — Ş4'ün Ş14'e devrettiği iki anahtar dâhil                                                                                        |
| `voice.sidebar.you`      | 1       | 6     | Ş4 `SEN` çipi yerine renk kullandı (sapma 2.4)                                                                                                                         |

Ölçüm yöntemi: `apps/web/src` + `apps/web/e2e` + `packages/ui/src` + `apps/desktop/src`
üstünde anahtarın **birebir** (üç tırnak biçiminde de) aranması; şablon kullanımı olmadığı
ayrıca doğrulandı (`rg '\`shell\.'`vb. sıfır eşleşme).`messages.test.ts` iki dilin anahtar
kümesini eşit tutuyor ve yeşil.

### 4.3 Bir kod düzeltmesi

`server-settings-overlay.tsx`'in `throw new Error("Sunucu ayarları bölümü bulunamadı…")` mesajı
İngilizceye çevrildi. Geliştiriciye giden bir tanı mesajı ekrana çıkmaz, ama taramaya istisna
yazmak yerine deponun kendi kuralına uyduruldu (`rg 'throw new Error'` — hepsi İngilizce).

---

## 5. Token ve tipografi denetimi

### 5.1 Kapsam genişletildi

`lib/home/token-audit.ts` artık iki kapsam taşıyor. `collectTokenAuditFiles(scope)` parametreli:
kurallar tek yerde yaşıyor, hangi yüzeylerin denetlendiği çağırana ait. `SERVER_TOKEN_AUDIT_SCOPE`
12 giriş, **43 dosya** — paketin yüzeyleri + ölçü sözlüğü + `shell-layout.ts`.

Kapsam `lib/servers` klasörünü **bütün olarak** almıyor: `discovery-presentation.ts`,
`server-discovery-service.ts`, `server-public-profile-service.ts` bu paketten önce yazıldı ve
Keşfet'e ait (Ş0'ın 8 numaralı TODO'sunun tam gerekçesi). Test bunu ayrıca kilitliyor:
"Keşfet'in kendi dosyaları kapsama sızmaz".

### 5.2 İki gerçek sızıntı bulundu ve kapatıldı

| #   | Sızıntı                                                                                                                                                                                   | Düzeltme                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `channel-invite-modal.tsx:221` ve `invites-section.tsx:306` satır içi `fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"` yazıyordu — bileşene gömülü **dördüncü** yazı ailesi | `font-mono` yardımcı sınıfı (Tailwind `--font-mono`), `message-item.tsx`in kod parçasıyla aynı kaynak. `channel-invite-modal.test.tsx` buna göre güncellendi                                                         |
| T2  | `font-family` kuralı **yanlış pozitif** üretiyordu: `fontFamily: "var(--font-display)"` (tırnaklı) sapma sayılıyordu; oysa satır içi `style` nesnesinde değer bir **dizedir**             | Kural tırnağı kabul ediyor. Karakter sınıfı `"'`` olarak yazıldı — ham tırnak, `copy-audit.ts`in mini-lexer'ında bir dize açıp dosyanın geri kalanındaki yorumları maskesiz bırakıyordu (bu bir kez gerçekten kırdı) |

### 5.3 Tek kasıtlı dolaylılık

`fontFamily: DISPLAY_FONT` — sabit `components/servers/shared/typography.ts`'te ve gerçekten
`var(--font-display)`e çıkıyor; test bunu ayrıca kanıtlıyor (`assert.match(DISPLAY_FONT, /^var\(--font-display\)/)`).
Maskeleme yalnız bu tam metni geçiriyor: `fontFamily: SOME_OTHER_FONT` ve
`fontFamily: "Outfit, sans-serif"` hâlâ yakalanıyor ("maskeleme kuralı kapatmıyor" testi).

### 5.4 Sonuç

- **Yeni hex sıfır.** 43 dosyada `hex-color` · `rgb-color` · `hsl-literal` · `oklch-color` ·
  `tailwind-palette-color` · `embedded-font-name` · `font-family` ihlali yok.
- `--accent-2` (K8) tek yeni token; `--info` zaten vardı.
- Tipografi `--font-display` / `--font-sans` üzerinden; bileşende font adı yok.
- Sözlük renk taşımıyor (`parity.test.ts` → "hiçbir renk taşımaz").
- **İki temada kanıt**: renk sabiti hiç yok, yani hiçbir parça tek temaya sabitlenemez. Ekran
  görüntüsü kanıtı alınamadı (§7).

---

## 6. Parity matrisi

### 6.1 `e2e/specs/design/server-parity.spec.ts` — 300 → 536 satır

| Blok                  | Test                                   | Durum                                           |
| --------------------- | -------------------------------------- | ----------------------------------------------- |
| Ş4 kanal kenar çubuğu | 8 (4 çözünürlük × 2 tema) + 2 davranış | zaten açıktı                                    |
| Ş5 sağ panel          | 8 + 2 davranış                         | zaten açıktı                                    |
| Ş8 kanal penceresi    | 8                                      | **`fixme` kalktı**                              |
| Ş9 davet penceresi    | 8                                      | **`fixme` kalktı**                              |
| Ş10 sunucu oluştur    | 8                                      | **`fixme` kalktı**                              |
| Ş11 ayarlar kabuğu    | 8                                      | **`fixme` kalktı**                              |
| Ş12 roller bölümü     | 8                                      | **`fixme` kalktı**                              |
| Ş13 tehlike bölgesi   | 8                                      | **`fixme` kalktı**                              |
| §8 dokuz ayar bölümü  | 2 (tema başına dokuz bölüm gezilir)    | **yeni**                                        |
| §11 dört kırılım      | 4                                      | **yeni**                                        |
| Ş6 metin kanalı       | 8                                      | **açıldı** (2026-08-26, `server-text-channel`)  |
| Ş7 ses kanalı         | 8 + 1 davranış                         | **açıldı** (2026-08-26, `server-voice-channel`) |

**Bugün: 91 gerçek gövde, 0 `fixme`.** (Ş14 kapanışında 73 gövde + 16 `fixme` idi; Ş6/Ş7
kendi satırlarını açtı.) Ş0 iskeletindeki tahmin `testId`'lerin üçü hiç doğmamıştı
(`server-channel-modal` → `channel-form`, `server-invite-modal` → `server-invite-modal-body`,
`server-create-modal` → `create-server-form`); matris artık üründeki gerçek adları taşıyor.

Her yüzey **kendi tetikleyicisinden** açılıyor (sunucu menüsü satırı, ray `+` düğmesi, ayarlar
menü satırı) — doğrudan bir store çağrısı, tetikleyicinin gerçekten bağlı olup olmadığını
ölçmezdi.

### 6.2 `lib/servers/parity.test.ts` — 820 → 945 satır, 47 test

Şeride başlarken üç grup parity denetimine **hiç** girmiyordu: `voiceHeader` · `inviteModal` ·
`notificationsModal`. Üçü de eklendi:

- §5.1 Krisp çipi · gecikme çipi · dört gecikme çubuğunun yükseklikleri (`[5, 8, 11, 12]`,
  en yükseği çipin kendi yüksekliği).
- §6.3 bağlantı satırı · kopyalama düğmesi · iki çip kartı · success bilgi kutusu.
- §6.4 üç seçenek satırı · ikon kutusu · radyo · mobil susturma satırı · 38×21 anahtar
  (§8.2/§8.3'ün 40×22'siyle **eşit olmadığı** ayrıca kilitli — Ş8 sapma S1).

İki kapsam kapısı eklendi:

1. **"sözlüğün her grubu bu dosyada geçiyor"** — 26 grubun hepsi. Yeni bir grup eklenip parity
   denetimine hiç girmemesi artık mümkün değil. (Zayıf ama ölçülebilir bir alt sınır; satır
   satır eşleşmeyi üstteki bloklar yapıyor.)
2. **"beyaz listede K1 dışında gerekçesiz girdi yok"** — `SPEC_DEVIATIONS` **tek** girdi
   (`sidebar.menuRowIconSize` 18 vs 17, HTML kazanır) ve K1 ayrı kayıtta.

**Referansta karşılığı olmayan tek ölçü** `inviteModal.qrBoxSize = 132`; testi bunu bir
iddia hâline getiriyor ("QR kutusunun referansta karşılığı olmadığını kayda geçirir" —
`reference.includes("132px") === false`). Gerekçe Ş3 §3.5 / Ş9 §2.6 / Ş13 sapma 8: tasarım QR'ı
kesikli bir **çip** olarak çiziyordu, K3 çipi kaldırıp iki gerçek yüzey açtı ve ikisi aynı
kutuyu çizmek zorunda.

---

## 7. Temizlik

| Artık                                                          | Durum                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server-settings-overlay.tsx` (eski, `components/shell/` kökü) | Ş11 silmişti; yeni dosya `shell/server-settings/` altında ve `attachments.spec.ts`in `server-settings-overlay` tutamağı korunuyor                                                    |
| `server-tags-editor.tsx`                                       | Ş8 silmişti (`DiscoveryTagPicker` yerine geçti)                                                                                                                                      |
| `server-events-panel.tsx`                                      | **Ş14 sildi** — Ş11'in 3 numaralı TODO'su                                                                                                                                            |
| `server-feature-toggle.tsx` · `server-icon-field.tsx`          | **Ş14 sildi** — Ş11'in 4 numaralı TODO'su                                                                                                                                            |
| `workspace-modals.tsx` yalnız yönlendirici                     | **Kapandı.** 754 → 575 satır; `Modal` tabanlı sunucu **düzenleme** formu, `serverMutation`, yedi `useState` ve `updateServerRequest` importu gitti                                   |
| `ServerModalState.mode`                                        | Silindi. `openServerModal({ mode: "edit" })` çağrısı **hiç yoktu**; tek çağıran `wizards-shell.tsx:1435` ve o `create` diyordu. Sunucu düzenleme artık Ayarlar › Genel'in işi (§8.1) |
| Kullanılmayan i18n anahtarları                                 | 119 silindi (§4.2)                                                                                                                                                                   |
| Ölü `data-testid`                                              | `server-edit-form` ve `server-submit-button` düzenleme formuyla birlikte gitti; kalan tutamakların hepsinin çağıranı var                                                             |

**`workspace-modals.tsx` neden hâlâ 575 satır:** yönlendirmenin dışında iki şey duruyor —
kategori/kanal mutasyonları (pencerenin `onSubmit`'i) ve iki onay penceresi (kanal sil · sunucu
sil). İkincisi Ş12 T4'ün de işaret ettiği yer: onay pencereleri hâlâ eski `Modal` bileşenini
kullanıyor, `ServerModalShell` dilinde değil. **Kapatılmadı** (§9).

---

## 8. PROMPT kabul listesi — madde madde

### Kabuk (5)

- [x] Ray (74) + gezinme paneli + kanal kenar çubuğu (252) + içerik + sağ panel (326).
      **K1 sapması:** panel 228 değil **280** (PLAN §3, `NAV_PANEL_ADJUSTMENTS`).
- [x] Ray, gezinme paneli ve kullanıcı barı Ana Sayfa/Mesajlar ile tek bileşenden.
- [x] Sunucu menüsünde tam olarak beş satır (`SERVER_MENU_ROWS`).
- [x] Kategoriler daraltılabiliyor; daraltıldığında yalnız aktif/okunmamış/konuşulan kanal
      (`channel-visibility.ts`).
- [x] Kanal arama popover'ı ve `⌘K` çipi çalışıyor (Ş4 §3'ün çakışma çözümüyle).

### Metin kanalı (3)

- [x] Başlık çipleri, sabitlenen çubuk, tarih ayracı, rol rozeti, … tasarımdaki gibi.
      **(Ş6, 2026-08-26.)** §3.3 denetimi on yedi maddede yapıldı: on dördü zaten
      karşılanıyordu, biri düzeltildi, ikisi gerekçeli sapma (`s6` §2).
- [x] Bildirim tercihi başlıktaki çipi ve zil ikonunun rengini değiştiriyor. **(Ş6.)**
      Zil `all → primary`, `mentions → warning`, `muted → danger`; eski satır içi menü silindi
      ve Ş9 §5.2'nin devri kapandı.
- [x] Arama paneli basit/gelişmiş, 4 içerik etiketi, thread anahtarı (Ş5). **Uyarı:** içerik
      çipleri ve thread anahtarı uçta karşılıksız ve panel bunu `server.search.unsupported`
      ile **söylüyor** (Ş5 T1/T2).

### Ses kanalı (6)

- [x] Konuşan katılımcıda halka + glow + canlı dalga. **(Ş7, 2026-08-26.)**
- [x] Kamera açık varyantı; akış yokken boş `<video>` mount edilmiyor. **(Ş7.)**
- [x] Ekran paylaşımı sahnesi + şerit; `CANLI` ve `1080p · 30 fps` çipleri. **(Ş7.)**
- [x] Kontrol çubuğu dört düğme + ayarlar + Ayrıl; kapalı mikrofon/hoparlör danger. **(Ş7.)**
- [x] Kenar çubuğundaki bağlı ses şeridi ve katılımcı satırları (Ş4). **Uyarı:** gecikme
      (`32 ms`) `null` — LiveKit RTT'sini okuyan yüzey yok (Ş4 TODO 1). Ş7'nin başlık çipi
      aynı boşluğu **sözcükle** dolduruyor: kalite gerçek, sayı yok.
- [x] Sağ panelde `Davet et` → `Gönderildi` dönüşümü (Ş5).

### Pencereler (7)

- [x] Kategori penceresinde canlı önizleme ve `0/48` sayacı.
- [x] Kanal penceresi 4 adım; tür kartları alçak; `Erişim` başlığında `Yalnızca yönetici` çipi.
- [x] Yavaş mod 12 seçenek; bitrate (varsayılan 64 kbps), kullanıcı limiti 0–10, RTC bölgesi,
      video kalitesi tıklanabilir ve başlık çipine yansıyor. **Uyarı:** RTC'nin beş şehri
      dağıtım `LIVEKIT_RTC_REGION_*` yayımlamadığı sürece çizilmiyor (Ş8 S3).
- [x] Davet penceresinde yalnız `Süre` ve `Kullanım` — ROL alanı yok.
- [x] Etkinlik penceresi: zorunlu alanlar, kanal çipleri, pasif buton + warning uyarısı.
- [x] Sunucu oluşturma: swatch'lar, kısa ad türetme, erişim radyoları, keşif etiketleri
      (ayarlarla **aynı bileşen**), üç anahtar, katlanır `Gelişmiş`, canlı önizleme kolonu.
- [x] _(§11 eki)_ Önizleme kolonu `<1024`'te forma üstten ekleniyor — **bu şeritte** sözlükten
      gelen px eşiğine bağlandı.

### Sunucu ayarları (12)

- [x] Sol üstte sunucu kartı: ikon, `5 üye`, görünürlük rozeti; menü 9 bölüm ve doğru sayılar.
- [x] Genel: swatch'lar, sayaçlar, canlı sunucu profili. **Sapma:** ad sayacı `0/48` değil
      `0/64` (Ş11 S1 — şerit dosyasının açıkça istediği sapma; sözleşme sınırı 64).
- [x] Görünürlük: `Keşfet'te listele` yalnız herkese açıkken; etiketler 5 sınırı + 5 öneri grubu.
- [x] İçerik: GIF/dosya anahtarları + üç seçenek grubu; sunucu geneli yavaş mod **gerçek ayar**
      ("Yakında" yok — `server-settings-shell.test.tsx` bunu kilitliyor).
- [x] Kanallar: `+ Kategori ekle` / `+ Kanal ekle` pencereleri açıyor; tutamak, sıralama okları,
      düzenle/sil; `Herkese açık` çipi **success**.
- [x] Roller: gruplar 5/5 · 5/5 · 4/4 · 0/4; `14 yetki seçili` canlı; hazır ayarlar yetki setini
      değiştiriyor.
- [x] Rol oluşturma ayrı pencere değil: `TASLAK` satırı, boş sağ panel, `Vazgeç`/`Rol oluştur`
      çubuğu, ad girilene kadar pasif.
- [x] Üyeler: arama + 7 filtre çipi listeyi **sunucuda** süzüyor, sayaç `N / 5 üye`; sahibin
      çıkarma düğmesi pasif (`aria-disabled` + neden).
- [x] Davetler: üç çip grubu özet satırına yansıyor; mevcut davetler listeleniyor. **K3 gereği**
      "sonraki özellik çipleri" **yok** — QR, hedefli davet ve bekleyen davetler gerçek.
- [x] Etkinlikler: iki sekme, kartlar, `İptal edilen`de boş durum.
- [x] Tehlike bölgesi: sahiplik devri (üye seçimi + onay anahtarı + koşullu buton) ve sunucu
      silme (ad birebir eşleşmeden pasif).
- [x] _(§12 eki)_ Satır menülerinde `Esc` sırası — **bu şeritte** düzeltildi (A2).

### Ortak (5)

- [x] Sadece token renkleri; yeni hex araması temiz (43 dosya, 0 ihlal).
- [x] Tipografi Outfit + Figtree, token üzerinden.
- [~] **Tema anahtarı çalışıyor; hiçbir parça tek temaya sabitlenmiş değil.** Statik kanıt tam:
  renk sabiti hiç yok. **Ekran görüntüsü kanıtı alınamadı** (§9).
- [~] **1360 · 1920 · 2560 · 3840'ta taşma ve kırpma yok.** Kırılım mantığı birim testleriyle
  dört çözünürlükte doğrulandı; **tarayıcı taraması koşulamadı** (§9).
- [x] **Tüm metinler birebir; placeholder/lorem yok; tip kontrolü, lint ve testler
      geçiyor; yeni bileşenler için render testleri var.** Ş6/Ş7 sonrası kapsam paketin
      **tamamı**: `server-screen-copy.test.ts` §3 ve §5 cümlelerini de tutuyor, token denetimi
      `components/chat/server-channel-header.tsx` ve `components/voice/server`i de tarıyor.

### PLAN §8'in ek maddeleri

- [x] `Server.iconColor` ve `Server.slowModeDelay` uçtan uca yazılıp okunuyor (Ş0 · Ş1 · Ş11).
- [x] Sahiplik devri gerçekten sahibi değiştiriyor, eski sahip Admin'e düşüyor, audit satırı
      yazılıyor (Ş1 · Ş13).
- [x] Ban · zaman aşımı · QR · hedefli davet · bekleyen davetler çalışıyor; "yakında" çipi yok.
- [x] `rg "#[0-9a-fA-F]{3,8}"` yeni dosyalarda sıfır.
- [x] `types` · `db` · `typecheck` · `lint` · `test` yeşil.
- [ ] `e2e:a11y` ve `server-parity.spec.ts` yeşil — **koşulamadı** (§9).
- [~] Dört çözünürlük × iki tema: taşma/kırpma yok — yukarıdaki gibi.

**Özet (2026-08-26 sonrası):** **50 madde işaretlendi**, işaretlenemeyen madde **kalmadı**;
3 madde "kısmi" (kanıtın tarayıcı ayağı eksik — §9), 1 madde (e2e yeşil) koşulamadı.
Ş14 kapanışındaki hâli: 43 işaretli, 6 işaretlenemez, 4 kısmi.

---

## 9. `TODO(api):` envanteri

Paketin bıraktığı her açık uç, tek tabloda. "Kimde" sütunu **hangi şeridin açtığını** söyler.

| #   | Ne eksik                                                | Hangi uç / alan                                                                                | Açan         | Bugün ne oluyor                                                                                                                                                         |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ses odası gecikmesi (`32 ms`)**                       | LiveKit `getStats().roundTripTime` — deponun hiçbir yerinde okunmuyor                          | Ş4           | `ConnectedVoiceStrip latencyMs={null}`; alt satır yalnız sunucu adını yazar. Sözleşme hazır, değer gelince tek prop dolar                                               |
| 2   | **Sunucu genelinde konuşma/susturulma durumu**          | `VoiceChannelStateDTO` yalnız `isDeafened` + `isScreenSharing` taşıyor                         | Ş4           | Bağlı olunmayan kanalda konuşma halkası çizilemiyor                                                                                                                     |
| 3   | **Katılımcı kamera/mikrofon durumu**                    | `VoiceStateParticipantDTO`ya `isMuted` + `isCameraEnabled`                                     | Ş5           | §4.1'in "kamera açık" ikonu ve _sağır olmayan_ "mikrofon kapalı" çizilemiyor                                                                                            |
| 4   | **Çevrimiçi sayısı sayfalı listeden türüyor**           | `WorkspaceServerSummary.onlineCount`                                                           | Ş4           | `6 çevrimiçi · 24 üye` satırının ilk yarısı `memberPage.nextCursor` doluyken eksik kalır                                                                                |
| 5   | **Arama `İÇERİYOR` çipleri uçta karşılıksız**           | `searchChannelMessages` yalnız `Message.content`; ek/bağlantı/görsel/`pinned` sorguya girmiyor | Ş5           | Çipler çizilir, uca **gönderilmez**; panel `server.search.unsupported` uyarısını gösterir                                                                               |
| 6   | **`Yalnızca thread yanıtlarında ara` uçta imkânsız**    | `search-service.ts`e `threadOnly` kipi + route şeması                                          | Ş5           | Sorgu thread yanıtlarını baştan eliyor; anahtar açıkken uydurma parametre her aramayı boş döndürürdü                                                                    |
| 7   | **Üye arama sunucuya bağlı değil**                      | `GET /servers/[id]/members?q=` **hazır**, panel bağlamıyor                                     | Ş5           | Kutu yalnız yüklü sayfayı süzüyor (sayfa 100'de kesiliyor)                                                                                                              |
| 8   | **Kanal erişim ön ayarı kanal başına okunuyor**         | `listWorkspaceServer` projeksiyonu `permissionPreset`i doldurmalı                              | Ş12          | Bölümdeki `useQueries` bloğu ve çipin boş hâli; bileşen alanı **önce** okuyor, uç geldiği gün istemci değişmez                                                          |
| 9   | **Rol başına üye sayısı sayfadan sayılıyor**            | `GET /servers/[id]/roles` yanıtına `memberCount`                                               | Ş12          | 100+ üyeli sunucuda rol satırındaki sayı eksik kalır (`@everyone` etkilenmez)                                                                                           |
| 10  | **RTC bölgesinin beş şehri**                            | Dağıtım `LIVEKIT_RTC_REGION_*` yayımlamıyor                                                    | Ş8           | Yalnız `Otomatik` çizilir. Uç listeyi yayımladığında değişecek tek şey `server.channel.rtcRegion.<KEY>` çevirileri                                                      |
| 11  | **Davet kullanım sayacı canlı değil**                   | Düz bağlantı harcandığında davet yöneticisine soket olayı gitmiyor                             | Ş3           | `3 / 25` ancak yeniden okumayla değişir. **Ş14 kararı: çip bilerek pasif kabul edildi** — §9.1                                                                          |
| 12  | **Ban/zaman aşımı/rol atama için ince soket olayı yok** | `server:member:updated`                                                                        | Ş2           | Yüzey sorguyu geçersizleştiriyor; başka istemcide açık duran üye listesi kendiliğinden tazelenmez                                                                       |
| 13  | **Zaman aşımının üst sınırı yok**                       | `ServerMemberTimeoutSchema`                                                                    | Ş2           | UI en fazla 1 hafta öneriyor, uç serbest ISO alıyor. SPEC sayı vermediği için uydurulmadı                                                                               |
| 14  | **Ses kanalında zaman aşımı uygulanmıyor**              | Ses katılım kapısı                                                                             | Ş2           | Zaman aşımlı üye metin gönderemiyor ama sesli kanalda mikrofonunu açabiliyor. Ş7 koştu ve **sunum katmanı bunu düzeltemez**: kapı ses katılım yolunda, sunucu tarafında |
| 15  | **`Admin` ön ayarıyla oluşturulan rol anında korunur**  | `createRole` `isProtectedRole` denetimi yapmıyor                                               | Ş12          | Rol oluşturulduğu anda düzenlenemez/silinemez hâle gelir. Panel doğru çiziyor (guard rozeti), ürün kuralı tuhaf                                                         |
| 16  | **`AuditLog`da `ipHash` yok**                           | Migration + `writeWorkspaceAuditLog` imzası                                                    | Ş1           | Çalışma alanı denetim satırı IP taşımıyor. **Karar bekliyor**                                                                                                           |
| 17  | **K6 daraltmasının UAT taraması koşmadı**               | Deploy adımı                                                                                   | Ş0/Ş1        | UAT'a dışarıdan bağlanılamıyor; SQL Ş1 raporunda. **Deploy öncesi koşmalı**                                                                                             |
| 18  | **Kategori/kanal silme onayı eski `Modal` dilinde**     | —                                                                                              | Ş12          | Onay pencereleri `ServerModalShell` dilinde değil (§7)                                                                                                                  |
| 19  | **`joinedAt` yok**                                      | `WorkspaceServerSummary`                                                                       | paket öncesi | Ray ve nav paneli "katıldın" yerine "ziyaret" gösteriyor                                                                                                                |
| 20  | **Kanala erişebilen üye sayısı**                        | Uç yok; `permissionPreset` de dolmuyor (#8)                                                    | Ş6           | Herkese açık/kilitli kanalda sunucunun üye sayısı yazılıyor; gizli ve role bağlı kanalda satır yalnız konuyu taşıyor (`lib/servers/channel-access-count.ts`)            |
| 21  | **Gerçek yayın çözünürlüğü/fps'i**                      | Ekran paylaşımı yayını                                                                         | Ş7           | `1080p · 30 fps` çipi **seçilen** kalite ön ayarından; ölçülen değer değil                                                                                              |

**Kapanmış TODO'lar** (kayıt için): Ş0 #1–#3 (Ş1 kapattı), Ş0 #8 (**Ş14 kapattı** — token
denetimi kapsamı), Ş0 #9 (**Ş14 kapattı** — 80 kombinasyonun 64'ü açıldı, 16'sı gerekçeli
`fixme`), Ş1 #5 (Ş11), Ş1 #4 (Ş13), Ş2 #4/#6 (Ş13/Ş3), Ş3 #4 (Ş9/Ş13), Ş11 #3/#4 (**Ş14**).

### 9.1 Kapatılamayan tek karar: davet kullanım sayacı (Ş13 not 6)

Ş13 kararı Ş14'e bırakmıştı: ya `server:settings:updated` sunucu odasına genişletilir, ya çip
bilerek pasif kabul edilir. **Ş14 ikincisini seçti.** Gerekçe: soketi sunucu odasına genişletmek
bir **uç değişikliğidir** ve Ş14'ün kapsamı açıkça "yeni özellik eklenmez" diyor; ayrıca her
davet kullanımında tüm sunucu odasına bir "ayarlar değişti" yayını atmak, ayar dinleyen her
istemcide gereksiz bir tam yeniden okuma tetiklerdi. Doğru çözüm ince bir
`server:invite:used` olayıdır ve o bir sonraki paketin işi (envanterde #11).

---

## 10. Doğrulama çıktısı

```
pnpm --filter @wizards/types test      529 pass · 0 fail
pnpm --filter @wizards/db test         146 pass · 0 fail
pnpm --filter @wizards/web typecheck   exit 0
pnpm --filter @wizards/web lint        exit 0 (10 config testi + eslint .)
pnpm --filter @wizards/web test        7066 pass · 0 fail · 3 skipped (1651 suite)
```

Şeridin kendi testleri (tek tek koşturuldu):

| Dosya                                                             | Test             |
| ----------------------------------------------------------------- | ---------------- |
| `lib/servers/shell-layout.test.ts`                                | 14               |
| `lib/servers/server-screen-copy.test.ts`                          | 14               |
| `lib/servers/token-audit.test.ts`                                 | 6                |
| `lib/servers/parity.test.ts`                                      | 47 (12 suite)    |
| `lib/servers/layer-stack.test.ts`                                 | 19 (5 yeni)      |
| `components/shell/server-settings/server-settings-shell.test.tsx` | 19 (2 yeni)      |
| `lib/home/token-audit.test.ts` + `copy-audit.test.ts`             | değişmedi, yeşil |

Şerit süiti **7055 → 7069** teste çıkardı (net +14; 119 ölü anahtarın silinmesi hiçbir testi
düşürmedi çünkü hiçbiri okunmuyordu).

### Şeridin açtığı ve kapattığı iki kırık

1. **`copy-audit.test.ts` kırıldı.** `token-audit.ts`e eklediğim `["'\`]`karakter sınıfı, ham
tırnak içerdiği için`maskComments`mini-lexer'ında bir dize açtı; dosyanın geri kalanındaki
Türkçe yorumlar maskesiz kaldı ve denetim kendi yorumlarını sapma saydı. Karakter sınıfı`"'`` yazılarak kapandı. **Tuzak kayda değer: bu depoda bir düzenli ifade
   değişmezine ham tırnak yazmak metin denetimini bozar.**
2. **`server-screen-copy.test.ts` kendi taramasında kırıldı** — `server-settings-overlay.tsx`in
   Türkçe `throw new Error` mesajı. Mesaj İngilizceye çevrildi (§4.3).

### Koşulamayan

- **`pnpm --filter @wizards/web e2e:a11y`** ve **`playwright test e2e/specs/design/server-parity.spec.ts`.**
  Ortam yok:

  ```
  E2E environment preflight failed.
  - E2E_TEST_MODE must be "true" before Playwright can reset test data.
  - E2E_DATABASE_URL or DATABASE_URL is required for Playwright reset/seed operations.
  - E2E_TEST_PASSWORD is required and must be generated locally/inside CI.
  ```

  İki dosya da tipten geçiyor ve mevcut yardımcıları kullanıyor (`getE2EServerRoute`,
  `gotoAppRoute`, `applyParityTheme`, `expectNoOverflow`, `expectNoClippedText`, `AxeBuilder`).
  **İlk yeşil koşu bir CI adımıdır**, bu makinede değil. Ş4 · Ş11 · Ş13 aynı duvara çarpmıştı;
  Ş14 duvarı kaldıramadı, yalnız arkasındaki her satırı yazdı.

- **Dört çözünürlük × iki tema ekran görüntüsü.** Yüzey `/channels/[serverId]/[channelId]`
  altında ve oturum istiyor; parola girmek bu oturumun sınırları dışında. Ekran görüntüsü
  çağrıları (`page.screenshot`) parity matrisinin 73 gövdesinde duruyor ve ilk yeşil koşuda
  `test-results/parity/` altına düşecek.

Bu ikisi kabul listesindeki üç "kısmi" maddenin tek sebebi. Statik kanıt tam: kırılım kararı,
tek kolon CSS'i, kabuğun tüketimi, token sözleşmesi ve metin sözleşmesi birim testleriyle
kilitli.

---

## 11. SPEC'ten sapmalar

| #      | Sapma                                                                                       | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** | **`<1200`'de gezinme paneli "74px ikon kolonu"na dönüşmüyor, kolondan düşüyor.**            | 00 §1 paneli **dokunulmaz** ilan ediyor (K1) ve §11 "yalnızca ikonlar, 74px" istiyor. İkisi ancak tek şekilde uyuşur: panel yeniden çizilmez, kabuk onu düşürür ve geriye zaten ikon-only, zaten 74 px olan **sunucu rayı** kalır. Gözlenen sonuç §11'inkiyle aynı — 74 px genişliğinde bir ikon kolonu. Panelin içeriği drawer'da erişilebilir                                                   |
| **S2** | **`server-screen-copy.test.ts` `lib/servers/` altında, beş kardeşi `lib/locale/` altında.** | Şerit dosyası yolu **açıkça** veriyor (§3). Parantezdeki "mevcut `*-screen-copy.test.ts` düzeni" testin **biçimini** anlatıyor ve o birebir izlendi (SPEC tablosu + iki dil + çoğul + eski anahtar listesi). Aileyi bölmek istenmiyorsa taşınacak tek şey dosya yolu                                                                                                                              |
| **S3** | **Token denetimi kapsamı `lib/servers` klasörünü bütün olarak almıyor.**                    | Klasör bu paketten önceki üç Keşfet dosyasını taşıyor (Ş0 TODO #8'in tam gerekçesi). Kapsam klasörü değil **dosyaları** sayıyor; karışırsa bu paketin denetimi başkasının borcuyla kırmızı olur. Test bunu ayrıca kilitliyor                                                                                                                                                                      |
| **S4** | **Token denetimi yorumları taramıyor; `fontFamily: DISPLAY_FONT` maskeli.**                 | Denetimin hedefi **değer**, prose değil: `typography.ts` hangi tokenın hangi aileye karşılık geldiğini yazmak zorunda. Sabit dolaylılığı ise `typography.ts`in var oluş sebebi — on beş dosyada aynı metni tekrar yazmak ilk yazım hatasında sessizce Figtree'ye düşerdi. Sabitin gerçekten bir tokena çıktığı ayrıca kanıtlanıyor                                                                |
| **S5** | **`menu (75)` katman türü SPEC §10'un tablosunda yok.**                                     | §10 üç katman veriyor (`popover 60 · settings 70 · modal 80`) ama §12 "menüler `Esc` ile kapanır" diyor ve ayarların **içinden** açılan bir menü için üçü de yanlış cevap: `popover` ayarları kapatır, `settings` kendisidir, `modal` bir yalan. 75 bugün yalnız **sırayı** anlatıyor (menüler kaplamanın kendi istifleme bağlamında çiziliyor); ayarların dışına portal edilen bir menü onu okur |
| **S6** | **Kenar çubuğunun dnd'sine `KeyboardSensor` eklenmedi.**                                    | Satırın kendisi tutamak (§2.4); `KeyboardSensor` varsayılan olarak `Space`/`Enter` ile başlar ve kanalı açma tuşunu çalardı. Klavye alternatifi tasarımın koyduğu yerde (§8.4) ve **aynı** yükü üretiyor                                                                                                                                                                                          |
| **S7** | **Monospace yazı `font-mono` yardımcı sınıfından.**                                         | Referans "monospace" diyor, bir yığın vermiyor. Satır içi yığın, tokenlaşmamış **dördüncü** bir yazı ailesi olurdu; `message-item.tsx`in kod parçası zaten `font-mono` kullanıyor ve iki yüzey artık aynı kaynaktan besleniyor                                                                                                                                                                    |

Renk sapması **yok**: yeni hex, yeni `rgb()`, yeni tema sınıfı ve yeni token üretilmedi.

---

## 12. Sonraki paket için notlar

1. ~~**Ş6 ve Ş7 hâlâ yazılmadı**~~ — **kapandı** (2026-08-26). `UNBUILT_SURFACES` listesi
   silindi, iki satır `SURFACES`e taşındı, `test.fixme` sıfırlandı ve Ş9 §5.2'nin devri
   (`chat-area`in eski bildirim menüsü) kapandı. `server-a11y.spec.ts`in kapsam notu hâlâ
   "Ş6/Ş7 kapsam dışı" diyor; iki yüzey artık var, senaryo genişletilebilir.
2. **`server-parity.spec.ts` ve `server-a11y.spec.ts` hiç koşmadı.** İkisi de tipten geçiyor ama
   bir tarayıcıda sürülmedi; ilk koşuda yüzeysel `testId`/zamanlama düzeltmeleri çıkabilir.
   **Bunu bir "yeşil" olarak raporlamayın** — kod yazıldı, kanıt alınmadı.
3. **Katman yığınının dört türü var.** Yeni bir açılır yazan şerit `kind`ını bilerek seçsin:
   `popover` altındakileri **kapatır**, `menu` ve `modal` yalnız `settings`i bırakır.
4. **Token denetimi artık kapsam parametreli.** Yeni bir paket kendi
   `<PAKET>_TOKEN_AUDIT_SCOPE`unu açıp `collectTokenAuditFiles(scope)` çağırsın; iki kapsamı
   tek listede birleştirmek bir paketin kırmızısını diğerinin testine yazar.
5. **Düzenli ifade değişmezine ham tırnak yazmayın** (`["'\`]`). `copy-audit.ts`in mini-lexer'ı
regex literal tanımıyor ve dosyanın geri kalanındaki yorumları maskesiz bırakıyor. Karakter
sınıfını `"'`` yazın.
6. **`ServerModalState.mode` silindi.** `openServerModal()` artık argümansız çağrılabiliyor ve
   yalnız oluşturma penceresini açıyor; sunucu düzenleme Ayarlar › Genel'in işi.
7. **Ölü i18n anahtarı taraması ucuz.** Anahtarın birebir metnini `apps/web/src` + `e2e` +
   `packages/ui/src` + `apps/desktop/src` içinde aramak yeterli; bu paketin yüzeylerinde şablon
   (`t(\`önek.${x}\`)`) kullanımı **yok**. Aynı taramayı depo genelinde koşarsanız ~1000 ölü
   anahtar daha çıkıyor — o bu paketin borcu değil, ayrı bir iş.
8. **`components/servers/server-profile-card.tsx` gömülü Türkçe metin taşıyor** (dokuz satır).
   `/servers/[serverId]/about` rotasının dosyası ve 00 §1 o rotayı bu paketin dışında tutuyor;
   metin denetiminin kapsamına **bilerek** alınmadı. Keşfet paketinin işi.

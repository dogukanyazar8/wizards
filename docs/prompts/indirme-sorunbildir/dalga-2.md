# Dalga 2 — Ray düğmeleri + "Sorun bildir" penceresi

Önce `00-ortak-baglam.md` oku. Ön koşul: **Dalga 1 tamamı**. Branch `uat`, commit yok.

**İlk iş:** `design_handoff/indirme-sorunbildir-paketi/referans.html`'i tarayıcıda aç, 1–13
numaralı çiplerin hepsine tıkla. Statik mockup değil — kategori seç, yaz, toggle çevir, gönder.
Davranışı oradan doğrula, ölçüyü `SPEC.md`'den al.

---

## Ş8 · Ray alt bloğu (SPEC §0)

**Dosya:** `apps/web/src/components/shell/server-rail.tsx`, `apps/web/src/lib/store.ts`,
`apps/web/src/components/shell/wizards-shell.tsx`.

- "Sunucu ekle" düğmesinden sonra `margin-top:auto` ile diplenen alt blok; içinde
  **22×1 px `H(border,.9)` ayırıcı** (`margin:9px 0`) ve iki düğme.
- Düğmeler 41×41, radius 14:
  - **Uygulamayı indir** — `H(success,.2)` zemin, `1.5px H(success,.4)`, 17px ok, stroke 2.2.
    Hover `H(success,.3)` + `translateY(-2px)`.
  - **Sorun bildir** — `H(surface-tertiary)` zemin, `1px H(border,.8)`, 18px böcek, stroke 1.7,
    `H(text-secondary)`. Hover zemin `H(warning,.18)`, çerçeve `H(warning,.4)`, ikon `H(warning)`,
    `translateY(-2px)`.
  - Geçiş `.16s`. İkon path'leri SPEC §0'dan aynen.
- Her ikisinde `title` + `aria-label` (i18n'den), `data-testid`:
  `server-rail-download-button`, `server-rail-report-button`.
- Rayın mevcut tooltip deseni (portal + `showAddTooltip`) varsa aynı desenle beslenir; yeni
  tooltip mekanizması icat edilmez.
- **Store:** `useAppStore` içine mevcut `serverModal` deseniyle iki slice:
  `reportModal: { open }`, `downloadModal: { open }` + `openReportModal/closeReportModal`,
  `openDownloadModal/closeDownloadModal`. Açma eylemleri **karşılıklı münhasır** (SPEC §C:
  ikisi aynı anda açılmaz) — biri açılırken diğeri kapanır.
- **Listeye `flex-1` verme** (00 §5).

**Kabul:** ray düğmeleri iki temada doğru tonda; hover/odak halkası çalışıyor; store testi iki
modalın aynı anda açılamadığını kanıtlıyor.

---

## Ş9 · Modal kabuğu (SPEC A.1–A.2)

**Dosya:** yeni `apps/web/src/components/support/bug-report-modal.tsx` (+ alt bileşenler),
`apps/web/src/components/shell/workspace-modals.tsx`.

- Mevcut `@/components/ui/modal` `Modal` bileşeni kullanılır; başlık şeridi SPEC A.2'ye uymuyorsa
  `hideHeader` ile kendi şeridini çiz — **yeni modal altyapısı yazma**.
- Genişlik `min(520px,100%)`, `max-height:100%`, radius 22, `H(surface-card)`, `1px H(border)`,
  `box-shadow:0 48px 96px -40px H(shadow-color)`. Karartma `H(background,.72)`, padding 34.
- **Yalnız gövde kaydırılır**; başlık şeridi ve alt bar sabit (`display:flex;flex-direction:column`
  - gövde `overflow-y:auto`).
- Başlık şeridi: 38×38 `H(warning,.16)` tile + 19px konuşma balonu/ünlem ikonu, başlık
  `600 19px/1.2` display `letter-spacing:-.02em`, alt satır 13px `H(text-secondary)`,
  sağda 30×30 X (`H(surface-soft)`, hover `H(surface-tertiary)`). Geri oku **yok**.
- Açılışta odak **ilk kategori çipinde** (`initialFocusRef`); Tab tuzağı modal içinde.
- Modal içeriği `next/dynamic` ile bölünür — ray düğmesine basılmadan bundle'a girmez.
- `WorkspaceModals` içindeki `modalKey` desenine eklenerek **her açılışta form sıfırlanır**
  (SPEC A.11: eski başarı ekranı kalmaz).

**Kabul:** Esc kapatıyor, dışarı tıklama kapatıyor, uzun içerikte yalnız gövde kayıyor,
`role="dialog"` + `aria-modal` + `aria-labelledby` var.

---

## Ş10 · Form (SPEC A.3–A.6)

**Dosya:** `bug-report-modal.tsx` + yeni saf model `apps/web/src/lib/support/bug-report-form-model.ts`
(+ testi).

Saf model (React'sız, node testli): `validateDraft`, `counterTone(n)`, `footerNote(state)`,
`isSubmitDisabled(state)`, `clampBody(value)`.

- **NEREDE OLDU?** — grup etiketi `600 10px` display, `letter-spacing:.15em`, uppercase,
  `H(text-muted)`; yanında **Zorunlu** pili (`H(danger,.14)` / `H(danger)`).
  5 çip: yükseklik 34, `padding:0 12px`, radius 11, `600 12.5px`, solda 15px ikon, `gap:7px`.
  Durum tonları SPEC A.3 tablosundan. `role="radiogroup"` + `role="radio"` + `aria-checked`.
  Seçim bekleyen doğrulama hatasını temizler.
- **NE OLDU?** — kabuk radius 14, `H(surface-base)`; çerçeve boşken `1px H(border)`, yazı varken
  `1px H(primary,.45)`. `textarea` `rows=4`, auto-grow, ~10 satırdan sonra iç kaydırma,
  `500 13.5px/1.55`, `resize:none`. Altta `H(surface-soft,.5)` zeminli iki uçlu satır:
  sol ipucu 11.5px `H(text-muted)`, sağ sayaç `600 11px` display.
  Sayaç tonu: **≤900** `H(text-muted)` · **>900** `H(warning)` · **=1000** `H(danger)`.
  Giriş 1000'de kesilir (`slice(0,1000)`). Yazmak bekleyen doğrulama hatasını temizler.
  **Enter form göndermez.**
- **RAPORA EKLENECEKLER** — tek kart radius 16, üç satır `padding:12px 13px`, aralarında
  `1px H(border,.55)`. Toggle 40×22, topuz 16×16 `#fff`, `role="switch"`.
  1. Sistem günlükleri · `Son 500 satır · mesaj içeriği yok` · **açık** (Ş6 tamponundan beslenir;
     tampon yoksa satır **hiç çizilmez** — SPEC A.5).
  2. Ekran görüntüsü · **kapalı** (Ş11).
  3. Cihaz ve sürüm bilgisi · **kapalı**; metin `{tarayıcı} · {OS} · {sürüm} ({build}) · {kanal}`,
     toggle kapalıyken de **görünür** ve rengi değişmez, tek satır + ellipsis.
     Kaynak: `navigator.userAgentData`/UA çözümü + `WHISPR_APP_VERSION`, `WHISPR_BUILD_ID`,
     `WHISPR_RELEASE_CHANNEL`; desktop'ta `window.__WHISPR_DESKTOP__.releaseRing` Ş1'deki
     eşlemeden geçer. Kullanıcı kimliği **girmez**.
- **Gizlilik notu** — `H(surface-soft,.7)`, 16px kalkan-onay `H(success)`, metin SPEC A.6'dan birebir.

**Kabul:** node testleri sayaç eşiklerini, pasiflik koşulunu ve 5 alt bar notunu kanıtlıyor;
`renderToStaticMarkup` testi üç toggle varsayılanını ve cihaz metninin kapalıyken de basıldığını
doğruluyor.

---

## Ş11 · Ekran görüntüsü satırı + tam ekran (SPEC A.5 alt bölüm, A.10)

**Dosya:** `bug-report-modal.tsx` alt bileşeni + `apps/web/src/lib/support/screenshot-upload.ts`.

Dört durum, hepsi SPEC'teki kutu/alt metin/eylem üçlüsüyle:

| Durum      | Kutu                                                          | Alt metin                             | Eylem                    |
| ---------- | ------------------------------------------------------------- | ------------------------------------- | ------------------------ |
| yok        | `1px dashed H(border)`, `H(surface-secondary)`, 14px üç çubuk | `Ekle · kaldırabilirsin`              | **Ekran görüntüsü ekle** |
| var        | `1px solid H(border)`, çizgili yer tutucu + büyüteç           | `{ad} · {boyut} · kaldırabilirsin`    | **Kaldır** (`H(danger)`) |
| yükleniyor | `1px solid H(primary,.5)`, ortada `%{n}`                      | `Yükleniyor · %{n} · {boyut}`         | yok                      |
| başarısız  | `1px solid H(danger,.5)`, `H(danger,.08)`, uyarı üçgeni       | `Yüklenemedi · {sebep}` (`H(danger)`) | **Tekrar dene**          |

- **Yükleniyor**da alt metnin altında 4px ilerleme çubuğu, `role="progressbar"` + `aria-valuenow`.
  Spinner tek başına yeterli değil.
- Kutuya tıklama: var → tam ekran · başarısız → tekrar dene · yok → dosya seçici.
  `title` metinleri SPEC'ten.
- Toggle açılınca `yok → var` (dosya seçici), kapanınca `var → yok` ve bekleyen ek yükleme
  hatası temizlenir.
- Yükleme yolu: Ş5'te oturuma açılan `feedback-attachment` purpose'u; dönen `claimId`
  `screenshotUploadKey` olarak gövdeye girer. İstemci tarafı doğrulama: yalnız
  `image/jpeg|png|webp`, ≤4 MB (uploader sınırıyla aynı) — sınır aşımı **başarısız** durumunu
  gösterir, isteği yollamaz.
- **Tam ekran katmanı** (A.10): `H(background,.9)` karartma, `min(620px,100%)` `16/10` çerçeve,
  sağ üstte 32×32 kapat, altta tek eylem **Kaldır** (`H(danger,.1)` zemin, `1px H(danger,.42)`).
  Esc bu katmanı kapatır, modalı değil.

**Kabul:** dört durumun dördü de `renderToStaticMarkup` testinde ayrı ayrı doğrulanıyor;
ilerleme çubuğunun `aria-valuenow`'u yüzdeyle eşleşiyor.

---

## Ş12 · Gönderim, onay, başarı, hata, çevrimdışı (SPEC A.7–A.9, A.11)

**Dosya:** `bug-report-modal.tsx`, `apps/web/src/lib/support/bug-report-client.ts`.

- **Alt bar** (A.8): `padding:14px 22px`, üstte `1px H(border,.5)`, `H(surface-secondary,.5)`.
  Solda 5 koşullu not, sağda **Vazgeç** (çerçeveli) + **Raporu gönder** (dolgulu, gölgeli).
  Pasif koşulu: kategori yok **veya** metin < 20 **veya** çevrimdışı.
  **Pasif butona tıklama doğrulama hatası satırını gösterir** — tıklama yutulmaz.
  Busy: metin **Gönderiliyor**, 14px halka spinner (`@keyframes wspin .7s linear infinite`).
- **Gönderim:** `POST /api/v1/support/report`. Sürerken gövde `opacity:.55` +
  `pointer-events:none`. Ağ hatası → gönderim hatası satırı + satır içi **Tekrar dene**.
- **Hata satırları** (A.7): doğrulama / gönderim / ek yükleme `H(danger,.1)` + `1px H(danger,.35)`;
  çevrimdışı `H(warning,.12)` + `1px H(warning,.35)`. Metinler SPEC'ten birebir, solda 16px ikon.
  Çevrimdışı algısı `navigator.onLine` + `online`/`offline` olayları. **Kuyruk yok (K6).**
- **Vazgeçme onayı** (A.9): ikinci karartma `H(background,.66)`, kart `min(392px,100%)` radius 20.
  Tetikleyiciler: X, Esc, dışarı tıklama — **yalnız taslak doluysa**. Dolu tanımı: metin yazılmış
  **veya** kategori seçilmiş **veya** toggle varsayılanlarından sapılmış **veya** ek eklenmiş.
  **Vazgeç** (yıkıcı, solda) taslağı sıfırlar ve kapatır; **Devam et** (dolgulu, sağda) forma döner.
- **Başarı ekranı** (A.11, toast **değil**): gövde ve alt bar yerine modal içi ekran; başlık şeridi
  kalır. 52×52 `H(success,.16)` daire + 26px onay, başlık **Rapor alındı**, alt metin, numara kartı
  (**WSP-#####** + **Numarayı kopyala** → kopyalandıktan sonra **Kopyalandı** + `H(success)` tonu),
  altta **Kapat**. Bu ekranda ve gönderim sırasında X **onay sormaz**.
- Modal her açılışta sıfır (`modalKey`, Ş9).

**Kabul:** PROMPT.md'deki 12 "Sorun bildir" kabul maddesinin hepsi işaretli;
`bug-report-client` testi 201/4xx/5xx yollarını ve `no-store` beklentisini kanıtlıyor.

---

## Dalga 2 çıkış kriteri

- [ ] `typecheck` · `test` · `lint` yeşil.
- [ ] SPEC A.12'deki 13 durumun her biri elle gezildi ve `ekranlar/01..13` ile karşılaştırıldı.
- [ ] Aydınlık temada da doğru; sabit hex yok (üç `#fff` istisnası dışında).
- [ ] Klavye: Esc, Tab tuzağı, Enter'ın göndermemesi doğrulandı.

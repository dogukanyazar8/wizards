# 10 — 2e · Yardım merkezi

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`. Branch `uat`, commit yok.

Referans: `screenshots/2e-yardim-merkezi.png` · HTML `#2e` (satır 353–443) ·
PROMPT.md §3.10, §4.17.

Rota: `HelpCenter` (`help`). Giriş: 1b DESTEK > "Yardım merkezi".

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-help-center-screen.tsx` (+ `.styles.ts`)
- `apps/mobile/src/about/mobile-help-cache.ts` — çevrimdışı için son 10 makale
- Container: `HelpCenterScreenContainer`

---

## 2. Yerleşim

### Başlık + arama (HTML 365–373)

`AboutScreenHeader` — "Yardım merkezi" 21/800, sağ aksiyon yok.
`AboutSearchField` (2b ile **aynı bileşen**, kabul kriteri 25):
`margin: 12px 16px 0`, `r16`, `padding: 12px 14px`, `gap: 9`, 16px büyüteç `iconTint`,
placeholder `Sorununu yaz: “mikrofon çalışmıyor”` 13.5/500 `textMuted`.

### EN ÇOK OKUNANLAR (HTML 375–409)

`AboutGroupLabel` `padding: 16px 20px 8px` + kart; **4 satır**, her biri `padding: 12px 16px`:

- Solda sıra numarası 12/800 `iconTint`, `width: 14`, `flex: none`.
  (Numara ikon değil metin; `iconTint` burada **sayı rengi** olarak kullanılıyor —
  HTML böyle. Kabul kriteri 22'deki "metin olarak kullanılmaz" kuralı gövde metni içindir;
  bu istisnayı yorumla belirt ve kontrastı ≥3:1 olacak şekilde koru.)
- Metin kolonu `gap: 2`: başlık 13.5/600 + alt metin 11/500 `textTertiary`
  = `{n} dk okuma · {n}B görüntüleme`.
- Sağda chevron 14px `iconTint`.
  Sıralama sunucudan gelen `viewCount` sırasıdır; istemci yeniden sıralamaz.

### KATEGORİLER (HTML 411–433)

`AboutGroupLabel` + ızgara: **tam 2 kolon**, `gap: 10`, `margin: 0 16px`.
RN'de grid yok → `flexDirection: "row"`, `flexWrap: "wrap"`, her karo
`width: (contentWidth - 10) / 2`; `contentWidth = ekranGenişliği - 32`.
Karolar **eşit yükseklikte** olmalı (kabul kriteri 30) → satır bazında en uzun karoya
hizalanır; en basit yol her karoya `minHeight` yerine satırları ikişerli render edip
`alignItems: "stretch"` kullanmaktır.

Karo: `card` + `1px cardBorder`, `r20`, `padding: 14px`, kolon `gap: 9`:
30px `r11` ikon kutusu + başlık 13/700 + `{n} makale` 10.5/500 `textTertiary`.

| Kategori           | Kutu / ikon                                   | Sayı |
| ------------------ | --------------------------------------------- | ---- |
| Hesap ve güvenlik  | `accentSurface` / kişi ikonu `accent`         | 14   |
| Sohbet ve kanallar | `successSurface` / balon ikonu `successText`  | 22   |
| Ses ve görüntü     | `warningSurface` / kamera ikonu `warningText` | 17   |
| Sunucu yönetimi    | `control` / liste ikonu `textSecondary`       | 9    |

Sayılar sunucudan (`categories[].articleCount`) gelir; sabit yazılmaz.

### İletişim satırı (HTML 435–441)

`margin: 16px 16px 0`, tek satırlık kart, `padding: 13px 16px`, `gap: 12`:
metin kolonu ("Aradığını bulamadın mı?" 14/600 + "Ekibe yaz · ortalama yanıt 4 saat"
11/500 `textTertiary`) + sağda `Yaz` butonu (`accentSurface`, `r12`, `padding: 9px 13px`,
12.5/700 `accent`) → `BugReport` rotası (prompt 11).

---

## 3. Arama davranışı (§4.17)

- 300 ms debounce, en az 2 karakter.
- Sonuç varsa: "EN ÇOK OKUNANLAR" ve "KATEGORİLER" bloklarının yerine tek kart içinde
  sonuç satırları (aynı satır düzeni, sıra numarası yerine kategori etiketi
  10.5/700 `textTertiary`).
- **Sonuç yoksa**: kart içinde tek satır — "Bunu bulamadık" 14/600 +
  "Ekibe yaz · sorunun {kategori} olarak açılır" 11/500 + sağda `Yaz` butonu.
  Dokunuş → `BugReport { category }` ile **kategori önseçili** açılır.
  Kategori eşlemesi sorgudan çıkarılır (basit anahtar kelime tablosu:
  mikrofon/ses/arama → `voice`; bildirim → `notification`; yavaş/donma → `performance`;
  mesaj/sohbet/kanal → `chat`; diğer → `other`). Tablo `mobile-about-model.ts` içinde
  saf fonksiyon olarak yazılır ve testi olur.

## 4. Çevrimdışı (§4.17)

- Açılan her makale `mobile-help-cache.ts` ile AsyncStorage'a yazılır; **son 10** tutulur
  (LRU, `slug` anahtarlı).
- Ağ yokken: popüler liste ve kategoriler React Query önbelleğinden; önbellek de yoksa
  önbelleğe alınmış makaleler "SON OKUDUKLARIN" başlığı altında listelenir.
- Makale açma: `bodyMarkdown` varsa uygulama içi okuyucu
  (`legal/mobile-legal-document-screen.tsx` deseni; yeni ekran yazmak yerine bu ekranın
  markdown render'ını yeniden kullan), yoksa `Linking.openURL(article.url)`.
- Makale açıldığında `POST help/articles/{slug}/view` best-effort çağrılır
  (hata sessizce yutulur, kullanıcıya gösterilmez).

---

## 5. Testler

`component-tests/mobile-about-help-center-2e.test.tsx`:

- Popüler listede tam 4 satır, sıra numaraları 1–4.
- Kategori ızgarası tam 2 kolon ve 4 karo; sayılar sunucu verisinden.
- Arama 2 karakterden kısa iken istek atılmıyor.
- Sonuç boşken "Bunu bulamadık" satırı ve `Yaz` butonu görünüyor; dokunuş
  `BugReport` rotasına **kategori parametresiyle** gidiyor.
- `bodyMarkdown` varsa uygulama içi okuyucu, yoksa `Linking.openURL` çağrılıyor.
- Makale açılışında view ucu çağrılıyor; uç hata verse de ekran hata göstermiyor.
- Çevrimdışıyken önbellekteki makaleler listeleniyor.

`scripts/mobile-about-model.test.ts`'e ekleme: sorgu → kategori eşleme tablosu.

## 6. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-help-center-2e.test.tsx
```

## 7. Kabul kriterleri

25 (arama alanı 2b ile aynı bileşen) · 30 (kategori ızgarası tam 2 kolon, `gap:10`,
karolar eşit yükseklik) · 9 (grup etiketleri) · 10 (satırlar ≥44px) · 1 (kırpma yok).

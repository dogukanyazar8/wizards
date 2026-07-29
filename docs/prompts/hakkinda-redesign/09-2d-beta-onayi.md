# 09 — 2d · Beta programı onay sheet'i

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `03`, `08`. Branch `uat`, commit yok.

Referans: `screenshots/2d-beta-onayi.png` · HTML `#2d` (satır 285–350) ·
PROMPT.md §3.9, §4.4, §4.16.

Bu bir **rota değildir**: overlay host üzerinden açılan sheet. İki tetikleyicisi var:

1. 1a UYGULAMA > "Beta programı" toggle'ı açılırken,
2. 2c'de Beta veya UAT seçilip "Kanalı kaydet"e basıldığında.

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-beta-consent-sheet.tsx` (+ `.styles.ts`)
- `kit/overlay-registry.ts` → `about-beta-consent` kaydı
- Açma yardımcısı: `apps/mobile/src/about/open-about-beta-consent.ts`
  — `Promise<boolean>` döner (onaylandı / vazgeçildi), böylece iki tetikleyici de
  aynı sonucu bekleyebilir.

---

## 2. Yerleşim

Arka plan: tetikleyen ekran olduğu gibi kalır; üzerine scrim `about.scrim`
(`rgba(20,23,42,.42)`) gelir, arkadaki içeriğin opaklığı **düşürülmez**.

Sheet — `AboutConsentSheetShell` (prompt 02):
`padding: 10px 20px 30px`, üst köşe `r30`, alt köşe cihaz köşesine oturur,
gölge `0 -14px 40px rgba(20,23,42,.18)`, `card` zemin.

1. Grabber 38×4 `r2` `grabber`, `margin: 0 auto 18px`.
2. 44px `r15` `accentSurface` kutu + 21px `accent` **deney tüpü** ikonu (HTML 322 path).
3. Başlık 19/800 "Beta programına katıl", `marginTop: 14`.
4. Açıklama 12.5/500 `lineHeight 1.5` `textSecondary`, `marginTop: 6`:
   "Beta sürümleri yayına girmeden iki hafta önce elinde olur. Karşılığında bizim için
   test ediyor olacaksın."
5. Üç koşul, `marginTop: 18`, `gap: 13`; her satır `alignItems: flex-start`, `gap: 11`:
   26px `r9` ikon kutusu + 12.5/600 `lineHeight 1.45` metin.
   **Sıra bağlayıcı — fayda → risk → güvence:**
   | #   | Kutu / ikon                                   | Metin                                    |
   | --- | --------------------------------------------- | ---------------------------------------- |
   | 1   | `accentSurface` / kıvılcım `accent`           | Yeni özellikler herkesten önce açılır    |
   | 2   | `warningSurface` / uyarı üçgeni `warningText` | Beklenmeyen hatalar ve çökmeler olabilir |
   | 3   | `successSurface` / kalkan+tik `successText`   | Sohbetlerin ve dosyaların etkilenmez     |
6. Onay satırı `marginTop: 18`: zemin `screen` (`#F6F7FB`), `r16`, `padding: 13px 14px`,
   `gap: 11`, `alignItems: center`:
   - 20px `r6` kutu. İşaretliyken `accent` zemin + 12px beyaz tik (`strokeWidth: 3.2`);
     işaretsizken `card` zemin + `1px radioBorder` kenar, tik yok.
   - Metin 12/600 `lineHeight 1.4`: "Kararsız sürüm kullanmayı kabul ediyorum".
   - Tüm satır dokunulabilir (`accessibilityRole="checkbox"`, `accessibilityState.checked`).
7. Birincil buton `marginTop: 16`: `accent`, `r16`, `padding: 14px 0`, 14/800 beyaz,
   gölge `0 10px 24px rgba(79,70,229,.24)`, etiket "Beta'ya katıl".
   **Onay kutusu işaretlenmeden pasif** (`opacity: .45`, dokunma yok) — kabul kriteri 29.
8. İkincil eylem `padding: 13px 0 0`, ortalı, **düz metin**: "Vazgeç" 13.5/700
   `textSecondary`. İkinci dolgulu buton **yok** (kabul kriteri 28).

---

## 3. Davranış (§4.4, §4.16)

1. Onay verildiğinde `whispr.settings.betaConsentAt = ISO now` yazılır ve sheet
   `true` ile kapanır.
2. "Vazgeç" veya scrim'e dokunma / geri tuşu → `false` ile kapanır ve
   **tetikleyici eski hâline döner**: 1a'daki toggle kapalı kalır, 2c'deki seçim
   kaydedilmez.
3. `betaConsentAt` doluysa sheet **bir daha açılmaz** — toggle/kaydet doğrudan işini yapar.
   Kullanıcı kanaldan çıkıp geri dönerse (`stable`e geçip tekrar `beta`)
   `betaConsentAt` **temizlenir** ve onay yeniden sorulur.
4. Onay sonrası kanal değişimi 2c'deki `POST app/channel` akışıyla yapılır;
   1a toggle'ı tetiklediyse aynı istek buradan gönderilir.
5. Toggle'dan gelindiğinde başarı sonrası kimlik kartındaki kanal çipi ve UYGULAMA
   satırı **birlikte** güncellenir (tek tercih kaynağı).

---

## 4. Erişilebilirlik

- Sheet açıldığında odak başlığa taşınır (`AccessibilityInfo.setAccessibilityFocus`).
- Pasif birincil butonun `accessibilityHint`'i neden pasif olduğunu söyler:
  "Devam etmek için onay kutusunu işaretle".
- Geri tuşu (Android) sheet'i kapatır, ekranı değil.

---

## 5. Testler

`component-tests/mobile-about-beta-consent-2d.test.tsx`:

- Üç koşul **fayda → risk → güvence** sırasında render ediliyor.
- Onay kutusu işaretsizken birincil butona basmak `onConfirm` çağırmıyor.
- İşaretleyince buton aktifleşiyor ve `betaConsentAt` yazılıyor.
- "Vazgeç" `false` ile kapatıyor; tetikleyen toggle kapalı kalıyor.
- İkinci dolgulu buton yok (`getAllByRole("button")` içinde tek dolu buton).
- `betaConsentAt` doluyken sheet hiç açılmıyor.
- `stable`e dönüşte `betaConsentAt` temizleniyor.

## 6. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-beta-consent-2d.test.tsx
```

## 7. Kabul kriterleri

28 (ikincil eylem düz metin, ikinci dolgulu buton yok) ·
29 (onay kutusu 20px `r6`; işaretsizken birincil buton pasif) ·
19 (sheet alt köşe cihaz köşesine oturuyor, scrim .42) · 22 (kontrast).

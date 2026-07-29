# 13 — 2h · Whispr'ı puanla

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `03`. Branch `uat`, commit yok.

Referans: `screenshots/2h-puanlama.png` · HTML `#2h` (satır 610–684) ·
PROMPT.md §3.13, §4.20.

Rota değil, **sheet**. Tetikleyici: 1b TOPLULUK > "Whispr'ı puanla" satırı
(ve §4.20'deki otomatik tetikleme koşulu).

---

## 0. Mağaza değerlendirmesi hakkında karar

`expo-store-review` **kurulu değil ve eklenmiyor** (yeni native build gerektirir).
5 yıldızda birincil buton `Linking.openURL` ile mağaza sayfasını açar:

- iOS: `itms-apps://apps.apple.com/app/id{APP_ID}?action=write-review`
- Android: `market://details?id={PACKAGE}`
  Kimlikler `src/release/mobile-store-contract-data.json` içindeki `appIdentity` alanından
  okunur; orada yoksa buton **gizlenir** ve yerine geri bildirim akışı gösterilir.

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-rating-sheet.tsx` (+ `.styles.ts`)
- `apps/mobile/src/about/mobile-rating-model.ts` — tetikleme koşulu + etiket eşlemesi
- `kit/overlay-registry.ts` → `about-rating` kaydı

---

## 2. Yerleşim

Scrim `about.scrim`; sheet `AboutConsentSheetShell` (`padding: 10px 20px 30px`,
üst köşe `r30`, alt köşe cihaz köşesine oturur).

1. Grabber 38×4 `r2` `grabber`, `margin: 0 auto 20px`.
2. Ortalı kolon:
   - `AboutBrandLogo size={52} radius={13}` — bar 3px / `gap 3`,
     yükseklikler 13/19/26/18/14, gölge `0 12px 26px logoShadow`.
   - Başlık 19/800 "Whispr'ı puanlar mısın?", `marginTop: 16`, ortalı.
   - Gerekçe 12.5/500 `lineHeight 1.5` `textSecondary`, `marginTop: 6`, ortalı:
     "{n} gündür bizimlesin. Bir dokunuşluk puan, Whispr'ı bilmeyenlere en çok yardım
     eden şey." — `{n}` **gerçek kullanım süresidir** (ilk oturum tarihinden hesaplanır;
     bilinmiyorsa cümlenin ilk yarısı düşer, uydurma sayı yazılmaz).
   - Yıldız sırası `marginTop: 20`, `gap: 10`: 42px yıldızlar.
     Dolu `fill: star`; boş `fill: none`, `stroke: starEmpty`, `strokeWidth: 1.6`.
     Dokunma alanı yıldız başına **≥44px** — `hitSlop: { horizontal: 2, vertical: 2 }`
     ile 42px + gap birleşimi 44'e tamamlanır.
     `accessibilityRole="radio"`, `accessibilityLabel="{n} yıldız"`.
   - Seçim etiketi 12/700 `textTertiary`, `marginTop: 12`:
     `{n} yıldız · “{etiket}”`. Etiketler: 1 "Hiç olmadı", 2 "Zayıf", 3 "İdare eder",
     4 "İyi, ama eksikleri var", 5 "Harika".
     Hiç seçim yokken etiket satırı **boş yer tutar** (yükseklik sabit kalsın, sheet zıplamasın).
3. **≤4 yıldız** → geri bildirim bloğu `marginTop: 18`:
   zemin `screen`, `r18`, `padding: 14px 15px`.
   - Başlık 13/700 "Eksik bulduğun bir şey var mı?"
   - Açıklama 11.5/500 `lineHeight 1.45` `textTertiary`, `marginTop: 5`:
     "İki satır yazarsan doğrudan ürün ekibine iletiriz. İstersen atlayabilirsin."
   - Konu çipleri `marginTop: 12`, `flexWrap`, `gap: 7`: `card` + `1px cardBorder`,
     `r10`, `padding: 7px 11px`, 11.5/600 `textSecondary`.
     Çipler: Bildirimler, Ses kalitesi, Hız, Tasarım. **Çoklu seçim**; seçili çip
     `accentSurface` zemin + `accent` metin.
   - Birincil buton "Gönder" — **mağazaya gitmez** (kabul kriteri 36).
4. **5 yıldız** → aynı yerde tek satır 12.5/500 `textSecondary`, ortalı:
   "Mağazada paylaşırsan çok yardımcı olur" + birincil buton
   "App Store'da değerlendir" (Android'de "Google Play'de değerlendir").
5. Birincil buton: `accent`, `r16`, `padding: 14px 0`, 14/800 beyaz,
   gölge `0 10px 24px rgba(79,70,229,.24)`, `marginTop: 16`.
   Yıldız seçilmeden **pasif**.
6. İkincil düz metin "Şimdi değil" 13.5/700 `textSecondary`, `padding: 13px 0 0`, ortalı.
   İkinci dolgulu buton **yok** (kabul kriteri 28).

---

## 3. Davranış (§4.20)

1. Yıldıza dokunuş → `selection()` haptiği + etiket **anında** değişir.
2. ≤4 yıldız → "Gönder": seçilen yıldız + konular
   `POST /api/v1/mobile/support/report` ucuna **`category: "other"` ve yapılandırılmış
   gövde** ile gider mi? **Hayır** — puanlama hata raporu değildir.
   Bunun yerine mevcut ürün geri bildirimi ucu kullanılır:
   `POST /api/v1/mobile/feedback` (mevcut, 4a akışının ucu), gövdede
   `rating` ve `topics` bilgisi metne çevrilerek gönderilir.
   Bu, yeni bir uç açmadan veriyi doğru kutuya koyar; gerekçeyi yorumla belirt.
3. 5 yıldız → mağaza bağlantısı `Linking.openURL` (§0). Bağlantı yoksa buton gizli.
4. Gönderim/mağaza sonrası: `rate.submittedVersion = mevcut sürüm` yazılır;
   **aynı sürümde bir daha sorulmaz**.
5. "Şimdi değil" → `rate.snoozedUntil = now + 90 gün`.
6. **Otomatik tetikleme koşulu** (`mobile-rating-model.ts`, saf fonksiyon):
   `≥7 gün kullanım` **ve** `son 7 günde çökme yok` **ve** `açık hata raporu yok`
   **ve** `snoozedUntil < now` **ve** `submittedVersion !== mevcut sürüm`.
   Çökme bilgisi mevcut `feedback/mobile-crash-report.ts` altyapısından okunur.
   Otomatik açılma bu iş kapsamında **etkin edilmez** — fonksiyon yazılır, testi olur,
   çağrı noktası yorumla işaretlenir. Sebep: tetikleme kararı ürün kararıdır, ekran işi değil.

---

## 4. Testler

`component-tests/mobile-about-rating-2h.test.tsx`:

- 5 yıldız render ediliyor; 4. yıldıza dokununca 4 dolu 1 boş.
- Etiket `4 yıldız · “İyi, ama eksikleri var”` biçiminde.
- 4 yıldızda **mağaza butonu yok**, konu çipleri + "Gönder" var.
- 5 yıldızda konu çipleri yok, mağaza butonu var.
- Yıldız seçilmeden birincil buton pasif.
- "Şimdi değil" `snoozedUntil` yazıyor (+90 gün).
- Gönderimden sonra `submittedVersion` yazılıyor.
- Kullanım süresi bilinmiyorken gerekçe cümlesinde sayı yok.
- İkinci dolgulu buton yok.

`scripts/mobile-rating-model.test.ts`:

- Tetikleme koşulunun beş bileşeni tek tek (her biri tek başına `false` yapıyor).
- Etiket eşlemesi 1–5.

## 5. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-rating-2h.test.tsx
```

```bash
node --test --import tsx scripts/mobile-rating-model.test.ts
```

## 6. Kabul kriterleri

35 (yıldızlar 42px, dolu `#F5B23D` / boş `stroke #DEE1EE`; etiket "sayı + tırnaklı etiket") ·
36 (4 yıldızda mağaza butonu görünmez; konu çipleri + "Gönder") ·
28 (ikincil eylem düz metin) · 19 (sheet köşeleri, scrim .42).

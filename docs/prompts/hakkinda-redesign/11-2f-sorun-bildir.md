# 11 — 2f · Sorun bildir

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `10`. Branch `uat`, commit yok.

Referans: `screenshots/2f-sorun-bildir.png` · HTML `#2f` (satır 446–518) ·
PROMPT.md §3.11, §4.10, §4.18.

Rota: `BugReport { category? }` (`help/report`).
Giriş: 1b DESTEK > "Sorun bildir", 2e "Yaz" butonu, 2e boş arama sonucu.

**Mevcut `mobile-feedback-*` akışına dokunulmaz.** Bu ayrı bir form ve ayrı bir uçtur
(`POST /api/v1/mobile/support/report`, prompt 01).

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-bug-report-screen.tsx` (+ `.styles.ts`)
- `apps/mobile/src/about/mobile-bug-report-model.ts` — taslak doğrulama + kuyruk
- `apps/mobile/src/about/mobile-bug-report-diagnostics.ts` — günlük özeti + cihaz bilgisi
- Container: `BugReportScreenContainer`

---

## 2. Yerleşim

### Başlık (HTML 458–461)

`AboutScreenHeader variant="close"` — sol üstte **kapat (X)** ikonu 17px, geri chevron'u
**değil** (kabul kriteri 31): bu bir form akışıdır. Başlık "Sorun bildir" 21/800.
Kapat: taslak doluysa "Vazgeçilsin mi?" onayı (`kit/destructive-confirmation-sheet.tsx`).

### NEREDE OLDU? (HTML 463–470)

`AboutGroupLabel` `padding: 14px 20px 8px` + çip satırı `padding: 0 16px`,
`flexWrap: "wrap"`, `gap: 8`:

- Seçili: `accent` zemin, `r11`, `padding: 8px 13px`, 12/700 beyaz.
- Pasif: `card` + `1px cardBorder`, 12/600 `textSecondary`.
  Çipler: `Ses ve arama` (`voice`), `Sohbet` (`chat`), `Bildirim` (`notification`),
  `Performans` (`performance`), `Diğer` (`other`).
  **Kategori seçimi zorunlu**; rota parametresi geldiyse önseçili açılır.

### NE OLDU? (HTML 472–479)

`AboutGroupLabel` + alan: `card` + `1px cardBorder`, `r20`, `padding: 14px 16px 11px`.

- `TextInput` `multiline`, 13.5/500 `lineHeight 1.5`, `text` rengi;
  placeholder "Ne oldu? Hangi adımlardan sonra?" `textMuted`.
  `minHeight` ~ 4 satır; büyüdükçe alan uzar (`onContentSizeChange`).
- Altta `marginTop: 12`, `paddingTop: 11`, `borderTop: 1px hairline`, satır `gap: 8`:
  - ipucu 11/500 `textTertiary`: "Adım adım anlatırsan daha hızlı çözeriz"
  - sayaç `{n} / 1000` 11/600 `iconTint`; **900'den sonra** `warningText`.
- Klavye: `KeyboardAvoidingView` yerine mevcut `MobileChatKeyboardRegion` deseni **değil**
  (o sohbet yüzeyine özel); burada `ScrollView` + `keyboardShouldPersistTaps="handled"` +
  `useMobileBottomSystemSpacing()` yeterli. Sabit alt buton klavye açıkken yukarı
  taşınmaz, klavyenin altında kalır — bunun yerine klavye açıkken buton
  `position: relative` olarak listenin sonuna alınır. Bu davranışı yorumla belirt.

### RAPORA EKLENECEKLER (HTML 481–509)

`AboutGroupLabel` + kart, üç toggle satırı `padding: 11px 16px`.
Alt metinler **ne gönderileceğini açıkça yazar** (kabul kriteri 32):

| Satır                  | Alt metin                                      | Varsayılan |
| ---------------------- | ---------------------------------------------- | ---------- |
| Sistem günlükleri      | Son 500 satır · mesaj içeriği yok              | **açık**   |
| Ekran görüntüsü        | {ekran adı} · düzenleyebilirsin                | **açık**   |
| Cihaz ve sürüm bilgisi | {model} · {os} · {version} ({build}) · {kanal} | **kapalı** |

- Ekran görüntüsü satırının solunda 34×44 `r8` önizleme: `control` zemin +
  `1px cardBorder`, içinde 3 adet 3px `timelineDot` çubuk (yükseklik 9/15/11),
  `alignItems: flex-end`, `paddingBottom: 7`, `gap: 2`.
  Gerçek görüntü varsa çubuklar yerine küçük görsel (`mobile-cached-image.tsx`).
- Önizlemeye dokunuş → düzenleyici. **Karar:** karalama/kırpma düzenleyicisi bu iş
  kapsamında yazılmaz; dokunuş görüntüyü tam ekran açar (`message-image-lightbox.tsx`)
  ve "Kaldır" eylemi sunar. §4.18'in düzenleyici sözü kapsam dışıdır, yorumla belirtilir.
- Cihaz bilgisi metni `expo-device` + `environment.ts` + bootstrap'tan üretilir;
  toggle kapalıyken metin yine görünür (kullanıcı ne göndermediğini de bilir).

### Gizlilik notu (HTML 511–514)

`margin: 14px 16px 0`, kart, `r20`, `padding: 12px 15px`, `gap: 11`,
`alignItems: flex-start`: 16px kalkan ikonu `textSecondary` + metin 11.5/500
`lineHeight 1.5` `textTertiary`:
"Mesajların, kişilerin ve dosyaların hiçbir zaman gönderilmez. Rapor 90 gün sonra silinir."
Bu cümle sunucu davranışıyla **eşleşmek zorunda** — `purgeAfter` alanı prompt 01'de bunu
tutuyor.

### Sabit alt buton (HTML 516)

`AboutStickyFooterButton` — "Raporu gönder", 2c ile aynı ölçüler.
Pasif koşulu: kategori seçilmemiş **veya** açıklama < 20 karakter (§4.18).

---

## 3. Günlük ve cihaz verisi

`mobile-bug-report-diagnostics.ts`:

- `collectRecentLogLines(limit = 500)` — mevcut `apps/mobile/src/feedback/mobile-fault-log.ts`
  altyapısını kullanır. **Mesaj içeriği, kişi adı, dosya adı ve token asla girmez**:
  toplama sırasında `SENSITIVE_TEXT_PATTERN` benzeri bir maskeleme uygulanır
  (`mobile-settings-model.ts:56`'daki desen örnektir).
- `collectDeviceInfo()` — `expo-device` modeli, OS sürümü, uygulama sürümü/build,
  kanal, dil. Kullanıcı kimliği **girmez**.
- Ekran görüntüsü: mevcut `mobile-crash-screenshot.ts` yakalama +
  `use-mobile-feedback-attachment-upload.ts` yükleme akışı yeniden kullanılır;
  yükleme anahtarı `screenshotUploadKey` olarak gövdeye girer.

---

## 4. Gönderim (§4.18)

1. Doğrulama: kategori + ≥20 karakter. Hata mesajı alanın altında değil, butona basınca
   toast ile verilir (form kısa).
2. `POST support/report` → `{ ticket }`.
3. Başarı: `showToast` `success` varyantı, metin `Rapor alındı · {ticket}`;
   ticket **panoya kopyalanır** (`expo-clipboard`) ve haptik verilir.
   Ekran kapanır (`navigation.goBack()`).
4. **Ağ yoksa** rapor kuyruğa alınır: `whispr.report.queuedDrafts` (AsyncStorage, en fazla
   5 taslak). Bağlantı geldiğinde `mobile-connectivity-context` dinleyicisiyle gönderilir;
   başarıda toast ile ticket bildirilir. Kuyruk mantığı `mobile-bug-report-model.ts`
   içinde saf fonksiyonlarla yazılır ve node testi olur.
5. Gönderim sırasında buton `busy` durumunda, form salt okunur.

---

## 5. Testler

`component-tests/mobile-about-bug-report-2f.test.tsx`:

- Başlıkta X ikonu var, geri chevron'u **yok**.
- Kategori seçilmeden ve 20 karakterden kısa metinle buton pasif.
- Rota parametresiyle gelen kategori önseçili.
- Sayaç 900'den sonra `warningText` rengine geçiyor.
- Üç ek satırı doğru varsayılanlarla (`logs` açık, `screenshot` açık, `device` kapalı).
- Cihaz bilgisi metni toggle kapalıyken de görünüyor.
- Başarılı gönderimde ticket panoya kopyalanıyor ve ekran kapanıyor.
- Ağ yokken taslak kuyruğa yazılıyor ve toast "gönderilecek" diyor.
- Dolu formda kapat → onay sheet'i açılıyor.

`scripts/mobile-bug-report-model.test.ts`:

- Doğrulama kuralları (kategori, 20/1000 sınırları).
- Kuyruk en fazla 5 taslak tutuyor, en eskisi düşüyor.
- Günlük maskeleme: token/e-posta/mesaj gövdesi içeren satırlar temizleniyor.

## 6. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-bug-report-2f.test.tsx
```

```bash
node --test --import tsx scripts/mobile-bug-report-model.test.ts
```

## 7. Kabul kriterleri

31 (başlıkta X, geri chevron'u değil) ·
32 (üç ek satırının alt metni ne gönderileceğini yazar; cihaz bilgisi varsayılan kapalı) ·
27 (sabit alt buton ölçüleri) · 10 (satırlar ≥44px) · 1 (kırpma yok).

Ek kabul: gönderilen gövdede mesaj içeriği, kişi adı, dosya adı veya token **yok**
(model testiyle kanıtlanır).

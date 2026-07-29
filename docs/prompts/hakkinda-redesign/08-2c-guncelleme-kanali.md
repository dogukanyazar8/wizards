# 08 — 2c · Güncelleme kanalı seçici

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `03`. Branch `uat`, commit yok.

Referans: `screenshots/2c-guncelleme-kanali.png` · HTML `#2c` (satır 211–282) ·
PROMPT.md §3.8, §4.15.

Rota: `AboutUpdateChannel` (`settings/about/channel`).
Giriş: 1a UYGULAMA > "Güncelleme kanalı" satırı.

---

## 0. Gerçeklik notu

EAS/expo-updates kanalı **çalışma anında değişmez**; kanal build zamanı ayarıdır.
Bu yüzden bu ekran kullanıcının **tercihini** kaydeder (`POST /api/v1/mobile/app/channel`,
prompt 01) ve yanıttaki `effectiveFrom: "next-build"` bilgisini kullanıcıya söyler.
Ekran "uygulama yeniden başlar" vaadini **yalnız sunucu `requiresRestart: true` derse**
gösterir; aksi hâlde "KANAL DEĞİŞTİĞİNDE" kartının ikinci satırı
"Yeni kanal bir sonraki güncellemeden itibaren geçerli olur" metnine döner.
Uydurma yeniden başlatma yapılmaz.

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-channel-screen.tsx` (+ `.styles.ts`)
- Container: `AboutUpdateChannelScreenContainer`

---

## 2. Yerleşim

### Başlık + açıklama (HTML 223–228)

`AboutScreenHeader` — "Güncelleme kanalı" 21/800, **sağ aksiyon yok**.
Altında açıklama 12.5/500 `lineHeight 1.55` `textSecondary`, `padding: 8px 20px 0`:
"Kanal, güncellemeleri ne kadar erken aldığını belirler. Kararlı kanal en az sürprizi,
UAT en yeni değişiklikleri getirir."

### Kanal kartı (HTML 230–261)

`margin: 14px 16px 0`, `card`, `1px cardBorder`, `r24`.
Üç seçenek satırı `padding: 14px 16px`, `alignItems: flex-start`, `gap: 12`;
ilk satır hariç `borderTop: 1px hairline`.

**Radyo** 22px, `flex: none`, `marginTop: 1`:

- Seçilmemiş: daire, `borderWidth: 2`, `borderColor: radioBorder`, zemin yok.
- Seçili: dolu `accent` daire + 12px beyaz tik, `strokeWidth: 3`.

**Metin kolonu** `flex: 1`, `gap: 3`:

- Başlık satırı `gap: 7`: başlık 14.5/700 + opsiyonel yardımcı çip
  (9/800 `ls .06em`, `r5`, `padding: 2px 5px`).
- Açıklama 11.5/500 `lineHeight 1.45` `textTertiary`.
- Meta 11/600 `textSecondary`, `marginTop: 3`.

| Kanal   | Çip                                                    | Açıklama                                                                    | Meta                       |
| ------- | ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------- |
| Kararlı | —                                                      | Herkese açık sürümler. Yayına girmeden önce iki test aşamasından geçer.     | 6–8 haftada bir · önerilen |
| Beta    | `12,4B KULLANICI` (`successText`/`successChipSurface`) | Yeni özellikleri iki hafta önce dene. Nadiren beklenmeyen hatalar görülür.  | 2 haftada bir              |
| UAT     | `İÇ TEST` (`warningText`/`warningChipSurface`)         | Ekibin günlük yapıları. Yarım kalmış özellikler ve çöken ekranlar olabilir. | Her hafta · şu anki kanal  |

- Seçili satırın zemini `accentCardSurface`; **kartın son satırıysa** alt köşeleri
  `borderBottomLeftRadius/RightRadius: 24` (kabul kriteri 26).
  Bu yüzden zemin satır bileşeninde koşullu olarak uygulanır, kart `overflow: hidden`
  ile değil (gölge yok, kırpma sorunu yok).
- "şu anki kanal" meta eki **dinamiktir**: hangi kanal aktifse onun metasına eklenir.
- Beta çipindeki kullanıcı sayısı sunucudan gelmiyorsa çip render edilmez
  (uydurma sayı yazılmaz).

### Uyarı kartı (HTML 263–266)

`margin: 14px 16px 0`, zemin `warningSurface`, `r20`, `padding: 13px 15px`, `gap: 11`,
`alignItems: flex-start`: 17px üçgen ikon `warningText` + metin 11.5/500
`lineHeight 1.5` `warningNoteText`.
**Yalnız seçili kanal Beta veya UAT iken** görünür. Metin seçilen kanala göre değişir:
UAT için HTML'deki metin, Beta için "Beta sürümlerde beklenmeyen hatalar görülebilir;
hata bildirimlerin doğrudan ekibe düşer."

### KANAL DEĞİŞTİĞİNDE kartı (HTML 268–278)

`AboutGroupLabel` `padding: 18px 20px 8px` + kart `padding: 13px 16px`, `gap: 11`.
İki satır, `alignItems: center`, `gap: 10`: 15px tik ikonu `successText` +
12.5/600 metin:

- "Sohbetler, sunucular ve ayarlar korunur"
- "Uygulama bir kez yeniden başlar" (§0 gereği koşullu metin)

### Sabit alt buton (HTML 280)

`AboutStickyFooterButton` — `left/right: 16`, `bottom: 26`, `accent`, `r16`,
`padding: 14px 0`, 14/800 beyaz, gölge `0 10px 24px rgba(79,70,229,.24)`,
etiket "Kanalı kaydet".
Seçim değişmediyse **pasif**: `opacity: .45`, dokunma yok, `accessibilityState.disabled`.

Sabit buton içeriği kapatmasın: `ScrollView` `contentContainerStyle` altına
`paddingBottom = 26 + butonYüksekliği + safeArea.bottom` eklenir.

---

## 3. Davranış (§4.15)

1. Seçim **yereldir**; kaydete basılana kadar hiçbir şey gönderilmez.
2. Kaydet → seçim `beta` veya `uat` ise **2d onay sheet'i** açılır (prompt 09).
   Onay verilmezse kanal değişmez ve seçim eski hâline döner.
   `stable` seçildiyse onay istenmez.
3. Onay sonrası `POST app/channel` çağrılır. Başarıda:
   - `whispr.settings.channel` yazılır,
   - 1a'daki kimlik kartı kanal çipi **ve** UYGULAMA > Güncelleme kanalı satırı
     birlikte güncellenir (§4.4) — ikisi de aynı tercihten okur, ayrı state tutulmaz,
   - `showToast` ile `effectiveFrom` bilgisi gösterilir,
   - `navigation.goBack()`.
4. Hata: buton eski hâline döner, toast `error` varyantı, seçim korunur.

---

## 4. Testler

`component-tests/mobile-about-channel-2c.test.tsx`:

- Üç seçenek render ediliyor; aktif kanalın metasında "şu anki kanal" var.
- Seçim değişmeden buton pasif; değişince aktif.
- UAT/Beta seçiliyken uyarı kartı görünür, Kararlı seçilince **kaybolur**.
- Seçili satır `accentCardSurface` zeminli; son satırsa alt köşe yarıçapı uygulanmış.
- Kaydet → `beta` için onay sheet'i açılıyor; onay reddedilince istek **atılmıyor**.
- Başarılı kayıtta tercih yazılıyor ve geri dönülüyor.
- Sunucu hatası → toast hata varyantı, ekran açık kalıyor.

## 5. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-channel-2c.test.tsx
```

## 6. Kabul kriterleri

26 (seçili satır `#F7F6FF`, radyo indigo dolu + beyaz tik, son satır alt köşe `r24`) ·
27 (sabit alt buton `bottom:26`, `left/right:16`, `r16`, 14/800) ·
10 (satır ≥44px) · 9 (grup etiketi) · 1 (kırpma yok).

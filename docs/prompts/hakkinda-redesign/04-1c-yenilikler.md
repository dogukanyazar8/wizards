# 04 — 1c · Yenilikler (sürüm notları listesi)

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `03`. Branch `uat`, commit yok.

Referans: `screenshots/1c-surum-notlari.png` · HTML `#1c` (satır 919–1018) · PROMPT.md §3.3,
§4.5, §4.6.

Rota: `AboutWhatsNew` (`settings/about/whats-new`). Giriş noktaları: 1a "Tümünü gör" ve
yenilikler kartının kendisi.

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-whats-new-screen.tsx`
- `apps/mobile/src/app/screens/about/about-whats-new-screen.styles.ts`
- Container: `mobile-screen-containers.tsx` → `AboutWhatsNewScreenContainer`

Kart bileşenlerinden `AboutCard`, `AboutGroupLabel`, `AboutTypePill`, `AboutRow`
prompt 02'den gelir; **kopyalanmaz**.

---

## 2. Yerleşim

### Başlık (HTML 931–938)

`AboutScreenHeader` — "Yenilikler" 21/800, sağda **etiketli buton**:
`card` zemin + `1px cardBorder`, `r13`, `padding: 9px 12px`, `gap: 6`,
zil ikonu 14px `accent` + `Bildir` 12/700 `accent`.
İşlev: sürüm bildirimlerini aç/kapa. Durum `whispr.settings.releaseNotify` (yeni tercih;
prompt 02'deki tercih modülüne ekle). Açıkken buton dolu görünmez — yalnız ikon
`accent` yerine `accent` + zil "dolu" varyantı olur; kapalıyken zil üstü çizgili.

### Filtre çipleri (HTML 940–945)

`padding: 12px 16px 4px`, `gap: 8`, yatay sıra (taşarsa `ScrollView horizontal`):

- Aktif: `accent` zemin, `r11`, `padding: 8px 13px`, 12/700 beyaz.
- Pasif: `card` + `1px cardBorder`, 12/600 `textSecondary`.
  Çipler: `Tümü` (varsayılan aktif), `Yeni`, `İyileştirme`, `Düzeltme`.
  §4.6: filtre yalnız görünen değişiklik türlerini süzer; **çipler asla pasifleşmez**;
  sonuç boşsa kart içinde tek satır: "Bu sürümde bu türde değişiklik yok"
  (`whatsNewEmpty`, 12.5/600 `textTertiary`).

### Güncel sürüm kartı (HTML 947–982)

`margin: 12px 16px 0`, zemin `accentCardSurface`, `1px accentCardBorder`, `r24`,
`padding: 15px 16px`:

1. Üst satır: `ŞU AN KULLANDIĞIN` çipi 9.5/800 `ls .08em`, `accent` / `accentChipSurface`,
   `r6`, `padding: 3px 7px` · `flex:1` boşluk · `24 Tem 2026` 11/600 `textTertiary`.
2. `marginTop: 11`, baseline hizalı satır `gap: 8`: `0.8.15` 20/800 `ls -.01em` +
   `“Echo”` 13/600 `textSecondary`.
   RN'de `alignItems: "baseline"` çalışır; çalışmazsa ikinci metne `paddingBottom: 1`
   ile optik hizalama yapılır ve yorumla açıklanır.
3. Özet 12.5/500 `lineHeight 1.5` `textSecondary`, `marginTop: 7`.
   Sunucudan `summary` gelmiyorsa **blok hiç render edilmez** (HTML `sc-if` karşılığı).
4. Değişiklik listesi `marginTop: 13`, `gap: 10`. Her satır `alignItems: center`, `gap: 10`:
   - `AboutTypePill width={62}` — 9/800 `ls .05em`, `r5`, `padding: 3px 6px`, ortalı,
     `numberOfLines={1}`. Etiketler: `YENİ` (`accent`/`accentChipSurface`),
     `İYİLEŞTİ` (`successText`/`successChipSurface`),
     `DÜZELDİ` (`warningText`/`warningChipSurface`).
   - Metin 12.5/600 `lineHeight 1.4`, `flex: 1`.
   - Dördü de aynı yükseklikte (20px) — çip yüksekliği sabitlenir (kabul kriteri 15).
5. `marginTop: 14`: `Tam sürüm notu` 12/800 `accent` + chevron 13px `accent` →
   `AboutReleaseNote { version }` (prompt 06).

### DAHA ÖNCE (HTML 984–1014)

`AboutGroupLabel` `padding: 18px 20px 8px`, ardından kart:

- Her satır `padding: 12px 16px`: solda 9px `timelineDot` nokta ·
  metin kolonu `gap: 2` (başlık 13.5/700; kod adı iç içe 600 `textTertiary`;
  alt metin 11/500 `textTertiary` = `{tarih} · {n} değişiklik · {öne çıkan}`) · chevron.
- **İlk 3 sürüm** listelenir (yüklü sürüm hariç).
- Son satır `padding: 13px 16px`: `Tüm sürüm geçmişi ({total})` 12.5/700 `accent` +
  chevron 14px `accent` → `AboutReleaseHistory` (prompt 07).
  `{total}` sunucudan gelen `total` alanıdır; istemci saymaz.

---

## 3. Veri

- `useAboutReleasesQuery({ limit: 4 })` — ilk kayıt yüklü sürümdür (vurgu kartı),
  sonraki üçü "DAHA ÖNCE".
- Yüklü sürüm listede yoksa (kanal farkı) vurgu kartı `aboutRelease(installedVersion)`
  ile ayrı çekilir.
- Yükleniyor: kart iskeletleri (`kit/skeleton.tsx`), **spinner değil**.
- Hata / ağ yok: kart yerine tek satır "Sürüm notları alınamadı · Tekrar dene"
  (`AboutRow` + `accent` eylem metni).

---

## 4. Davranışlar

1. Ekran açıldığında `whispr.about.seenVersion = latest` yazılır (§4.5). Yazım kalıcıdır;
   1a'daki `YENİ` rozeti ve profil hub'ındaki nokta aynı anda söner.
   **Tuzak:** yazma işlemi ekran unmount olurken değil, ilk başarılı veri geldiğinde
   yapılır; veri gelmeden yazılırsa kullanıcı hiç görmediği sürümü "görülmüş" sayar.
2. Filtre değişimi yalnız vurgu kartındaki listeyi süzer; "DAHA ÖNCE" bloğu etkilenmez.
3. `Bildir` butonu tercihi anında değiştirir + `showToast` ile geri bildirim verir.
4. Geri: `navigation.goBack()`.

---

## 5. Testler

`component-tests/mobile-about-whats-new-1c.test.tsx`:

- Dört filtre çipi render ediliyor; `Yeni`ye basınca yalnız `NEW` satırları kalıyor.
- Filtre boş sonuç verdiğinde çip **pasifleşmiyor** ve boş metni görünüyor.
- Tür çipleri 62px sabit genişlikte (stil doğrulaması).
- `summary` yoksa özet bloğu render edilmiyor.
- "DAHA ÖNCE" tam 3 satır + "Tüm sürüm geçmişi (38)" satırı.
- Ekran açılınca `seenVersion` yazılıyor (AsyncStorage mock'u ile), **veri gelmeden
  yazılmıyor**.
- "Tam sürüm notu" `AboutReleaseNote` rotasına doğru `version` ile gidiyor.

## 6. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-whats-new-1c.test.tsx
```

## 7. Kabul kriterleri

15 (tür çipleri 62px sabit, tek satır, dördü aynı yükseklik) ·
16 (vurgu kartı `#F7F6FF` + `#E7E6FD` kenar, sürüm 20/800) ·
17 (geçmiş satırlarında 9px `#C9CDE3` nokta ve "N değişiklik" özeti) ·
9 (grup etiketleri) · 10 (satırlar ≥44px) · 22 (kontrast).

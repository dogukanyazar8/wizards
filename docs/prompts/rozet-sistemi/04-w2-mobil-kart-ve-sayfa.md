# 04 — W2: Mobil kart (1a/1d) ve tam profil (1c) rozet satırı

Önce `00-ortak-baglam.md` ve `03-w1-okuma-yolu-ve-api.md` okunur. Bu prompt **ilk görünür
değişikliği** getirir. `05-w2-web-popover.md` ile **paralel koşabilir** (ortak dosya yok).

---

## Görev

1. 5 yeni line-icon glyph.
2. `profileBadge` tema token grubu (7 tint, açık + koyu).
3. Tek `ProfileBadgeChips` bileşeni — kart ve sayfa **aynı bileşeni** kullanır.
4. Kademe gösterimi + `+N` taşma chip'i.
5. Rozet metninin katalogdan okunması (iki yerdeki kopya metin kalkar).
6. Bileşen testleri.

---

## 1. Yeni glyph'ler

`apps/mobile/src/design/mobile-line-icon-definitions.ts` → `MOBILE_LINE_ICON_NAMES`
listesine **alfabetik sırasını koruyarak** eklenir:

| ad          | çizim                                  |
| ----------- | -------------------------------------- |
| `flame`     | alev dış hattı, tek path, stroke 1.9   |
| `lightbulb` | ampul + taban çizgileri                |
| `code`      | `</>` — iki chevron + eğik çizgi       |
| `flask`     | erlen: boyun + gövde + sıvı çizgisi    |
| `sparkle`   | dört uçlu yıldız + küçük ikinci yıldız |

Kurallar: 24×24 viewBox, `fill="none"`, `stroke-width` 1.9, `round` cap/join —
mevcut tanımların birebir aynı üslubu. Renk **hardcode edilmez**, `color` prop'undan gelir.

---

## 2. Tema token grubu — `profileBadge`

`apps/mobile/src/design/palette.ts`:

- Yeni sabitler: `redesignProfileBadgeLight` / `redesignProfileBadgeDark`.
- Yedi tint, her biri `{ surface, border, icon }`:

| tint       | açık `surface` / `border` / `icon`  | kaynak                                                |
| ---------- | ----------------------------------- | ----------------------------------------------------- |
| `lavender` | `#EEF0FE` / `#DFE2FC` / `#4F46E5`   | mock 1a:330 — birebir                                 |
| `amber`    | `#FDEBD7` / `#F5DDBC` / `#C77A2B`   | mock 1a:331 — birebir                                 |
| `green`    | `#E8F8EE` / `#D2F0DE` / `#1B8A55`   | mock 1a:332 — birebir                                 |
| `blue`     | `#E0F0FA` / `#CAE2F4` † / `#2B7AC7` | handoff token tablosu (Mavi)                          |
| `purple`   | `#F3E8FA` / `#E6D5F4` † / `#8A46C7` | handoff token tablosu (Mor)                           |
| `red`      | `#FCE9E9` / `#F9D7D7` † / `#E05252` | handoff token tablosu (Hata)                          |
| `neutral`  | `#F6F7FB` / `#E7E9F4` / `#6B7194`   | handoff token tablosu (Arkaplan / Kenarlık / İkincil) |

† **Kenarlık kaynakta yok, türetildi.** Handoff yalnız üç rozet tinti çizmiş; mavi,
mor ve kırmızı için kenarlık değeri hiçbir yerde geçmiyor. Kural: kenarlık = `icon`
rengi `surface` üzerine **%12 opaklıkta** karıştırılmış hâli. %12, mevcut üç çiftin
ima ettiği oranların (lavanta ≈%8.5, kehribar ≈%14, yeşil ≈%9.5) ortasıdır — tek bir
oran üçüne birden tam oturmadığı için formül **mevcut üç tinte geriye dönük
uygulanmaz**; onlar handoff değerleriyle kalır. Yukarıdaki üç hex bu kuralla
hesaplanmış nihai değerlerdir ve `palette.ts`'e **sabit** yazılır; çalışma zamanında
renk karıştırma yapılmaz.

Koyu tema: mevcut koyu rozet token'larının desenini izler —
`lavender` `#2A2D55`/`#3B3F73`/`#A5A8F5`, `amber` `#3A2E1B`/`#55432A`/`#E8B36A`,
`green` `rgba(52,211,153,.12)`/`rgba(52,211,153,.3)`/`#34D399`. Kalan dördü aynı
formülle: yüzey `rgba(<icon>, .12)`, kenarlık `rgba(<icon>, .3)`, ikon açık tondan
seçilir (`blue` `#6BB6E8`, `purple` `#BD8FE0`, `red` `#F08B8B`,
`neutral` yüzey `#232644` / kenarlık `#2B2F52` / ikon `#9BA1C7`).

`themes.ts` içinde `profileBadge` alanı olarak yayınlanır.

**Geriye dönük uyum:** `theme.profileCard.badgeEarly*/badgeSupporter*/badgeInviter*`
anahtarları **silinmez** — yeni gruptan beslenen alias olarak kalır. Silinirse
`mobile-redesign-theme-contract.test.ts` ve mevcut kart testleri kırılır.

---

## 3. Tek bileşen — `ProfileBadgeChips`

Bugün iki ayrı çizim var: kart `profile-card/profile-card-parts.tsx:78`, sayfa
`profile-page/mobile-profile-page-sections.tsx:247`. **İkisi tek bileşende birleşir.**

Yeni yer: `apps/mobile/src/social/profile-badges/profile-badge-chips.tsx`
(+ `profile-badge-chips.styles.ts`). Sayfa ve kart bunu import eder; sayfadaki
`BADGE_ICON`/`getBadgeTint`/`getBadgeLabel` yardımcıları ve karttaki `tints`/
`BADGE_LABEL_KEYS` blokları **silinir**.

```tsx
type ProfileBadgeChipsProps = {
  readonly badges: readonly EarnedBadge[];
  /** Kartta 3, sayfada 3; ileride değişirse tek yerden. */
  readonly visibleCount?: number;
  /** Rozet yükleniyor: satır yer tutar, chip çizilmez. */
  readonly loading?: boolean;
  readonly onPressBadge?: (badge: EarnedBadge) => void;
  readonly onPressOverflow?: () => void;
  readonly testID?: string;
};
```

### Çizim kuralları

- Chip **28×28, r10**, 1px kenarlık, glyph 14px — handoff 1a:330 / 1c:491 değerleri.
  Bu üç sayı `mobile-profile-page.styles.ts:17`'deki `METRICS` yerine yeni styles
  dosyasına taşınır; sayfa oradan okur.
- Chip'ler arası boşluk mevcut `badgeRow` değerini korur.
- Görünen rozet listesi **`splitBadgesForCard(badges, visibleCount)`** ile belirlenir
  (prompt 01). Mobilde ve web'de aynı fonksiyon → aynı üç chip.
- **Taşma chip'i:** `overflow > 0` ise son sırada `neutral` tintli chip, glyph yerine
  `+N` metni. Metin 11px/800, `allowFontScaling={false}` **değil** —
  `maxFontSizeMultiplier={2}` literal (00 §2 mobil kuralı).
- **Kademe gösterimi:** kademe 2 ve 3'te chip kenarlığı **1px yerine 1.5px** ve
  kenarlık rengi tint'in `icon` tonuna geçer. Kademe 3'te ayrıca chip'in sağ-üstünde
  6px çapında `icon` renginde nokta. Yeni renk, yeni gradyan, rakam **yazılmaz**.
- **Loading:** `loading` true iken satır **28px yüksekliğinde boş** kalır (chip yok,
  iskelet parıltısı yok). Gerekçe: rozet sorgusu profil sorgusundan sonra dönebilir,
  kart yüksekliği zıplamamalı.
- `badges.length === 0 && !loading` → satır tamamen kaldırılır (bugünkü davranış).
- Her chip `accessible`, `accessibilityRole="image"`,
  `accessibilityLabel` = katalog `copy[locale].name` + kademe > 1 ise kademe adı.
- `onPressBadge` verilmişse chip dokunulabilir olur ve dokunma hedefi **≥44px**
  (görsel 28px kalır, `hitSlop` ile büyütülür). Prompt 06 bunu kullanır; bu promptta
  `onPressBadge` **bağlanmaz**.

### Bağlantı noktaları

- `profile-card-view.tsx:292` — `profile.badges` yerine rozet sorgusunun sonucu.
  Engelli kullanıcıda bugünkü gibi hiç çizilmez.
- `mobile-profile-page-sections.tsx:247` — aynı bileşen, aynı props.
- Rozet verisi prompt 03'teki `mobileQueryKeys.badges.user(userId)` sorgusundan gelir.
  **Profil payload'ındaki donmuş `badges` alanı artık okunmaz** — ekranlarda o alana
  yapılan referanslar kaldırılır (alan sözleşmede kalır, istemci kullanmaz).

---

## 4. Metin

`mobile-copy.ts` içindeki **altı anahtar silinir**:
`profileBadgeEarlyMember/Inviter/Supporter` (`:1695`, `:3975`) ve
`profileCardBadgeEarlyMember/Inviter/Supporter`. Aynı rozetin iki farklı anahtarda
durması zaten drift kaynağıydı.

Yerine `mobile-copy.ts`'e yalnız **çerçeve metni** girer (tr + en birlikte):

| anahtar                  | tr              |
| ------------------------ | --------------- |
| `profileBadgesTitle`     | `Rozetler`      |
| `profileBadgesOverflow`  | `+{count}`      |
| `profileBadgesTierLabel` | `Kademe {tier}` |

Rozet **adı ve açıklaması katalogdan** okunur:
`BADGE_CATALOG[badge.id].copy[locale]`. `useMobileLocaleRuntime()` ile gelen `locale`
kullanılır; `mobileCopy.tr` doğrudan erişimi yasak (`mobile-design-contract.test.ts`).

---

## 5. Testler

`apps/mobile/component-tests/mobile-profile-badges.test.tsx` (yeni):

1. Üç rozetle üç chip çizilir, `+N` chip'i **yok**.
2. Beş rozetle üç chip + `+2` chip'i; görünen üç chip `splitBadgesForCard` sırasında.
3. Karıştırılmış rozet dizisi aynı üç chip'i verir (sıralama deterministik).
4. `loading` iken chip yok ama satır yüksekliği 28 (ölçüm `toHaveStyle` ile).
5. Rozet yok + `loading` false → satır hiç render edilmiyor (`queryByTestId` null).
6. Kademe 3 rozette kenarlık 1.5px ve kademe noktası var; kademe 1'de yok.
7. `accessibilityLabel` katalog metnini taşıyor; `en` locale'de İngilizce geliyor.
8. Koyu temada chip yüzeyi koyu token'dan geliyor (ham `#EEF0FE` render'da yok).

Mevcut testler güncellenir (kırılacaklar):

- `apps/mobile/component-tests/mobile-profile-card.test.tsx` — `profile.badges`
  beklentileri yeni sorgu mock'una taşınır.
- `apps/mobile/component-tests/mobile-user-profile-screen-11c.test.tsx` — aynı.

---

## Kabul kriterleri

1. `npx jest component-tests/mobile-profile-badges.test.tsx` ve güncellenen iki
   dosya yeşil; `pnpm test:components` toplam sayısı düşmedi.
2. `pnpm --filter @wizards/mobile typecheck` yeşil.
3. 1a kartı ve 1c sayfası **aynı bileşeni** render ediyor (iki ayrı chip çizimi kalmadı).
4. 390pt genişlikte `screenshots/1a-hizli-profil-kanal.png` ve `1c-tam-profil.png`
   ile chip satırı örtüşüyor: 28×28, r10, glyph 14, satır avatar hizasında.
5. Koyu temada `1e`/`1f` referanslarıyla örtüşüyor.
6. Bileşen dosyalarında ham renk literali yok.
7. Rozet verisi geç gelirken kart yüksekliği **zıplamıyor** (kullanıcı cihaz testinde
   bunu doğrulayacak; prompt bunu iddia etmez, yer tutucuyu kanıtlar).

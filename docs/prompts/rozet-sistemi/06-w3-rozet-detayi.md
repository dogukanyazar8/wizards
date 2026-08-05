# 06 — W3: Rozet detayı (mobil sheet + web panel)

Önce `00-ortak-baglam.md`, `04`, `05` okunur. Chip'ler artık dokunulabilir hâle gelir.

---

## Görev

1. Mobil rozet detay sheet'i.
2. Web rozet detay paneli.
3. `+N` taşma davranışı: tüm rozet listesi.
4. İlerleme çubuğu — **yalnız kendi profilinde**.
5. Testler.

---

## 1. İçerik sözleşmesi (iki platformda birebir aynı)

Detay yüzeyi tek bir rozet için şunları gösterir, bu sırayla:

| bölüm          | kaynak                                       | kural                                         |
| -------------- | -------------------------------------------- | --------------------------------------------- |
| Büyük glyph    | katalog `glyph` + `tint`                     | 56×56 kutu, r18, glyph 28px                   |
| Ad             | `BADGE_CATALOG[id].copy[locale].name`        | 19px/800                                      |
| Kademe etiketi | `copy.tiers?.[tier-1]` yoksa `Kademe {tier}` | yalnız `thresholds.length > 1` ise            |
| Açıklama       | `copy[locale].description`                   | 13.5px/1.5, ikincil renk                      |
| Kazanma tarihi | `earnedAt`                                   | `{Ay Yıl}'te kazanıldı` — **gün gösterilmez** |
| Süre bilgisi   | `expiresAt`                                  | yalnız doluysa: `{tarih}'e kadar geçerli`     |
| İlerleme       | `OwnBadgesResponse.progress`                 | **yalnız kendi profilinde**                   |

**Başkasının profilinde ilerleme, sayaç, ham değer gösterilmez.** Gerekçe: `regular`
gün sayısı ya da `voice` saati kullanım alışkanlığını sızdırır. Bu kural
`00-ortak-baglam.md` §4 ile bağlayıcıdır ve testle korunur.

İlerleme çubuğu görünüyorsa metni: `{value}/{nextThreshold} {birim}` +
`nextBadgeThreshold` null ise `En üst kademe` yazısı, çubuk dolu.
Birim metinleri çerçeve sözlüğünden gelir (`gün`, `davet`, `üye`, `saat`).
**`unit: "second"` olan rozetlerde değer saate çevrilerek gösterilir** (`voice`,
`broadcaster`) — ham saniye kullanıcıya gösterilmez.

Kazanılmamış rozet (yalnız kendi "Rozetlerim" listesinde görülebilir, prompt 07):
glyph `neutral` tintte ve %40 opaklıkta, kademe etiketi yok, ilerleme çubuğu var.

---

## 2. Mobil — detay sheet

Yeni dosya: `apps/mobile/src/social/profile-badges/profile-badge-detail-sheet.tsx`
(+ `.styles.ts`).

- **Tek pencere kuralı:** sheet `kit/overlay-host.tsx` üzerinden açılır, ayrı `Modal`
  açılmaz (00 §2).
- Alt sheet: üst köşe r28, tutamaç 44×5, `%45` overlay, ~250–300ms ease-out yay —
  handoff'un 2b/2c sheet ölçüleri.
- Açılış: `ProfileBadgeChips`'in `onPressBadge` prop'u bağlanır. Dokunma hedefi
  `hitSlop` ile ≥44px (prompt 04'te hazırlandı).
- `+N` chip'i `onPressOverflow` ile **tüm rozet listesi** sheet'ini açar: aynı sheet
  kabuğu, içerik 2 sütunlu grid — her hücre 28px chip + rozet adı. Hücreye dokunma
  tek rozet detayına geçer (sheet içeriği değişir, ikinci sheet açılmaz).
- Haptik: chip dokunuşunda `useMobileHaptics().selection()`.
- Kapanış: overlay dokunuşu, aşağı kaydırma, geri tuşu.

Kart bağlamı (1a) içinde açılırsa kart **kapanmaz**; sheet kartın üstüne biner.

## 3. Web — detay paneli

`apps/web/src/components/shared/profile-badge-detail.tsx`.

- Popover içinde **inline panel** olarak açılır (yeni portal/modal açılmaz):
  chip'e tıklanınca popover'ın gövdesi rozet detayına geçer, üstte 32px geri butonu
  ile önceki görünüme döner. Gerekçe: popover zaten portal + odak tuzağı yönetiyor,
  ikinci katman odak yönetimini bozar.
- `+N` tıklaması aynı panelde **tüm rozet listesini** gösterir; satıra tıklamak tek
  rozet detayına geçer.
- Geçişler `framer-motion` ile, popover'daki mevcut animasyon süresiyle aynı.
- `role="dialog"` popover'da zaten var; panel `aria-live="polite"` ile içerik
  değişimini duyurur.

---

## 4. Veri

- Başkasının rozetleri: prompt 03'teki `badges.user(userId)` sorgusu — **zaten yüklü**,
  detay ek istek atmaz.
- Kendi ilerlemesi: `badges.own()` sorgusu, **yalnız kendi profilinde ve yalnız sheet
  açıldığında** (`enabled: isSelf && isOpen`). Kart açılışında istenmez.

---

## 5. Testler

Mobil — `apps/mobile/component-tests/mobile-profile-badge-detail.test.tsx`:

1. Chip dokunuşu sheet'i açıyor; sheet katalog adını ve açıklamasını gösteriyor.
2. **Başkasının profilinde ilerleme çubuğu yok** (`queryByTestId` null) ve
   `badges.own()` sorgusu **hiç çağrılmıyor**.
3. Kendi profilinde ilerleme çubuğu var ve `{value}/{next}` metnini gösteriyor.
4. `voice` rozetinde saniye değil **saat** gösteriliyor (36000 → `10`).
5. Son kademede `En üst kademe` yazıyor, çubuk dolu.
6. `+N` dokunuşu tüm liste görünümünü açıyor; listeden bir rozete dokunmak detaya
   geçiyor ve **ikinci sheet açılmıyor** (overlay host'ta tek kayıt).
7. Kazanma tarihi ay+yıl formatında; gün geçmiyor.
8. Sheet açıkken kart hâlâ mount (kart kapanmıyor).

Web — `apps/web/src/components/shared/profile-badge-detail.test.ts`:

9. İçerik seçici saf fonksiyonu (`buildBadgeDetailModel`) başkasının profilinde
   `progress: null` döndürüyor, kendi profilinde dolu.
10. `voice`/`broadcaster` için saniye→saat dönüşümü mobil ile aynı sonucu veriyor
    (aynı saf fonksiyon `@wizards/types` içindeyse oradan test edilir).

**Saniye→saat dönüşümü ve ilerleme metni üreten fonksiyon `packages/types/src/badges.ts`
içine konur** ki iki platform aynı sayıyı yazsın:

```ts
export function formatBadgeProgressValue(
  id: BadgeId,
  value: number,
): { value: number; unit: BadgeDefinition["unit"] };
```

---

## Kabul kriterleri

1. Mobil ve web detay yüzeyleri **aynı alanları aynı sırada** gösteriyor.
2. Başkasının profilinde hiçbir sayaç/ilerleme görünmüyor — testle kanıtlı.
3. `pnpm --filter @wizards/mobile typecheck`, `pnpm --filter @wizards/web typecheck`,
   `pnpm --filter @wizards/types test` yeşil.
4. Mobil sheet overlay-host üzerinden açılıyor; ayrı `Modal` yok.
5. Web'de ikinci portal açılmadı; odak tuzağı bozulmadı.
6. Detay açmak **ek ağ isteği atmıyor** (kendi ilerlemesi hariç).

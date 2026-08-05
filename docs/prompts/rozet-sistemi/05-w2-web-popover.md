# 05 — W2: Web/desktop profil popover'ında rozet satırı

Önce `00-ortak-baglam.md` ve `03-w1-okuma-yolu-ve-api.md` okunur.
`04-w2-mobil-kart-ve-sayfa.md` ile **paralel koşabilir** — ortak dosya yok.

**Desktop ayrı iş değildir.** `apps/desktop` Tauri kabuğu `apps/web`'i yükler
(`tauri.conf.json` → `devUrl: http://localhost:3000`). Bu promptun çıktısı desktop'ta
kendiliğinden görünür.

---

## Görev

1. Web rozet chip bileşeni (mobil ile **aynı geometri, aynı sıralama, aynı metin**).
2. `user-profile-popover.tsx` içine chip satırı.
3. Rozet sorgusu + query key.
4. Çerçeve metinleri (`messages/tr.ts` + `en.ts`).
5. Testler.

---

## 1. Bileşen — `apps/web/src/components/shared/profile-badge-chips.tsx`

```tsx
type ProfileBadgeChipsProps = {
  badges: EarnedBadge[];
  visibleCount?: number; // varsayılan 3
  loading?: boolean;
  onSelectBadge?: (badge: EarnedBadge) => void;
  onSelectOverflow?: () => void;
};
```

### Mobil ile eşleşmesi zorunlu olanlar

- Görünen rozetler **`splitBadgesForCard(badges, visibleCount)`** ile seçilir
  (`@wizards/types`, prompt 01). Web kendi sıralamasını yazmaz.
- Rozet adı/açıklaması **`BADGE_CATALOG[id].copy[locale]`**'den gelir.
  `messages/tr.ts`'e rozet adı yazılmaz.
- Chip **28×28, r10**, 1px kenarlık, glyph 14px, kademe 2–3'te kenarlık 1.5px ve
  kademe 3'te 6px nokta — mobil kuralın aynısı (prompt 04 §3).
- `+N` taşma chip'i `neutral` tintli, metin 11px/800.

### Web'e özgü

- İkon: `lucide-react`. Katalog `glyph` adları → lucide eşlemesi tek bir sabit
  tabloda tutulur (`BADGE_LUCIDE_ICON`), mobil glyph adları kanonik kalır:
  `shield`→`Shield`, `check`→`Check`, `star`→`Star`, `calendar`→`Calendar`,
  `person-plus`→`UserPlus`, `servers`→`Server`, `lightbulb`→`Lightbulb`,
  `bug`→`Bug`, `code`→`Code`, `flame`→`Flame`, `chat-bubble`→`MessageCircle`,
  `mic`→`Mic`, `video`→`Video`, `bolt`→`Zap`, `flask`→`FlaskConical`,
  `sparkle`→`Sparkles`.
  Eşleme tablosu **`BadgeId` üzerinden tam kapsayıcı** yazılır (`Record<BadgeId, …>`),
  böylece kataloğa rozet eklenince web derlenmez ve eksik ikon derleme zamanında yakalanır.
- Renk: web'de tema CSS değişkenleri kullanılır. Tint değerleri
  `apps/web/src/app/globals.css` (veya mevcut token dosyası) içinde
  `--badge-<tint>-surface/border/icon` olarak tanımlanır; değerler prompt 04 §2
  tablosuyla **birebir aynı** olmalı. Bileşende ham hex yazılmaz.
- Açık/koyu tema mevcut mekanizmayla; koyu değerler yine prompt 04 §2 tablosundan.

---

## 2. Popover'a bağlama

`apps/web/src/components/shared/user-profile-popover.tsx` (613 satır):

- `useQuery` ile rozet sorgusu eklenir: `badgeQueryKeys.user(userId)`,
  `fetchUserBadges` (prompt 03 §4), `staleTime` **5 dakika** — mobil ile aynı.
- Chip satırı **ad bloğunun üstüne, avatar hizasına** yerleşir: mobil 1a'da avatar
  hizasında sağda duruyor; web popover'da da avatar satırının sağ ucuna hizalanır.
  Popover genişliği yetmezse satır ada **alta** iner (`flex-wrap`), chip'ler küçülmez.
- `loading` prop'u sorgu `isPending` iken true — satır 28px yer tutar, popover
  yüksekliği zıplamaz.
- Engellenmiş kullanıcıda (mevcut `blocked_by_me` / `blocked_by_them` durumları)
  chip satırı **hiç çizilmez**, mobil kartla aynı.
- `onSelectBadge` bu promptta **bağlanmaz** (prompt 06 kullanır).

Popover `message-item.tsx` ve `friend-card.tsx` üzerinden açılıyor; o dosyalara
dokunulmaz.

---

## 3. Metin

`apps/web/src/lib/locale/messages/tr.ts` + `en.ts`, **yalnız çerçeve**:

| anahtar                   | tr              | en            |
| ------------------------- | --------------- | ------------- |
| `profile.badges.title`    | `Rozetler`      | `Badges`      |
| `profile.badges.overflow` | `+{count}`      | `+{count}`    |
| `profile.badges.tier`     | `Kademe {tier}` | `Tier {tier}` |

Rozet adı/açıklaması buraya **girmez** (00 §5).

---

## 4. Testler

Web'in mevcut test altyapısı `node --test` + `tsx`. Bileşen render testi yoksa
**mantık testine indirilir** — DOM testi uydurmak yerine saf fonksiyonlar test edilir:

`apps/web/src/components/shared/profile-badge-chips.test.ts`:

1. `BADGE_LUCIDE_ICON` katalogdaki **her** `BadgeId` için kayıt taşıyor
   (`Object.keys` karşılaştırması, eksik/fazla yok).
2. Aynı rozet listesi için web'in seçtiği görünür üçlü, mobilin seçtiğiyle aynı —
   ikisi de `splitBadgesForCard` çağırdığından test bunu doğrudan doğrular
   (5 rozetlik sabit girdi → beklenen id dizisi).
3. Tint tablosu 7 tint'in hepsini kapsıyor ve `BadgeTint` union'ıyla tam eşleşiyor.

Popover davranışı için mevcut test dosyası varsa genişletilir; yoksa **yeni DOM test
altyapısı kurulmaz** — kullanıcı cihaz/tarayıcı testinde doğrulayacak.

---

## Kabul kriterleri

1. `pnpm --filter @wizards/web typecheck` yeşil.
2. `node --test --import tsx src/components/shared/profile-badge-chips.test.ts` yeşil.
3. Aynı kullanıcı için web popover ve mobil kart **aynı üç rozeti aynı sırada**
   gösteriyor (test 2 bunu fonksiyon düzeyinde kanıtlar; görsel doğrulama kullanıcıda).
4. Rozet adı/açıklaması iki sözlükte de yok — yalnız katalogda.
5. Bileşende ham hex yok; tint'ler CSS değişkeninden.
6. Popover yüksekliği rozet sorgusu beklerken sabit.
7. `apps/desktop` altında **hiçbir dosya değişmedi**.

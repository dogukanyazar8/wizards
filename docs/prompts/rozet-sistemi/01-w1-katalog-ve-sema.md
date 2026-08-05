# 01 — W1: Katalog + şema + migration

Önce `00-ortak-baglam.md` okunur. Bu prompt **hiçbir ekranı değiştirmez**; kullanıcı
uygulamada hiçbir fark görmez. Çıktısı: paylaşılan katalog + veritabanı zemini.

---

## Görev

1. `packages/types/src/badges.ts` — 16 rozetlik kanonik katalog, tip + zod şeması + metin.
2. `packages/db/prisma/schema.prisma` — `UserBadge`, `UserBadgeProgress`, `BadgeSource`
   enum'u, `Contributor.userId`, `NotificationType.BADGE`.
3. `packages/db/prisma/rebaseline-migrations/20260805100000_user_badges/migration.sql`.
4. `packages/types/src/badges.test.ts` — katalog değişmezlerini kilitleyen test.

---

## 1. Katalog — `packages/types/src/badges.ts`

`packages/types/src/index.ts`'e export eklenir. Şekil:

```ts
export const BADGE_IDS = [
  "staff",
  "verified",
  "earlyMember",
  "veteran",
  "inviter",
  "founder",
  "ideaShipped",
  "bugHunter",
  "contributor",
  "streak",
  "regular",
  "voice",
  "broadcaster",
  "supporter",
  "betaTester",
  "event",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export type BadgeFamily = "identity" | "contribution" | "activity" | "commerce" | "event";
export type BadgeLayer = "derived" | "awarded" | "granted";
export type BadgeTint = "lavender" | "amber" | "green" | "blue" | "purple" | "red" | "neutral";

export type BadgeDefinition = {
  id: BadgeId;
  family: BadgeFamily;
  layer: BadgeLayer;
  /** 1-tabanlı; dizinin uzunluğu kademe sayısıdır. */
  thresholds: readonly number[];
  /** Eşiğin birimi — metinde "63/100 gün" üretmek için. */
  unit: "day" | "invite" | "member" | "second" | "count" | "none";
  glyph: string;
  tint: BadgeTint;
  /** Küçük sayı önce çizilir. 00-ortak-baglam §4 sırası. */
  priority: number;
  copy: {
    tr: { name: string; description: string; tiers?: readonly string[] };
    en: { name: string; description: string; tiers?: readonly string[] };
  };
};

export const BADGE_CATALOG: Readonly<Record<BadgeId, BadgeDefinition>>;
```

### Kurallar

- `thresholds` **tek kademeli rozetlerde `[1]`**, `veteran`'da `[365, 730, 1095]` (gün),
  `voice`'ta `[36_000, 360_000]` (saniye). Kademe eşiği katalogdan okunur; değerlendirici
  sabit yazmaz.
- `event` rozeti eşiksizdir (`thresholds: [1]`, `unit: "none"`) — koşulu admin kararıdır.
- `priority` değerleri 00 §4'teki sırayı birebir yansıtır: `staff: 1` … `veteran: 16`.
- `copy.tiers` yalnız kademeli rozetlerde dolu; kademe adı verilir ("Davetçi",
  "Kıdemli davetçi", "Elçi"). Yoksa istemci `name` + kademe rakamını gösterir.
- Metinler **tam ve nihai** yazılır (00 §5 üslubu). Bu paket dışında rozet metni yoktur.

### Yardımcı saf fonksiyonlar (aynı dosya)

```ts
/** Değere göre kazanılmış kademe; 0 = kazanılmamış. */
export function resolveBadgeTier(id: BadgeId, value: number): number;

/** Sonraki kademe eşiği ve kalan; son kademedeyse null. */
export function nextBadgeThreshold(
  id: BadgeId,
  value: number,
): { tier: number; threshold: number; remaining: number } | null;

/** 00 §4 sıralama kuralı: priority → tier desc → earnedAt asc → id. */
export function sortBadges<T extends { id: BadgeId; tier: number; earnedAt?: string }>(
  badges: readonly T[],
): T[];

/** Karta sığan üçü + taşma sayısı. */
export function splitBadgesForCard<T extends { id: BadgeId; tier: number; earnedAt?: string }>(
  badges: readonly T[],
  visibleCount?: number, // varsayılan 3
): { visible: T[]; overflow: number };
```

`sortBadges` ve `splitBadgesForCard` **hem mobil hem web tarafından kullanılır** — kart
sıralaması iki platformda farklı olamaz.

### Wire şeması (aynı dosya)

```ts
export const BadgeIdSchema = z.enum(BADGE_IDS);

export const EarnedBadgeSchema = z
  .object({
    id: BadgeIdSchema,
    tier: z.number().int().min(1).max(3),
    earnedAt: z.string().datetime(),
    /** GRANTED rozetlerde dolu olabilir. */
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .strict();

export const BadgeProgressSchema = z
  .object({
    id: BadgeIdSchema,
    tier: z.number().int().min(0).max(3),
    value: z.number().int().min(0),
    nextThreshold: z.number().int().min(0).nullable(),
  })
  .strict();

export const UserBadgesResponseSchema = z
  .object({
    badges: z.array(EarnedBadgeSchema).max(BADGE_IDS.length),
  })
  .strict();

export const OwnBadgesResponseSchema = z
  .object({
    badges: z.array(EarnedBadgeSchema).max(BADGE_IDS.length),
    progress: z.array(BadgeProgressSchema).max(BADGE_IDS.length),
  })
  .strict();
```

`mobile-social.ts`'e **dokunulmaz** (00 §2 uyumluluk kısıtı).

---

## 2. Prisma şeması

`packages/db/prisma/schema.prisma`:

```prisma
enum BadgeSource {
  DERIVED
  AWARDED
  GRANTED
}

/// Kazanılmış rozet. DERIVED rozetler burada satır tutmaz — onlar okuma anında
/// User satırından hesaplanır. Satır silinmez; iptal `revokedAt` ile işaretlenir,
/// çünkü "bir zamanlar kazanmıştı" bilgisi moderasyon için gerekir.
model UserBadge {
  id           String      @id @default(uuid())
  userId       String
  badge        String      @db.VarChar(32)
  tier         Int         @default(1)
  source       BadgeSource
  earnedAt     DateTime    @default(now())
  /// Yalnız GRANTED rozetlerde dolu (event). Okuma yolunda filtrelenir.
  expiresAt    DateTime?
  revokedAt    DateTime?
  revokeReason String?     @db.VarChar(280)
  grantedById  String?
  grantReason  String?     @db.VarChar(280)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  user      User  @relation("UserBadgeOwner", fields: [userId], references: [id], onDelete: Cascade)
  grantedBy User? @relation("UserBadgeGranter", fields: [grantedById], references: [id], onDelete: SetNull)

  @@unique([userId, badge])
  @@index([userId, revokedAt])
  @@index([badge, tier])
}

/// Değerlendiricinin sayacı. Okuma yolunda ASLA okunmaz; yalnız "Rozetlerim"
/// ekranı ve değerlendiricinin kendisi okur.
model UserBadgeProgress {
  userId         String
  badge          String    @db.VarChar(32)
  /// Kümülatif ölçüm (gün sayısı, davet sayısı, saniye…). BigInt çünkü
  /// voiceSeconds toplamı Int sınırını aşabilir.
  value          BigInt    @default(0)
  /// Yalnız `streak` kullanır; gün atlanınca 1'e döner.
  streakDays     Int       @default(0)
  /// Aynı günün ikinci kez sayılmasını engelleyen UTC gün başlangıcı.
  lastCountedDay DateTime?
  updatedAt      DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, badge])
}
```

`User` modeline iki relation eklenir:

```prisma
  badges        UserBadge[]         @relation("UserBadgeOwner")
  badgeGrants   UserBadge[]         @relation("UserBadgeGranter")
  badgeProgress UserBadgeProgress[]
```

`Contributor` modeline:

```prisma
  userId String?
  user   User?   @relation("ContributorUser", fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
```

(+ `User` tarafına `contributorEntries Contributor[] @relation("ContributorUser")`)

`NotificationType` enum'una `BADGE` eklenir — gerekçe yorumu `FEEDBACK`'inkiyle aynı
biçimde yazılır: kendi tipi, böylece mobil dokunma yönlendirmesi metadata koklamadan
"Rozetlerim"e gider ve kullanıcı rozet bildirimini güvenlik bildirimini kaybetmeden
susturabilir.

---

## 3. Migration

`packages/db/prisma/rebaseline-migrations/20260805100000_user_badges/migration.sql`.
**`migrations/` klasörüne yazılmaz** — orası okunmuyor.

İçerik sırası:

1. `CREATE TYPE "BadgeSource" AS ENUM ('DERIVED', 'AWARDED', 'GRANTED');`
2. `ALTER TYPE "NotificationType" ADD VALUE 'BADGE';`
3. `CREATE TABLE "UserBadge" (...)` + `UserBadgeProgress`
4. Unique + index'ler (`UserBadge_userId_badge_key`, `UserBadge_userId_revokedAt_idx`,
   `UserBadge_badge_tier_idx`)
5. FK'ler (`UserBadge_userId_fkey` CASCADE, `UserBadge_grantedById_fkey` SET NULL,
   `UserBadgeProgress_userId_fkey` CASCADE)
6. `ALTER TABLE "Contributor" ADD COLUMN "userId" TEXT;` + FK SET NULL + index

Postgres kısıtı: `ALTER TYPE ... ADD VALUE` aynı transaction içinde eklenip **hemen
kullanılamaz**. Bu migration enum değerini yalnız ekler; `BADGE` tipini yazan kod
prompt 07'de gelir, ayrı deployment olur. Migration dosyasına bu gerekçe yorum olarak
yazılır.

Ardından:

```bash
pnpm --filter @wizards/db exec prisma generate
```

---

## 4. Test — `packages/types/src/badges.test.ts`

`node --test` + `assert`. Kilitlenecek değişmezler:

1. `BADGE_IDS.length === 16` ve katalog her id için tanım taşır.
2. `priority` değerleri **1..16 arası, tekrarsız** ve 00 §4 sırasını verir
   (`sortBadges` çıktısı beklenen dizi ile `deepEqual`).
3. Toplam kademe sayısı **28** (`sum(thresholds.length) === 28`).
4. `thresholds` her rozette **kesin artan**.
5. Her rozetin `copy.tr` ve `copy.en`'i dolu; `tiers` varsa uzunluğu
   `thresholds.length` ile eşit.
6. `resolveBadgeTier` sınır davranışı: eşiğin **tam üstünde** kademe kazanılır
   (`>=`), bir altında kazanılmaz. `streak` için 6→0, 7→1, 29→1, 30→2, 100→3.
7. `nextBadgeThreshold` son kademede `null`.
8. `splitBadgesForCard` 5 rozetle `{ visible: 3, overflow: 2 }`, 3 rozetle
   `{ visible: 3, overflow: 0 }`, 0 rozetle `{ visible: [], overflow: 0 }` döner.
9. `sortBadges` **kararlı**: aynı girdi karıştırılıp verildiğinde aynı çıktı
   (eşitlik bozucular çalışıyor).
10. `glyph` alanları tekrarsız (iki rozet aynı ikonu kullanmaz).

---

## Kabul kriterleri

1. `pnpm --filter @wizards/types test` yeşil, yeni testler dahil.
2. `pnpm --filter @wizards/web typecheck` ve `pnpm --filter @wizards/mobile typecheck` yeşil.
3. `packages/types/src/mobile-social.ts` **diff'te görünmüyor**.
4. `prisma generate` hatasız; `UserBadge` ve `UserBadgeProgress` üretilen istemcide var.
5. Migration dosyası `rebaseline-migrations/` altında ve `migration_lock.toml`
   bozulmamış.
6. Hiçbir ekran dosyası (`apps/mobile/src/social/**`, `apps/web/src/components/**`)
   değişmemiş.
7. Uygulama çalıştırıldığında rozet davranışı **bugünküyle birebir aynı**.

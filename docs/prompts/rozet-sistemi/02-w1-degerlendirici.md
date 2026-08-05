# 02 — W1: Değerlendirici, tetikleyiciler, gecelik iş, backfill

Önce `00-ortak-baglam.md` ve `01-w1-katalog-ve-sema.md` okunur. Bu prompt da **hiçbir
ekranı değiştirmez**; kullanıcı hâlâ fark görmez. Çıktısı: rozet kazandıran motor.

---

## Görev

1. `apps/web/src/lib/badges/badge-service.ts` — değerlendirici + türetici + okuyucu.
2. `apps/web/src/lib/badges/badge-triggers.ts` — olay tetikleyicileri (ince sarmalayıcılar).
3. `apps/web/src/lib/badges/badge-sweep.ts` — saatlik/gecelik iş.
4. Tetikleyici çağrılarının mevcut servislere eklenmesi (7 nokta, aşağıda).
5. `apps/web/scripts/backfill-badges.ts` — tek seferlik geriye dönük hesaplama.
6. Testler: `badge-service.test.ts`, `badge-triggers.test.ts`, `badge-sweep.test.ts`.

---

## 1. `badge-service.ts` — sözleşme

**DI zorunlu.** Web testlerinde veritabanı yok; her fonksiyon `client` parametresi alır,
varsayılanı `prisma`. Desen `mobile-user-profile-service.ts`'teki
`dependencies`/`defaultDependencies` ile aynı.

```ts
export type BadgeStore = {
  userBadge: Pick<PrismaClient["userBadge"], "findMany" | "upsert" | "updateMany">;
  userBadgeProgress: Pick<PrismaClient["userBadgeProgress"], "findUnique" | "upsert" | "findMany">;
};

/** DERIVED katman — User satırından, sorgu yok. */
export function deriveBadges(input: {
  registeredAt: Date;
  premiumType: PremiumType;
  premiumSince: Date | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  adminRole: AdminRole | null;
  hasActionedModerationCase: boolean;
  now?: Date;
}): EarnedBadge[];

/**
 * Sayacı ilerletir, eşik geçildiyse UserBadge satırını yükseltir.
 * Idempotent: aynı gün/aynı olay ikinci kez gelirse sayaç artmaz.
 */
export async function advanceBadgeProgress(args: {
  userId: string;
  badge: BadgeId;
  /** "increment" sayaç artırır, "set" mutlak değer yazar (sweep kullanır). */
  mode: "increment" | "set";
  amount: number;
  /** Gün bazlı rozetlerde UTC gün başlangıcı; aynı gün ikinci kez sayılmaz. */
  day?: Date;
  store?: BadgeStore;
}): Promise<{ tier: number; previousTier: number; value: number }>;

/** Okuma yolu. Tek indeksli sorgu; UserDailyMetric taramaz. */
export async function readUserBadges(args: {
  userId: string;
  now?: Date;
  store?: BadgeStore;
}): Promise<EarnedBadge[]>;

export async function readOwnBadgeProgress(args: {
  userId: string;
  store?: BadgeStore;
}): Promise<BadgeProgress[]>;

export async function revokeBadges(args: {
  userId: string;
  badges: readonly BadgeId[];
  reason: string;
  store?: BadgeStore;
}): Promise<number>;
```

### Bağlayıcı davranışlar

- `advanceBadgeProgress` kademe **yalnız yukarı** taşır. `previousTier > tier` çıkarsa
  yazma yapılmaz (tek istisna `founder`, prompt aşağıda özel olarak ele alır).
- `day` verildiğinde `UserBadgeProgress.lastCountedDay` ile karşılaştırılır; aynı gün
  ise **hiçbir yazma yapılmaz** ve mevcut değerler döner.
- `streak` özel: `day` ile `lastCountedDay` arası fark
  - 0 gün → yazma yok
  - 1 gün → `streakDays += 1`
  - > 1 gün → `streakDays = 1` (seri koptu, **kademe düşmez**)
    > `value` alanı `streakDays` ile senkron tutulur, kademe `value`'dan hesaplanır.
- `readUserBadges` filtresi: `revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now)`.
  Kullanıcı `isBanned` veya `deletedAt` doluysa **boş dizi** döner.
- Dönen dizi `sortBadges` ile sıralanır (katalogdaki tek sıralama).
- `deriveBadges` sonucu ile depolanan rozetler `readUserBadges` içinde **birleştirilir**;
  aynı id iki katmandan gelirse depolanan kazanır.

### `verified` özel kuralı

`hasActionedModerationCase` çağıranın sağladığı bir boolean'dır — `badge-service`
moderasyon tablosunu kendisi sorgulamaz. Okuma yolunda bu bilgi zaten profil
sorgusunda mevcut değilse `false` geçilir ve **saatlik sweep** iptali uygular
(`revokeBadges`). Böylece okuma yolu ek sorgu almaz.

---

## 2. Tetikleyiciler — `badge-triggers.ts`

Her tetikleyici: **hata yutar**, `logError` ile kaydeder, asla `throw` etmez, çağıran
işlemi bloklamaz. Transaction **içinde çalışmaz** — çağrı her zaman commit sonrası.

| fonksiyon                                                     | rozet                  | nereye takılır                                                                                                                         |
| ------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `onAppSessionEnded({ userId, day, appSeconds })`              | `streak`               | `apps/web/src/lib/analytics/service.ts:238` `endAppSession`, `incrementMetricAcrossInterval` çağrısından **sonra**                     |
| `onAppSessionStarted({ userId, releaseChannel, clientType })` | `betaTester`           | aynı dosya `startAppSession:158`, `incrementUserDailyMetric` sonrası                                                                   |
| `onMessageCreated({ userId, day })`                           | `regular`              | aynı dosya `recordMessageCreated:280` sonuna                                                                                           |
| `onMediaSessionEnded({ userId, kind, durationSeconds })`      | `voice`, `broadcaster` | aynı dosya `endMediaUsageSession:349` sonuna                                                                                           |
| `onInviteRedeemed({ inviterId })`                             | `inviter`              | `apps/web/src/lib/workspace/invite-service.ts:630` `joinWorkspaceServerByInvite`, `$transaction` **bittikten sonra**                   |
| `onFeedbackShipped({ userIds })`                              | `ideaShipped`          | `apps/web/src/lib/feedback/feedback-service.ts`, roadmap durumu `SHIPPED`'e geçtiğinde (bildirim yazan blokla aynı yer, `:524` civarı) |
| `onBugReportResolved({ userId })`                             | `bugHunter`            | `apps/web/src/lib/support/admin-support-service.ts:119` `bugReport.update` sonrası, yeni durum `RESOLVED` ise                          |

### Kurallar

- `onAppSessionEnded` yalnız `appSeconds ≥ 60` olduğunda aktif gün sayar. Eşik
  **oturum başına değil gün başına** — `advanceBadgeProgress` gün bazlı olduğu için
  aynı günün ikinci oturumu yazma yapmaz. Bu, "günde 60 saniyeyi tek oturumda
  doldurmayan kullanıcı" için kayıp demektir; kabul edilir ve `badge-triggers.ts`
  başında yorumla gerekçelendirilir (alternatifi her mesajda gün taraması).
- `onInviteRedeemed` `inviterId === katılan kullanıcı` ise **hiçbir şey yapmaz**
  (kendine davet). Davet satırının `createdById`'si kullanılır.
- `onMediaSessionEnded` `kind` `VOICE` ise `voice`, `SCREEN_SHARE` ise `broadcaster`
  sayacını `increment` eder; `CAMERA` hiçbir rozete gitmez.
- `onFeedbackShipped` bir roadmap öğesine bağlı **tüm** feedback sahiplerini alır
  (tek kullanıcı değil), her birine ayrı `advanceBadgeProgress`.

---

## 3. Saatlik sweep — `badge-sweep.ts`

`apps/web/src/lib/outbox/worker.ts:41` içindeki saatlik blok uygulamanın **tek
zamanlayıcısıdır** (satır 86 yorumu). Yeni iş oraya takılır:

```ts
export async function sweepBadges(args: { now: Date; store?: BadgeStore }): Promise<{
  founderUpdated: number;
  revoked: number;
  expired: number;
}>;
```

`startOutboxWorker` seçeneklerine `sweepBadges = sweepBadgesService` eklenir ve
`sweepModerationCaseAlerts` çağrısının **ardından** çağrılır. DI aynı desen.

Sweep üç iş yapar:

1. **`founder` yeniden hesabı.** Sahibi olduğu en kalabalık sunucunun üye sayısı
   alınır, `advanceBadgeProgress(mode: "set")` ile yazılır. `founder` **kademe
   düşürebilen tek rozettir** — üye sayısı eşiğin altına inerse kademe iner, 0'a
   inerse satır `revokedAt` ile kapatılır. Bu istisna kodda yorumla işaretlenir.
2. **İptal taraması.** Son sweep'ten beri `ACTIONED` olmuş `ModerationCase` kayıtlarının
   subject'lerinde `revokeBadges(["inviter","founder","contributor","verified"])`.
   `verified` DERIVED olduğu için burada bir "iptal işareti" satırı yazılır
   (`UserBadge` satırı `source: DERIVED`, `revokedAt` dolu) ve `readUserBadges`
   türetilen rozeti bu satır varsa eler.
3. **Süre dolumu.** `expiresAt < now` olan `event` rozetleri sayılır (satır silinmez,
   okuma zaten filtreliyor); yalnız metrik döndürür.

Sweep **kullanıcı taraması yapmaz** — 1. iş yalnız `UserBadge` içinde `founder`
satırı olan kullanıcılar + `Server.ownerId` üzerinden gelir, 2. iş yalnız yeni
`ACTIONED` vakalar üzerinden.

---

## 4. Backfill — `apps/web/scripts/backfill-badges.ts`

Tek seferlik, elle çalıştırılan script. **Deployment'ta otomatik koşmaz.**

- Argümanlar: `--dry-run` (varsayılan açık), `--batch=500`, `--badge=<id>` (tek rozet).
- Kullanıcıları `id` sırasına göre sayfalayarak gezer; her batch için:
  - `inviter`: `serverInvite.aggregate({ _sum: { uses } })`, kendine davet hariç.
  - `regular`: `userDailyMetric.groupBy({ by: ["date"], where: { userId } })` →
    `messageCount + dmMessageCount > 0` olan **farklı gün** sayısı.
  - `streak`: aynı gruplama üzerinden `appSeconds ≥ 60` günlerinin **en uzun ardışık
    serisi**; `lastCountedDay` en son aktif gün olarak yazılır.
  - `voice` / `broadcaster`: `_sum` toplamları.
  - `founder`: en kalabalık sahip olunan sunucunun üye sayısı.
  - `bugHunter`, `ideaShipped`: sayım sorguları.
  - `betaTester`: `preferredReleaseChannel = BETA` **ve** `appSession` var.
- `--dry-run` her rozet için kaç kullanıcının hangi kademeyi alacağını **tabloyla**
  raporlar, hiçbir şey yazmaz. Yazma `--commit` ile açılır.
- Script sonunda dağılım özeti basar: rozet başına kullanıcı sayısı + yüzde.
  **Bu çıktı katalog eşiklerinin doğruluk kanıtıdır** — bir rozeti kullanıcıların
  %60'ından fazlası taşıyorsa eşik yeniden değerlendirilmek üzere raporlanır
  (script eşiği kendisi değiştirmez).

---

## 5. Testler

`apps/web/src/lib/badges/badge-service.test.ts` (node --test, sahte store):

1. `deriveBadges` — `ANALYST` rolü `staff` **vermez**, diğer roller verir.
2. `deriveBadges` — `emailVerified && twoFactorEnabled` ama `hasActionedModerationCase`
   ise `verified` yok.
3. `deriveBadges` — `supporter` kademe 2 tam 180 günde açılır, 179'da açılmaz.
4. `deriveBadges` — `veteran` 365/730/1095 gün sınırları.
5. `advanceBadgeProgress` — aynı gün iki kez çağrıldığında ikinci çağrı **yazma yapmaz**
   (store'a giden `upsert` sayısı 1).
6. `advanceBadgeProgress` — `streak` 1 gün boşlukta artar, 2 gün boşlukta 1'e döner,
   **kademe düşmez**.
7. `advanceBadgeProgress` — kademe geriye gitmez (`mode: "set"` düşük değerle çağrılsa
   bile `founder` dışında kademe korunur).
8. `readUserBadges` — `revokedAt` dolu, `expiresAt` geçmiş ve `isBanned` durumlarında
   eleme.
9. `readUserBadges` — çıktı `sortBadges` sırasında; karıştırılmış girdi aynı sırayı verir.
10. `readUserBadges` — DERIVED bir rozetin iptal işareti satırı varsa türetilen rozet elenir.

`badge-triggers.test.ts`:

11. Her tetikleyici, store fırlattığında **`throw` etmez** ve `logError` çağırır.
12. `onInviteRedeemed` kendine davette hiçbir şey yazmaz.
13. `onAppSessionEnded` `appSeconds < 60` ile hiçbir şey yazmaz.
14. `onMediaSessionEnded` `CAMERA` ile hiçbir şey yazmaz.

`badge-sweep.test.ts`:

15. `founder` üye sayısı düşünce kademe iner; eşik altına inince satır kapanır.
16. `ACTIONED` vaka dört rozeti iptal eder, diğerlerine dokunmaz.
17. Sweep hiçbir zaman tüm kullanıcıları taramaz (sahte store'da `user.findMany`
    çağrılmadığı doğrulanır).

---

## Kabul kriterleri

1. `node --test --import tsx src/lib/badges/*.test.ts` (apps/web içinden) yeşil.
2. `pnpm --filter @wizards/web typecheck` yeşil.
3. Mevcut testler kırılmadı — özellikle `analytics/service.test.ts`,
   `workspace/message-service.test.ts`, `feedback/*.test.ts`.
4. Hiçbir tetikleyici transaction içinde çağrılmıyor (grep ile doğrulanır:
   tetikleyici çağrıları `$transaction` bloklarının dışında).
5. Okuma yolunda `userDailyMetric` erişimi **yok** (`badge-service.ts` içinde bu
   delegate hiç geçmiyor).
6. Backfill `--dry-run` ile çalışıyor ve dağılım tablosu basıyor.
7. Kullanıcı arayüzünde hâlâ hiçbir değişiklik yok.

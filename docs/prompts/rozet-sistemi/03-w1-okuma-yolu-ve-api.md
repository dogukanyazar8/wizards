# 03 — W1: Okuma yolu ve API (iki platform, tek gerçek)

Önce `00-ortak-baglam.md`, `01`, `02` okunur. Bu prompt **son W1 adımıdır**; ekran hâlâ
değişmez ama iki platform da rozet verisini çekebilir hâle gelir.

---

## Görev

1. Rozet uçları: **tek route-logic, dört ince rota** (mobil + web × başkası + kendisi).
2. Profil payload'ındaki donmuş `badges` alanının yeni motordan beslenmesi.
3. Mobil istemci sözleşmesi + query key.
4. Web istemci sözleşmesi + query key.
5. Rate-limit + route-contract kayıtları.
6. Testler.

---

## 1. Uçlar

**Tek mantık dosyası:** `apps/web/src/lib/badges/badge-route-logic.ts`

```ts
export type BadgeRouteDependencies = {
  readUserBadges: typeof readUserBadgesService;
  readOwnBadgeProgress: typeof readOwnBadgeProgressService;
  readUserGate: (userId: string) => Promise<{ isBanned: boolean; deletedAt: Date | null } | null>;
};

export const defaultBadgeRouteDependencies: BadgeRouteDependencies;

export async function handleReadUserBadges(args: {
  requesterId: string;
  userId: string;
  dependencies?: BadgeRouteDependencies;
}): Promise<UserBadgesResponse>;

export async function handleReadOwnBadges(args: {
  userId: string;
  dependencies?: BadgeRouteDependencies;
}): Promise<OwnBadgesResponse>;
```

Dört rota, hepsi `GET`, hepsi gövdesiz, hepsi kimlik ister:

| yol                                                             | çağırır                | kimlik                   | rate-limit action  |
| --------------------------------------------------------------- | ---------------------- | ------------------------ | ------------------ |
| `apps/web/src/app/api/v1/mobile/users/[userId]/badges/route.ts` | `handleReadUserBadges` | `requireMobileApiUserId` | `user:badges`      |
| `apps/web/src/app/api/v1/users/[userId]/badges/route.ts`        | `handleReadUserBadges` | `requireApiUserId`       | `user:badges`      |
| `apps/web/src/app/api/v1/mobile/account/badges/route.ts`        | `handleReadOwnBadges`  | `requireMobileApiUserId` | `user:badges:self` |
| `apps/web/src/app/api/v1/users/me/badges/route.ts`              | `handleReadOwnBadges`  | `requireApiUserId`       | `user:badges:self` |

`route.ts` dosyaları **mantık taşımaz**; kimlik + rate-limit + `jsonError` sarmalayıp
route-logic'e devrederler. İki platform aynı fonksiyonu çağırdığı için payload'ın
farklılaşması **yapısal olarak imkânsızdır** — bu, "kullanıcılar farklı içerik
görmeyecek" kısıtının uygulanma biçimidir.

### Zorunlu kayıtlar (unutulursa test kırmızı)

1. `apps/web/src/lib/api-rate-limit.ts` → `API_RATE_LIMITS`'e
   `"user:badges": { limit: 120, windowSeconds: 60 }` ve
   `"user:badges:self": { limit: 60, windowSeconds: 60 }`.
   (`user:badges` limiti profilinkinden yüksek: kart açılışında profil + rozet
   paralel gidiyor, üye listesinde arka arkaya çağrılabiliyor.)
2. `apps/web/src/app/api/v1/route-contract.test.ts` — dördü de `GET`, gövdesiz mutasyon
   **değil**, kimliksiz erişilebilir **değil**; listelerde yer almazlar ama testin
   rota envanterine girerler (test dosyasının gerektirdiği biçimde).

### Yanıt

`UserBadgesResponseSchema` / `OwnBadgesResponseSchema` (prompt 01). Her ikisi de
`.strict()`. **Yeni şemalar olduğu için `.strict()` sorun değildir** — bu uçları
konuşan istemci zaten yeni sürümdür.

---

## 2. Donmuş `badges` alanı — yeni motordan besle

`apps/web/src/lib/social/mobile-user-profile-service.ts`:

- `deriveMobileProfileBadges` **silinmez, imzası düzeltilir**: `premiumType: PremiumType`
  (enum), `string` değil. Testindeki geçersiz `"TIER_1"` değeri `"FULL"` ile değiştirilir.
- Gövdesi yeni motora devreder: `deriveBadges(...)` çağrılır, sonuç
  `earlyMember | supporter | inviter` üçüne **daraltılır** ve eski sırada döner
  (`earlyMember`, `supporter`, `inviter`).
- `inviter` artık `serverInvite.count(uses > 0)` ile değil, `UserBadge` satırıyla
  belirlenir. Satır 396'daki `prisma.serverInvite.count(...)` çağrısı
  `Promise.all` listesinden **çıkarılır** — profil okumasında bir sorgu azalır.
- Fonksiyonun üstüne, neden daraltıldığını anlatan yorum yazılır ve
  `00-ortak-baglam.md` §2 uyumluluk kısıtına atıf verilir.

**`MobileUserProfileSchema` ve `MobileProfileBadgeSchema` dosyada değişmez.** Diff'te
`packages/types/src/mobile-social.ts` görünürse prompt başarısızdır.

Web profil rotası (`apps/web/src/app/api/v1/users/[userId]/profile/route.ts`)
bu adımda **değişmez** — rozetler ayrı uçtan geliyor.

---

## 3. Mobil istemci

`apps/mobile/src/social/mobile-badges-client.ts` (yeni dosya, desen:
`mobile-legal-client.ts` — yol üreten saf fonksiyon + zod `parse`):

```ts
export function buildUserBadgesPath(userId: string): string;
export function buildOwnBadgesPath(): string;
export async function fetchUserBadges(client, userId): Promise<UserBadgesResponse>;
export async function fetchOwnBadges(client): Promise<OwnBadgesResponse>;
```

Query key'ler `apps/mobile/src/query/mobile-query-keys.ts` içine:

```ts
badges: {
  user: (userId: string) => ["badges", "user", userId] as const,
  own: () => ["badges", "own"] as const,
}
```

**Profil query key'iyle birleştirilmez** — profil `staleTime`'ı ile rozetlerinki farklı
(rozet nadiren değişir, `staleTime` 5 dakika verilir).

Kart açılışında rozet sorgusu profil sorgusuyla **paralel** başlar. Rozet geç gelirse
chip satırı 28px yüksekliğinde boş yer tutar — **layout zıplaması yasak** (prompt 04
bunu çizer).

## 4. Web istemci

`apps/web/src/lib/badges/client.ts`:

```ts
export const badgeQueryKeys = {
  user: (userId: string) => ["badges", "user", userId] as const,
  own: () => ["badges", "own"] as const,
};
export async function fetchUserBadges(userId: string): Promise<UserBadgesResponse>;
export async function fetchOwnBadges(): Promise<OwnBadgesResponse>;
```

Aynı `staleTime` (5 dakika) kullanılır. Mobil ve web'in cache politikası eşleşmeli,
yoksa aynı kullanıcı iki cihazda farklı anlarda farklı rozet görür.

---

## 5. Testler

`apps/web/src/lib/badges/badge-route-logic.test.ts`:

1. `handleReadUserBadges` banlı kullanıcı için **boş dizi** döner (404 değil —
   engellenmiş profil zaten kısıtlı kartı çiziyor).
2. Var olmayan kullanıcı `404` (`ApiError`).
3. Yanıt `UserBadgesResponseSchema.parse` ile doğrulanıyor (şema uyumu testte kanıtlanır).
4. `handleReadOwnBadges` ilerleme listesini **katalogdaki her AWARDED rozet için**
   döndürür (kazanılmamışlar `tier: 0` ile), böylece "Rozetlerim" ekranı eksik satır
   görmez.

`apps/web/src/lib/social/mobile-user-profile-service.test.ts` (mevcut dosya genişletilir):

5. `deriveMobileProfileBadges` çıktısı **hâlâ** `["earlyMember","supporter","inviter"]`
   sırasında ve **yalnız bu üç değeri** üretebiliyor — yeni katalogdan hiçbir id
   sızmıyor. Bu test uyumluluk kısıtının bekçisidir.
6. Geçersiz `"TIER_1"` yerine `"FULL"` kullanılıyor, enum tipiyle derleniyor.

`packages/types` tarafında:

7. `UserBadgesResponseSchema` bilinmeyen anahtar reddediyor (`.strict()` kanıtı).

Mobil tarafta (`apps/mobile`, node testi):

8. `buildUserBadgesPath("abc")` beklenen yolu üretiyor; `fetchUserBadges` sahte
   istemciyle şemayı `parse` ediyor ve bozuk payload'da fırlatıyor.

---

## Kabul kriterleri

1. Dört rota da yanıt veriyor; mobil ve web uçlarının gövdeleri **byte olarak aynı**
   (testte iki çağrının çıktısı `deepEqual`).
2. `packages/types/src/mobile-social.ts` diff'te yok.
3. Profil okumasındaki `Promise.all` bir sorgu **azaldı** (invite count kalktı).
4. `pnpm --filter @wizards/web typecheck` + `pnpm --filter @wizards/mobile typecheck` yeşil.
5. Mevcut profil testleri yeşil; kart davranışı değişmedi.
6. Rate-limit union'ı ve route-contract testi güncel.
7. Hâlâ hiçbir ekran dosyası değişmedi — W1 burada biter.

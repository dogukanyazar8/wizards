# 08 — W4: Admin grant/iptal + nadirlik + donmuş alanın kaldırılması

Önce `00-ortak-baglam.md`, `01`, `02`, `03` okunur. Bu prompt W2/W3 ile **paralel
koşabilir** (ekran dosyalarına dokunmaz, admin yüzeyi ayrı).

---

## Görev

1. Admin capability + rozet grant/iptal uçları.
2. Admin konsolunda rozet paneli.
3. Nadirlik yüzdesi (gecelik rollup).
4. Donmuş `badges` alanının kaldırılma **koşulu ve prosedürü** (bu promptta
   uygulanmaz, yalnız kayda geçer).

---

## 1. Capability

`apps/web/src/lib/admin/capability-roles.ts` → `ADMIN_CAPABILITIES`'e alfabetik yerine:

```ts
  // Granting a badge writes to a public profile surface; revoking one is a
  // moderation act. Support may look, only the top two may write.
  "badge.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
  "badge.write": ["OWNER", "ADMIN"],
```

`admin-route-capability.test.ts` → `ROUTE_CAPABILITY_PINS` yeni rotalar için
güncellenir (00 §2, zorunlu üç kayıt).

---

## 2. Uçlar

`apps/web/src/app/api/v1/admin/users/[userId]/badges/route.ts`:

| metot    | iş                                                                       | capability    |
| -------- | ------------------------------------------------------------------------ | ------------- |
| `GET`    | kullanıcının tüm rozetleri, iptal edilenler + süresi geçmişler **dahil** | `badge.read`  |
| `POST`   | GRANTED rozet ver                                                        | `badge.write` |
| `DELETE` | rozet iptal et (`revokedAt` + `revokeReason`)                            | `badge.write` |

Mantık `apps/web/src/lib/badges/badge-admin-service.ts` içinde, DI ile.

### Bağlayıcı kurallar

- **Yalnız `layer: "granted"` rozetler elle verilebilir** (`contributor`, `event`).
  AWARDED veya DERIVED bir rozeti elle vermeye çalışmak `400` döner. Gerekçe:
  bir rozetin anlamı kazanma koşuludur; elle verilen `streak` sistemin tamamını
  yalanlar.
- `event` rozetinde `expiresAt` **zorunlu**; yoksa `400`.
- Her `POST`/`DELETE` `AdminAuditLog`'a yazar: `action` `badge.grant` / `badge.revoke`,
  `targetType` `USER`, `targetId` kullanıcı, `metadata` `{ badgeId, tier }`,
  `reason` zorunlu (boş `reason` → `400`).
- İptal edilen satır **silinmez** — `revokedAt` işaretlenir. "Bir zamanlar taşıyordu"
  bilgisi moderasyon vakası için gereklidir.
- Grant sonrası ilgili kullanıcıya `BADGE` bildirimi yazılır (prompt 07 yolu);
  iptalde bildirim **yazılmaz**.

---

## 3. Admin konsol paneli

Mevcut admin kullanıcı detay yüzeyine "Rozetler" bölümü:

- Aktif rozetler listesi (chip + ad + kademe + kaynak etiketi `DERIVED/AWARDED/GRANTED`
  - kazanma tarihi).
- İptal edilmiş rozetler ayrı, soluk, iptal nedeni ve tarihiyle.
- "Rozet ver" formu: rozet seçici **yalnız GRANTED rozetleri listeler**,
  `event` seçilince tarih alanı zorunlu olur, neden alanı zorunlu.
- Her satırda "İptal et" — onay diyaloğu + neden alanı.
- `badge.write` yoksa form ve butonlar **render edilmez** (gizlenmez, hiç çizilmez).

Mevcut admin desenleri izlenir; RSC render tuzağına dikkat (istemci etkileşimi olan
bölüm `"use client"`).

---

## 4. Nadirlik yüzdesi

Rozet detayında `%N kullanıcıda` göstermek için sayım gerekir. **Okuma yolunda
sayılmaz.**

- Yeni tablo yerine mevcut saatlik sweep (`badge-sweep.ts`, prompt 02) günde bir kez
  `userBadge.groupBy({ by: ["badge", "tier"], _count: true })` + aktif kullanıcı
  sayısı hesaplar ve sonucu **tek bir satırlık** özet olarak saklar.
  Depolama seçimi: mevcut `FeatureFlag`/`ClientHealthDailySummary` desenlerinden
  hangisi uygunsa; yeni model açmaktan kaçınılır.
- Yüzde `OwnBadgesResponse` ve `UserBadgesResponse`'a **eklenmez** (şema donuyor);
  ayrı `GET /api/v1/badges/rarity` ucundan gelir, `staleTime` 1 saat.
- Yüzde **1 ondalık** ile gösterilir; `%0.0` yerine `%1'den az` yazılır.
- Toplam kullanıcı sayısı 500'ün altındayken yüzde **hiç gösterilmez** (küçük
  örneklemde yanıltıcı ve kimliksizleştirmeyi zayıflatır).

---

## 5. Donmuş `badges` alanının kaldırılması — prosedür

`MobileUserProfileSchema.badges` alanı (00 §2 uyumluluk kısıtı) **bu promptta
kaldırılmaz**. Kaldırma koşulu ve adımları burada kayda geçer:

**Koşul:** `AppSession` telemetrisinde son 30 günde `appVersion < 0.9.0` olan mobil
oturum sayısı sıfır. Sorgu admin analitik panelinden çalıştırılabilir olmalı.

**Adımlar (koşul sağlandığında, ayrı bir iş olarak):**

1. `packages/types/src/mobile-social.ts` → `badges` alanı ve
   `MobileProfileBadgeSchema` kaldırılır.
2. `mobile-user-profile-service.ts` → daraltma bloğu ve
   `deriveMobileProfileBadges` kaldırılır.
3. `mobile-user-profile-service.test.ts` → uyumluluk bekçisi testi kaldırılır.
4. Mobil istemcide alana referans kalmadığı doğrulanır (W2'de zaten kesilmişti).

Bu adımlar **erken uygulanırsa sahadaki eski istemcilerde profil kartı hiç açılmaz**.

---

## 6. Testler

1. AWARDED/DERIVED rozet grant denemesi `400`.
2. `event` grant'i `expiresAt` olmadan `400`.
3. Boş `reason` ile grant/iptal `400`.
4. Grant `AdminAuditLog` satırı yazıyor; `metadata` `{ badgeId, tier }`.
5. Grant `BADGE` bildirimi yazıyor; iptal yazmıyor.
6. `badge.read` capability'si `ANALYST`'te **yok**; `badge.write` yalnız `OWNER`/`ADMIN`.
7. `GET` iptal edilmiş ve süresi geçmiş rozetleri **döndürüyor** (kullanıcı ucundan
   farklı olarak).
8. Nadirlik ucu 500 kullanıcı altında yüzde döndürmüyor.
9. `admin-route-capability.test.ts` ve `route-contract.test.ts` yeşil.

---

## Kabul kriterleri

1. `pnpm --filter @wizards/web typecheck` yeşil, admin testleri yeşil.
2. AWARDED rozetler hiçbir yoldan elle verilemiyor.
3. Her yazma işlemi audit log satırı üretiyor.
4. Rozet sayımı okuma yolunda çalışmıyor.
5. `packages/types/src/mobile-social.ts` diff'te **yok**.

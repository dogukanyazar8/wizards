# S1 — Sunucu Tipi ve Görünürlük: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sunucuları `PERSONAL` / `COMMUNITY` olarak ayıran, görünürlüğü (`isPublic`, `discoverable`) canlandıran, üye sayacını denormalize eden ve tek kanonik sunucu-profili okuma modelini kuran altyapı katmanını teslim et.

**Architecture:** Tek Prisma migration bir enum + bir sayaç kolonu + bir bileşik index ekler. Yazma tarafında COMMUNITY yalnız yeni admin rotasından doğar; tüketici sözleşmesi ayrıcalıklı alanı hiç taşımaz. Okuma tarafında mevcut davet-önizleme servisi, `serverId` anahtarlı ortak `getServerPublicProfile` servisinin ince sarmalayıcısına indirilir.

**Tech Stack:** TypeScript, Next.js App Router (`apps/web`), Prisma 7 + PostgreSQL (`packages/db`), Zod (`packages/types`), `node:test` + `node:assert/strict`, Redis (ioredis), Socket.IO.

**Spec:** `docs/superpowers/specs/2026-08-07-sunucu-tipi-ve-gorunurluk-s1-design.md`

## Global Constraints

- Dal: `uat`. Ana dala doğrudan yazma yok.
- Migration **yalnız** `packages/db/prisma/rebaseline-migrations/` altına yazılır. `packages/db/prisma/migrations/` bayattır; Prisma orayı okumaz, oraya yazılan migration sessizce hiç koşmaz.
- Migration dizin adı, mevcut son girdi `20260805100000_user_badges`'den sonra sıralanmalıdır.
- Web birim testlerinde gerçek veritabanı **yoktur**. Veritabanına dokunan her servis, test edilebilmesi için `PrismaClient` (veya dar bir arayüz) parametresi alan bir iç fonksiyona bölünür — mevcut `getMobileInvitePreviewWithDatabase` deseni.
- Test çerçevesi `node:test`. `describe`/`it` + `assert` from `node:assert/strict`. Jest/vitest kullanılmaz.
- `S1 hiçbir kullanıcıya görünür değişiklik üretmez.` Yeni ekran, yeni buton, yeni kopya metni yoktur.
- Mevcut testler zayıflatılmaz. Bir test kırmızıya dönüyorsa değişiklik yanlıştır — test değil, kod düzeltilir. Tek istisna, bir görev adımının açıkça "bu testi güncelle" dediği durumdur.
- Kapı komutu: `pwsh -File scripts/quality/Invoke-LocalGate.ps1 -Profile Standard`. Geçerli profiller: Fast, Standard, CI, Mobile, MobileRelease, Security, E2ESmoke, E2EApi, E2ERealtime. `Web` diye bir profil yoktur.
- **Commit YASAK.** Bu planın hiçbir görevi `git commit`, `git push`, `git stash` veya `git checkout` çalıştırmaz. Her görev sonunda yalnız `git add <o görevin yolları>` çalışır — bu bir commit değil, indekse alma işlemidir ve bir sonraki görevin farkını ayırmak için gereklidir. Tüm iş uncommitted kalır; commit'i kullanıcı kendisi atar.
- Çalışma ağacında S1 ile ilgisiz, devam eden bir ses/video kalitesi işi vardır (`apps/web/src/components/providers/live-voice-provider.tsx`, `apps/web/src/lib/voice/media-capabilities.ts`, `apps/mobile/src/voice/**`, `apps/mobile/scripts/mobile-*`, `docker-compose.yml`, `graphify-out/**`). Bu dosyalara **dokunma** ve **indekse alma**. `git add .` veya `git add -A` asla çalıştırma — yalnız görevinin açıkça listelediği yolları ekle.
- Taban çizgisi ölçüldü: `pnpm --filter @wizards/web test` → 1711/1711 PASS. Bir testin kırmızıya dönmesi senin değişikliğindendir, önceden var olan bir kırmızı değildir.

## Spec'ten Sapmalar (bilinçli, gerekçeli)

Uygulama öncesi kod okumasında spec'in üç varsayımı yanlış çıktı. Plan doğrusunu uygular:

1. **`verified` kaynağı `features` dizisidir, `verificationLevel` değil.** Mevcut kod `invite.server.features.includes("VERIFIED")` kullanıyor (`mobile-invite-preview-service.ts:271`). Kanonik okuma modeli bu davranışı korur. `verificationLevel` kolonu S1'de yalnız admin yazma kapısında geçer, okuma modeline girmez — okuma tarafındaki kullanımı S4'e kalır.
2. **`mutualFriends` sınırı 8'dir, 3 değil.** Mevcut sorgu `take: 8` (`mobile-invite-preview-service.ts:218`). Parite için 8 korunur.
3. **Kanonik okuma modeli çevrimiçi sayısını veritabanından okumaya devam eder.** Mevcut 2g yolu `serverMember.count({ where: { user: { status: { in: [...] } } } })` kullanıyor (`mobile-invite-preview-service.ts:195`) — `fetchSockets()` değil. Bunu S1'de Redis'e çevirmek 2g testlerini kırar ve regresyon kapısını yok eder. Redis sayacı S1'de yine kurulur (Görev 8) ve `getOnlineServerMemberCount`'un `fetchSockets()` gövdesini değiştirir; kanonik profil modelinin ona geçişi, çoklu-sunucu toplu okumasının gerçekten gerektiği **S3**'e bırakılır. Bu bilinçli, kayıtlı bir boşluktur.

---

## Dosya Haritası

**Oluşturulacak**

- `packages/db/prisma/rebaseline-migrations/20260807HHMMSS_server_type_and_counters/migration.sql` — enum, iki kolon, backfill, index
- `apps/web/src/lib/workspace/server-member-counter.ts` — üye sayacı artır/azalt/yeniden-hesapla
- `apps/web/src/lib/workspace/server-member-counter.test.ts`
- `apps/web/src/lib/socket/server-online-presence.ts` — Redis çevrimiçi üye seti
- `apps/web/src/lib/socket/server-online-presence.test.ts`
- `apps/web/src/lib/servers/server-public-profile-service.ts` — kanonik okuma modeli
- `apps/web/src/lib/servers/server-public-profile-service.test.ts`
- `apps/web/src/app/api/v1/admin/servers/route-logic.ts` — admin create iş mantığı (rotadan ayrı, test edilebilir)
- `apps/web/src/app/api/v1/admin/servers/route-logic.test.ts`
- `apps/web/src/app/api/v1/admin/servers/[serverId]/route.ts` — admin delete
- `packages/db/prisma/schema-server-type.test.mjs` — şema + migration sözleşme testi

**Değiştirilecek**

- `packages/db/prisma/schema.prisma` — `ServerType` enum, `Server.type`, `Server.memberCount`, yeni index
- `packages/types/src/workspace.ts` — `ServerTypeSchema`, `AdminCreateServerSchema`, `UpdateServerFieldsSchema`, `ServerPublicProfileSchema`
- `packages/types/src/workspace.test.ts` — yeni şema testleri
- `apps/web/src/lib/admin/capability-roles.ts` — `server.write` yetkisi
- `apps/web/src/lib/admin/capabilities.test.ts` — yeni yetki iddiası
- `apps/web/src/lib/workspace/server-service.ts` — `createWorkspaceServer` seçenekleri, `deleteWorkspaceServer` kapısı, `updateWorkspaceServer` alan kapısı, kurucu üyelik sayacı
- `apps/web/src/lib/workspace/invite-service.ts:754` — katılma sayacı
- `apps/web/src/lib/workspace/member-service.ts:223,376,551` — ekle/çıkar/kick sayacı
- `apps/web/src/lib/account/privacy-service.ts:505` — hesap silme sayacı
- `apps/web/src/lib/workspace/unread-service.ts:634` — `getOnlineServerMemberCount` gövdesi
- `apps/web/src/lib/socket/rooms.ts`, `apps/web/src/lib/socket/server.ts` — Redis presence set yaşam döngüsü
- `apps/web/src/app/api/v1/admin/servers/route.ts` — `POST` eklenir
- `apps/web/src/lib/invites/mobile-invite-preview-service.ts` — kanonik modele indirgenir

**Dokunulmayacak (regresyon kapısı)**

- `apps/mobile/component-tests/mobile-about-community-2g.test.tsx`
- `apps/web/src/app/api/v1/mobile/invites/[code]/preview/**` testleri

---

## Görev Sırası ve Bağımlılıklar

```
1 (migration) ─┬─> 2 (sözleşme) ─┬─> 4 (create seçenekleri) ──> 5 (admin rotaları)
               │                  └─> 9 (okuma modeli)
               ├─> 7 (üye sayacı)
               └─> 6 (koruma kapıları)
3 (capability) ──> 5
8 (redis presence) — bağımsız
```

---

### Task 1: Migration + şema

**Files:**

- Modify: `packages/db/prisma/schema.prisma:905-956` (model `Server`), enum bloğu
- Create: `packages/db/prisma/rebaseline-migrations/20260807HHMMSS_server_type_and_counters/migration.sql`
- Test: `packages/db/prisma/schema-server-type.test.mjs`

**Interfaces:**

- Consumes: yok
- Produces: Prisma tipleri `ServerType` (`"PERSONAL" | "COMMUNITY"`), `Server.type: ServerType`, `Server.memberCount: number`. Sonraki tüm görevler `import type { ServerType } from "@wizards/db"` ile bunu kullanır.

- [ ] **Step 1: Sözleşme testini yaz (başarısız olacak)**

Create `packages/db/prisma/schema-server-type.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

describe("server type and counter schema", () => {
  it("declares the ServerType enum with exactly two members", () => {
    const match = schema.match(/enum ServerType \{([^}]*)\}/);
    assert.ok(match, "ServerType enum is missing from schema.prisma");
    const members = match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    assert.deepEqual(members, ["PERSONAL", "COMMUNITY"]);
  });

  it("adds type and memberCount to Server with safe defaults", () => {
    const model = schema.match(/model Server \{([\s\S]*?)\n\}/);
    assert.ok(model, "model Server is missing");
    assert.match(model[1], /type\s+ServerType\s+@default\(PERSONAL\)/);
    assert.match(model[1], /memberCount\s+Int\s+@default\(0\)/);
    assert.match(model[1], /@@index\(\[type, discoverable, memberCount\]\)/);
  });

  it("ships the migration in the directory Prisma actually reads", () => {
    const live = readdirSync(join(prismaDir, "rebaseline-migrations"));
    const migration = live.find((entry) => entry.endsWith("_server_type_and_counters"));
    assert.ok(migration, "migration is missing from rebaseline-migrations");
    assert.ok(
      migration > "20260805100000_user_badges",
      "migration must sort after the current last entry",
    );

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migration, "migration.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TYPE "ServerType"/);
    assert.match(sql, /ADD COLUMN "type" "ServerType" NOT NULL DEFAULT 'PERSONAL'/);
    assert.match(sql, /ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /UPDATE "Server"/);
    assert.match(sql, /CREATE INDEX/);
  });

  it("never places the migration in the stale directory", () => {
    const stale = readdirSync(join(prismaDir, "migrations"));
    assert.ok(
      !stale.some((entry) => entry.endsWith("_server_type_and_counters")),
      "migration landed in the stale migrations/ directory; Prisma will never run it",
    );
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

```bash
node --test packages/db/prisma/schema-server-type.test.mjs
```

Beklenen: FAIL — `ServerType enum is missing from schema.prisma`.

- [ ] **Step 3: Şemayı değiştir**

`packages/db/prisma/schema.prisma` — mevcut enum blokları arasına (örneğin `enum ScheduledEventEntityType` sonrası) ekle:

```prisma
enum ServerType {
  PERSONAL
  COMMUNITY
}
```

`model Server` içinde, `isNsfw` satırının hemen ardına iki alan ekle:

```prisma
  type                        ServerType            @default(PERSONAL)
  memberCount                 Int                   @default(0)
```

`model Server` sonundaki index bloğuna ekle:

```prisma
  @@index([type, discoverable, memberCount])
```

- [ ] **Step 4: Migration dosyasını yaz**

Dizini şu anki UTC saatiyle oluştur (örnek: `20260807143000_server_type_and_counters`). `packages/db/prisma/rebaseline-migrations/<dizin>/migration.sql`:

```sql
-- Server classification: personal servers stay the default, community servers
-- are created only through the admin surface.
CREATE TYPE "ServerType" AS ENUM ('PERSONAL', 'COMMUNITY');

ALTER TABLE "Server" ADD COLUMN "type" "ServerType" NOT NULL DEFAULT 'PERSONAL';

-- Denormalised member counter. The discovery list and the profile card read it
-- directly so neither has to aggregate ServerMember on a hot path.
ALTER TABLE "Server" ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Server" s
SET "memberCount" = (
  SELECT COUNT(*) FROM "ServerMember" m WHERE m."serverId" = s."id"
);

CREATE INDEX "Server_type_discoverable_memberCount_idx"
  ON "Server"("type", "discoverable", "memberCount");
```

- [ ] **Step 5: Prisma istemcisini üret ve testi geçir**

```bash
pnpm db:generate
```

```bash
node --test packages/db/prisma/schema-server-type.test.mjs
```

Beklenen: 4 test PASS.

- [ ] **Step 6: Tablo adlarını üretilen SQL ile doğrula**

```bash
pnpm --filter @wizards/db exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
```

> Kurulu Prisma 7.9.1'de bayrak `--to-schema`'dır; eski `--to-schema-datamodel` adı kaldırılmıştır.

Çıktıda `"Server"` ve `"ServerMember"` tablo adlarının tırnaklı hâlinin migration SQL'iyle birebir eşleştiğini gözle doğrula. Eşleşmiyorsa migration SQL'indeki adları üretilen çıktıya göre düzelt ve Adım 5'i tekrarla.

- [ ] **Step 7: Değişikliği indekse al (commit YOK)**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/rebaseline-migrations packages/db/prisma/schema-server-type.test.mjs
```

---

### Task 2: Sözleşme katmanı

**Files:**

- Modify: `packages/types/src/workspace.ts:203-217` (`CreateServerSchema`), `:219-...` (`UpdateServerFieldsSchema`), dosya sonu tip dışa aktarımları
- Test: `packages/types/src/workspace.test.ts`

**Interfaces:**

- Consumes: Görev 1'in `ServerType` tipi
- Produces:
  - `ServerTypeSchema: z.ZodEnum<["PERSONAL", "COMMUNITY"]>`
  - `AdminCreateServerSchema` → `AdminCreateServerInput = { name, shortName?, description?, iconUrl?, allowFileUploads?, allowGifs?, allowMemberAdds?, type: "PERSONAL" | "COMMUNITY", isPublic?: boolean, discoverable?: boolean, verificationLevel?: "NONE" | ... }`
  - `UpdateServerFieldsSchema` artık `isPublic?: boolean` ve `discoverable?: boolean` taşır
  - `ServerPublicProfileSchema` / `ServerPublicProfile` (alanlar Görev 9'da kullanılır)

- [ ] **Step 1: Başarısız testleri yaz**

`packages/types/src/workspace.test.ts` sonuna ekle (mevcut importlara `AdminCreateServerSchema`, `ServerPublicProfileSchema`, `ServerTypeSchema`, `UpdateServerFieldsSchema` ekle):

```typescript
describe("server type contract", () => {
  it("accepts only the two known server types", () => {
    assert.equal(ServerTypeSchema.parse("PERSONAL"), "PERSONAL");
    assert.equal(ServerTypeSchema.parse("COMMUNITY"), "COMMUNITY");
    assert.equal(ServerTypeSchema.safeParse("SYSTEM").success, false);
  });

  it("keeps the consumer create contract free of privileged fields", () => {
    assert.equal("type" in CreateServerSchema.shape, false);
    assert.equal("isPublic" in CreateServerSchema.shape, false);
    assert.equal("discoverable" in CreateServerSchema.shape, false);
    assert.equal("verificationLevel" in CreateServerSchema.shape, false);
  });

  it("lets the admin create contract carry the privileged fields", () => {
    const parsed = AdminCreateServerSchema.parse({
      discoverable: true,
      isPublic: true,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    assert.equal(parsed.type, "COMMUNITY");
    assert.equal(parsed.isPublic, true);
    assert.equal(parsed.discoverable, true);
  });

  it("forces community servers to stay publicly joinable", () => {
    const result = AdminCreateServerSchema.safeParse({
      isPublic: false,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    assert.equal(result.success, false);
  });

  it("exposes visibility switches on update but never the type", () => {
    assert.equal("isPublic" in UpdateServerFieldsSchema.shape, true);
    assert.equal("discoverable" in UpdateServerFieldsSchema.shape, true);
    assert.equal("type" in UpdateServerFieldsSchema.shape, false);
  });

  it("describes the canonical public profile payload", () => {
    const profile = ServerPublicProfileSchema.parse({
      bannerUrl: null,
      channels: [{ liveCount: null, name: "duyurular", readOnly: true, type: "text" }],
      description: "",
      discoverable: true,
      iconUrl: null,
      isPublic: true,
      joined: false,
      memberCount: 12_400,
      mutualFriendCount: 0,
      mutualFriends: [],
      name: "Whispr Topluluk",
      onlineCount: 1_200,
      serverId: "s1",
      shortName: null,
      type: "COMMUNITY",
      verified: true,
    });

    assert.equal(profile.channels[0]?.name, "duyurular");
    assert.equal(profile.type, "COMMUNITY");
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

```bash
pnpm --filter @wizards/types test
```

Beklenen: FAIL — `ServerTypeSchema is not defined`.

- [ ] **Step 3: Şemaları uygula**

`packages/types/src/workspace.ts`, `CreateServerSchema` tanımının hemen üstüne:

```typescript
export const ServerTypeSchema = z.enum(["PERSONAL", "COMMUNITY"]);

export const ServerVerificationLevelSchema = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);
```

> Bu beş değer `packages/db/prisma/schema.prisma:88` içindeki `enum VerificationLevel` ile birebir doğrulandı (NONE, LOW, MEDIUM, HIGH, VERY_HIGH). Sıra ve yazım aynen korunmalıdır.

`CreateServerSchema` tanımından hemen sonra:

```typescript
/**
 * Community servers exist only behind the admin surface, so the privileged
 * fields live on a separate schema. The consumer contract never carries them —
 * the gate is the shape of the request, not a runtime check inside the service.
 */
export const AdminCreateServerSchema = CreateServerSchema.extend({
  discoverable: z.boolean().optional().default(false),
  isPublic: z.boolean().optional().default(false),
  type: ServerTypeSchema.default("PERSONAL"),
  verificationLevel: ServerVerificationLevelSchema.optional().default("NONE"),
}).refine((value) => value.type !== "COMMUNITY" || value.isPublic, {
  message: "Community servers must be publicly joinable",
  path: ["isPublic"],
});
```

`UpdateServerFieldsSchema` nesnesine iki alan ekle (alfabetik sıraya uy):

```typescript
  discoverable: z.boolean().optional(),
  isPublic: z.boolean().optional(),
```

**Aynı adımda zorunlu:** `UpdateServerSchema`, `UpdateServerFieldsSchema`'yı bir `.refine()` ile sarar ve o yüklem "en az bir alan verildi mi" kontrolünü alan alan sayarak yapar. Yeni iki alan oraya eklenmezse `UpdateServerSchema.safeParse({ isPublic: true })` `"validation.form.atLeastOne"` ile 400 döner — ve rotanın doğruladığı şema `UpdateServerFieldsSchema` değil, `UpdateServerSchema`'dır (`apps/web/src/app/api/v1/servers/[serverId]/route.ts:40`). Yüklemin listesine ekle:

```typescript
    value.isPublic !== undefined ||
    value.discoverable !== undefined ||
```

Adım 1'deki test bloğuna da bu iki iddiayı ekle (`UpdateServerSchema`'yı import listesine almayı unutma):

```typescript
it("accepts a visibility-only update", () => {
  assert.equal(UpdateServerSchema.safeParse({ isPublic: true }).success, true);
  assert.equal(UpdateServerSchema.safeParse({ discoverable: true }).success, true);
});

it("still rejects an update with no fields at all", () => {
  assert.equal(UpdateServerSchema.safeParse({}).success, false);
});
```

Dosyanın şema bölümü sonuna kanonik profil şeması:

```typescript
export const ServerPublicProfileChannelSchema = z.object({
  liveCount: z.number().int().nonnegative().nullable(),
  name: z.string(),
  readOnly: z.boolean(),
  type: z.enum(["text", "voice"]),
});

export const ServerPublicProfileFriendSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
});

/**
 * One read model behind three surfaces: the 2g profile card, the discovery
 * card, and the invite preview. Keeping it single stops the permission filter
 * from being written twice and drifting.
 */
export const ServerPublicProfileSchema = z.object({
  bannerUrl: z.string().nullable(),
  channels: z.array(ServerPublicProfileChannelSchema),
  description: z.string(),
  discoverable: z.boolean(),
  iconUrl: z.string().nullable(),
  isPublic: z.boolean(),
  joined: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  mutualFriendCount: z.number().int().nonnegative(),
  mutualFriends: z.array(ServerPublicProfileFriendSchema),
  name: z.string(),
  onlineCount: z.number().int().nonnegative(),
  serverId: z.string(),
  shortName: z.string().nullable(),
  type: ServerTypeSchema,
  verified: z.boolean(),
});
```

Dosya sonundaki tip dışa aktarımlarına ekle:

```typescript
export type ServerTypeValue = z.infer<typeof ServerTypeSchema>;
export type AdminCreateServerInput = z.infer<typeof AdminCreateServerSchema>;
export type ServerPublicProfile = z.infer<typeof ServerPublicProfileSchema>;
export type ServerPublicProfileChannel = z.infer<typeof ServerPublicProfileChannelSchema>;
export type ServerPublicProfileFriend = z.infer<typeof ServerPublicProfileFriendSchema>;
```

- [ ] **Step 4: Testleri geçir**

```bash
pnpm --filter @wizards/types test
```

Beklenen: tüm testler PASS (yeni 6 test dahil).

- [ ] **Step 5: `.strict()` ön koşulunu denetle**

```bash
grep -rn "CreateServerSchema" apps/web/src apps/mobile/src packages/types/src --include=*.ts --include=*.tsx
```

Her çağrı yerinde gönderilen gövdeyi oku. Gövdeler yalnız `name`, `shortName`, `description`, `iconUrl`, `allowFileUploads`, `allowGifs`, `allowMemberAdds` alanlarını taşıyorsa Adım 6'yı uygula. Fazladan alan gönderen **tek bir** çağrı bile varsa Adım 6'yı **atla** ve `docs/superpowers/plans/2026-08-07-sunucu-tipi-ve-gorunurluk-s1.md` içindeki bu adımın altına hangi çağrının engellediğini yaz. K3'ün asıl kapısı `.strict()` değil, `type`'ın şemada hiç bulunmamasıdır; bu adımın atlanması planı bozmaz.

- [ ] **Step 6: (koşullu) `.strict()` ekle ve iddiayı testle**

`CreateServerSchema` kapanışını `});` yerine `}).strict();` yap. Ardından Adım 1'deki `describe` bloğuna ekle:

```typescript
it("rejects a privileged field smuggled into the consumer contract", () => {
  const result = CreateServerSchema.safeParse({
    name: "Sızma denemesi",
    type: "COMMUNITY",
  });

  assert.equal(result.success, false);
});
```

```bash
pnpm --filter @wizards/types test
```

Beklenen: PASS.

- [ ] **Step 7: Değişikliği indekse al (commit YOK)**

```bash
git add packages/types/src/workspace.ts packages/types/src/workspace.test.ts
```

---

### Task 3: `server.write` admin yetkisi

**Files:**

- Modify: `apps/web/src/lib/admin/capability-roles.ts:31`
- Test: `apps/web/src/lib/admin/capabilities.test.ts`

**Interfaces:**

- Consumes: yok
- Produces: `AdminCapability` birleşimine `"server.write"` değeri. Görev 5 `requireAdminCapability("server.write")` çağırır.

- [ ] **Step 1: Başarısız testi yaz**

`apps/web/src/lib/admin/capabilities.test.ts` içindeki `describe("admin capability map", ...)` bloğuna ekle:

```typescript
it("restricts server writes to the two founding roles", () => {
  assert.deepEqual(ADMIN_CAPABILITIES["server.write"], ["OWNER", "ADMIN"]);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="restricts server writes"
```

Beklenen: FAIL — `ADMIN_CAPABILITIES["server.write"]` is `undefined`.

- [ ] **Step 3: Yetkiyi ekle**

`apps/web/src/lib/admin/capability-roles.ts`, `"server.read"` satırının hemen ardına (alfabetik sıra korunur):

```typescript
  // Creating or deleting a community server changes what every user can
  // discover and join. Only the two founding roles may write.
  "server.write": ["OWNER", "ADMIN"],
```

- [ ] **Step 4: Testleri geçir**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="admin capability map"
```

Beklenen: PASS. Mevcut "keeps ANALYST out of the sensitive capabilities" testi de yeşil kalmalıdır (`server.write` OWNER + ADMIN olduğu için ANALYST zaten dışarıda).

- [ ] **Step 5: Değişikliği indekse al (commit YOK)**

```bash
git add apps/web/src/lib/admin/capability-roles.ts apps/web/src/lib/admin/capabilities.test.ts
```

---

### Task 4: `createWorkspaceServer` ayrıcalıklı seçenekleri

**Files:**

- Modify: `apps/web/src/lib/workspace/server-service.ts:914-1053`
- Test: `apps/web/src/lib/workspace/server-service.test.ts` (yoksa oluştur)

**Interfaces:**

- Consumes: Görev 1 `ServerType`, Görev 2 `AdminCreateServerInput`
- Produces:

  ```typescript
  export type CreateWorkspaceServerOptions = {
    readonly discoverable?: boolean;
    readonly isPublic?: boolean;
    readonly type?: ServerType;
    readonly verificationLevel?: VerificationLevel;
  };

  export function buildServerCreateData(
    userId: string,
    input: CreateServerInput,
    inviteCode: string,
    options?: CreateWorkspaceServerOptions,
  ): Prisma.ServerUncheckedCreateInput;

  export async function createWorkspaceServer(
    userId: string,
    input: CreateServerInput,
    options?: CreateWorkspaceServerOptions,
  ): Promise<...>; // dönüş tipi değişmez
  ```

  Görev 5 `createWorkspaceServer(adminUserId, input, { type, isPublic, discoverable, verificationLevel })` çağırır.

- [ ] **Step 1: Başarısız testi yaz**

`apps/web/src/lib/workspace/server-service.test.ts` (dosya varsa sonuna ekle, yoksa bu başlıkla oluştur):

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildServerCreateData } from "@/lib/workspace/server-service";

const BASE_INPUT = {
  allowFileUploads: true,
  allowGifs: true,
  allowMemberAdds: true,
  description: null,
  iconUrl: null,
  name: "Test sunucu",
  shortName: null,
};

describe("buildServerCreateData", () => {
  it("defaults to a private personal server when no options are given", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234");

    assert.equal(data.type, "PERSONAL");
    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
    assert.equal(data.ownerId, "u1");
  });

  it("applies the privileged options the admin surface passes", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234", {
      discoverable: true,
      isPublic: true,
      type: "COMMUNITY",
    });

    assert.equal(data.type, "COMMUNITY");
    assert.equal(data.isPublic, true);
    assert.equal(data.discoverable, true);
  });

  it("starts the member counter at one for the founding member", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234");

    assert.equal(data.memberCount, 1);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="buildServerCreateData"
```

Beklenen: FAIL — `buildServerCreateData` dışa aktarılmamış.

- [ ] **Step 3: Servisi böl ve seçenekleri uygula**

`apps/web/src/lib/workspace/server-service.ts` — `createWorkspaceServer` tanımının hemen üstüne:

```typescript
export type CreateWorkspaceServerOptions = {
  readonly discoverable?: boolean;
  readonly isPublic?: boolean;
  readonly type?: ServerType;
  readonly verificationLevel?: VerificationLevel;
};

/**
 * Split out of the transaction so the privileged defaults can be asserted
 * without a database. The consumer route never passes `options`, which is why
 * `POST /api/v1/servers` can only ever produce a private personal server.
 */
export function buildServerCreateData(
  userId: string,
  input: CreateServerInput,
  inviteCode: string,
  options: CreateWorkspaceServerOptions = {},
): Prisma.ServerUncheckedCreateInput {
  return {
    description: input.description ?? null,
    discoverable: options.discoverable ?? false,
    features: applyServerMediaSettings([], {
      allowFileUploads: input.allowFileUploads,
      allowGifs: input.allowGifs,
      allowMemberAdds: input.allowMemberAdds,
    }),
    iconUrl: input.iconUrl ?? null,
    inviteCode,
    isPublic: options.isPublic ?? false,
    // The founding member row is created inside the same transaction, so the
    // counter starts at one instead of zero plus a follow-up increment.
    memberCount: 1,
    name: input.name.trim(),
    ownerId: userId,
    shortName: input.shortName ?? null,
    type: options.type ?? "PERSONAL",
    verificationLevel: options.verificationLevel ?? "NONE",
  };
}
```

Dosya başındaki importlara `ServerType` ve `VerificationLevel` tiplerini ekle:

```typescript
import type { Prisma, ServerType, VerificationLevel } from "@wizards/db";
```

(Mevcut `@wizards/db` import satırı varsa oraya birleştir, ikinci bir import satırı açma.)

> **Ön koşul — barrel dışa aktarımı.** `packages/db/src/index.ts` içindeki `export type { ... } from "./generated/prisma/client";` bloğu enum tiplerini adıyla yeniden dışa aktarır. `ServerType` Task 1'de eklendi, ama `VerificationLevel` bu blokta **yoktur** ve bu göreve kadar hiçbir yerde gerekmemiştir. Import satırını yazmadan önce `VerificationLevel`'ı o bloğa alfabetik sırasına ekle (`UserReportReason` satırının hemen ardına). Bu iki dosyalık bir değişikliktir ve `buildServerCreateData`'nın `verificationLevel` seçeneği onu tükettiği için bu görevin kapsamındadır. Eklemeden `pnpm --filter @wizards/web typecheck` "Module '@wizards/db' has no exported member 'VerificationLevel'" hatası verir.

`createWorkspaceServer` imzasını ve gövdesindeki `tx.server.create` çağrısını değiştir:

```typescript
export async function createWorkspaceServer(
  userId: string,
  input: CreateServerInput,
  options: CreateWorkspaceServerOptions = {},
) {
  const createdServer = await prisma.$transaction(async (tx) => {
    const inviteCode = await generateInviteCode(tx);

    const server = await tx.server.create({
      data: buildServerCreateData(userId, input, inviteCode, options),
      select: {
        id: true,
      },
    });
```

Gövdenin geri kalanı (rol oluşturma, `serverMember.create`, kategori, kanal) **değişmez**.

- [ ] **Step 4: Testleri geçir**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="buildServerCreateData"
```

Beklenen: 3 test PASS.

- [ ] **Step 5: Tüketici rotasının değişmediğini doğrula**

```bash
grep -n "createWorkspaceServer" apps/web/src/app/api/v1/servers/route.ts
```

Beklenen çıktı: tek satır, `createWorkspaceServer(userId, input)` — üçüncü argüman yok. Varsa kaldır.

- [ ] **Step 6: Değişikliği indekse al (commit YOK)**

```bash
git add apps/web/src/lib/workspace/server-service.ts apps/web/src/lib/workspace/server-service.test.ts
```

---

### Task 5: Admin create ve delete rotaları

**Files:**

- Create: `apps/web/src/app/api/v1/admin/servers/route-logic.ts`
- Create: `apps/web/src/app/api/v1/admin/servers/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/admin/servers/[serverId]/route.ts`
- Modify: `apps/web/src/app/api/v1/admin/servers/route.ts` (POST ekle)

**Interfaces:**

- Consumes: Görev 2 `AdminCreateServerSchema`, Görev 3 `"server.write"`, Görev 4 `CreateWorkspaceServerOptions`
- Produces:

  ```typescript
  export type AdminServerCreateDependencies = {
    readonly createServer: (
      userId: string,
      input: CreateServerInput,
      options: CreateWorkspaceServerOptions,
    ) => Promise<{ id: string }>;
    readonly writeAuditLog: (args: AdminAuditLogInput) => Promise<void>;
  };

  export async function createAdminServer(
    adminUserId: string,
    body: unknown,
    headers: Headers | null,
    dependencies: AdminServerCreateDependencies,
  ): Promise<{ id: string }>;
  ```

- [ ] **Step 1: Başarısız testleri yaz**

Create `apps/web/src/app/api/v1/admin/servers/route-logic.test.ts`:

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAdminServer } from "@/app/api/v1/admin/servers/route-logic";
import type { AdminAuditLogInput } from "@/lib/admin/audit-log";

function buildDependencies() {
  const created: Array<{ options: unknown; userId: string }> = [];
  const audited: AdminAuditLogInput[] = [];

  return {
    audited,
    created,
    dependencies: {
      createServer: async (userId: string, _input: unknown, options: unknown) => {
        created.push({ options, userId });
        return { id: "server-1" };
      },
      writeAuditLog: async (args: AdminAuditLogInput) => {
        audited.push(args);
      },
    },
  };
}

describe("createAdminServer", () => {
  it("creates a community server with the privileged options applied", async () => {
    const { created, dependencies } = buildDependencies();

    const result = await createAdminServer(
      "admin-1",
      { discoverable: true, isPublic: true, name: "Whispr Topluluk", type: "COMMUNITY" },
      null,
      dependencies as never,
    );

    assert.equal(result.id, "server-1");
    assert.equal(created.length, 1);
    assert.deepEqual(created[0]?.options, {
      discoverable: true,
      isPublic: true,
      type: "COMMUNITY",
      verificationLevel: "NONE",
    });
  });

  it("writes an audit entry naming the created server", async () => {
    const { audited, dependencies } = buildDependencies();

    await createAdminServer(
      "admin-1",
      { isPublic: true, name: "Whispr Topluluk", type: "COMMUNITY" },
      null,
      dependencies as never,
    );

    assert.equal(audited.length, 1);
    assert.equal(audited[0]?.action, "server.create");
    assert.equal(audited[0]?.adminUserId, "admin-1");
    assert.equal(audited[0]?.targetId, "server-1");
    assert.equal(audited[0]?.targetType, "Server");
  });

  it("rejects a community server that is not publicly joinable", async () => {
    const { dependencies } = buildDependencies();

    await assert.rejects(
      createAdminServer(
        "admin-1",
        { isPublic: false, name: "Whispr Topluluk", type: "COMMUNITY" },
        null,
        dependencies as never,
      ),
    );
  });

  it("never creates a server when validation fails", async () => {
    const { created, dependencies } = buildDependencies();

    await assert.rejects(createAdminServer("admin-1", { name: "x" }, null, dependencies as never));

    assert.equal(created.length, 0);
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="createAdminServer"
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: İş mantığını yaz**

Create `apps/web/src/app/api/v1/admin/servers/route-logic.ts`:

```typescript
import { AdminCreateServerSchema, type CreateServerInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import type { AdminAuditLogInput } from "@/lib/admin/audit-log";
import type { CreateWorkspaceServerOptions } from "@/lib/workspace/server-service";

export type AdminServerCreateDependencies = {
  readonly createServer: (
    userId: string,
    input: CreateServerInput,
    options: CreateWorkspaceServerOptions,
  ) => Promise<{ id: string }>;
  readonly writeAuditLog: (args: AdminAuditLogInput) => Promise<void>;
};

/**
 * The only path that can write `type: COMMUNITY`. Kept transport-free so the
 * gate and the audit trail can be asserted without a database or a session.
 */
export async function createAdminServer(
  adminUserId: string,
  body: unknown,
  headers: Headers | null,
  dependencies: AdminServerCreateDependencies,
): Promise<{ id: string }> {
  const parsed = AdminCreateServerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError("Invalid server payload", 400, "INVALID_PAYLOAD");
  }

  const { discoverable, isPublic, type, verificationLevel, ...input } = parsed.data;

  const created = await dependencies.createServer(adminUserId, input, {
    discoverable,
    isPublic,
    type,
    verificationLevel,
  });

  await dependencies.writeAuditLog({
    action: "server.create",
    adminUserId,
    headers,
    metadata: { discoverable, isPublic, type },
    targetId: created.id,
    targetType: "Server",
  });

  return created;
}
```

- [ ] **Step 4: Testleri geçir**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="createAdminServer"
```

Beklenen: 4 test PASS.

- [ ] **Step 5: POST rotasını bağla**

`apps/web/src/app/api/v1/admin/servers/route.ts` — mevcut `GET` altına ekle, importları güncelle:

```typescript
import { createAdminServer } from "@/app/api/v1/admin/servers/route-logic";
import { createWorkspaceServer } from "@/lib/workspace/server-service";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminCapability("server.write");
    await enforceApiRateLimit(admin.id, "admin:server:create");

    const created = await createAdminServer(admin.id, await request.json(), request.headers, {
      createServer: createWorkspaceServer,
      writeAuditLog: writeAdminAuditLog,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 6: DELETE rotasını yaz**

Create `apps/web/src/app/api/v1/admin/servers/[serverId]/route.ts`:

```typescript
import { prisma } from "@wizards/db";
import type { NextRequest } from "next/server";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";

/**
 * Community servers refuse deletion through the consumer route, so this is the
 * only way one can be removed. Personal servers may also be deleted here for
 * moderation, which is why the audit entry records the type.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ serverId: string }> },
) {
  try {
    const admin = await requireAdminCapability("server.write");
    await enforceApiRateLimit(admin.id, "admin:server:delete");

    const { serverId } = await context.params;
    const server = await prisma.server.findUnique({
      select: { name: true, type: true },
      where: { id: serverId },
    });

    if (!server) {
      return Response.json({ error: "Server not found" }, { status: 404 });
    }

    await prisma.server.delete({ where: { id: serverId } });
    await writeAdminAuditLog({
      action: "server.delete",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { name: server.name, type: server.type },
      targetId: serverId,
      targetType: "Server",
    });

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 7: Rota sözleşme testlerini çalıştır**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="route"
```

Beklenen: PASS. `admin-route-capability.test.ts` yeni rotaları görüp yetki eşlemesini doğrular; kırmızıya dönerse o testin beklediği kayıt biçimine göre yeni rotaları ekle (test zayıflatılmaz, kayıt eklenir).

- [ ] **Step 8: Değişikliği indekse al (commit YOK)**

```bash
git add apps/web/src/app/api/v1/admin/servers
```

---

### Task 6: Koruma kapıları

**Files:**

- Modify: `apps/web/src/lib/workspace/server-service.ts:1054` (`updateWorkspaceServer`), `:1164` (`deleteWorkspaceServer`)
- Test: `apps/web/src/lib/workspace/server-service.test.ts`

**Interfaces:**

- Consumes: Görev 1 `ServerType`
- Produces:

  ```typescript
  export type ServerVisibilityFields = {
    readonly discoverable?: boolean | undefined;
    readonly isPublic?: boolean | undefined;
  };

  export function assertServerIsDeletableByOwner(type: ServerType): void;
  export function assertVisibilityFieldsWritable(
    type: ServerType,
    input: ServerVisibilityFields,
  ): void;
  ```

  `ServerVisibilityFields` bilerek yapısal tutulur: `UpdateServerInput` bir `z.infer` sonucudur ve şekli Görev 2'de değişir; kapı fonksiyonunun ona bağlanması gereksiz bir bağımlılık yaratır.

- [ ] **Step 1: Başarısız testleri yaz**

`apps/web/src/lib/workspace/server-service.test.ts` sonuna ekle (importa iki fonksiyonu ekle):

```typescript
describe("community server protection", () => {
  it("lets an owner delete a personal server", () => {
    assert.doesNotThrow(() => assertServerIsDeletableByOwner("PERSONAL"));
  });

  it("refuses owner deletion of a community server", () => {
    assert.throws(() => assertServerIsDeletableByOwner("COMMUNITY"), /403|admin/i);
  });

  it("lets a personal server owner flip visibility", () => {
    assert.doesNotThrow(() =>
      assertVisibilityFieldsWritable("PERSONAL", { discoverable: true, isPublic: true }),
    );
  });

  it("refuses visibility writes on a community server", () => {
    assert.throws(() => assertVisibilityFieldsWritable("COMMUNITY", { isPublic: false }));
    assert.throws(() => assertVisibilityFieldsWritable("COMMUNITY", { discoverable: false }));
  });

  it("allows unrelated community updates to pass through", () => {
    assert.doesNotThrow(() => assertVisibilityFieldsWritable("COMMUNITY", {}));
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="community server protection"
```

Beklenen: FAIL — fonksiyonlar dışa aktarılmamış.

- [ ] **Step 3: Kapıları uygula**

`apps/web/src/lib/workspace/server-service.ts`, `updateWorkspaceServer` tanımının üstüne:

```typescript
/**
 * A community server's owner is the admin who created it, so the ordinary
 * owner check is not enough on its own — deletion has to route through the
 * admin surface where it lands in the audit trail.
 */
export function assertServerIsDeletableByOwner(type: ServerType): void {
  if (type === "COMMUNITY") {
    throw new ApiError(
      "Community servers can only be deleted from the admin surface",
      403,
      "COMMUNITY_SERVER_PROTECTED",
    );
  }
}

export type ServerVisibilityFields = {
  readonly discoverable?: boolean | undefined;
  readonly isPublic?: boolean | undefined;
};

export function assertVisibilityFieldsWritable(
  type: ServerType,
  input: ServerVisibilityFields,
): void {
  if (type !== "COMMUNITY") {
    return;
  }

  if (input.isPublic !== undefined || input.discoverable !== undefined) {
    throw new ApiError(
      "Community server visibility is managed from the admin surface",
      403,
      "COMMUNITY_SERVER_PROTECTED",
    );
  }
}
```

`updateWorkspaceServer` içinde, `ensureServerPermission(...)` satırının **hemen ardına**:

```typescript
const currentServer = await prisma.server.findUniqueOrThrow({
  select: { type: true },
  where: { id: serverId },
});
assertVisibilityFieldsWritable(currentServer.type, input);
```

Aynı fonksiyonun alan eşlemesi bölümüne, mevcut `if (input.messageCharacterLimit !== undefined)` bloğunun yanına:

```typescript
if (input.isPublic !== undefined) {
  data.isPublic = input.isPublic;
}

if (input.discoverable !== undefined) {
  data.discoverable = input.discoverable;
}
```

`deleteWorkspaceServer` içinde, `ensureOwner(access)` satırının **hemen öncesine**:

```typescript
const deletedServer = await prisma.server.findUniqueOrThrow({
  select: { type: true },
  where: { id: serverId },
});
assertServerIsDeletableByOwner(deletedServer.type);
```

- [ ] **Step 4: Testleri geçir**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="community server protection"
```

Beklenen: 5 test PASS.

- [ ] **Step 5: Tüm web testlerini çalıştır**

```bash
pnpm --filter @wizards/web test
```

Beklenen: hepsi PASS. `deleteWorkspaceServer` veya `updateWorkspaceServer` çağıran mevcut testler kırmızıya dönerse yeni `findUniqueOrThrow` çağrısını taklit etmeleri gerekir — testin taklidini genişlet, kapıyı kaldırma.

- [ ] **Step 6: Değişikliği indekse al (commit YOK)**

```bash
git add apps/web/src/lib/workspace/server-service.ts apps/web/src/lib/workspace/server-service.test.ts
```

---

### Task 7: Üye sayacı

**Files:**

- Create: `apps/web/src/lib/workspace/server-member-counter.ts`
- Create: `apps/web/src/lib/workspace/server-member-counter.test.ts`
- Modify: `apps/web/src/lib/workspace/invite-service.ts:754`, `apps/web/src/lib/workspace/member-service.ts:223,376,551`, `apps/web/src/lib/account/privacy-service.ts:505`

**Interfaces:**

- Consumes: Görev 1 `Server.memberCount`
- Produces:

  ```typescript
  export type ServerMemberCounterClient = {
    $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
    server: { update: (args: never) => Promise<unknown> };
  };

  export async function incrementServerMemberCount(
    client: ServerMemberCounterClient,
    serverId: string,
  ): Promise<void>;
  export async function decrementServerMemberCount(
    client: ServerMemberCounterClient,
    serverId: string,
  ): Promise<void>;
  export async function decrementServerMemberCounts(
    client: ServerMemberCounterClient,
    serverIds: readonly string[],
  ): Promise<void>;
  export async function recomputeServerMemberCount(
    client: ServerMemberCounterClient,
    serverId: string,
  ): Promise<void>;
  ```

- [ ] **Step 1: Başarısız testleri yaz**

Create `apps/web/src/lib/workspace/server-member-counter.test.ts`:

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decrementServerMemberCount,
  decrementServerMemberCounts,
  incrementServerMemberCount,
  recomputeServerMemberCount,
} from "@/lib/workspace/server-member-counter";

function buildClient() {
  const rawQueries: string[] = [];
  const updates: unknown[] = [];

  return {
    client: {
      $executeRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
        rawQueries.push(`${query.join("?")}|${values.join(",")}`);
        return 1;
      },
      server: {
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
    },
    rawQueries,
    updates,
  };
}

describe("server member counter", () => {
  it("increments through Prisma because overflow is not a risk", async () => {
    const { client, rawQueries, updates } = buildClient();

    await incrementServerMemberCount(client as never, "s1");

    assert.equal(rawQueries.length, 0);
    assert.deepEqual(updates, [{ data: { memberCount: { increment: 1 } }, where: { id: "s1" } }]);
  });

  it("decrements through raw SQL so the counter can never go negative", async () => {
    const { client, rawQueries, updates } = buildClient();

    await decrementServerMemberCount(client as never, "s1");

    assert.equal(updates.length, 0);
    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /GREATEST/);
    assert.match(rawQueries[0] ?? "", /s1/);
  });

  it("decrements a batch of servers in one statement", async () => {
    const { client, rawQueries } = buildClient();

    await decrementServerMemberCounts(client as never, ["s1", "s2"]);

    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /GREATEST/);
  });

  it("skips the statement entirely for an empty batch", async () => {
    const { client, rawQueries } = buildClient();

    await decrementServerMemberCounts(client as never, []);

    assert.equal(rawQueries.length, 0);
  });

  it("recomputes from the membership table to repair drift", async () => {
    const { client, rawQueries } = buildClient();

    await recomputeServerMemberCount(client as never, "s1");

    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /SELECT COUNT/i);
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="server member counter"
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Sayacı yaz**

Create `apps/web/src/lib/workspace/server-member-counter.ts`:

```typescript
import { Prisma } from "@wizards/db";

/**
 * Narrow enough that a transaction client, the base client, and a test double
 * all satisfy it. The counter is written from six call sites, so it lives in
 * one module rather than being repeated at each of them.
 */
export type ServerMemberCounterClient = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  server: { update: (args: never) => Promise<unknown> };
};

export async function incrementServerMemberCount(
  client: ServerMemberCounterClient,
  serverId: string,
): Promise<void> {
  await client.server.update({
    data: { memberCount: { increment: 1 } },
    where: { id: serverId },
  } as never);
}

/**
 * Prisma's `decrement` happily writes -1. A membership row can be removed by
 * more than one path (leave, kick, ban, account deletion), so the floor is
 * enforced in SQL instead of trusted at each call site.
 */
export async function decrementServerMemberCount(
  client: ServerMemberCounterClient,
  serverId: string,
): Promise<void> {
  await client.$executeRaw`
    UPDATE "Server"
    SET "memberCount" = GREATEST(0, "memberCount" - 1)
    WHERE "id" = ${serverId}
  `;
}

export async function decrementServerMemberCounts(
  client: ServerMemberCounterClient,
  serverIds: readonly string[],
): Promise<void> {
  if (serverIds.length === 0) {
    return;
  }

  await client.$executeRaw`
    UPDATE "Server"
    SET "memberCount" = GREATEST(0, "memberCount" - 1)
    WHERE "id" IN (${Prisma.join([...serverIds])})
  `;
}

/** Repair path for drift. Not scheduled anywhere in S1 — callable on demand. */
export async function recomputeServerMemberCount(
  client: ServerMemberCounterClient,
  serverId: string,
): Promise<void> {
  await client.$executeRaw`
    UPDATE "Server" s
    SET "memberCount" = (
      SELECT COUNT(*) FROM "ServerMember" m WHERE m."serverId" = s."id"
    )
    WHERE s."id" = ${serverId}
  `;
}
```

- [ ] **Step 4: Testleri geçir**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="server member counter"
```

Beklenen: 5 test PASS.

- [ ] **Step 5: Katılma yolunu bağla (`invite-service.ts`)**

`apps/web/src/lib/workspace/invite-service.ts:754` — `tx.serverMember.create({...})` çağrısının hemen ardına:

```typescript
await incrementServerMemberCount(tx, invite.server.id);
```

Dosya başına import ekle:

```typescript
import { incrementServerMemberCount } from "@/lib/workspace/server-member-counter";
```

- [ ] **Step 6: Üye ekleme yolunu bağla (`member-service.ts:376`)**

`tx.serverMember.create({...})` çağrısının hemen ardına:

```typescript
await incrementServerMemberCount(tx, serverId);
```

- [ ] **Step 7: Ayrılma yolunu bağla (`member-service.ts:223`)**

`leaveWorkspaceServer` içindeki tek başına duran `prisma.serverMember.delete({...})` çağrısını transaction'a al:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.serverMember.delete({
    where: {
      userId_serverId: {
        serverId,
        userId,
      },
    },
  });
  await decrementServerMemberCount(tx, serverId);
});
```

- [ ] **Step 8: Kick/ban yolunu bağla (`member-service.ts:551`)**

Aynı biçimde:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.serverMember.delete({
    where: {
      id: member.id,
    },
  });
  await decrementServerMemberCount(tx, serverId);
});
```

`member-service.ts` başına import ekle:

```typescript
import {
  decrementServerMemberCount,
  incrementServerMemberCount,
} from "@/lib/workspace/server-member-counter";
```

- [ ] **Step 9: Hesap silme yolunu bağla (`privacy-service.ts:505`)**

`await tx.serverMember.deleteMany({ where: { userId } });` satırını şununla değiştir:

```typescript
const removedMemberships = await tx.serverMember.findMany({
  select: { serverId: true },
  where: { userId },
});
await tx.serverMember.deleteMany({ where: { userId } });
await decrementServerMemberCounts(
  tx,
  removedMemberships.map((membership) => membership.serverId),
);
```

Dosya başına import ekle:

```typescript
import { decrementServerMemberCounts } from "@/lib/workspace/server-member-counter";
```

- [ ] **Step 10: Altı yazma noktasının bağlandığını doğrula**

```bash
grep -rn "ServerMemberCount" apps/web/src/lib/workspace/invite-service.ts apps/web/src/lib/workspace/member-service.ts apps/web/src/lib/account/privacy-service.ts apps/web/src/lib/workspace/server-service.ts
```

Beklenen: `invite-service` 2 satır (import + çağrı), `member-service` 3 satır (import + 3 çağrı = 4 satır), `privacy-service` 2 satır. `server-service` sıfır — orada sayaç `buildServerCreateData` içinde `memberCount: 1` olarak başlar (Görev 4).

- [ ] **Step 11: Tüm web testlerini çalıştır**

```bash
pnpm --filter @wizards/web test
```

Beklenen: PASS. `leaveWorkspaceServer` veya kick yolunu test eden mevcut testler artık `$transaction` bekler — taklidi genişlet, transaction'ı kaldırma.

- [ ] **Step 12: Değişikliği indekse al (commit YOK)**

```bash
git add apps/web/src/lib/workspace/server-member-counter.ts apps/web/src/lib/workspace/server-member-counter.test.ts apps/web/src/lib/workspace/invite-service.ts apps/web/src/lib/workspace/member-service.ts apps/web/src/lib/account/privacy-service.ts
```

---

### Task 8: Redis çevrimiçi üye sayacı

**Files:**

- Create: `apps/web/src/lib/socket/server-online-presence.ts`
- Create: `apps/web/src/lib/socket/server-online-presence.test.ts`
- Modify: `apps/web/src/lib/workspace/unread-service.ts:634`

**Interfaces:**

- Consumes: `getRedisOp()` from `@/lib/redis`
- Produces:

  ```typescript
  export type ServerOnlinePresenceRedis = {
    expire: (key: string, seconds: number) => Promise<unknown>;
    sadd: (key: string, member: string) => Promise<unknown>;
    scard: (key: string) => Promise<number>;
    srem: (key: string, member: string) => Promise<unknown>;
  };

  export function buildServerOnlineKey(serverId: string): string; // `server:${serverId}:online`
  export async function addServerOnlineMember(
    redis: ServerOnlinePresenceRedis,
    serverId: string,
    userId: string,
  ): Promise<void>;
  export async function removeServerOnlineMember(
    redis: ServerOnlinePresenceRedis,
    serverId: string,
    userId: string,
  ): Promise<void>;
  export async function countServerOnlineMembers(
    redis: ServerOnlinePresenceRedis,
    serverId: string,
  ): Promise<number>;
  ```

  S3 bu modülü çoklu-sunucu pipeline okuması için genişletir.

- [ ] **Step 1: Başarısız testleri yaz**

Create `apps/web/src/lib/socket/server-online-presence.test.ts`:

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addServerOnlineMember,
  buildServerOnlineKey,
  countServerOnlineMembers,
  removeServerOnlineMember,
} from "@/lib/socket/server-online-presence";

function buildRedis() {
  const sets = new Map<string, Set<string>>();
  const expiries: string[] = [];

  return {
    expiries,
    redis: {
      expire: async (key: string) => {
        expiries.push(key);
        return 1;
      },
      sadd: async (key: string, member: string) => {
        const set = sets.get(key) ?? new Set<string>();
        set.add(member);
        sets.set(key, set);
        return 1;
      },
      scard: async (key: string) => sets.get(key)?.size ?? 0,
      srem: async (key: string, member: string) => {
        sets.get(key)?.delete(member);
        return 1;
      },
    },
    sets,
  };
}

describe("server online presence", () => {
  it("names the key after the server", () => {
    assert.equal(buildServerOnlineKey("s1"), "server:s1:online");
  });

  it("counts each user once no matter how many sockets they hold", async () => {
    const { redis } = buildRedis();

    await addServerOnlineMember(redis as never, "s1", "u1");
    await addServerOnlineMember(redis as never, "s1", "u1");
    await addServerOnlineMember(redis as never, "s1", "u2");

    assert.equal(await countServerOnlineMembers(redis as never, "s1"), 2);
  });

  it("drops a user when the last socket leaves", async () => {
    const { redis } = buildRedis();

    await addServerOnlineMember(redis as never, "s1", "u1");
    await removeServerOnlineMember(redis as never, "s1", "u1");

    assert.equal(await countServerOnlineMembers(redis as never, "s1"), 0);
  });

  it("refreshes the expiry on every write so a stale set cannot linger", async () => {
    const { expiries, redis } = buildRedis();

    await addServerOnlineMember(redis as never, "s1", "u1");

    assert.deepEqual(expiries, ["server:s1:online"]);
  });

  it("returns zero for a server nobody is in", async () => {
    const { redis } = buildRedis();

    assert.equal(await countServerOnlineMembers(redis as never, "empty"), 0);
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="server online presence"
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Modülü yaz**

Create `apps/web/src/lib/socket/server-online-presence.ts`:

```typescript
/**
 * `fetchSockets()` serialises every socket in a room just to count the distinct
 * users behind them. A twelve-thousand-member community server makes that
 * expensive, and a discovery list would repeat it once per server. A Redis set
 * answers the same question with one `SCARD`.
 *
 * The set is derived state, not a record of truth: if Redis loses it, sockets
 * repopulate it as they reconnect. The TTL keeps an abandoned key from
 * outliving the process that wrote it.
 */
const ONLINE_SET_TTL_SECONDS = 60 * 60 * 12;

export type ServerOnlinePresenceRedis = {
  expire: (key: string, seconds: number) => Promise<unknown>;
  sadd: (key: string, member: string) => Promise<unknown>;
  scard: (key: string) => Promise<number>;
  srem: (key: string, member: string) => Promise<unknown>;
};

export function buildServerOnlineKey(serverId: string): string {
  return `server:${serverId}:online`;
}

export async function addServerOnlineMember(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
  userId: string,
): Promise<void> {
  const key = buildServerOnlineKey(serverId);
  await redis.sadd(key, userId);
  await redis.expire(key, ONLINE_SET_TTL_SECONDS);
}

export async function removeServerOnlineMember(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
  userId: string,
): Promise<void> {
  await redis.srem(buildServerOnlineKey(serverId), userId);
}

export async function countServerOnlineMembers(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
): Promise<number> {
  return redis.scard(buildServerOnlineKey(serverId));
}
```

- [ ] **Step 4: Testleri geçir**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="server online presence"
```

Beklenen: 5 test PASS.

- [ ] **Step 5: `getOnlineServerMemberCount` gövdesini değiştir**

`apps/web/src/lib/workspace/unread-service.ts:634-649` — tüm gövdeyi değiştir:

```typescript
export async function getOnlineServerMemberCount(serverId: string) {
  return countServerOnlineMembers(getRedisOp(), serverId);
}
```

Dosya başına importları ekle:

```typescript
import { countServerOnlineMembers } from "@/lib/socket/server-online-presence";
import { getRedisOp } from "@/lib/redis";
```

Artık kullanılmıyorsa `getSocketServer` importunu bu dosyadan kaldırma — dosyanın başka yerlerinde (`emitServerUnreadUpdateToUser`) hâlâ kullanılıyor.

- [ ] **Step 6: Set yaşam döngüsünü bağla**

Sunucu odalarına katılım tek yerde: `apps/web/src/lib/socket/server.ts:338`. Mevcut satır:

```typescript
await socket.join(serverIds.map((serverId) => `server:${serverId}`));
```

Şununla değiştir:

```typescript
await socket.join(serverIds.map((serverId) => `server:${serverId}`));

// The room membership and the online set are written together so the two can
// never disagree about which servers this socket is present in.
socket.data.onlineServerIds = serverIds;
const presenceRedis = options.redis ?? getRedisOp();
await Promise.all(
  serverIds.map((serverId) => addServerOnlineMember(presenceRedis, serverId, userId)),
);
```

`apps/web/src/lib/socket/server.ts:491` — disconnect işleyicisinin `try` bloğunun başına ekle:

```typescript
const onlineServerIds: string[] = socket.data.onlineServerIds ?? [];
if (socket.data.userId) {
  await Promise.all(
    onlineServerIds.map((serverId) =>
      removeServerOnlineMember(getRedisOp(), serverId, socket.data.userId as string),
    ),
  );
}
```

`apps/web/src/lib/socket/handlers/presence.ts:31` ve `:87` — her iki `ctx.socket.data.presenceStatus = presence.status;` satırının hemen ardına:

```typescript
const presenceServerIds: string[] = ctx.socket.data.onlineServerIds ?? [];
const applyPresence =
  presence.status === "OFFLINE" ? removeServerOnlineMember : addServerOnlineMember;
await Promise.all(
  presenceServerIds.map((serverId) =>
    applyPresence(getRedisOp(), serverId, ctx.socket.data.userId as string),
  ),
);
```

Üç dosyanın da başına gereken importları ekle:

```typescript
import {
  addServerOnlineMember,
  removeServerOnlineMember,
} from "@/lib/socket/server-online-presence";
import { getRedisOp } from "@/lib/redis";
```

`socket.data.onlineServerIds` alanını socket data tip tanımına ekle (`apps/web/src/lib/socket/events.ts` içindeki socket data tipi — `presenceStatus` alanının yanına):

```typescript
  onlineServerIds?: string[];
```

- [ ] **Step 7: Tüm web testlerini çalıştır**

```bash
pnpm --filter @wizards/web test
```

Beklenen: PASS. `getOnlineServerMemberCount`'u `fetchSockets` taklidiyle test eden mevcut testler artık Redis taklidi ister — taklidi güncelle (davranış aynı: benzersiz, `OFFLINE` olmayan kullanıcı sayısı).

- [ ] **Step 8: Değişikliği indekse al (commit YOK)**

```bash
git add apps/web/src/lib/socket/server-online-presence.ts apps/web/src/lib/socket/server-online-presence.test.ts apps/web/src/lib/socket/rooms.ts apps/web/src/lib/socket/server.ts apps/web/src/lib/socket/handlers/presence.ts apps/web/src/lib/workspace/unread-service.ts
```

---

### Task 9: Kanonik okuma modeli + davet önizlemesi indirgemesi

**Files:**

- Create: `apps/web/src/lib/servers/server-public-profile-service.ts`
- Create: `apps/web/src/lib/servers/server-public-profile-service.test.ts`
- Modify: `apps/web/src/lib/invites/mobile-invite-preview-service.ts`

**Interfaces:**

- Consumes: Görev 2 `ServerPublicProfile`
- Produces:

  ```typescript
  export const SERVER_PUBLIC_PROFILE_SELECT: Prisma.ServerSelect;

  export function buildServerPublicProfile(
    server: ServerPublicProfileSource,
    viewer: ServerPublicProfileViewer,
  ): ServerPublicProfile;

  export async function getServerPublicProfileWithDatabase(
    database: PrismaClient,
    serverId: string,
    viewerId: string | null,
  ): Promise<ServerPublicProfile>;

  export async function getServerPublicProfile(
    serverId: string,
    viewerId: string | null,
  ): Promise<ServerPublicProfile>;
  ```

- [ ] **Step 1: Regresyon kapısını yeşil olarak kaydet**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="invite preview"
```

```bash
pnpm --filter @wizards/mobile test -- mobile-about-community-2g
```

Beklenen: ikisi de PASS. Çıktıyı not al — bu, refactor sonrası karşılaştırma tabanıdır. Şu an kırmızıysa **dur**, Görev 9'a başlama; önce mevcut kırmızıyı bildir.

- [ ] **Step 2: Başarısız testleri yaz**

Create `apps/web/src/lib/servers/server-public-profile-service.test.ts`:

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildServerPublicProfile } from "@/lib/servers/server-public-profile-service";

const OWNER_ROLE_PERMISSIONS = 0n;

function buildSource(overrides: Record<string, unknown> = {}) {
  return {
    bannerUrl: null,
    channels: [
      {
        _count: { voiceStates: 3 },
        id: "c1",
        name: "duyurular",
        permissionOverrides: [],
        type: "TEXT" as const,
      },
      {
        _count: { voiceStates: 14 },
        id: "c2",
        name: "topluluk-sesli",
        permissionOverrides: [],
        type: "VOICE" as const,
      },
    ],
    description: "Yol haritasını burada tartışıyoruz.",
    discoverable: true,
    features: ["VERIFIED"],
    iconUrl: null,
    id: "s1",
    isPublic: true,
    memberCount: 12_400,
    members: [],
    name: "Whispr Topluluk",
    ownerId: "owner-1",
    roles: [{ id: "r1", isDefault: true, name: "@everyone", permissions: OWNER_ROLE_PERMISSIONS }],
    shortName: null,
    type: "COMMUNITY" as const,
    ...overrides,
  };
}

const EMPTY_VIEWER = {
  mutualFriendCount: 0,
  mutualFriends: [],
  onlineCount: 1_200,
  viewerId: null,
};

describe("buildServerPublicProfile", () => {
  it("carries the server identity and classification through", () => {
    const profile = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);

    assert.equal(profile.serverId, "s1");
    assert.equal(profile.name, "Whispr Topluluk");
    assert.equal(profile.type, "COMMUNITY");
    assert.equal(profile.isPublic, true);
    assert.equal(profile.discoverable, true);
    assert.equal(profile.memberCount, 12_400);
    assert.equal(profile.onlineCount, 1_200);
  });

  it("derives verified from the features array, not verificationLevel", () => {
    const verified = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);
    const plain = buildServerPublicProfile(
      buildSource({ features: [] }) as never,
      EMPTY_VIEWER as never,
    );

    assert.equal(verified.verified, true);
    assert.equal(plain.verified, false);
  });

  it("reports a voice channel's live count and leaves text channels null", () => {
    const profile = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);

    const text = profile.channels.find((channel) => channel.name === "duyurular");
    const voice = profile.channels.find((channel) => channel.name === "topluluk-sesli");

    assert.equal(text?.liveCount, null);
    assert.equal(text?.type, "text");
    assert.equal(voice?.liveCount, 14);
    assert.equal(voice?.type, "voice");
  });

  it("hides channels the default role cannot view", () => {
    const source = buildSource({
      channels: [
        {
          _count: { voiceStates: 0 },
          id: "c3",
          name: "gizli",
          permissionOverrides: [
            { allow: 0n, deny: 1n, targetId: "r1", targetType: "ROLE" as const },
          ],
          type: "TEXT" as const,
        },
      ],
      roles: [{ id: "r1", isDefault: true, name: "@everyone", permissions: 1n }],
    });

    const profile = buildServerPublicProfile(source as never, EMPTY_VIEWER as never);

    assert.equal(
      profile.channels.some((channel) => channel.name === "gizli"),
      false,
    );
  });

  it("marks the viewer as joined only when a membership row is present", () => {
    const guest = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);
    const member = buildServerPublicProfile(
      buildSource({ members: [{ id: "m1", roles: [] }] }) as never,
      { ...EMPTY_VIEWER, viewerId: "u1" } as never,
    );

    assert.equal(guest.joined, false);
    assert.equal(member.joined, true);
  });

  it("passes the mutual friend summary through untouched", () => {
    const profile = buildServerPublicProfile(
      buildSource() as never,
      {
        mutualFriendCount: 12,
        mutualFriends: [{ avatarUrl: null, displayName: "Ada", id: "u9" }],
        onlineCount: 1_200,
        viewerId: "u1",
      } as never,
    );

    assert.equal(profile.mutualFriendCount, 12);
    assert.equal(profile.mutualFriends.length, 1);
    assert.equal(profile.mutualFriends[0]?.displayName, "Ada");
  });
});
```

- [ ] **Step 3: Testleri çalıştır, başarısız olduklarını doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="buildServerPublicProfile"
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 4: Kanonik servisi yaz**

Create `apps/web/src/lib/servers/server-public-profile-service.ts`. `MOBILE_INVITE_PREVIEW_SELECT.server.select` bloğunu (`mobile-invite-preview-service.ts:31-90`) buraya `SERVER_PUBLIC_PROFILE_SELECT` adıyla taşı; `_count: { select: { members: true } }` yerine düz `memberCount: true` kullan ve `discoverable`, `isPublic`, `shortName`, `type` alanlarını ekle. Kanal eşleme, izin çözümleme ve `verified` türetimi `mobile-invite-preview-service.ts:228-272` içindeki mantığın birebir aynısıdır — kopyala, davranışı değiştirme.

İskelet:

```typescript
import type { ChannelType, Prisma, PrismaClient } from "@wizards/db";
import type { ServerPublicProfile, ServerPublicProfileFriend } from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  PermissionBits,
  hasPermission,
  resolveChannelPermissions,
  type RolePermissionRecord,
} from "@/lib/workspace/permissions";

const PREVIEWABLE_CHANNEL_TYPES = [
  "TEXT",
  "VOICE",
  "ANNOUNCEMENT",
  "STAGE",
  "FORUM",
] as const satisfies readonly ChannelType[];

export const SERVER_PUBLIC_PROFILE_SELECT = {
  bannerUrl: true,
  channels: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
    select: {
      _count: { select: { voiceStates: true } },
      id: true,
      name: true,
      permissionOverrides: {
        select: { allow: true, deny: true, targetId: true, targetType: true },
      },
      type: true,
    },
    where: { parentId: null, type: { in: [...PREVIEWABLE_CHANNEL_TYPES] } },
  },
  description: true,
  discoverable: true,
  features: true,
  iconUrl: true,
  id: true,
  isPublic: true,
  memberCount: true,
  members: {
    select: {
      id: true,
      roles: {
        select: {
          role: { select: { id: true, isDefault: true, name: true, permissions: true } },
        },
      },
    },
    take: 1,
  },
  name: true,
  ownerId: true,
  roles: {
    select: { id: true, isDefault: true, name: true, permissions: true },
    where: { isDefault: true },
  },
  shortName: true,
  type: true,
} satisfies Prisma.ServerSelect;

export type ServerPublicProfileSource = Prisma.ServerGetPayload<{
  select: typeof SERVER_PUBLIC_PROFILE_SELECT;
}>;

export type ServerPublicProfileViewer = {
  readonly mutualFriendCount: number;
  readonly mutualFriends: readonly ServerPublicProfileFriend[];
  readonly onlineCount: number;
  readonly viewerId: string | null;
};

function isVoiceChannel(type: ChannelType): boolean {
  return type === "VOICE" || type === "STAGE";
}

/**
 * Pure so the permission filter can be asserted without a database. Three
 * surfaces read a server profile — the 2g card, the discovery card, and the
 * invite preview — and all of them go through this function so the filter can
 * never be written a second time and drift.
 */
export function buildServerPublicProfile(
  server: ServerPublicProfileSource,
  viewer: ServerPublicProfileViewer,
): ServerPublicProfile {
  const membership = server.members[0] ?? null;
  const roles: RolePermissionRecord[] = [
    ...server.roles,
    ...(membership?.roles.map((entry) => entry.role) ?? []),
  ];

  const channels = server.channels
    .map((channel) => {
      const permissions = resolveChannelPermissions({
        memberId: membership?.id ?? null,
        ownerId: server.ownerId,
        overrides: channel.permissionOverrides,
        roles,
        userId: viewer.viewerId ?? "",
      });
      const voice = isVoiceChannel(channel.type);

      return {
        liveCount: voice ? channel._count.voiceStates : channel.type === "FORUM" ? 0 : null,
        name: channel.name,
        readOnly: !hasPermission(
          permissions,
          voice ? PermissionBits.CONNECT_VOICE : PermissionBits.SEND_MESSAGES,
        ),
        type: voice ? ("voice" as const) : ("text" as const),
        visible: hasPermission(permissions, PermissionBits.VIEW_CHANNEL),
      };
    })
    .filter((channel) => channel.visible)
    .map(({ visible: _visible, ...channel }) => channel);

  return {
    bannerUrl: server.bannerUrl,
    channels,
    description: server.description ?? "",
    discoverable: server.discoverable,
    iconUrl: server.iconUrl,
    isPublic: server.isPublic,
    joined: membership !== null,
    memberCount: server.memberCount,
    mutualFriendCount: viewer.mutualFriendCount,
    mutualFriends: [...viewer.mutualFriends],
    name: server.name,
    onlineCount: viewer.onlineCount,
    serverId: server.id,
    shortName: server.shortName,
    type: server.type,
    verified: server.features.includes("VERIFIED"),
  };
}
```

Ardından aynı dosyada, `mobile-invite-preview-service.ts:181-221` içindeki `mutualFriendWhere` + üçlü `Promise.all` sorgusunu taşıyan veritabanı katmanını yaz:

```typescript
export async function getServerPublicProfileWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile> {
  const server = await database.server.findUnique({
    select: {
      ...SERVER_PUBLIC_PROFILE_SELECT,
      members: {
        ...SERVER_PUBLIC_PROFILE_SELECT.members,
        where: viewerId === null ? { id: "" } : { userId: viewerId },
      },
    },
    where: { id: serverId },
  });

  if (!server) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  const viewer = await loadServerPublicProfileViewer(database, serverId, viewerId);

  return buildServerPublicProfile(server as ServerPublicProfileSource, viewer);
}

export async function getServerPublicProfile(
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile> {
  const { prisma } = await import("@wizards/db");
  return getServerPublicProfileWithDatabase(prisma, serverId, viewerId);
}
```

Aynı dosyaya izleyici yükleyicisini yaz. Bu, `mobile-invite-preview-service.ts:181-221` ve `:249-256` mantığının birebir taşınmış hâlidir — sorgu şekli, `take: 8` sınırı ve `orderBy` değişmez:

```typescript
async function countOnlineMembers(database: PrismaClient, serverId: string): Promise<number> {
  return database.serverMember.count({
    where: {
      serverId,
      user: { status: { in: ["ONLINE", "IDLE", "DND"] } },
    },
  });
}

async function loadServerPublicProfileViewer(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfileViewer> {
  if (viewerId === null) {
    return {
      mutualFriendCount: 0,
      mutualFriends: [],
      onlineCount: await countOnlineMembers(database, serverId),
      viewerId: null,
    };
  }

  const mutualFriendWhere = {
    OR: [
      {
        receiver: { serverMembers: { some: { serverId } } },
        senderId: viewerId,
      },
      {
        receiverId: viewerId,
        sender: { serverMembers: { some: { serverId } } },
      },
    ],
    status: "ACCEPTED" as const,
  };

  const [onlineCount, mutualFriendCount, mutualFriendships] = await Promise.all([
    countOnlineMembers(database, serverId),
    database.friendRequest.count({ where: mutualFriendWhere }),
    database.friendRequest.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        receiver: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
        receiverId: true,
        sender: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
        senderId: true,
      },
      take: 8,
      where: mutualFriendWhere,
    }),
  ]);

  return {
    mutualFriendCount,
    mutualFriends: mutualFriendships.map((friendship) => {
      const friend = friendship.senderId === viewerId ? friendship.receiver : friendship.sender;
      return {
        avatarUrl: friend.avatarUrl,
        displayName: friend.displayName?.trim() || friend.username,
        id: friend.id,
      };
    }),
    onlineCount,
    viewerId,
  };
}
```

- [ ] **Step 5: Testleri geçir**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="buildServerPublicProfile"
```

Beklenen: 6 test PASS.

- [ ] **Step 6: Davet önizlemesini indirge**

`apps/web/src/lib/invites/mobile-invite-preview-service.ts` — `MOBILE_INVITE_PREVIEW_SELECT.server.select` bloğunu `SERVER_PUBLIC_PROFILE_SELECT` ile değiştir, kanal eşleme / izin çözümleme / arkadaş sorgusu kodunu sil, `getMobileInvitePreviewWithDatabase` sonunu şu hâle getir:

```typescript
const profile = await getServerPublicProfileWithDatabase(database, invite.server.id, userId);

return {
  bannerUrl: profile.bannerUrl,
  channels: profile.channels,
  description: profile.description,
  iconUrl: profile.iconUrl,
  joined: profile.joined,
  memberCount: profile.memberCount,
  mutualFriendCount: profile.mutualFriendCount,
  mutualFriends: profile.mutualFriends,
  name: profile.name,
  onlineCount: profile.onlineCount,
  serverId: profile.serverId,
  slug,
  verified: profile.verified,
};
```

Davet çözümleme (`findUnique` by `code`, `vanityUrlCode` yedeği, `inviteCanBePreviewed`) **değişmez**. `MOBILE_INVITE_PREVIEW_SELECT` artık yalnız `expiresAt`, `maxUses`, `server: { select: { id: true } }`, `targetUserId`, `uses` taşır.

`buildMobileInvitePreviewResponse` dışa aktarımı, ona bağlı testler varsa korunur; yoksa silinir. Karar için:

```bash
grep -rn "buildMobileInvitePreviewResponse" apps/web/src apps/mobile
```

- [ ] **Step 7: Regresyon kapısını doğrula**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="invite preview"
```

```bash
pnpm --filter @wizards/mobile test -- mobile-about-community-2g
```

Beklenen: Adım 1'deki sonuçla **birebir aynı** — aynı testler, aynı sayı, hepsi PASS. Bu testlerden herhangi biri kırmızıya dönerse refactor davranışı değiştirmiş demektir: testi düzeltme, `server-public-profile-service.ts`'i düzelt.

- [ ] **Step 8: Değişikliği indekse al (commit YOK)**

```bash
git add apps/web/src/lib/servers apps/web/src/lib/invites/mobile-invite-preview-service.ts
```

---

### Task 10: Tam kapı ve teslim

**Files:** yok (doğrulama görevi)

- [ ] **Step 1: Prisma istemcisini tazele**

```bash
pnpm db:generate
```

- [ ] **Step 2: Tam yerel kapıyı çalıştır**

```bash
pwsh -File scripts/quality/Invoke-LocalGate.ps1 -Profile Standard
```

Beklenen: `[PASS]`. typecheck, eslint, format, `node --test` (web + types + db) hepsi yeşil.

- [ ] **Step 3: Mobil tarafın etkilenmediğini doğrula**

```bash
pwsh -File scripts/quality/Invoke-LocalGate.ps1 -Profile Mobile
```

Beklenen: `[PASS]`. S1 mobil kod değiştirmedi; buradaki tek risk 2g sözleşme testidir.

- [ ] **Step 4: Görünür değişiklik olmadığını doğrula**

```bash
git status --porcelain -- apps/web/src/components apps/web/src/app
```

Beklenen: boş çıktı. S1 hiçbir ekran, bileşen veya kopya metni değiştirmez. Çıktı boş değilse kapsam dışına taşılmıştır — o değişikliği geri al.

`apps/mobile` altında yalnız devam eden ses/video işinin dosyaları görünmelidir; S1'e ait tek bir mobil dosya bile olmamalıdır.

- [ ] **Step 5: UAT migration doğrulaması (dağıtım sonrası)**

UAT'a dağıtımdan sonra, [[reference_railway_uat_migration_check]] yordamıyla son SUCCESS deployment'ın commit'inin bu migration'ı içerdiğini doğrula. Ardından bir sunucu detayı çağrısında `memberCount` alanının sıfır olmayan gerçek değer döndüğünü kontrol et — sıfır dönüyorsa backfill koşmamıştır.

---

## Bilinen Boşluklar (S1 kapanışında kayda geçer)

1. Kanonik profil modeli çevrimiçi sayısını hâlâ veritabanından okur; Redis `SCARD` yolu kurulu ama profil modeline bağlı değil. **S3**'te çoklu-sunucu okuması gerektiğinde bağlanır.
2. `verificationLevel` kolonu yazılabilir ama hiçbir okuma yolunda kullanılmaz. Rozet mantığı `features` dizisindeki `"VERIFIED"` değerinden gelir. Birleştirme **S4**.
3. `recomputeServerMemberCount` yazıldı ama hiçbir zamanlanmış işe bağlanmadı. Bakım scripti **S4** veya ayrı iş.
4. `PERSONAL ↔ COMMUNITY` terfisi yok. **S4**.
5. `vanityUrlCode` yönetimi kapsam dışı bırakıldı.

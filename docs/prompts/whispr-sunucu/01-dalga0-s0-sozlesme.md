# Ş0 — Sözleşme, veri ve ölçü katmanı (Dalga 0, kilit)

> Önce oku: `00-ortak-baglam.md`, `PLAN.md` §3 (kararlar), `SPEC-SUNUCU.md` §9–§11.
> **Bu şerit bitmeden hiçbir şerit başlamaz.** UI yazılmaz; yalnız sözleşme, veri, ölçü ve denetim.

---

## Görev

Sunucu paketinin altına tek bir doğruluk katmanı koy: iki yeni kolon, genişletilmiş `@wizards/types`
sözleşmesi, SPEC ölçü sözlüğü, `--accent-2` token'ı ve parity/şema denetim iskeletleri.

---

## 1. Migration (K2)

`packages/db/prisma/rebaseline-migrations/<timestamp>_server_screen/migration.sql`:

```sql
ALTER TABLE "Server" ADD COLUMN "iconColor" TEXT;
ALTER TABLE "Server" ADD COLUMN "slowModeDelay" INTEGER NOT NULL DEFAULT 0;
```

`schema.prisma` → `model Server`:

```prisma
  /// Sunucu ikonunun renk tonu. `null` = eski deterministik türetme (kısa adın harf
  /// kodları toplamı % palet uzunluğu). Geri doldurma yapılmaz; mevcut sunucuların
  /// görünümü değişmez.
  iconColor     String?
  /// Sunucu geneli yavaş mod, saniye. `Channel.slowModeDelay` ile aynı değer kümesini
  /// paylaşır; uygulama kuralı max(server, channel) ve tek yerde yaşar.
  slowModeDelay Int      @default(0)
```

- **Geri doldurma yok.** `iconColor` `null` bırakılır.
- `pnpm --filter @wizards/db db:migrate:deploy` yerel DB'de koşturulur, çıktı rapora yazılır.
- `packages/db/prisma/schema-server-screen.test.mjs` yazılır (mevcut `schema-*.test.mjs` düzeni):
  iki kolonun varlığı, tipi, varsayılanı ve `iconColor`'ın nullable olduğu denetlenir.

---

## 2. Sözleşme — `packages/types/src/workspace.ts`

### 2.1 Yeni

```ts
export const SERVER_ICON_TONES = [
  "primary",
  "info",
  "success",
  "warning",
  "danger",
  "accent2",
] as const;
export const ServerIconToneSchema = z.enum(SERVER_ICON_TONES);

/** Sunucu geneli yavaş mod; kanal ayarıyla aynı değer kümesi. */
export const ServerSlowModeSchema = z
  .number()
  .int()
  .refine((value) => CHANNEL_SLOW_MODE_DELAYS.includes(value as never));

export const TransferServerOwnershipSchema = z
  .object({
    acknowledged: z.literal(true),
    newOwnerUserId: z.string().min(1),
  })
  .strict();

export const ServerMemberTimeoutSchema = z
  .object({
    /** null = zaman aşımını kaldır */
    until: z.string().datetime().nullable(),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const ServerBanSchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
    deleteMessageSeconds: z.number().int().min(0).max(604_800).optional(),
  })
  .strict();

/** Hedefli davet: ServerInvite.targetUserId dolu olan davet. */
export const TargetedInviteSchema = z
  .object({
    targetUserId: z.string().min(1),
  })
  .strict();
```

- `UpdateServerFieldsSchema`'ya `iconColor: ServerIconToneSchema.nullable().optional()` ve
  `slowModeDelay: ServerSlowModeSchema.optional()` eklenir.
  `UPDATE_SERVER_FIELD_KEYS` **elle listelenmez** — mevcut `Object.keys(...)` türetmesi zaten var.
- `WorkspaceServerSummarySchema`'ya `iconColor` ve `slowModeDelay` **zorunlu** okuma alanı olarak eklenir.
- `WorkspaceInviteSchema`'ya `targetUserId: z.string().nullable().default(null)` eklenir.
- `WorkspaceMemberSchema`'ya `communicationDisabledUntil: z.string().datetime().nullable().default(null)` eklenir.
- `CreateServerSchema`'ya `iconColor: ServerIconToneSchema.optional()` eklenir.

### 2.2 K6 daraltması — **önce say, sonra daralt**

Daraltmadan önce yerel ve UAT DB'de ihlal taraması yap; sonucu rapora yaz:

```sql
SELECT count(*) FROM "Role" WHERE length(name) > 32;
SELECT count(*) FROM "ScheduledEvent" WHERE length(name) > 60;
SELECT count(*) FROM "ScheduledEvent" WHERE length(coalesce(description,'')) > 180;
```

İhlal **varsa** daraltma yapılmaz; rapora "K6 bloke, N satır ihlal" yazılır ve düzeltme scripti
önerilir. İhlal **yoksa**:

- `WorkspaceRoleMutationSchema.name`: `workspaceNameSchema(48, …)` → `workspaceNameSchema(32, …)`
- `ServerScheduledEventFieldsSchema.name`: `max(100)` → `max(60)`
- `ServerScheduledEventFieldsSchema.description`: `max(1000)` → `max(180)`
- `CreateServerScheduledEventSchema.name`: `max(100)` → `max(60)`

### 2.3 Mobil (K10)

- Mobil şemaları bu alanları **opsiyonel** görür; `mobile-workspace-management.ts` içindeki
  türetmeler kırılmamalı. `toMobileServerRole` bilinmeyen yetki anahtarını düşürmeye devam eder.
- Mobil ekran dosyalarına dokunulmaz.

### 2.4 Testler

`packages/types/src/workspace.test.ts` genişletilir: yeni şemaların kabul/ret örnekleri, K6
sınırlarının tam değerde geçip +1'de düştüğü, `iconColor: null`'ın kabul edildiği.

---

## 3. Ölçü sözlüğü — `apps/web/src/lib/servers/metrics.ts`

`lib/messages/metrics.ts` düzeninde `SERVER_METRICS` yaz. En az şu bloklar, hepsi
`SPEC-SUNUCU.md` + `Sunucu.dc.html` inline `style` değerlerinden:

| Blok               | SPEC      | İçerik                                                                                                                                                                                                             |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sidebar`          | §2        | 252, başlık 14/13, menü top 70 / radius 16 / padding 6, arama düğmesi 8/10 r12, popover top 114, kategori başlığı, kanal satırı 7/9 r11, aktif şerit 3.5×18, rozet 19×18 r6, katılımcı satırı 4/9/4/26, avatar 22  |
| `voiceStrip`       | §2.5      | margin 0/9/8, padding 10/11, radius 14, ayrılma düğmesi 26 r9                                                                                                                                                      |
| `textHeader`       | §3.1      | padding 14/20, ikon 20, ad 16.5, düğme 33 r11, ayraç 1×22                                                                                                                                                          |
| `pinnedBar`        | §3.2      | padding 8/20, ikon 13, metin 11.5                                                                                                                                                                                  |
| `composer`         | §3.4      | padding 0/20/18, kutu 9/12 r15, düğme 34 r11, gönder 36 r12                                                                                                                                                        |
| `rightPanel`       | §4        | 326, başlık 15/15/13, kapatma 27 r9, üye satırı 7/8 r12, avatar 32, presence 10, grup başlığı 9.5                                                                                                                  |
| `search`           | §4.3      | segment, sorgu kutusu, alan 8/11 r11, çip, anahtar 38×21 knob 15, sonuç kartı 11/12 r14                                                                                                                            |
| `voiceGrid`        | §5.2      | padding 18/20/4, gap 12, kart `16/11` r20, çerçeve 2, avatar 62, dalga 4 çubuk `.9s` `.15s`                                                                                                                        |
| `screenShare`      | §5.3      | sahne r20 çerçeve 2, şerit kartı 162 r14, tam ekran düğmesi 30                                                                                                                                                     |
| `voiceControls`    | §5.4      | düğme h44 r15, ayarlar 44, ayraç 1×28, gap 7, padding 14/20/18                                                                                                                                                     |
| `modal`            | §6        | kaplama padding 34, kart r22, başlık 20/22/16, ikon kutusu 38 r13, kapatma 30 r10, ayak 14/22, birincil h40 r13                                                                                                    |
| `modalWidths`      | §6, §7    | `notifications: 460`, `invite: 480`, `category: 560`, `event: 560`, `channel: 660`, `createServer: 940`                                                                                                            |
| `channelWizard`    | §6.2      | adım rakam kutusu 19 r7, tür kartı 9/11 r13 çerçeve 1.5, ikon 27 r9, tik 19, erişim satırı 11/13 r14 ikon 30 r10 radyo 17, ayar kartı 12/13 r14, çip 6/10 r9                                                       |
| `createServer`     | §7        | ikon 68 r22, swatch 26 r9, önizleme kolonu 296, ray satırı ikonu 44, kart ikonu 40                                                                                                                                 |
| `settings`         | §8        | kaplama padding 26, kart `min(1180px,100%)` r24, sol kolon 262, sunucu kartı ikonu 42 r14, menü satırı 9/10 r11, başlık çubuğu 14/22, gövde 20/22/26, kapatma 31                                                   |
| `settingsSections` | §8.1–§8.9 | Genel `1fr/286` + ikon 76 r24 + swatch 27 r9 + kısaltma kolonu 116; Görünürlük satırı 13/15 r16 ikon 32 r11 + kod rozeti 31 r10; Roller `212/1fr`; Üye satırı 11/14 r16 avatar 36; Etkinlik tarih kutusu 52×56 r14 |
| `radii`            | README    | `[6,8,9,10,11,12,13,14,15,16,18,20,22,24,26,999]`                                                                                                                                                                  |

Kurallar:

- `HOME_METRICS`'te olan ölçü **kopyalanmaz** (ray 74, panel 280, kabuk r26 / min 1360×920).
- Sözlük **renk taşımaz**.
- K1 sapması dosyanın başına yorumla yazılır: SPEC 228 der, kod 280 kullanır, gerekçe
  `NAV_PANEL_ADJUSTMENTS`.

---

## 4. Yardımcı sabitler

`apps/web/src/lib/servers/permission-groups.ts`

- 4 grup × 18 yetki; her yetki **mevcut** `WorkspacePermissionKey` değerine eşlenir:
  Genel (5) · Ses ve Medya (5) · Moderasyon (4) · Yönetim (4, `ADMINISTRATOR` `yalnızca sahip`).
- 3 hazır ayar: `Üye` = Genel; `Moderatör` = Genel + Ses ve Medya + Moderasyon;
  `Admin` = hepsi **eksi** `ADMINISTRATOR`.
- `countSelected(perms)` → başlıktaki `14 yetki seçili` bundan türetilir.

`apps/web/src/lib/servers/discovery-tag-groups.ts`

- 5 grup, kod rozetleriyle: `OY` · `İŞ` · `ÇA` · `Kİ` · `DE`, her biri 4 etiket (SPEC §8.2 tablosu).
- Etiketler `ServerTagSchema` slug kuralından geçirilir.

`apps/web/src/lib/servers/channel-visibility.ts`

- `shouldShowInCollapsedCategory(channel, { activeChannelId, voiceStates })` →
  aktif **veya** okunmamışı olan **veya** içinde konuşan olan kanal.
- Saf fonksiyon + birim testi.

`apps/web/src/lib/servers/server-slow-mode.ts`

- `resolveEffectiveSlowMode(serverDelay, channelDelay) => Math.max(...)` + testi.
  Ş1 bunu mesaj gönderme servisine bağlar.

---

## 5. Token

`apps/web/src/app/globals.css`:

- `--accent-2: 291 64% 55%;` açık ve koyu blokların **ikisine** de eklenir
  (`--info` satırlarının hemen altına, aynı düzenle).
- Gerekirse `--accent-2-foreground` eklenir; başka token üretilmez.

---

## 6. Denetim iskeletleri

- `apps/web/src/lib/servers/parity.test.ts` — `lib/settings/parity.test.ts` düzeninde:
  SERVER_METRICS'in SPEC tablolarıyla eşleştiği, K1 sapmasının beyaz listede olduğu,
  sözlükte renk bulunmadığı.
- `apps/web/e2e/specs/design/server-parity.spec.ts` — `home-parity.spec.ts` düzeninde iskelet:
  4 çözünürlük × 2 tema matrisi tanımlanır, testler `test.fixme` ile işaretlenir; her şerit
  kendi bölümünü açar.
- i18n: `server.*` ağacının iskeleti `tr.ts` ve `en.ts`'e eklenir (bölüm başlıkları + menü satırları).
  Bugünkü `serverSettings.*` anahtarlarının listesi rapora çıkarılır (Ş11–Ş13 taşıyacak).

---

## Sınırlar

- **UI yazılmaz.** Bileşen dosyasına dokunulmaz.
- Yeni yetki anahtarı, yeni tema sınıfı, yeni hex, yeni sanallaştırıcı üretilmez.
- Mobil ekran dosyaları değişmez.
- Migration başka klasöre yazılmaz.

---

## Kabul kriterleri

- [ ] İki kolon eklendi, yerel DB'de migration koştu, `schema-server-screen.test.mjs` yeşil.
- [ ] Yeni şemalar + K6 daraltması (veya "bloke" raporu) `workspace.test.ts` ile kanıtlı.
- [ ] `SERVER_METRICS` §2–§8'in tüm bloklarını taşıyor; sözlükte renk yok; K1 sapması yorumlu.
- [ ] `permission-groups.ts` 18 yetkiyi mevcut anahtarlara eşliyor, 3 hazır ayar testli.
- [ ] `discovery-tag-groups.ts` 5 grup × 4 etiket; `channel-visibility.ts` ve
      `server-slow-mode.ts` saf + testli.
- [ ] `--accent-2` iki temada da tanımlı.
- [ ] `parity.test.ts` yeşil; `server-parity.spec.ts` iskeleti mevcut.
- [ ] `pnpm --filter @wizards/types test`, `@wizards/db test`, `@wizards/web typecheck|lint|test` yeşil.

## Rapor

`raporlar/s0-sozlesme.md` — 00 §11 düzeninde. K6 tarama sonucu ve `serverSettings.*` anahtar listesi
**mutlaka** rapora girer.

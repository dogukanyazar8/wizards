# Dalga 0 raporu — sözleşme

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Dört şerit de tamamlandı. Kapı yeşil.

---

## Ş0.1 — Ölçü sözlüğü + `--info` token

| Dosya                                       | Durum                                                               |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/src/lib/mentions/metrics.ts`      | yeni — 10 bölüm, ~280 ölçü                                          |
| `apps/web/src/lib/mentions/metrics.test.ts` | yeni — 19 test                                                      |
| `apps/web/src/app/globals.css`              | `--info`, `--info-foreground`, `--info-soft`, `--info-readable`     |
| `apps/web/eslint.config.mjs`                | arbitrary px kapsamına `components/mentions/**` + `lib/mentions/**` |
| `apps/web/scripts/eslint-config.test.mjs`   | kapsam iddiası                                                      |

Sözlük bölümleri: `shell` · `sidebar` · `feedHeader` · `feed` · `card` · `cardMenu` · `replyBox` ·
`contextPanel` · `settingsModal` · `emptyState` + `MENTIONS_DENSITY`.

**`--info` nereye kondu:** durum tonlarının (`--danger`/`--success`/`--warning`) yanına, `:root`
bloğuna. Tasarımın verdiği `hsl(199 89% 48%)` iki temada da aynıdır; kardeşleri gibi tema
bloklarında tekrar tanımlanmaz. `@theme inline` haritasına eklenmedi — `--success` ve `--warning`
da orada değil, Tailwind renk yardımcısı olarak kullanılmıyorlar.

**SPEC ↔ HTML sapmaları: 3 kayıt, hepsi "SPEC sessiz" türünden.** Mesajlar paketindeki gibi
sayısal çelişki **çıkmadı**; SPEC-BAHSEDILMELER doğrudan `Bahsedilmeler.dc.html`ten çıkarılmış ve
kontrol edilen ~120 değerin hepsi tutuyor. Kayıtlar:

| Alan                          | HTML    | SPEC                         |
| ----------------------------- | ------- | ---------------------------- |
| `sidebar.kindRowPillFontSize` | 11      | vermiyor                     |
| `card.kindBadgeLetterSpacing` | `.02em` | vermiyor                     |
| `emptyState.buttonPaddingX`   | 17      | yalnız height/radius veriyor |

**Arbitrary px kapsamı kod yazılmadan önce açıldı.** Mesajlar paketinde kapsam Dalga 3'te
açılmış ve 152 değer sonradan taşınmıştı; bu pakette kural ilk satırdan itibaren geçerli.

---

## Ş0.2 — Migration + Prisma şeması

| Dosya                                                                                   | Durum                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------ |
| `packages/db/prisma/schema.prisma`                                                      | 4 enum, 2 yeni model, 3 model genişletmesi |
| `packages/db/prisma/rebaseline-migrations/20260821120000_mentions_screen/migration.sql` | yeni                                       |
| `packages/db/prisma/schema-mentions-screen.test.mjs`                                    | yeni — 28 test                             |
| `packages/db/package.json`                                                              | yeni testi `test` betiğine kaydetti        |
| `packages/db/scripts/schema-index-audit.test.mjs`                                       | `MessageMention` indeks kümesi + gerekçe   |

Enumlar: `MentionKind` (`SELF`/`ROLE`/`THREAD`) · `MentionStateSource`
(`CHANNEL`/`DM`/`EVERYONE`/`THREAD`) · `DesktopMentionMode` · `ThreadFollowOrigin`.

Modeller: `MentionState` (okundu / sonra oku / kaldırıldı, `@@unique([userId, source, refId])`) ·
`ThreadFollow` (`@@unique([userId, parentMessageId])`, `mutedAt` ile kapatma).

Genişletmeler: `MessageMention.kind + roleId` · `DMMessageMention.kind` ·
`UserNotificationSettings` +7 alan.

**`@herkes` için tablo yazılmadı.** Plan `MassMention` öngörüyordu; kodu okurken
`Message.mentionEveryone` kolonunun **zaten** gönderimde (`message-service.ts:835`) ve
düzenlemede (`:1022`) yazıldığı görüldü — geçmiş veri dahil dolu. Yeni tablo bir kolonun
kopyası olurdu. Karar K2'nin gerekçesi (üye başına satır yazmamak) aynen korunuyor, maliyeti
sıfıra indi. `00-ortak-baglam.md` K2 maddesi bu bulguyla güncellendi.

**Geri doldurma yok, bilerek.** Mevcut bahsetme satırlarının hepsi kullanıcı adı eşleşmesinden
geldiği için `SELF` varsayılanı geçmişi doğru anlatıyor; `MentionState` boş başlıyor ve okunma
durumu bir bahsetmeye dokunulana kadar `Notification` satırından okunmaya devam ediyor.

**İndeks denetimi genişletildi.** `MessageMention` iki yeni indeks aldı ve
`schema-index-audit.test.mjs` bunları gerekçesiyle kayda geçirdi:
`[userId, kind, createdAt]` (tür daraltması) ve `[roleId]` (`onDelete: SetNull` taraması).
`@everyone` dalı için kısmi indeks ham SQL ile:
`Message_mentionEveryone_channelId_createdAt_idx ... WHERE "mentionEveryone" = true`.

**Migration yerel veritabanında koştu:** `wizards@localhost:5432`, `migrate status` →
`Database schema is up to date!`. UAT/prod'a uygulanmadı.

---

## Ş0.3 — `@wizards/types` sözleşmeleri + rota ayrıştırıcıları

| Dosya                                         | Durum                                               |
| --------------------------------------------- | --------------------------------------------------- |
| `packages/types/src/mentions-screen.ts`       | yeni — şemalar, kimlik yazımı, UI indirgeyicisi     |
| `packages/types/src/mentions-screen.test.ts`  | yeni — 17 test                                      |
| `packages/types/src/index.ts`                 | ihraç satırı                                        |
| `apps/web/src/lib/mentions/routes.ts`         | yeni — URL durumu                                   |
| `apps/web/src/lib/mentions/routes.test.ts`    | yeni — 14 test                                      |
| `apps/web/src/lib/mentions/contracts.ts`      | yeni — `MentionCardProps`, tonlar, sayı okuyucuları |
| `apps/web/src/lib/mentions/contracts.test.ts` | yeni — 9 test                                       |

**Bahsetme kimliği bileşik.** Akış dört kaynaktan besleniyor ve iki kaynağın kimliği
çakışabilir; her bahsetme `(source, refId)` çiftiyle adreslenir, tel üzerinde
`"<source>:<refId>"` yazılır (`formatMentionId` / `parseMentionId`). Ayrıştırıcı yalnız ilk iki
nokta üst üsteyi ayraç sayar, tanınmayan kaynağa düşmez.

**Durum disiplini indirgeyicide.** SPEC §2'nin "aynı anda tek menü, tek yanıt, tek panel"
kuralı `mentionsUiReducer` içinde tek yerde; `Esc` en içteki katmanı kapatır
(modal → menü → yanıt → panel).

**Plandan iki sapma:**

1. Sekme ve ray satırı sayıları düz alan adı değil, **okuyucu fonksiyon** oldu
   (`readMentionTabCount`, `readMentionKindRowCount`). Sebep: `Rol · @herkes` sekmesi iki türü
   birden sayıyor (tasarım örneğinde 2 rol + 1 `@herkes` = 3) ve `DM` sekmesi sayısını
   `bySource` haritasından alıyor. Düz anahtar bu iki durumu anlatamıyordu.
2. `MentionsUiState`/`mentionsUiReducer` `apps/web` yerine `@wizards/types` içinde — React
   bağımlılığı taşımıyor ve mobil tarafın da aynı kuralı okuyabilmesi için.

---

## Ş0.4 — i18n sözlüğü

| Dosya                                                  | Durum                           |
| ------------------------------------------------------ | ------------------------------- |
| `apps/web/src/lib/locale/messages/tr.ts`               | +137 anahtar                    |
| `apps/web/src/lib/locale/messages/en.ts`               | +137 anahtar                    |
| `apps/web/src/lib/locale/mentions-screen-copy.test.ts` | yeni — 7 test, 60 cümle birebir |

Eski ekranın 9 anahtarı (`mentions.filter.*`, `mentions.empty`, `mentions.emptyHint`,
`mentions.markAllRead`, `mentions.title`, `mentions.unreadCount`) **korundu** — Dalga 2 / Ş5
`mentions-screen.tsx` dosyasını silene kadar kullanımdalar. Test bunu açıkça doğruluyor.

**Plandan bir sapma:** yanıt kutusunun kısayol ipuçları tek anahtar (`Enter gönder`) yerine
ikişer anahtara bölündü (`hint.sendKey` = `Enter`, `hint.send` = `gönder`). Sebep: tasarım tuş
adını **kalın**, eylemi normal yazıyor; tek dizede bunu yapmak ya biçimlendirmeyi kaybettirir ya
JSX'e metin gömdürür. Tuş adları çevrilmez.

**SPEC'te olmayıp eklenen 8 metin** (hepsi rapora tabi, Dalga 2 şeritleri kullanacak):
`mentions.empty.filtered` · `mentions.settings.quiet.titleOff` · `mentions.settings.dirtyWarning` ·
`mentions.settings.saveError` · `mentions.card.threadClosed` · `mentions.kind.role.subtitleEmpty` ·
`mentions.toast.*` (7 satır) · `mentions.a11y.*` (3 satır).

---

## Kapı çıktısı

```
pnpm --filter @wizards/db  db:generate   ✔ Generated Prisma Client (7.9.1)
pnpm --filter @wizards/web typecheck     ✔ (çıktı yok)
pnpm --filter @wizards/web lint          ✔ 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test          ✔ 3695 pass · 0 fail · 1 skip (3696 test, 852 suite)
pnpm --filter @wizards/types test        ✔ 452 pass · 0 fail
pnpm --filter @wizards/db   test         ✔ 81 pass · 0 fail
pnpm --filter @wizards/db   db:migrate:deploy → 20260821120000_mentions_screen uygulandı
pnpm --filter @wizards/db   db:migrate:status  → Database schema is up to date!
```

Yeni test sayısı: **67** (metrics 19 · routes 14 · contracts 9 · i18n 7 · types 17 ·
şema 28 — şema testleri db paketinde sayılıyor).

## Dalga 1'e devredilen notlar

1. **`@everyone` dalı `Message.mentionEveryone` okur** — Ş2 tablo yazmaz, yalnız bildirim üretir;
   Ş3 sorgu dalını bu bayraktan kurar.
2. **`MentionState` tembeldir.** Ş3'ün birleşik okuma kuralı:
   `unread = (MentionState.readAt IS NULL) AND COALESCE(Notification.read, TRUE) = FALSE`.
   Satır yoksa `Notification` belirler.
3. **`desktopNotifications` bir sürüm daha duruyor.** Ş4 okuma yolunu `desktopMentionMode`
   üzerine taşır ama eski kolonu düşürmez.
4. **`suppress*` ters mantığı yalnız Ş4'ün servis katmanında çözülür** — route ve bileşen
   `!suppress` yazmaz.
5. **Ray `client.ts` sınırı:** Ş1 yalnız `mentionsQueryKeys` + sayaç sorgusunu yazar ve
   `// Ş3` yorum sınırı bırakır; Ş3 dosyanın kalanını yazar.
6. **Web'de hâlâ genel toast altyapısı yok** — Ş8'in ilk işi (`components/ui/toast.tsx`).

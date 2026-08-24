# Dalga 0 · Sözleşme katmanı — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

Dört şerit de uygulandı. Şeritler paralel koşacak şekilde tasarlanmıştı; bu turda tek oturumda
sırayla koşuldular (Ş0.1 → Ş0.2 → Ş0.3 → Ş0.4), dosya kümeleri yine ayrık kaldı.

---

## Ne yapıldı

### Ş0.1 — Ölçü sözlüğü, denetim, lint

- `lib/messages/metrics.ts` — 11 bölgelik ölçü sözlüğü, `Mesajlar.dc.html` inline stillerinden
  çıkarıldı. Renk taşımaz; `lib/home/metrics.ts`'in `pxToRem` / `pxToEm` / `hairline` fonksiyonlarını
  yeniden dışa verir, ikinci bir dönüştürücü yazmaz.
- `lib/messages/density.ts` — SPEC'in `--m-pad` / `--m-gap` / `--act` değişkenlerini mevcut
  `InterfaceDensity` tercihinden türetir; `MESSAGES_DENSITY_BY_SCALE` ölçek adımı başına satır
  sayısını verir.
- `lib/messages/audit-budget.ts` — **plandan sapma**, aşağıda §"Sözleşme değişikliği" altında.
- `eslint.config.mjs` — `src/components/messages/**` ve `src/lib/messages/**` arbitrary-px
  kuralının kapsamına girdi; `scripts/eslint-config.test.mjs` bunu doğruluyor.
- `HOME_METRICS.panel` daraltıldı (karar #2): 272 → 228, nav satırı 14.5 → 14, sunucu satırı
  13.5 → 13, dört yatay padding bir birim daraldı.

### Ş0.2 — Migration ve şema

`rebaseline-migrations/20260820120000_messages_screen/migration.sql` + `schema.prisma`:

| Değişiklik                                      | Ayrıntı                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `GroupHistoryVisibility.LAST_7D`                | `LAST_24H`'tan sonra eklendi; `LAST_24H` **korundu**                  |
| `FriendsSort` enum + `UserSettings.friendsSort` | varsayılan `STATUS`                                                   |
| `DMPinnedMessage`                               | tek sabitten taşıma yapan backfill ile; `pinnedMessageId` düşürülmedi |
| `Poll` / `PollOption` / `PollVote`              | `CHECK (num_nonnulls(dmMessageId, messageId) = 1)` dâhil              |

`prisma/schema-messages-screen.test.mjs` (19 test) dördünü de kilitliyor ve `packages/db`
test betiğine kaydedildi.

### Ş0.3 — `@wizards/types`

- **Yeni:** `poll.ts` (taslak, yazma/okuma şemaları, yüzde hesabı, iyimser oy),
  `voice-message.ts` (dBFS ölçeği, kova, kodlama, süre), `messages-screen.ts` (durum indirgeyici,
  §11 DTO'ları, sıralama, hızlı başla).
- **Değişen:** `GROUP_DM_MAX_PARTICIPANTS` 32 → 250; `GROUP_AVATAR_COLORS` 5 hex → 6 token adı
  (+ legacy eşleme, ton, HSL); `GroupHistoryVisibilitySchema` += `LAST_7D`;
  `createInitialGroupCreateState()` varsayılanları (`ALL`, davet açık); `canSubmitGroup` ad ister;
  `GroupCreateRequestBody.name` zorunlu.
- Yeni testler: 25 (anket) + 22 (sesli mesaj) + 20 (ekran durumu) = 67.

### Ş0.4 — i18n

`messages.*` altında **230 anahtar**, TR + EN. `lib/locale/messages-screen-copy.test.ts` SPEC'te
birebir verilen 130+ cümleyi karakter karakter doğruluyor, iki dilin yer tutucularının
eşleştiğini kontrol ediyor.

---

## Sahiplenilen dosyalar (yazılan)

```
apps/web/eslint.config.mjs
apps/web/scripts/eslint-config.test.mjs
apps/web/src/lib/home/metrics.ts                     (panel bloğu + navRow)
apps/web/src/lib/home/metrics.test.ts
apps/web/src/lib/locale/messages/tr.ts
apps/web/src/lib/locale/messages/en.ts
apps/web/src/lib/locale/messages-screen-copy.test.ts (yeni)
apps/web/src/lib/messages/{metrics,density,audit-budget}.ts + testleri  (yeni)
packages/db/package.json
packages/db/prisma/schema.prisma
packages/db/prisma/schema-messages-screen.test.mjs   (yeni)
packages/db/prisma/rebaseline-migrations/20260820120000_messages_screen/migration.sql (yeni)
packages/types/src/{poll,voice-message,messages-screen}.ts + testleri   (yeni)
packages/types/src/{group-dm,group-dm-settings,group-dm-selection,index}.ts
packages/types/src/{group-dm,group-dm-settings,group-dm-selection}.test.ts
apps/web/src/app/api/v1/dm/groups/route-logic.test.ts
apps/web/src/app/api/v1/mobile/dm/groups/route-logic.test.ts
apps/web/src/components/dm/group-create-dialog.test.tsx
apps/web/src/lib/dm/{group-service,group-invite-service}.test.ts
apps/mobile/src/app/mobile-group-chat-model.ts        (LAST_7D dalı)
apps/mobile/src/locale/mobile-copy.ts                 (groupHistory7d, TR + EN)
apps/mobile/scripts/mobile-group-client.test.ts
```

---

## Sözleşme değişikliği — Dalga 1 ve 2 bunu okuyacak

### 1. Denetim borcu `skip` yerine **büyümeyen bütçe** ile tutuluyor

Plan (`01-dalga0-sozlesme.md` §Ş0.1.4) kapsamı `HOME_*_AUDIT_SCOPE` dizilerine eklemeyi ve testi
Dalga 3'e kadar `skip` etmeyi söylüyordu. **Uygulanmadı**, çünkü `skip` hiçbir şeyi korumaz: yeni
yazılan her satır borca eklenebilirdi ve kimse fark etmezdi.

Yerine `lib/messages/audit-budget.ts`: kapsam başına ölçülmüş tavan, iki yönlü test. Sayı artarsa
kırılır (yeni borç girmez), azalırsa da kırılır ve bütçeyi düşürmeyi ister (kapanan borç sessizce
yeni bir sapmaya yer açmaz).

Ölçülen borç (2026-08-20):

| Kapsam                | token | metin |
| --------------------- | ----- | ----- |
| `components/chat`     | 17    | 5     |
| `components/dm`       | 2     | 0     |
| `components/friends`  | 8     | 0     |
| `components/messages` | 0     | 0     |
| `lib/messages`        | 0     | 0     |

Dökümü: `image-lightbox` 7 hex + 1 `text-slate-*`, `message-input` 5 `text-slate-700`,
`message-attachments` 2 `rgba()` + 1 `text-slate-950`, `gif-picker` 1 `text-slate-700`,
`friends-view` 6 emerald/amber + 1 `hsl()`, `friend-card` 1 `hsl()`, `dm-conversation` ve
`dm-sidebar` birer `hsl()`. Metin tarafında `message-item`'ın kod bloğu kopyala etiketleri
(2, gerçek sapma — i18n bekliyor) ve markdown anket ayrıştırıcısının Türkçe anahtar kelimeleri
(3: `gün`, `Süre`, `dakika` — ekrana çıkmaz, girdi dilbilgisidir).

**Dalga 1/2 şeritleri kendi dosyalarındaki sapmayı kapatırken bütçe satırını da düşürür.**
Dalga 3 hepsini sıfıra indirip kapsamı kalıcı denetime taşır.

### 2. `PollDuration` DB enum'u yazılmadı

Plan `enum PollDuration { H1 D1 D3 }` diyordu. Şemaya girmedi: veritabanı **çözülmüş anı**
(`closesAt`) tutuyor. Birimi de saklamak "bu anket kapandı mı" sorusuna ikinci bir cevap
yaratırdı. Birim yalnız `@wizards/types`'ta, bestekârın seçtiği şey olarak duruyor.

### 3. Sesli mesaj için migration gerekmedi

`Attachment.duration` (Float?) ve `Attachment.waveform` (String?) **zaten vardı** ve `waveform`
hiçbir yerde yazılmıyordu — mobil oynatıcı çubukları ek kimliğinin hash'inden türetiyor. Kolon
tipini `Int[]`'e çevirmek canlı bir veritabanında boş bir kolonu yıkmak olurdu ve zod'un zaten
verdiğinden fazlasını getirmezdi. Kodlama `voice-message.ts`'te: virgülle ayrılmış 0–100
tamsayılar, en çok 64 kova.

### 4. Gezinme paneli daralması Etkinlikler ekranını da kapsıyor

`HOME_METRICS.sideScreens.dayPanelWidth` panel genişliğine **bilerek** bağlıydı ("gün paneli
navigasyon panelinin genişliğinde; ikinci bir genişlik uydurulmadı") ve mevcut test eşitliği
zorluyordu. Kuralı koruyup daralmayı ona da uyguladım: gün paneli 272 → 228.
**Bu bir varsayımdır** — Etkinlikler ekranı bu paketin kapsamı dışında. Farklı isteniyorsa
bağın kopması ve `dayPanelWidth`'in 272'de sabitlenmesi gerekir; söyleyin, geri alayım.

### 5. Dalga 1'in dosya listesinden bir madde Ş0.1'e taşındı

`02-dalga1-s1` şeridi `lib/home/metrics.ts`'i "yalnız panel.width + iki font boyutu" için
sahipleniyordu. Daralma bir **sözlük** değişikliğidir ve Ş0.1'e ait; orada yapıldı. Ş1 artık
`lib/home/metrics.ts`'e dokunmaz, yalnız okur ve Ana Sayfa parity anlık görüntülerini yeniler.

### 6. Mobil uygulamada üç dosya değişti

Karar #3/#4/#9 `@wizards/types`'ı değiştirdiği için mobil **derlenmez** hâle gelmişti. Asgari
onarım yapıldı: `formatHistoryLabel` `LAST_7D` dalını aldı, `groupHistory7d` kopyası iki dile
eklendi, bir istemci testi ad alanını taşıdı. Mobil ekran tasarımına dokunulmadı.

---

## Kapı çıktısı

```
pnpm db:generate                    ✔ Prisma Client 7.9.1
pnpm typecheck                      ✔ 5/5 paket
pnpm lint                           ✔ 5/5 paket (eslint-config 10/10)
pnpm --filter @wizards/types test   ✔ 429 / 429
pnpm --filter @wizards/db test      ✔ 25 + 51, 0 fail
pnpm --filter @wizards/web test     ✔ 3311 / 3311
graphify update .                   ✔ 28137 düğüm, 66197 kenar
```

`pnpm format` deposun tamamında 114 dosya bildiriyor; bunların çoğu bu paketten **önce** vardı
(taban `a50db1ad`, önceki paketlerin commit edilmemiş işi). Bu turda dokunulan 20 dosya
prettier'dan geçirildi.

---

## Açık kalanlar

- **Migration koşulmadı.** UAT veritabanına dışarıdan bağlanılamıyor
  (`reference_railway_uat_migration_check`). `20260820120000_messages_screen` ilk dağıtımda
  `db:migrate:deploy` ile uygulanacak. Backfill'in taşıdığı satır sayısı ancak orada ölçülebilir.
- **`ALTER TYPE ... ADD VALUE` transaction içinde.** PostgreSQL 18 kullanılıyor ve yeni değer aynı
  dosyada **kullanılmıyor**; aynı kalıp `20260811150000_group_invite_disappearing` migration'ında
  zaten var.
- **Mobil grup kurma ekranında ad artık zorunlu.** `canSubmitGroup` mobilde de bu kuralı uygular;
  mobil ekranın "Grubu oluştur" butonu boş adda pasifleşecek ama ekran **bunu kullanıcıya
  söylemiyor**. Mobil tarafın kendi paketinde bir uyarı metni gerekiyor — Ş8 raporunda kapatılacak
  (`09-dalga2-s8` §Rapor).
- **`GROUP_AVATAR_COLORS` artık token adı taşıyor**, ama `DMConversation.avatarColor` kolonu
  `VarChar(7)`. Altı adın en uzunu 7 karakter (`primary`, `success`, `warning`) — **tam sınırda**.
  Yeni bir swatch adı 7 karakteri geçerse sessizce kesilir. Ş2 grup kurma ucuna dokunurken kolonu
  `VarChar(16)`'ya genişletmeli.

---

## Karar gerektiren

1. **Etkinlikler gün paneli 272 → 228 daraldı** (yukarıda §4). Bağ korunsun mu, kopsun mu?
2. **`avatarColor` kolonu `VarChar(16)`'ya genişletilsin mi?** Bugün çalışıyor ama payı yok.

# 04 — S4: Topluluk yönetimi + biriken borçlar

Önce `00-ortak-baglam.md` oku. `03` ve `03b` bitmiş olmalı.

Son dalga. Kurucu ekibin topluluk sunucularını yönettiği yüzey, artı S1–S3 boyunca bilinçli ertelenen borçların kapatılması.

Bu prompt tek geçişte uygulanır. Sıra: **A → B → C** (yazma yolu, sonra sıralama, sonra UI), **D ve E** bağımsız.

---

## S1–S3'ün bıraktığı durum — tüket, yeniden keşfetme

**Yazma yolu, halihazırda:**

| Metot    | Yol                                | Not                                         |
| -------- | ---------------------------------- | ------------------------------------------- |
| `GET`    | `/api/v1/admin/servers`            | liste, `server.read`                        |
| `POST`   | `/api/v1/admin/servers`            | COMMUNITY yazabilen tek yol, `server.write` |
| `DELETE` | `/api/v1/admin/servers/[serverId]` | `server.write`                              |

İş mantığı `apps/web/src/app/api/v1/admin/servers/route-logic.ts` içinde, DI'lı: `createAdminServer`, `deleteAdminServer`. **`PATCH` yok** — Bölüm A onu ekliyor.

**Admin konsolu:** `apps/web/src/components/admin/sections/admin-servers.tsx` — sıfır `useMutation`, sıfır `onClick`. Tamamen salt okunur liste. Bölüm C ona eylem veriyor.

**Sayaç onarımı:** `recomputeServerMemberCount` (`apps/web/src/lib/workspace/server-member-counter.ts`) yazıldı ama **hiçbir yerden çağrılmıyor**. Bölüm D onu bağlıyor.

**Keşif index'i — dikkat.** S1'in eklediği `@@index([type, discoverable, memberCount])` keşif sorgusuna hizmet **edemiyordu**; `EXPLAIN` sequential scan gösterdi. S3 yerine `[discoverable, isPublic, memberCount]` ekledi (migration `20260808120000_server_discovery_index`) ve üç sorgu varyantında `Index Scan Backward` doğruladı. **Bölüm B sıralamayı değiştirdiğinde bu index'in hâlâ kullanıldığını yeniden ölç.** S1'in eski index'inin gerçek amacı belirsiz kaldı — silinmedi.

**Test taban çizgileri:** web `2032/2032`, mobil node `1667/1667`, mobil jest `1169/1169` (128 suite), `packages/types` yeşil.

---

## Bağlayıcı kararlar

1. **Yönetim yüzeyi admin konsolundadır.** `apps/web/src/app/admin/` zaten duyarlı; tek ekran web + desktop + mobil tarayıcıyı kapsar. **Mobil uygulamaya topluluk yönetim ekranı eklenmez.**
2. **Terfi ve indirme iki yönlüdür, ama denetlenir.** `PERSONAL → COMMUNITY` ve tersi; ikisi de `server.write` kapısından geçer ve `writeAdminAuditLog`'a yazar.
3. **Terfi yan etkileri sessiz uygulanmaz.** `PERSONAL → COMMUNITY` yaparken `isPublic` zorla `true` (şema `.refine()`'ı zaten şart koşuyor). `COMMUNITY → PERSONAL` yaparken `discoverable` zorla `false` — aksi halde artık topluluk olmayan bir sunucu keşifte kalır. **İki zorlamayı da servis katmanında yap ve test et**, UI'da değil.
4. **Öne çıkarma yeni kolon istemez.** `features` dizisi zaten var ve `"VERIFIED"` orada tutuluyor. Öne çıkarma için `"FEATURED"` aynı diziye girer. **Yeni migration yazma.**

---

## Bölüm A — Terfi ve indirme

**Teslim:**

- `PATCH /api/v1/admin/servers/[serverId]` — `type`, `isPublic`, `discoverable`, `verificationLevel`, `features` alanlarını yönetir.
- Yeni zod şeması `packages/types/src/workspace.ts`'e.
- İş mantığı `route-logic.ts`'te DI'lı, mevcut `createAdminServer` / `deleteAdminServer` desenini izler. Transport `route.ts`'te kalır.
- Karar 3'teki iki zorlama servis katmanında.
- `apps/web/src/app/api/v1/admin/admin-route-capability.test.ts`'e kayıt.

**Bu dosyada üç kapalı liste seni bekliyor** (`00 §4`; ikisi derleyiciden kaçar, yalnız test koşunca çıkar):

- `apps/web/src/lib/api-rate-limit.ts` — eylem adları kapalı union
- `apps/web/src/lib/api-rate-limit.test.ts` — `M1_MOBILE_RATE_LIMITS` (yalnız mobil uç eklersen)
- `apps/web/src/app/api/v1/route-contract.test.ts` — sabit kodlanmış M1 rota sayacı (yalnız mobil uç eklersen) ve `:1327`'nin "her mutasyon rotası `parseJsonBody` kullanır ya da gövdesiz kaydedilir" kuralı

Ayrıca: `packages/types`'a **yeni şema** eklemek `assertSchemaBehaviorCoverage`'a (`packages/types/src/workspace.test.ts`) fixture ister, yoksa o test kırmızıya döner.

**Ve en önemlisi — dördüncü tekrardan kaçın.** Bu projede "en az bir alan değişti mi" yüklemleri alanları tek tek sayıyor ve sözleşmeye alan eklenince güncellenmiyor. Aynı hata **üç kez** çıktı: `UpdateServerSchema.refine()` (S1), `hasMobileServerUpdate` (S3), ve `03b`'nin denetlediği yerler. `PATCH` şeman böyle bir yüklem taşıyacaksa **alan listesini şemanın anahtarlarından türet**, elle sayma.

## Bölüm B — Doğrulama rozeti ve öne çıkarma

**Teslim:**

- `features` dizisine `"VERIFIED"` / `"FEATURED"` ekleme-çıkarma, aynı `PATCH` ucundan.
- Keşif sıralaması: `FEATURED` taşıyanlar üstte. `orderBy` iki anahtarlı olur.
- **`EXPLAIN` ile index'in hâlâ kullanıldığını kanıtla.** Postgres `features` dizisi üzerinde sıralama yapamaz — muhtemelen ya ayrı bir boolean kolon ya bir kısmi index gerekecek. **Tahmin etme, ölç, sonra karar ver.** Sequential scan çıkarsa ya sıralamayı basitleştir ya index'i genişlet; hangisini seçtiğini ve neden seçtiğini rapora yaz.
- Profil kartındaki doğrulama rozeti zaten `features.includes("VERIFIED")` okuyor — ek iş yok.

## Bölüm C — Admin konsolu ekranı

`admin-servers.tsx` şu an salt okunur.

**Teslim:**

- Topluluk sunucusu oluşturma formu — `POST /api/v1/admin/servers` zaten var, UI yok.
- Satır eylemleri: terfi/indir, doğrula/kaldır, öne çıkar/kaldır, sil.
- Silme onayı sunucu adını yazdırır — `deleteWorkspaceServer`'daki mevcut `confirmationName` deseniyle tutarlı.
- Denetim izi görünür: her eylemden sonra kim, ne zaman.

Mevcut admin bölüm bileşen desenini izle. **Yeni tasarım sistemi kurma.**

## Bölüm D — `memberCount` sapma onarımı

**Teslim:**

- Bakım scripti — `apps/web/scripts/` altında, `tsx` ile koşan mevcut bakım scriptleri desenine uy (`maintenance:*` script'leri örnektir). Tüm sunucuları tarar, sapanları düzeltir, raporlar.
- Admin konsolunda tek sunucu için "sayacı yeniden hesapla" düğmesi.
- **Zamanlanmış iş kurma.** Script elle koşulur. Sapma nadirse cron gereksiz karmaşıklıktır; ölçüm sapma gösterirse ayrı iş olarak değerlendirilir.

## Bölüm E — Biriken borçlar

S1–S3 boyunca kaydedilen küçük bulgular. Hepsi ucuz; burada kapanır:

1. `verificationLevel` varsayılanı ve geçersiz kılması hiçbir testte doğrulanmıyor.
2. COMMUNITY sunucuyu **gerçek çağrı yerlerinden** (`updateWorkspaceServer`, `deleteWorkspaceServer`) geçiren uçtan uca kapı testi yok — kapılar yalnız doğrudan test ediliyor, yanlış değişken geçirilse yakalanmaz.
3. `getAccessContext` (`apps/web/src/lib/workspace/access-context.ts:39-55`) sunucu satırını zaten yüklüyor ama `type`'ı seçmiyor. Tek kelimelik `select` eklemesi `updateWorkspaceServer` ve `deleteWorkspaceServer`'daki iki ek `findUniqueOrThrow` gidiş-dönüşünü kaldırır. `AccessContext` paylaşılan sözleşme — değişiklik eklemeli, ama tüm tüketicileri typecheck ile doğrula.
4. Toplu azaltma testi `/GREATEST/` iddia ediyor ama her iki `serverId`'nin gerçekten sorguya girdiğini doğrulamıyor.
5. `describe("createAdminServer")` bloğu iki şema-only test içeriyor; adı yanıltıcı. Kendi bloğuna ayır.
6. `getActiveServerMemberUserIds` hâlâ `fetchSockets` tabanlı, `getOnlineServerMemberCount` Redis tabanlı. İkisinin bayatlık karakteri farklı. **Aynı kaynağa çekmenin maliyetini ölç**; ucuzsa çek, değilse farkı belgele.
7. `graphify update .` S1'den beri koşulmadı — `graphify-out/**` yasağı ile kök `CLAUDE.md` talimatı çelişiyordu. **Dalga sonunda bir kez koş.**

---

## Yapılmayacaklar

- Topluluk sunucusu için ayrı rol/izin sistemi — mevcut rol sistemi yeter
- Sunucu kategorileri/etiketleri — talep gelmeden yazılmaz
- Moderasyon kuyruğuna topluluk-özel akış — mevcut `ModerationCase` altyapısı yeter
- Analitik panosu — mevcut admin analitiği yeter
- Mobil uygulamada topluluk yönetim ekranı (karar 1)
- Öneri/kişiselleştirme algoritması — sıralama `FEATURED` sonra `memberCount desc`, o kadar

## Kapı

`00 §5`'teki biçim — `pwsh` yok, mutlak yol şart:

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Standard
```

Mobil kod değiştiysen (E/6 seni oraya götürebilir) mobilin **iki ayrı süiti**:

```
pnpm --filter @wizards/mobile test
```

```
pnpm --filter @wizards/mobile test:components
```

Ek kanıt: `EXPLAIN` çıktısı (Bölüm B'nin sıralamasıyla), bakım scriptinin kuru koşum çıktısı.

## Teslim listesi

- [ ] A: `PATCH` ucu, terfi/indirme, iki zorlama servis katmanında, capability + kapalı liste kayıtları, yüklem şema anahtarlarından türetildi
- [ ] B: `VERIFIED`/`FEATURED` yönetimi, sıralama + `EXPLAIN` kanıtı + seçim gerekçesi
- [ ] C: admin konsolu oluşturma formu + satır eylemleri + denetim izi
- [ ] D: sapma onarım scripti + tekil düğme (cron yok)
- [ ] E: yedi borcun tamamı
- [ ] Kapı yeşil

## Rapor

`docs/prompts/sunucu-tipi-gorunurluk/raporlar/04-rapor.md`. Bölüm bölüm ne teslim edildiği, `EXPLAIN` çıktıları, hangi kapalı listeleri güncellemek zorunda kaldığın, E'deki yedi borcun her birinin durumu. Tüm doğrulama komutlarının gerçek çıktısı. **Sapmalar** ve **Eklenmeyenler** bölümlerini doldur.

---

## S4 bittiğinde — kapanış kontrolü

1. Kişisel sunucu açılabiliyor, özel/açık ayarlanabiliyor, keşifte görünüp görünmemesi seçilebiliyor.
2. Topluluk sunucusu yalnız kurucu ekip tarafından açılabiliyor, herkese açık, keşifte.
3. Her sunucunun `serverId` ile açılan profil kartı var, 2g tasarımına uygun, web + mobil.
4. Kullanıcı davet olmadan açık sunucuya katılabiliyor; ban/tavan/kapalı kontrolleri çalışıyor ve özel sunucunun varlığı sızmıyor.
5. `memberCount` ve çevrimiçi sayısı doğru; sapma onarım yolu var.
6. Hiçbir tüketici rotasından `type: COMMUNITY` yazılamıyor.
7. **Görsel parite ölçüldü** — S2 kartı ve S3 keşif ekranı 2g tasarımıyla yan yana kondu. Bu, dört dalga boyunca hiç yapılmadı; sandbox'ta `apps/web/.env` içindeki `DATABASE_URL` boş olduğu için dev server açılmıyordu. Emülatör/tarayıcı kontrolü hâlâ açık.

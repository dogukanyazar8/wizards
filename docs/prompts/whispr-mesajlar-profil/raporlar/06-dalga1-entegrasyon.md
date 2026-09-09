# Dalga 1 — entegrasyon raporu

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** dört şerit bitti, kapı yeşil. Commit atılmadı.

Şerit raporları: `02-rapor.md` (Ş1) · `03-rapor.md` (Ş2) · `04-rapor.md` (Ş3) · `05-rapor.md` (Ş4).

## Kapı

| Komut                                  | Sonuç                                        |
| -------------------------------------- | -------------------------------------------- |
| `pnpm --filter @wizards/web typecheck` | **0 hata**                                   |
| `pnpm --filter @wizards/web test`      | 7929 geçti · **0 hata** · 3 atlandı · exit 0 |
| `pnpm --filter @wizards/types test`    | 623 / 623                                    |
| `pnpm --filter @wizards/db test`       | 158 / 158                                    |
| Dalga 1 dosyalarının izole koşusu      | **319 / 319** (14 dosya, 62 süit, 4 sn)      |

## Ana oturumun kapattığı üç açık

Şeritler paralel koştuğu için üç iş bilerek onlara bırakılmadı; ikisi paylaşımlı dosya, biri
kimsenin sahiplenmediği bir dosyaydı.

1. **`dm:conversation:history_cleared` tip kaydı.** Ş2 olayı yayıyordu ama
   `apps/web/src/lib/socket/events.ts` tip listesinde karşılığı yoktu (o dosya hiçbir şeridin
   sahiplenme listesinde değildi). Payload `{ clearedAt, conversationId }`; sohbet odasına **ve**
   her katılımcının kişisel odasına gidiyor, çünkü sohbeti açık olmayan üyenin ray önizlemesi de
   mesaj listesi kadar bayat.
2. **İki yıkıcı ucun kendi hız sınırı kovası.** `API_RATE_LIMITS` içine
   `dm:group:clear-history` (10 / saat) ve `dm:group:delete` (5 / saat) eklendi;
   `groupProfileDefaults.rateLimits` iki dizesi güncellendi ve Ş2'nin `TODO(rate-limit):` yorumu
   kalktı. Ş2'nin koruyucu testi yeni eşlemeye çevrildi ve **ikinci bir test** eklendi: iki kova
   da paylaşımlı `dm:group:update` bütçesinden **her iki eksende de** (daha az çağrı, daha uzun
   pencere) sıkı olmalı, ve silme temizlemeden sıkı olmalı.
3. **Kova çakışması doğrulandı.** `api-rate-limit.ts` last-write-wins bir dosya ve üç şerit ona
   dokundu. Dört şeridin de anahtarları yerinde: `dm:attachments` (Ş3),
   `mobile:dm:attachments` (Ş3), `user:privacy:read` / `user:privacy:update` / `users:report`
   (Ş4), `dm:conversation:read` + `mobile:dm:details` (Ş1 yeni açmadı, mevcutları kullandı).
   Silinen anahtar yok.

## Ölçüm tuzakları — bir sonraki dalganın bilmesi gerekenler

Bu turda üç kez yanlış ölçtüm. Üçü de kaydedilmeye değer.

1. **`pnpm --filter @wizards/web test | tail -N` yanıltıcıdır.** Çıktıda birden fazla `ℹ fail`
   özeti görünebiliyor; **son** özet toplamdır, ama `tail` kısa tutulursa ara bir özet okunur.
   Doğrusu: çıkışı dosyaya al ve `echo "EXIT=$?"` ile **çıkış kodunu** oku. Bu tur bir kez
   "0 hata" diye rapor ettim, gerçek exit kodu 1'di.
2. **`--test-force-exit` olmadan izole koşu asılır.** `run-node-tests.mjs` bu bayrağı geçiyor;
   elle `node --import tsx --test <dosyalar>` koşarsan `lib/account/privacy-service.test.ts`
   açık bir handle bırakıyor (Ş4'ün 60 sn'lik gizlilik önbelleği) ve süreç bitmiyor —
   500 sn sonra "test failed" diye görünüyor, oysa hiç koşmamış. Bu bir **test sızıntısı**
   işaretidir: zamanlayıcı `unref()` edilseydi bayrak gerekmezdi. Dalga 3 QA'ine devredildi.
3. **`DATABASE_URL`'i gerçek veritabanına verme.** Runner bilerek sahte bir
   `wizards_unit_tests` dizesi geçiyor (PrismaPg import anında dizeyi doğruluyor, pg tembel
   bağlanıyor). `.env`'deki gerçek dizeyi export edersen prisma **gerçekten** bağlanır ve
   izole koşu asılır.

**Eş zamanlı düzenleme uyarısı:** entegrasyon sırasında `apps/web/src/app/settings/layout.tsx`,
`components/providers/authenticated-app-providers.test.ts` ve `lib/desktop/shortcuts.test.ts`
Dalga 1 dışından değişti (dosya zaman damgaları koşularımın arasına düşüyor) ve iki koşu arasında
hata kimliği değişti. Şu anki yeşil, o dosyalar durulduktan **sonraki** ölçümdür. Bir sonraki
kapıda repo sakinken ölç.

## Şeritlerin bıraktığı kararlar

- **Ş1 · K6 nüansı:** "ortak sunucularda en eski `joinedAt`" pratikte erken katılanın satırıdır,
  gerçek tanışma sunucusu değil. SPEC'e sadık kalındı, kod değiştirilmedi.
- **Ş2 · `Grubu sil` yalnız OWNER.** `ADMIN` 403. Ş8 satırı yalnız `viewerRole === "OWNER"` iken
  çizer.
- **Ş2 · Denetim `AdminAuditLog`'a yazılıyor**, `AuditLog`'a değil: `AuditLog.serverId` non-null
  bir `Server` FK'si ve grup DM'in sunucusu yok.
- **Ş3 · `SharedLinkDTO.title` markdown link etiketinden geliyor.** Şemada embed/preview tablosu
  yok; çıplak URL'de `null`. Bu olmadan §15.5'in başlıklı bağlantı satırı hiç çizilemezdi.
- **Ş4 · `notifyLevel` "eski değerine dönemiyor"** — önceki tier'i saklayan kolon yok, sessizlik
  kaldırılınca `ALL` yazılıyor. Ş8'in bildirim radyosu bunu göstermeli.
- **Ş4 · Mobil gizlilik ucu yeni:** `/api/v1/mobile/account/privacy`.

## Dalga 3 QA'ine devredilen üç açık

1. **`historyVisibility: "ALL"` grubunda geçmiş temizlendikten sonra katılan üye taban almıyor**
   — temizlenen geçmişi görebilir. Kapatması `historyClearedAt` kolonu (migration) ister; bu
   paketin kapsamı dışında, ayrı iş.
2. **`privacy-service.test.ts` açık handle bırakıyor** (yukarıda #2). Zamanlayıcı `unref()`.
3. **`route-contract.test.ts` takma adlı `route-logic` import'unu yakalamıyor.** Kod tabanında
   10 tane daha takma adlı import var ve test onlarla yeşil — yani kapı takma adı **yakalamıyor**,
   o rotalar başka yoldan geçiyor. Kural yine de geçerli (rota `route-logic`'i göreli yolla
   import etmeli), ama kapının kendisi eksik.

## Dalga 2 hazır

Dört şeridin sözleşmesi donmuş durumda. Ş5/Ş6/Ş7/Ş8 paralel başlayabilir. Ş5'in ilk işi olan
`dm-details-panel.tsx` silme hedefi `04-rapor.md` içinde satır satır çıkarılmış
(`DmConversationShortcuts` 370–396 **silinmez** — grup paneli onu import ediyor).

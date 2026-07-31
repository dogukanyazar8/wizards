# Ortak bağlam — her dalga promptuna dahildir

## Çalışma kuralları

- Branch: **`uat`**. Başka branch açma.
- **Commit atma.** Kullanıcı açıkça istemeden `git commit` ve `git push` yok.
- Kod, yorum ve commit mesajları **İngilizce**. Sohbet Türkçe caveman ultra.
- Yorumlar *neden*i anlatır, *ne*yi değil. Ölçülen sayıyı yaz: "a device run measured X".
- Dosya düzenlemede **Edit aracını kullan**. Bu repoda CRLF var; `\n` arayan python/sed replace sessizce başarısız oluyor.

## Doğrulama komutları (dalga bitiminde hepsi yeşil olmalı)

```bash
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile exec jest
pnpm --filter @wizards/web test
pnpm format
graphify update .
```

Mobil node testleri tek başına koşar, paralel paket varken OOM (`exit 137`) olur:

```bash
NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @wizards/mobile exec node --test --test-concurrency=1 --import tsx "scripts/*.test.ts"
```

## Test altyapısı tuzakları

- Jest yalnız `component-tests/**/*.test.tsx` topluyor. `.ts` uzantılı dosya koşmaz.
- Node test runner `react-native` transform **edemez**. RN/Expo import eden modülü node testinden import etme — bağımlılığı enjekte et.
- Web testlerinde **DB yok**. Servis mantığı test edilecekse saf modüle çıkar ve enjekte et (`lib/messages/client-nonce.ts` bu desenin örneği).
- RNTL'de `toHaveTextContent` enterpolasyonlu metinde eşleşmiyor; `props.children` üzerinden `toContain` kullan.
- Promise ile state güncelleyen etkileşimi `await act(async () => { ... })` içine al, yoksa güncelleme render'a düşmez.

## Mimari sözleşmeler (ihlal etme)

- `mobile-product-app.tsx` **520 satır altında** kalmalı (`mobile-phase-two-architecture.test.ts`). Container seviyesi action'lar `MobileProductNavigationActions`'a gider, screen prop'una değil.
- Route contract testi yalnız `*route-logic` ile biten import'ları izler.
- Prisma yalnız `packages/db/prisma/rebaseline-migrations` okur.
- Disk ilk görünüm, sunucu/socket gerçek. Hidrasyon yalnız boş akışı doldurur; local-first/oplog yok.
- AsyncStorage'a mesaj içeriği girmez.
- Panel `environment !== "production"` ile kapılı.

## Güvenlik sözleşmeleri (hız için gevşetilmez)

- Hata önceliği korunur: **401 → 403 → 429 → 200**. Yetkisiz istek asla veri sızdırmaz.
- Auth ve permission kontrolü paralel koşabilir, ama **ikisi de** sonuçlanmadan yanıt dönmez.
- SQLCipher fail-closed: `PRAGMA cipher_version` boşsa cache çalışmaz.
- `assertReleaseUrl` development dışı her ortamda çalışır.
- Telemetri hiçbir koşulda mesaj içeriği, e-posta, token taşımaz.

## Ölçüm gerçekleri (2026-07-31 release APK, uat)

```
startup            p95  455   bütçe 2500  ✅
resume             p95  302   bütçe  700  ✅
send-echo          p95   42.9 bütçe   50  ✅
chat-open-cached   p95  461   bütçe  100  ❌ 4.6x
chat-open-network  p95 1347   bütçe  500  ❌ 2.7x
send-ack           p95 1237   bütçe  300  ❌ 4.1x

açılış: bundle 76 → cache-hydrated 154 → auth 168 → first-frame 195
        → navigator-ready 296 → content 420 → interactive 631

sohbet açılışı (dokunuştan): navigated 106 · mounted 104 · content 461
  → mount sonrası ~337ms, sıfır ağ

açık/kaybolan span: 1 · 33
prefetch: 4/4 (sahte — istek bitmeden sayılıyor)
yapı: unknown (buildId config'e hiç yazılmıyor)
```

**Kritik:** `chat-open-*` sayıları yalnız **kanal** açılışlarını içerir. DM listesinde span kapatıcı yok, 10 DM açılışının hepsi kaybolan span'e gitti. DM performansı hakkında hiç verimiz yok.

Railway: web 1 replica / 1 CPU / 2GB, `europe-west4` Amsterdam, sleep kapalı, DB ve Redis aynı bölge. Edge p95: Channel GET 391 · DM GET 337 · Channel POST 394. GET payload p50 ~21KB. Gzip edge'de açık (`Server: railway-hikari`).

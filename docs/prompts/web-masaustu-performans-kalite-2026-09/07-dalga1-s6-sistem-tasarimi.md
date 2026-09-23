# D1 / Ş6 — Sistem tasarımı ve mimari

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/00-baseline.json` var (`M-KOD-cycles`, `M-KOD-lib-to-components`, `M-KOD-route-prisma`).
Tür: **salt okuma.** Yalnız `raporlar/S6.findings.json` + `raporlar/S6-rapor.md`.
Sahiplik: modüller ve süreçler arası yapı — sınırlar, bağımlılık yönü, döngüler, sözleşmeler, durum sahipliği, gerçek zaman teslim modeli, süreç/dağıtım modeli, masaüstü↔web sınırı, gözlemlenebilirlik mimarisi. Dosya içi kalite Ş5'in.

## Amaç

Whispr'ın büyüdükçe yavaşlamaması (hem çalışma zamanı hem geliştirme hızı) için gereken **hedef mimariyi**, bugünkü yapıdan **evrimle** ulaşılabilir adımlar olarak çizmek ve her mimari kuralı **otomatik denetlenebilir** hale getirmek (uygunluk fonksiyonu). Yeniden yazım, mikroservis, framework değişimi önerilmez (00 §9).

## Önceki bulgular (priorStatus zorunlu)

A1-001…A1-006, A6-002, principal F-09 (tasarım boyutu), F-15, F-16 döngüleri, principal "Korunması gereken kararlar" (00 §9) — bunlar hedef mimarinin sabitleridir.

## Tohum

```bash
graphify path "apps/web/src/lib/analytics/service.ts" "apps/web/src/lib/voice/service.ts"
graphify path "apps/web/src/lib/account/privacy-service.ts" "apps/web/src/lib/attachments/scanner.ts"
graphify explain "apps/web/src/lib/socket/context.ts"
graphify explain "AuthenticatedAppProviders()"
graphify explain "jsonError()"
```

```bash
ls apps/web/src/lib
rg -n "from \"@/components" apps/web/src/lib --glob '!*.test.*'
rg -n "from \"@wizards/db\"|prisma\." apps/web/src/app --glob 'route.ts'
rg -n "\"server-only\"|\"client-only\"" apps/web/src
rg -n "__TAURI_INTERNALS__|isTauri|isDesktopApp|isDesktopRuntime" apps/web/src --glob '!*.test.*'
rg -n "process\.env\." apps/web/src --glob '!*.test.*' -c
```

Gerçekler (2026-09-23): `lib/` altında ~60 alan klasörü + ~40 gevşek dosya; `"server-only"` işareti **0** dosyada, `"client-only"` 1; masaüstü algılama 18 yerde; `eslint.config.mjs:48` tek `no-restricted-imports` bloğu.

## Kapsam matrisi

| Birim                                                                                              | Hedef                                                                                          |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/*` alanları                                                                      | %100 — alan başına fan-in/fan-out, dengesizlik (Ce/(Ca+Ce)), döngüye katılım                   |
| Katmanlar: `app/api/**/route.ts` → `route-logic.ts` → `lib/<alan>/*service*` → Prisma/Redis        | %100 desen uyumu sayımı; sapan rotalar listesi                                                 |
| Taşıyıcı ikilikleri (socket handler ↔ REST route-logic)                                            | `lib/socket/handlers/*` %100 — her olayın REST karşılığı ve ortak servis kullanıp kullanmadığı |
| İstemci durum sahipleri (React Query, zustand, context, realtime yamaları)                         | mesaj, okunmamış, presence, ses, bildirim, ayarlar — %100                                      |
| Süreçler: web süreci (HTTP + socket + işçiler), outbox servisi                                     | %100                                                                                           |
| Masaüstü ↔ web sınırı                                                                              | komut/olay sözleşmesi, capability dosyaları, 18 algılama yeri                                  |
| Gözlemlenebilirlik: Sentry (istemci 0.05, sunucu 0.1), log, `workspace-performance`, Server-Timing | %100 envanter                                                                                  |

## Aranacak kusur sınıfları

1. **Döngüler ve ters yön.** D0 `M-KOD-cycles` listesindeki her döngü için: hangi import kırılırsa döngü çözülür, çözümün en küçük hali (principal: `extractUploadThingFileKey` saf modüle). `lib → components` ve sunucu modülünün istemci ağacına girme riski (`server-only` hiç yok — bir istemci bileşeni yanlışlıkla sunucu servisini import ederse ne olur? Kanıtla: bugün böyle bir import zinciri var mı).
2. **Alan sınırları.** Alanlar arası bağımlılık matrisi; en dengesiz/merkezi alanlar (`workspace`, `dm`, `voice`, `badges`, `analytics`). Yan etki zinciri (ör. `voice/service → analytics` → `badges` → `workspace-events`): senkron çağrı zinciri yerine mevcut outbox/olay mekanizması kullanılmalı mı? Yalnız döngü veya ölçülmüş gecikme varsa öner.
3. **Taşıyıcıya bağlı iş mantığı.** F-09'un genellemesi: aynı alan kararının socket ve REST'te ayrı yazıldığı her yer. Hedef: taşıyıcı ince, karar tek serviste (route-logic DI deseniyle). Liste + birleştirme sırası.
4. **Durum sahipliği.** Aynı veri için birden fazla doğruluk kaynağı (örn. okunmamış sayısı hem sorgu önbelleğinde hem store'da; ses durumu hem context'te hem sorguda). Realtime yama ile refetch'in yarıştığı yerler. Hedef: her veri türü için tek sahip + yazım yolu tablosu.
5. **Gerçek zaman teslim modeli.** Olay taksonomisi (`ServerToClientEvents`/`ClientToServerEvents` sayısı, adlandırma), teslim garantisi (en fazla bir kez + F-02 yeniden bağlanmada delta refetch), idempotensi (`clientNonce`), sıralama varsayımları, ack kullanımı (F-03 sonrası). Açık boşluklar.
6. **Süreç modeli ve ölçeklenme hazırlığı.** Web süreci içindeki işçiler (`server.ts:93,97`), in-memory durum (tek replikada doğru, çok replikada yanlış olan her şey: sayaçlar, önbellekler, zamanlayıcılar), Redis kilitleri, kapanış (F-15). İkinci replika eklendiğinde neyin bozulacağı listesi.
7. **Masaüstü sınırı.** Uzak içeriğe verilen native yetki (capability dosyaları) ile `desktop-native-evolution.md` hedefi arasındaki fark; köprü sözleşmesinin sürümlenmesi (web deploy'u eski masaüstü sürümüyle konuşunca ne olur?); 18 algılama noktası tek bir platform modülünde mi toplanmalı.
8. **Sözleşme yeri.** Socket olay tipleri `apps/web` içinde (A1-002) — web↔masaüstü↔mobil tek kaynağa (`packages/types`) taşımanın maliyeti ve kazancı; `packages/ui` (~147 satır) kaldır mı, doldur mu — kanıtla.
9. **Yapılandırma.** `process.env` erişiminin dağınıklığı (dosya sayısı), merkezi doğrulama (`lib/env.ts` var — kapsamı?), istemciye sızan env.
10. **Gözlemlenebilirlik mimarisi.** SLI/SLO yokluğu: D0 metriklerinden hangileri üretimde de toplanabilir (Sentry Web Vitals, Server-Timing → log, fan-out metriği)? Performans gerilemesini üretimde fark etmenin bugünkü yolu var mı?

## Uygunluk fonksiyonları (zorunlu çıktı)

Her mimari kural için: kural cümlesi, otomatik denetim yöntemi (ESLint `no-restricted-imports`/özel kural, `code-metrics.mjs` sayacı, AST testi — emsal `voice-provider-bundle.test.ts`), **bugünkü ihlal sayısı**, ratchet başlangıç değeri. Örnek biçim:

| Kural                                    | Denetim                   | Bugün | Ratchet          |
| ---------------------------------------- | ------------------------- | ----- | ---------------- |
| `lib/**` `components/**` import etmez    | `M-KOD-lib-to-components` | ?     | ≤ bugün, hedef 0 |
| `route.ts` Prisma'yı doğrudan çağırmaz   | `M-KOD-route-prisma`      | ?     | ≤ bugün          |
| Import döngüsü yok                       | `M-KOD-cycles`            | ?     | ≤ bugün, hedef 0 |
| Sunucu servisleri `server-only` işaretli | sayaç                     | 0     | ≥ bugün          |

Ş8 bu tabloyu doğrudan kapıya çevirir; kaynak-metin regex testi yerine AST/ESLint tercih edilir.

## Hedef mimari (zorunlu çıktı)

- Bugünkü ve hedef mimari diyagramı (metin/ASCII yeterli), aradaki fark adım adım: her adım bağımsız teslim edilebilir, ≤ 3 gün, davranış korur.
- 3–6 **ADR taslağı** (bağlam, karar, sonuç, alternatifler) — yalnız bir yol ayrımı gerçekten varsa (ör. "platform algılama tek modülde", "alan olayları senkron çağrı yerine yerel olay veriyolu/outbox", "socket sözleşmesi `packages/types`'a"). Ş7 bunları kullanıcı kararına çevirir.

## Yapılmayacaklar

- Değişiklik. Yeniden yazım, mikroservis, yeni altyapı.
- Kanıtsız "katman ekleyin" önerisi — her öneri bir ihlal sayısına veya ölçülmüş maliyete bağlı.

## Teslim

`raporlar/S6.findings.json` + `raporlar/S6-rapor.md` (uygunluk fonksiyonu tablosu + hedef mimari + ADR taslakları dahil).

## Kapı

00 §12'nin dört kontrolü (`S6`). Ek: uygunluk tablosundaki her satırda "Bugün" sütunu ölçülmüş (soru işareti kalmamış).

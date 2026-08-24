# Dalga 2 · Ş4 raporu — kabuk + dizin kolonu

## Sonuç

Ş4 uygulandı. Commit oluşturulmadı.

- `selectThirdColumn`, `/discover`, sorgulu biçimi ve sondaki `/` için `"discover"` seçiyor.
- Kabukta yalnız Keşfet entegrasyonu eklendi: 276 px genişlik, render dalı ve koşullu
  `discoverRail` prop/mount. 74 px sunucu rayı, 228 px gezinme paneli ve kullanıcı barına Ş4
  değişikliği yapılmadı.
- `DiscoverSidebar` 276 px saf sunum bileşeni. Altı kategori, üç sıralama seçeneği, arama ve
  davet kartını çiziyor; fetch/mutasyon/query açmıyor.
- Kategori ve sıralama satırları `<Link>`. Ray bağlantılarında Next production prefetch'i
  `prefetch={false}` ile kapalı.
- Sayaçlar yalnız mevcut React Query önbelleğindeki ilk sunucu sayfasının `categories`
  nesnesinden okunuyor. Önbellek yoksa `null`; satırlar kalıyor, piller çizilmiyor.
- Arama 250 ms sonra `router.replace` kullanıyor. Eski URL yankısı, daha yeni yerel taslağı
  ezemiyor; eşleşen yankı ref kilidini bırakıyor.

Dalga 0 ön koşulu `01-dalga0-rapor.md` §5 üzerinden doğrulandı: Keşfet odak kapıları yeşil;
raporda ayrı işlere ait önceden var olan tam-web kırıkları ayrıca sınırlandırılmış.

## Dosyalar

- `apps/web/src/lib/home/third-column.ts`
- `apps/web/src/lib/home/third-column.test.ts`
- `apps/web/src/components/shell/wizards-shell.tsx` — yalnız `discover` entegrasyonu
- `apps/web/src/components/discover/discover-sidebar.tsx`
- `apps/web/src/components/discover/discover-sidebar-row.tsx`
- `apps/web/src/components/discover/discover-rail-container.tsx`
- `apps/web/src/components/discover/discover-sidebar.test.tsx`

## Doğrulama

| Kontrol                                                | Sonuç                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| Ş4 odak testleri (`third-column` + `discover-sidebar`) | **PASS — 22/22**                                               |
| Ş4 dosyaları + `wizards-shell.tsx` hedefli ESLint      | **PASS**                                                       |
| Ş4 sahiplik dosyaları Prettier                         | **PASS**                                                       |
| Salt-okunur kod incelemesi                             | **PASS — kritik yok; iki önemli + bir minor bulgu düzeltildi** |
| `graphify update .`                                    | **ENV BLOCKED — AST çıkarımı bitti, indeks yazımı exit 1**     |
| İstenen `typecheck && lint && test` zinciri            | **FAIL — typecheck'te durdu**                                  |
| Web lint, bağımsız                                     | **FAIL — 1 hata**                                              |
| Web test, bağımsız                                     | **FAIL — 4418 test; 4412 pass, 5 fail, 1 skip**                |

### Tam kapı kırıkları — Ş4 dışı

İstenen zincirin gözlemlenen ilk `typecheck` kırığı:

- `apps/web/src/lib/discover/join-client.test.ts:45:45` — `input` implicit `any`.
- `apps/web/src/lib/discover/join-client.test.ts:45:52` — `init` implicit `any`.

Paralel Etkinlikler çalışması dosya eklemeye devam ettiği için son anlık `typecheck` tekrarında bu
iki hata kayboldu; yerini 23 kapsam dışı hata aldı:

- Eksik modüller: `events/route-logic`, `events-service`, `density`, `events-query`, `ics`,
  `presentation`.
- `use-next-event-clock.test.ts`: `nextEventCountsQueryOptions`, `selectCachedEventCounts`,
  `selectNextEventClock` export'ları yok.
- Etkinlik testlerinde 11 implicit-`any`/`unknown` parametre hatası.
- `events/realtime.ts:252:26`: `counts | undefined`, zorunlu `counts` tipine uymuyor.
- `scheduled-event-service.ts:1:37`: `@wizards/db`, `ScheduledEventRsvpStatus` export etmiyor.

`lint`:

- `apps/web/src/lib/discover/events-service.ts:1:1` — `Prisma` yalnız type olarak kullanılıyor;
  `@typescript-eslint/consistent-type-imports`.

`test`:

- `apps/web/src/app/api/v1/discover/servers/route-logic.test.ts` — eşleşen `route-logic`
  modülü yok (`ERR_MODULE_NOT_FOUND`).
- `apps/web/src/app/api/v1/route-contract.test.ts` — iki mobile thread-follow handler bodyless
  sözleşme listesinde yok.
- `apps/web/src/lib/events/realtime.test.ts` — `@/lib` paketi/modülü çözülemiyor
  (`ERR_MODULE_NOT_FOUND`).
- `apps/web/src/lib/messages/audit-budget.test.ts` — `group-create-dialog.tsx:608:38`
  `hsl(` borcu `1 > 0`.
- Aynı audit-budget dosyasının ters bütçe testi — gerçek borç `1`, kayıtlı bütçe `0`.

Bu dosyaların hiçbiri Ş4 sahiplik listesinde değil; kapsam dışı kırıklar değiştirilmedi.

### Graphify güncelleme sınırı

`graphify update .`, 3119 dosyanın AST çıkarımını tamamladıktan sonra exit 1 verdi:

```text
Nothing to update or rebuild failed — check output above.
[graphify] backed up curated graph (5 files) -> 2026-08-21/
[graphify watch] Rebuild failed: [Errno 22] Invalid argument: 'graphify-out\\.graphify_root'
```

`graphify-out/.graphify_root` mevcut, normal dosya ve içeriği `.`. Araç hatası Ş4 kaynak
doğrulamasını etkilemedi; graph çıktıları zaten çalışma ağacında dirty idi ve geri alınmadı.

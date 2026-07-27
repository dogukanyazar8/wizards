# RUN PROMPT — Admin Dalga 2: A Telemetri + B2 Handoff Kabuğu

Whispr admin yeniden tasarımının 2. dalgası. İki bağımsız iş — **ayrı oturumlarda paralel koşulabilir** (tek çakışma: `lib/admin/dashboard.ts`, yalnızca B2 dokunur):

1. **A:** Platform + sürüm boyutu metriklere eklenir. Bugün mobil/desktop oturumları `WEB` sayılıyor (istemciler `x-whispr-client` göndermiyor). Geri dönüşsüz iş — toplanmayan gün kalıcı kör nokta.
2. **B2:** Panel handoff tasarımıyla gerçek rotalara taşınır: ortak kit + Genel Bakış / Kullanıcılar / Sunucular / Audit modülleri.

**Ön koşul:** Dalga 1 (B1 capability haritası) tamamlanmış olmalı.

## Okuma sırası

1. `docs/superpowers/plans/2026-07-27-admin-wave2-a-b2.md` — görevler
2. `docs/superpowers/specs/2026-07-26-admin-telemetry-backbone-design.md` (A — tamamı)
3. `docs/superpowers/specs/2026-07-27-admin-design-handoff-implementation.md` (G — görsel otorite; §1 kit ölçüleri, §2 modül haritası, §4 veri gerçekleri)
4. `design_handoff/design_handoff_admin_panel/README.md` + ekran görüntüleri; şüphede `Whispr Admin.dc.html` esas
5. `docs/superpowers/specs/2026-07-26-admin-panel-shell-design.md` §1-3 (B2)

## Bağlayıcı kurallar

- **Commit atma.** Dalga sonunda raporla.
- **A adım 0 ölçümle başlar** (kod değişikliği yok): `AppSession` clientType dağılımı + gerçek cihaz UA'sı kaydedilir, sonuç A spec'ine yazılır. Atlamak yasak.
- `incrementUserDailyMetric` attribution parametresi **zorunlu** — `// @ts-expect-error` tip testiyle sabitlenir. `UNKNOWN` yazmak isteyen `UNKNOWN_ATTRIBUTION` sabitini açıkça geçirir.
- Eski `AppSession` satırları `attributionVerified=false` → platform raporlarında **UNKNOWN kovası** (saklı `WEB` değerine bakılmaz).
- **Görselde G kazanır:** ölçüler G §1 tablosundan; HTML kopyalanmaz, React ile yeniden üretilir; sabit hex yalnızca `avatar-gradients.ts`. Türkçe sayı biçimi: `1.204` / `%4,2` / `4,21M`.
- B2 refactor'ü **eşdeğerlik testi önce**: bölünmüş yükleyicilerin birleşimi mevcut snapshot çıktısına eşit — bu test refactor boyunca yeşil kalır.
- Anchor yönlendirmesi client-side shim (fragment sunucuya ulaşmaz — sunucu tarafı redirect deneme).
- Mobil testler `apps/mobile` dizininden koşulur (tsx kök-dizin tuzağı); RNTL `render`/`fireEvent` await ister.

## Doğrulama

```bash
pnpm --filter @wizards/db test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web lint
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
graphify update .
```

## Rapor formatı

- Adım 0 ölçüm sonucu (clientType dağılımı + UA dizesi) ve çıkarımın doğrulanıp doğrulanmadığı
- Eşdeğerlik testinin refactor boyunca yeşil kaldığı kanıtı
- `/admin/users` doğrudan URL çalışıyor; `ANALYST` navigasyonda göremediği modülün sayfasından yönlendiriliyor
- Kit sözleşme testleri (hex yasağı, 250px/62px/1360px) yeşil
- Değişen dosyalar + sapmalar

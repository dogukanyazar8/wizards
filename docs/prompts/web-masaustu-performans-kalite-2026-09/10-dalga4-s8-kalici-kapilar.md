# D4 / Ş8 — Kalıcı kapılar ve ratchet'ler

Ön koşul: `00-ortak-baglam.md` okundu; D3'ün planlanan `U-*` şeritleri bitti (veya `08-plan.json`'da `U-D` alt dalgası olarak bu şeritle birlikte koşuyor); `raporlar/08-butceler.json` var; K5 cevaplı.
Tür: **uygulama.** Yazılabilir: aşağıdaki "Dokunabileceğin dosyalar" tablosu + `raporlar/10-kapilar-rapor.md`.

## Amaç

D3'te kazanılan her sayıyı ve Ş6'nın her mimari kuralını **otomatik bir kapıya** bağlamak. Kural: kapı **titrememeli** (gürültüden kırmızı olan kapı birkaç hafta içinde devre dışı bırakılır) ve **yalnız aşağı yönlü ratchet** yapmalı (bütçe gevşetmek gerekçe dosyası ister — emsal `docs/operations/coverage-ratchet.md`).

## Dokunabileceğin dosyalar

| Yol                                                                                     | Ne                                                                    |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/perf-budgets.json` (veya Ş7'nin seçtiği tek yer)                              | `08-butceler.json`'un kapı biçimi                                     |
| `apps/web/scripts/perf/bundle-report.mjs` + testi                                       | `--budget` kontrolü                                                   |
| `apps/web/scripts/perf/lab-budget-check.mjs` + testi                                    | laboratuvar sonucu → bütçe karşılaştırması                            |
| `apps/web/package.json`                                                                 | `perf:bundle:check`, `perf:lab:check` script satırları                |
| `apps/web/eslint.config.mjs`                                                            | Ş6 uygunluk fonksiyonlarından ESLint'le denetlenebilenler             |
| `scripts/quality/code-metrics.mjs` + testi, `scripts/quality/code-metrics-ratchet.json` | döngü, ters yön import, `route.ts` Prisma, dev dosya büyüme ratchet'i |
| `scripts/quality/local-gate-profiles.json` + `local-gate-contract.test.mjs`             | yeni adımlar                                                          |
| `.github/workflows/ci.yml` (K5-A/C ise) + ilgili sözleşme testleri                      | CI adımları                                                           |
| `apps/desktop/src-tauri/Cargo.toml` `[lints]` (Ş7 kararıysa)                            | Rust lint ratchet'i                                                   |
| `apps/desktop/scripts/measure-windows-desktop.*`                                        | bütçe karşılaştırması                                                 |
| `docs/operations/web-desktop-performance.md`                                            | runbook (yeni)                                                        |

## Kapılar

### K-BND — Paket bütçesi (her PR / yerel `Standard`)

- `next build` sonrası `perf:bundle:check`: rota başına gz ≤ `fail`; aşımda rota, önceki/yeni bayt ve **hangi chunk'ın büyüdüğü** (baskın içerik) yazılır.
- Deterministik (bayt) — tolerans küçük tutulabilir (ör. +%1 veya +2 KB gz, hangisi büyükse).
- Sınır iddiaları (ör. `/home`'da livekit yok) ayrı AST/manifest testiyle — bütçe yalnız toplamı yakalar, _neyin_ sızdığını değil.

### K-LAB — Laboratuvar bütçesi (gece / yerel `E2E*` profili, PR'da değil)

- `perf:lab` + `perf:lab:check`: `dusuk` profil, N ≥ 5, median ve p95. Tolerans `08-butceler.json`'daki `max(%x, 3×MAD)`.
- İki seviye: `warn` (tolerans aşıldı) ve `fail` (2 × tolerans). Tek koşu kırmızı olursa aynı job içinde **bir kez** yeniden ölç; ikisi de aşarsa fail — titremeyi azaltır, gerçek gerilemeyi kaçırmaz.
- Makine farkı: CI runner ile geliştirici makinesi farklı → her ortamın kendi referans dosyası (`perf-budgets.<env>.json`) veya yalnız göreli ölçüt (aynı job'da `main` build'iyle A/B). Hangisinin seçildiğini ve nedenini runbook'a yaz.

### K-DSK — Masaüstü (Windows, gece veya yerel `Desktop` profili)

- `measure:windows` → `M-DSK-START-T3`, `M-DSK-RSS-10m`, `M-DSK-EXE-MB`, `M-DSK-NSIS-MB` bütçe karşılaştırması. Boyut deterministik (sıkı), açılış/RSS toleranslı.
- Windows runner yoksa yalnız yerel profil; bunu açıkça belgeleyip sürüm çıkışı kontrol listesine (`apps/desktop/RELEASE.md`) bir satır ekleme önerisini rapora yaz — dosyayı Ş7 kararı olmadan değiştirme.

### K-ARC — Mimari uygunluk (her PR / yerel `Fast`)

Ş6 uygunluk tablosundaki her kural:

- ESLint ile denetlenebilen (ör. `lib/**` → `components/**` yasak, istemci bileşeninde sunucu servisi import'u yasak): `eslint.config.mjs`'e **mevcut `no-restricted-imports` bloğunu genişleterek** (ikinci kapı yazma). Bugün ihlal varsa ya D3'te kapatıldı ya kural `warn` + ratchet dosyasında sayı.
- Sayaç ile denetlenen (döngü, `route.ts` Prisma, dev dosya büyümesi): `code-metrics.mjs --check scripts/quality/code-metrics-ratchet.json`. Sayı artarsa fail; azalırsa "ratchet'i düşür" mesajı (kendiliğinden düşürmez, kullanıcı/PR düşürür).
- Dev dosya kuralı: ratchet dosyasında listelenen dosyalar büyüyemez (satır ≤ kayıtlı); yeni dosyalar ≤ Ş7'nin belirlediği üst sınır. Test ve i18n mesaj dosyaları hariç.
- Rust: Ş7 kararıyla `Cargo.toml` `[lints.clippy]` (ör. `unwrap_used = "warn"` yalnız test dışı) — mevcut ihlal sayısı ratchet'e.

### K-DEV — Geliştirme döngüsü (bilgi, fail değil)

`M-DEV-*` süreleri yerel gate özetinde yazdırılır; kapı değildir (makine bağımlı). Runbook'ta hedefleri ve ölçüm komutu.

## Kurallar

- Her yeni betik `*.test.mjs` taşır ve **gerçekten bir yerde koşar** (00 §4.7: `apps/web/scripts/*.test.mjs` web `test`'inde koşmaz — `lint` listesine veya `test:toolchain`'e bağla; hangisini seçtiğini yaz).
- `ci.yml` değişirse: `pnpm actionlint`, `pnpm test:toolchain` (içinde `ci-execution-contract`, `github-hosted-ci-contract`, `actionlint-contract` testleri) yeşil olmalı. Action'lar SHA-pinli kalır, `permissions` en az yetki.
- CI yoksa (Actions fatura kilidi sürüyorsa) yerel gate kanonik; `local-gate-contract.test.mjs` güncellenir.
- Kapının kendisini kanıtla: her kapı için bir **kasıtlı ihlal** denemesi (scratchpad kopyasında veya testte fixture ile) → kırmızı → geri. Kırmızıya düşmeyen kapı kapı değildir.

## Runbook

`docs/operations/web-desktop-performance.md` (okunur Türkçe):

1. Metrik kataloğu (`M-*`) ve her birinin ölçüm komutu.
2. Bütçeler: nerede, nasıl okunur, nasıl gevşetilir (gerekçe + kullanıcı onayı), nasıl sıkılaştırılır.
3. Kapı kırmızı olduğunda ne yapılır: bundle aşımı → hangi rapor, hangi araç (`ANALYZE=true`); lab aşımı → trace nasıl alınır; masaüstü aşımı → süreç ağacı.
4. Ölçüm tuzakları (00 §3 yan etkiler).
5. Saha verisi: Sentry Web Vitals erişimi varsa nerede bakılır (yoksa "doğrulanmadı").

## Kapı

```bash
pnpm test:toolchain
```

```bash
pnpm --filter @wizards/web lint
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/desktop test
```

`ci.yml` değiştiyse:

```bash
pnpm actionlint
```

Ek: `raporlar/10-kapilar-rapor.md`'de her kapı için "kasıtlı ihlal → kırmızı" kanıtı (komut + karar veren çıktı satırı) ve bugünkü ağaçta yeşil çıktısı.

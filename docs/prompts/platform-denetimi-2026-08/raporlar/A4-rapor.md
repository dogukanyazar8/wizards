# A4 — Test süreçleri ve kod kalitesi denetimi

Temel commit: `5a2b3990733b17672cf65fba631b7ec44a7bf96a` · Tarih: 2026-08-08
Kanonik veri: [`A4.findings.json`](A4.findings.json)

## Kapsam ve yöntem

Envanter statik, sayılar gerçek: `pnpm --filter @wizards/web test:coverage` çalıştırıldı ve c8 birleşik raporu okundu. `ci.yml`'in tamamı (9 iş) okundu. Rota × test matrisi ve kapsam özeti iki ayrı script ile üretildi.

Bu eksenin iki ana hipotezi **çürütüldü** — aşağıda ayrı bölümde.

## Bulgu özeti

critical 0 · high 1 · medium 2 · low 0 — toplam **3**

| id     | Başlık                                                               | Sev    | Efor | Dalga |
| ------ | -------------------------------------------------------------------- | ------ | ---- | ----- |
| A4-001 | Kapsam ölçülüyor ama eşik yok; %41,16 düşse de kapı kırılmaz         | high   | M    | W1    |
| A4-002 | 279 dosya %0 yürütülmüş kapsamda; rota gövdeleri hiç çalıştırılmıyor | medium | L    | W2    |
| A4-003 | `@wizards/db` test suiti (8 dosya) hiçbir CI işinde koşmuyor         | medium | S    | W0    |

## Bulgular

**A4-001 — "coverage baseline" adında bir baseline yok.** `run-coverage.ts` (100 satır) yalnız API E2E ön kontrolüne göre çıkıyor; yüzde eşiği, önceki değerle karşılaştırma veya dosya bazında minimum yok. c8 yapılandırmasında `check-coverage` aranmış, bulunamamış. Bugünkü değerler:

| Ölçüt     | Değer                         |
| --------- | ----------------------------- |
| Satır     | **%41,16** (60.006 / 145.757) |
| Dal       | %76,72                        |
| Fonksiyon | %59,27                        |

Düşük satır oranı tek başına kusur değil (890 dosyanın büyük bölümü React bileşeni ve rota kabuğu). Kusur, bu sayının **hiçbir şey yapmaması**: 300 satırlık testsiz bir servis eklendiğinde kapı yeşil kalır.

**A4-002 — Rota gövdeleri yürütülmüyor.** 279 dosya (≥20 satır) %0 kapsamda. En düşük 25'in içinde: `admin/servers/[serverId]` (95 satır, PATCH/DELETE), `admin/moderation/cases/*`, `admin/flags/[key]`, `admin/notification-campaigns`, `attachments/[attachmentId]/download` (109 satır), `auth/desktop-session`. 211 rotanın yalnız **73**'ünde aynı klasörde test dosyası var.

Kısmen çürütüldü ve severity buna göre düştü: iş mantığı servis katmanında testli (`moderation/appeal-service.test.ts`, `feature-flags/admin-service.test.ts` vb.). Kapsanmayan şey rota gövdesinin kendisi — guard sırası, param ayrıştırma, hata eşleme, yanıt şekli.

**A4-003 — `@wizards/db` kapının dışında.** Paketin 8 test dosyası ve gerçek bir `test` script'i var (`prisma.test.ts`, `prisma7-contract.test.mjs`, `rebaseline-uat-migration-history.test.mjs`, seed testleri). `.github/workflows/` altında `@wizards/db` geçen her satır `db:generate` veya `db:migrate:deploy` — test çağrısı yok. `pnpm test` (turbo test, tümünü koşardı) hiçbir adımda geçmiyor; kapsam adımı yalnız web.

A1-001 ile birleşince tablo netleşiyor: migration yolu hem yanlış dizin tuzağı taşıyor **hem de** o yolu koruyan testler CI'da koşmuyor.

## Çürütülen hipotezler

| Hipotez                                                                                            | Sonuç                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mobil süitler (334 dosya) CI'ın dışında** — prompt bunu "koşmuyorsa Critical" diye işaretlemişti | **Yanlış.** `ci.yml:95` "Mobile quality gate" adımı `pnpm --filter @wizards/mobile test`, `test:components`, `validate:env`, `release:check`, `quality:check` koşuyor.                |
| **Mobil bileşen testlerinin %27'si zayıf iddia** (1026 `toBeTruthy`)                               | **Yanlış.** Örnekleme gösterdi ki bunlar `view.getByTestId(...)` / `view.getByText(...)` üzerinde — RNTL'in standart varlık idiomu. Asıl iddia sorgunun kendisi (bulamazsa fırlatır). |
| Desktop testleri CI'da yok                                                                         | **Yanlış.** `desktop-ops` işinde `cargo test --locked` + `pnpm --filter @wizards/desktop test` + `lint:rust` var.                                                                     |
| Susturulmuş CI adımı (`continue-on-error`, `\|\| true`)                                            | **Yok.** Sıfır eşleşme.                                                                                                                                                               |
| Snapshot bağımlılığı                                                                               | **Yok.** 0 snapshot testi.                                                                                                                                                            |
| Üretim kodunda tip kaçağı / kirlilik                                                               | **Neredeyse yok.** 1 `any`, **0** `@ts-ignore`, **0** TODO/FIXME, **0** `console.log`.                                                                                                |

## CI kapısının gerçek hâli

`ci.yml` 9 iş: `verify`, `actionlint`, `semgrep` (SAST), `typescript-native-shadow`, Node 22 uyumluluk, `e2e-smoke`, Firefox/WebKit smoke, a11y taraması, görsel regresyon, `desktop-ops`.

`verify` adımları: checkout → pnpm → node → install → `db:generate` → E2E parola guard → **gitleaks secret scan** → `pnpm audit` → format → lint → typecheck → mobil Chromium → types test → ui test → **mobil quality gate** → coverage → build.

Bu güçlü bir kapı. Eksikleri:

| Eksik                      | Etki                  |
| -------------------------- | --------------------- |
| `@wizards/db` test         | A4-003                |
| Kapsam eşiği               | A4-001                |
| `pnpm audit` bugün kırmızı | A3-001 ile aynı kalem |

## Test kalitesi ölçümleri

| Ölçüt                       | Değer                                                  |
| --------------------------- | ------------------------------------------------------ |
| Web testi                   | 2072 pass / 0 fail / 462 suite — **0 skipped, 0 todo** |
| Mobil birim testi           | 1669 pass / 0 fail                                     |
| Web zayıf iddia oranı       | 248 / 4601 = **%5,4**                                  |
| `skip`/`todo` işaretli test | 7                                                      |
| Snapshot testi              | 0                                                      |
| `route-contract.test.ts`    | **1.931 satır** AST tabanlı sözleşme testi             |

`route-contract.test.ts` tüm v1 rotalarında şunları zorluyor: kimliksiz rota allowlist'i açık ve minimal, her kimlikli rota bir auth guard çağırıyor, mutasyon yapan rotalar JSON'u merkezî parse ediyor, rate-limit eylemleri kayıtlı ve metoda doğru eşlenmiş, handler imzaları Next uyumlu. AST decoy'larına (yorum, string, yeniden atanan alias, ulaşılamayan kod) karşı ayrı testleri var.

**Zorlamadığı tek şey yetkilendirme** — A3-002 tam olarak bu.

## Kod kalitesi

| Ölçüt                             | Değer |
| --------------------------------- | ----- |
| `any` (üretim kodu)               | **1** |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `as unknown as`                   | 31    |
| TODO / FIXME                      | **0** |
| `console.log`                     | **0** |

Bu, bu ölçekte (335k satır istemci kaynağı) olağandışı derecede temiz.

## Kapı sonucu

```
findings 3 sema disi 0
kanit hatasi 0        (dosya + satir + alinti eslesmesi)
metrik 20 eksik alan 0 dinamik 8
web: var  mobil: var  rota: var  kapsam: var
```

## Açık sorular

1. **Kırılganlık üç tur koşulmadı.** Web süiti bu oturumda iki kez bağımsız koştu (2072/0 her ikisinde) — iki tur stabil, üç tur ölçütü karşılanmadı. Mobil jest süiti bu turda hiç koşulmadı.
2. **17 Playwright spec'inin kapsadığı yolculuklar okunmadı.** A4-002'nin gerçek etkisi buna bağlı: admin yazma uçları e2e'de koşuyorsa rota gövdeleri dolaylı çalıştırılıyor demektir.
3. **Mutasyon dayanıklılığı ölçülmedi.** Kritik saf fonksiyonlar (izin hesaplama, oran sınırı, sayaç, mesaj gruplama) için "bir satırı bozulsa hangi test kırılır" yanıtlanmadı.
4. 31 `as unknown as` kullanımının yoğunlaştığı yerler incelenmedi.
5. 7 `skip`/`todo` testin nedenleri okunmadı.
6. `mobile-redesign-device-gate-nightly.yml`, `mobile-release.yml`, `desktop-release.yml`, `desktop-native-build.yml` okunmadı.
7. Test yardımcılarının tekrar edip etmediği (fixture/factory disiplini) incelenmedi.
8. **`ci.yml` çalışma ağacında temel commit'ten farklı** (15 ekleme / 38 silme, commit'lenmemiş): "Node 22 Native Compatibility" işi ve desktop-ops matrisi kaldırılmış görünüyor. A4 bulguları temel commit'e göre yazıldı; `@wizards/db` eksikliği **her iki ağaçta da** doğrulandı.

# D3 / `U-*` — Uygulama şeridi (şablon)

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/08-plan.json` var ve **kullanıcı planı onayladı**; şeridin `decisions` listesindeki kararlar `08-kararlar.md`'de cevaplı; `dependsOn` şeritleri bitti.
Girdi: şerit kimliği, ör. `U-03`.
Tür: **uygulama.** Yalnız `08-plan.json` → `lanes[U-xx].touches` içindeki dosyalara yazar + `raporlar/U-xx-rapor.md`.

## Amaç

Tek bir temayı, **ölçülmüş kazançla** ve davranış güvencesiyle kapatmak. Kazanç gürültü içindeyse performans değişikliği geri alınır — daha basit kod kazanır.

## Adımlar

### 0. Hazırlık

1. `08-plan.json`'dan şerit kaydını, bağlı bulguları (`S*.findings.json`) ve kabul ölçütlerini oku.
2. `git status --short -- <touches>`: bu dosyalarda başka bir oturumun commit'lenmemiş değişikliği var mı? Varsa ve şerit planında öngörülmemişse **dur**, rapora yaz (iki işi aynı diff'e karıştırma).
3. `treeFingerprint` kaydet.

### 1. Kanıtı yeniden doğrula

Kod D1'den beri değişmiş olabilir. Her bulgunun `evidence` satırını bugünkü ağaçta oku. Bulgu artık geçerli değilse: `gecersiz` + kanıt, o kalem için değişiklik yok.

### 2. Önce ölç

Şeridin `acceptance` metriklerini **aynen** `method` komutlarıyla, bugünkü ağaçta koş (00 §3: prod build, profil, N). D0 değeri referanstır; kıyas bu "önce" değeriyle yapılır.

### 3. Önce test

- Davranış/sınır iddiası yaz, **kırmızı** gör. Örnekler:
  - Paket sınırı: `/home` ilk yüklemesinde `livekit-client` yok → bundle raporu üstünde assertion veya AST sınır testi (emsal `components/providers/voice-provider-bundle.test.ts`).
  - Render: olay başına commit sayısı → saf fonksiyona çıkarılabilen yama mantığı için birim test (ör. `setQueryData` güncelleyicisi yalnız etkilenen sayfayı kopyalar).
  - Rust: senkron komutun async'e taşınması → komut mantığının saf fonksiyonu için `#[test]`; ana iş parçacığı iddiası testle zor — o zaman ölçüm (T1, komut süresi) kabul kanıtıdır, bunu raporda açıkça yaz.
- **Kaynak-metin testi yazma** (dosyada şu satır var mı regex'i). Yapısal iddia gerekiyorsa AST veya çıktı (bundle, manifest) üzerinden.
- Test kırmızıya düşmüyorsa bulguyu yanlış anlamışsındır — dur, yeniden oku.

### 4. En küçük değişiklik

- 00 §9 ilkeleri. Tek tanım, var olan kapıya giriş, üçüncü çağrı yerinde soyutlama.
- Düzeltilen her tuzağa _neden_ yorumu ("eskiden X her oturumlu sayfada yükleniyordu; ses dışı rotalarda 139 KB gz boşa iniyordu").
- Kullanıcıya görünen davranış değişiyorsa yalnız `08-kararlar.md`'de onaylanan kadar.
- Yeni bağımlılık, feature flag, env anahtarı yok (karar dışında).

### 4a. Bölme / taşıma şeritleri (K4-A)

- **Yalnız taşıma.** Davranış, public API, olay adları, testID'ler, i18n anahtarları değişmez.
- Taşımadan önce: `git grep -n "<eski yol|sembol>" -- '*.test.*' '*.mjs' '*.json'` — kaynak-metin sözleşme testleri, graphify, `.design-sync` referansları. Her birini aynı şeritte güncelle; testin _iddiasını_ değil yalnız _yolunu_ değiştir.
- Küçük adımlar: bir sorumluluğu çıkar → typecheck → ilgili testler → sonraki. Her adımda test sayısı düşmez.
- Rust modül bölmede: `pub(crate)` yüzeyi en dar; `#[tauri::command]` adları ve `generate_handler!` listesi değişmez; `removeUnusedCommands` ve capability dosyalarıyla eşleşme korunur.
- Hedef büyüklük `acceptance`'ta; tutturulamıyorsa neden.

### 5. Sonra ölç

Aynı komut, aynı profil, aynı N, aynı oturumda. Tablo: metrik · önce (median/p95/MAD) · sonra · fark · gürültü eşiğini geçti mi (00 §3).

- Performans amaçlı değişiklik eşiği geçmiyorsa: **değişikliği geri al** (kendi diff'ini Edit ile; `git checkout` yasak), testleri koru eğer davranışı kilitliyorlarsa, kalemi `gecersiz-kazanc` diye raporla.
- `no-regression` ölçütlerinde tolerans aşılırsa şerit bitmez.

### 6. Kapı

Dokunulan yüzeye göre:

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
pnpm --filter @wizards/desktop test
```

```bash
pnpm --filter @wizards/desktop lint:rust
```

```bash
pnpm test:toolchain
```

UI akışına dokunduysa ilgili e2e (`e2e:smoke`, gerekiyorsa `e2e:realtime` veya ses için `chromium-real-media` projesi). `packages/types`'a dokunduysa `pnpm --filter @wizards/types test` ve mobil typecheck (`pnpm --filter @wizards/mobile typecheck`) — mobil kodu değiştirme, kırılırsa dur.

Son olarak:

```bash
graphify update .
```

`git diff --stat` ile yalnız `touches` içindeki dosyaların ve yalnız hedef satırların değiştiğini doğrula (EOL, 00 §1.1). `next build` koştuysan `next-env.d.ts` geri yüklendi mi.

### 7. Rapor

`raporlar/U-xx-rapor.md` ve kullanıcıya (caveman ultra) 00 §13 biçiminde:

1. Kapanan bulgular (`S*-nnn`, `file:line`) ve durumu (`kapandi` / `gecersiz` / `gecersiz-kazanc`).
2. Önce/sonra tablosu.
3. Eklenen testler (ne iddia ediyor).
4. Davranış değişiklikleri (varsa, karar numarasıyla).
5. Kapsam dışı bırakılan ve bir sonraki şeride devredilen.
6. Önerilen commit mesajı (conventional commits, normal dil) — **commit atma**.

## Paralel koşma

Aynı alt dalgadaki şeritler ayrı oturumlarda aynı anda koşabilir (Ş7 `touches` kesişimini boş garanti etti). Yine de `pnpm install`, `next build`, `cargo build` gibi paylaşılan çıktı üreten komutları iki oturumda **aynı anda** koşma: `.next/`, `target/` ve `next-env.d.ts` yarışır. Ölçüm koşuları CPU paylaşırsa sayılar bozulur — ölçüm sırasında başka ağır iş koşmadığını `env` kaydına yaz.

# D1 / Ş5 — Kod kalitesi

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/00-baseline.json` var (`M-KOD-*`, `M-DEV-*`).
Tür: **salt okuma.** Yalnız `raporlar/S5.findings.json` + `raporlar/S5-rapor.md`. Ölçüm betikleri scratchpad'de; ESLint'i config değiştirmeden `--rule` bayrağıyla rapor modunda koşmak serbest.
Sahiplik: dosya/fonksiyon düzeyinde kalite — büyüklük, karmaşıklık, tekrar, tip ve hata disiplini, test kalitesi, geliştirme döngüsü hızı. Modüller arası sınır ve bağımlılık yönü Ş6'nın.

## Amaç

"Kaliteli kod" iddiasını ölçüye çevirmek ve **nereye yatırım yapılırsa en çok geri döneceğini** göstermek. Kalite borcu her yerde eşit pahalı değildir: sık değişen ve büyük dosyadaki borç her değişiklikte faiz öder, dokunulmayan dosyadaki borç ödemez. Bu yüzden ana çıktı **sıcak nokta listesi** (büyüklük × değişim sıklığı × hata düzeltme yoğunluğu).

## Önceki bulgular (priorStatus zorunlu)

A1-006 (god node'lar), A4-001…003 (kapsam eşiği, sıfır kapsamlı dosyalar, db suiti), principal F-16, F-17, ölü kod turu (2026-09-20 — tekrar tarama, kalan maddeleri yalnız referansla).

## Ölçüm

### 1. Sıcak noktalar

```bash
git log --since=180.days --format= --numstat -- apps/web/src apps/desktop/src-tauri/src
git log --since=180.days --format=%H --grep='^fix' -i --name-only -- apps/web/src apps/desktop/src-tauri/src
```

Dosya başına: satır (şimdi), değişim sayısı (commit), eklenen+silinen satır, `fix` commit sayısı. Puan = `normalize(satır) × normalize(değişim) × (1 + fixOranı)`; formül rapora. Test dosyalarını ayrı listele. İlk 30 = **sıcak nokta listesi**. Graphify derecesi (`graphify explain "<dosya>"` bağlantı sayısı) ek sütun.

Not: `main` geçmişi büyük toplu commit'ler içerebilir (redesign fazları, ölü kod turu). Tek commit'te > 2.000 satır değiştiren commit'leri ayrıca işaretle, puanı çarpıtıyorsa hariç tutulmuş varyantı da ver.

### 2. Karmaşıklık (rapor modu)

```bash
pnpm --filter @wizards/web exec eslint src --no-warn-ignored --format json --rule "{\"complexity\":[\"warn\",15],\"max-lines-per-function\":[\"warn\",{\"max\":120,\"skipBlankLines\":true,\"skipComments\":true}],\"max-depth\":[\"warn\",4],\"max-params\":[\"warn\",5]}" > <scratchpad>/eslint-complexity.json
```

Flat config'te `--rule` çalışmıyorsa nedenini yaz ve eşdeğerini TypeScript AST ile scratchpad betiğinde üret. Çıktı: kural başına ihlal sayısı, en karmaşık 30 fonksiyon (dosya:satır, değer). `M-KOD-complexity-gt15` vb. yeni metrik olarak kaydet.

### 3. Tekrar

Bağımlılıksız scratchpad betiği: fonksiyon gövdelerini (≥ 12 satır) token'a ayır, tanımlayıcı/literal normalize et, hash'le; eşleşen ve %85+ benzeyen çiftler. F-09 (`deriveMessageSendFanoutTargets` ≡ `deriveChannelMessageFanoutTargets`) bu betiğin doğrulama örneğidir — onu bulamıyorsa betik yanlıştır. Çıktı: kopya küme sayısı, en büyük 20 küme.

### 4. Tip ve hata disiplini

D0 `M-KOD-*` sayılarını sıcak noktalarla kesiştir: `any`/`as unknown as`/`@ts-expect-error`/`eslint-disable` hangi dosyalarda yoğun? Ek statik tarama:

- Boş veya yutan `catch` (`catch {}`, yalnız `console.*`), `void promise` ile yakalanmayan ret, socket handler'da ele alınmayan ret.
- Aynı hata için farklı kullanıcı mesajı/kod üreten yollar (`jsonError` sözleşmesi dışına çıkan rotalar).
- `tsconfig` sıkılığı: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` açık mı; kapalıysa açıldığında kaç hata (yalnız sayım: `tsc --noEmit` scratchpad tsconfig ile).
- `typescript-eslint` type-checked kural setinden kapalı olanlar ve açılırsa ihlal sayısı (rapor modu).

### 5. Test kalitesi

- **Kaynak-metin sözleşme testleri:** `readFileSync(` ile `.ts/.tsx/.rs` kaynak okuyan test sayısı ve listesi (`voice-provider-bundle.test.ts` gibi AST tabanlı olanları ayrı say — onlar daha dayanıklı). Hangileri gerçek bir kuralı (paket sınırı, güvenlik) koruyor, hangileri yalnız "bu satır burada dursun" diyor? İkincisi refactor'u pahalılaştırır — Ş7 için politika önerisi.
- **Yavaş testler:** `node --test --test-reporter=tap` veya run-node-tests çıktısından dosya başına süre; en yavaş 20 ve toplam süredeki payı (`M-DEV-webtest-s` ile uzlaştır).
- **Sıcak noktaların test karşılığı:** ilk 30 sıcak noktanın her biri için birim test var mı, davranışı mı yoksa uygulamayı mı iddia ediyor.
- RNTL/jest kapsam dışı (mobil).

### 6. Geliştirme döngüsü

D0 `M-DEV-*`: typecheck, lint, test, build, cargo süreleri. En yavaş halka hangisi, neden (ör. lint'in type-aware kuralları, `next build` `experimental.cpus: 4`)? Ölçülebilir iyileştirme önerisi (paralellik, önbellek, artımlı çalıştırma) — kanıtla.

## Aranacak kusur sınıfları (özet)

1. Sıcak noktada çok sorumluluklu dosya (sorumluluk sayısı ≥ 4, dosya:satır aralıklarıyla göster).
2. Kopya alan mantığı (özellikle socket/REST, web/masaüstü köprüsü).
3. Tip kaçışlarının sıcak noktada toplanması.
4. Hata yutma ve tutarsız hata sözleşmesi.
5. Kırılgan test mimarisi (kaynak-metin testleri, uygulama iddiası, yavaş kurulum).
6. Yavaş geri besleme döngüsü.

Stil/format bulgusu yazma (Prettier + ESLint zaten kapı). "Değişken adı kötü" yalnız yanlış anlamaya yol açtığı kanıtlanırsa.

## Yapılmayacaklar

- Değişiklik, config değişikliği, yeni bağımlılık (K3).
- Ölü kod yeniden taraması (2026-09-20'de yapıldı).
- Mobil.

## Teslim

`raporlar/S5.findings.json` + `raporlar/S5-rapor.md`; rapora ek:

- **Sıcak nokta tablosu (ilk 30):** dosya, satır, değişim, fix oranı, graph derecesi, puan, sorumluluklar, test durumu, önerilen hamle (böl / tekrarı birleştir / test ekle / dokunma).
- **Kalite karnesi:** her `M-KOD-*` ve yeni kalite metriği için bugün / önerilen hedef / ratchet yönü (Ş8 bunu kapıya çevirir).
- **Bölme adayları:** K4-A seçilirse hangi dosyalar, hangi sırayla, hangi hedef büyüklüğe — her biri için davranış koruma planı (hangi testler güvence).

## Kapı

00 §12'nin dört kontrolü (`S5`). Ek: tekrar betiği F-09 çiftini buldu mu — `evet/hayır` rapora; hayırsa betik düzeltilmeden şerit bitmez.

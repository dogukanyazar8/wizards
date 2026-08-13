# Ortak bağlam — denetim 2026-08 kapatma paketi

**Her prompt bu dosyayı ilk okur.** Buradaki kurallar prompt'ların hepsinde geçerlidir; prompt'lar yalnız kendi kapsamını yazar.

Kaynak rapor: `docs/denetim/2026-08-12-platform-denetimi.md`. Bir bulgunun tam kanıtı (alıntılanan satır, etki senaryosu) oradadır — prompt yalnız `dosya:satır` ve ne yapılacağını taşır.

---

## Çalışma kuralları

- **Branch:** `uat`. Yeni branch açma, branch değiştirme.
- **Commit atma.** Hiçbir prompt commit, push, PR üretmez. Değişiklik çalışma ağacında kalır.
- **Caveman ultra** ile çalış. Kullanıcıya dönen metin terse; kod, yorum, commit mesajı normal yazılır.
- **Migration koşturma.** Şema değişikliği yapan prompt migration dosyasını yazar, `prisma migrate` çalıştırmaz.
- Rapor dışı bir sorun görürsen **düzeltme** — not düş, kullanıcıya söyle. Kapsam genişletmek bu paketin en büyük riski.

## Tasarım ilkeleri

**SOLID, ama ölçüsünde.**

- **SRP:** bir modül bir nedenle değişsin. Denetimdeki tekrar eden kök neden zaten bu: aynı kararın iki yerde farklı yazılması (iki "yükseltilmiş izin" listesi, iki temizleyici kalıp listesi, iki bildirim temizleme yolu). Düzeltme = **tek tanım**, iki tarafın onu import etmesi. Yeni katman değil.
- **OCP:** var olan bir kapıya (permission gate, rate limit tablosu, invalidasyon tablosu) yeni giriş eklemek, o kapının yanına ikinci bir kapı yazmaktan iyidir.
- **LSP/ISP:** bir DTO'yu iki farklı okuyucu farklı görmek zorundaysa iki projeksiyon yaz, tek geniş nesneyi herkese gönderip istemcide filtreleme.
- **DIP:** bu repo servis bağımlılıklarını `dependencies` nesnesiyle enjekte ediyor (`GroupServiceDependencies`, `BadgeStore`, ...). Yeni yazdığın her test edilebilir birim aynı deseni kullansın; testte DB'ye ihtiyaç duyan kod yazma.

**Over-engineering yasak.**

- Yeni soyutlama katmanı, yeni "framework", yeni generic yardımcı **yalnız** üçüncü çağrı yerinde doğar. İki çağrı yerinde kopyala.
- Yeni dosya açmadan önce sor: var olan dosya bu sorumluluğu taşıyor mu? Taşıyorsa oraya yaz.
- Feature flag, config anahtarı, ortam değişkeni ekleme — istenmedikçe.
- Bir bulgunun düzeltmesi 3 satırsa 3 satır yaz. "Bir daha olmasın" diye jenerik çözüm kurma; onun yerine **test** yaz.
- Refactor yapma. Bulgu neyi bozuyorsa onu düzelt. "Bu arada şunu da temizleyeyim" bu pakette yok.

**Yorum kuralı.** Bu repo yorumlarında _neden_ anlatıyor, _ne_ değil. Düzelttiğin her tuzağa, tuzağın kendisini anlatan bir yorum bırak — "eskiden şöyleydi, şu yüzden yanlıştı". Bir sonraki geliştirici aynı hataya dönmesin.

## Test kuralları

- **Her bulgu için testi önce yaz, kırmızı olduğunu gör, sonra düzelt.** Test kırmızıya düşmüyorsa bulguyu yanlış anlamışsındır.
- Test, bulgunun **davranışını** iddia etsin, uygulamasını değil. "`X` fonksiyonu `Y`'yi çağırır" değil, "iptal edilmiş oturum reddedilir".
- Web birim testi: `node --test`, DB yok → bağımlılıklar enjekte edilir.
- Mobil birim testi: `apps/mobile/scripts/*.test.ts`, node test runner.
- Mobil bileşen testi: `apps/mobile/component-tests/*.test.tsx`, jest + RNTL.
- **RNTL 14 asenkron:** `render()` ve `fireEvent.*` promise döner, `await` şart. Tek `it` içinde iki `render` + `unmount` dosyadaki sonraki testleri zehirliyor — ayrı `it` blokları yaz.

## Doğrulama komutları

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
pnpm --filter @wizards/web test
```

```bash
cd apps/mobile && npx jest component-tests
```

Kod değiştiyse en son:

```bash
graphify update .
```

Notlar:

- `typecheck`/`lint` **pnpm üzerinden** koşmalı; `npm run` ile runner yanlış tsc bulup derlemeden ölür.
- `node --import tsx` repo kökünden değil, paket dizininden koşulur.

## Repo sözleşmeleri (ihlali test kırar)

- `apps/mobile/src/app` altında **hex renk yasak** — yorumda bile. Her ölçü ve renk `theme.*` token'ından gelir.
- Yeni token her iki temada (`lightTheme`, `darkTheme`) tanımlı olmalı; metrik ve renk adları çakışmamalı.
- Yeni kopya anahtarı `mobileCopy.tr` **ve** `mobileCopy.en`'de olmalı, İngilizcesi Türkçesinden farklı olmalı, arayüz etiketinde emoji olmamalı.
- Mobil rota eklerken üç kayıt zorunlu: param tipi, navigator ekranı, deep-link/linking eşlemesi.
- Prisma yalnız `packages/db/prisma/rebaseline-migrations` dizinini okur. Migration başka yere yazılırsa sessizce hiç koşmaz.

## Prompt'un bitiş raporu

Her prompt sonunda kullanıcıya şunları ver, fazlasını değil:

1. Kapatılan bulgular — bulgu no + `dosya:satır`.
2. Kök neden cümlesi (her bulgu için bir satır).
3. Kapsam dışı bıraktıkların ve nedeni.
4. Doğrulama çıktısı: typecheck exit kodu, test sayıları.
5. Commit atılmadığı notu.

## Faz sırası

```
1. Güvenlik      01 → 02 → 03 → 04 → 05 → 06 → 07
2. Veri          08 → 09 → 10 → 11
3. Şema          12
4. Sunucu perf   13 → 14
5. Web istemci   15 → 16
6. Mobil istemci 17 → 18 → 19 → 20
7. Kalite        21
```

Fazlar arası bağımlılık az; aynı dosyaya dokunan prompt'lar sırayla koşulmalı. Her prompt'un başında "Ön koşul" satırı var.

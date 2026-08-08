# A4 — Test süreçleri ve kod kalitesi denetimi

Ön koşul: `00-ortak-baglam.md` okundu.
Çıktı: `raporlar/A4.findings.json` + `raporlar/A4-rapor.md`.

## Amaç

İki soruya kanıtlı yanıt: **(1)** Bu süitler bir gerilemeyi gerçekten yakalar mı? **(2)** Kapı (CI) yeşilken üretime kusur geçebilir mi, geçebiliyorsa hangi yoldan?

Test sayısı bir başarı ölçüsü değildir. Ölçü, **kapsanan davranış** ve **yakalama gücüdür**.

## Tohum sorgular

```bash
graphify query "test setup and helpers" --budget 8000
graphify query "prisma client injection for testable services" --budget 8000
graphify explain "route contract test"
graphify path "apps/web/src/app/api" "apps/web/src/**/*.test.ts"
graphify query "jest configuration and react native testing library setup" --budget 8000
```

## Kapsam matrisi

| Yüzey                  | Birim                              | Hedef kapsam                     |
| ---------------------- | ---------------------------------- | -------------------------------- |
| Web birim testleri     | 329 dosya                          | envanter %100, elle inceleme 25  |
| Mobil birim testleri   | 214 dosya                          | envanter %100, elle inceleme 20  |
| Mobil bileşen testleri | 129 dosya                          | envanter %100, elle inceleme 15  |
| Types testleri         | 15 dosya                           | %100                             |
| E2E (Playwright)       | 17 spec                            | %100                             |
| Desktop testleri       | 16 dosya + `lib.rs` `#[cfg(test)]` | %100                             |
| API rotaları           | 228                                | rota başına test var/yok tablosu |
| CI kapıları            | 5 workflow                         | %100                             |

## Ölçüm protokolü

Ana çalışma ağacında koş, çıktıyı aynen sakla:

```bash
pnpm --filter @wizards/web test              # geçen/başarısız + süre
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
pnpm --filter @wizards/desktop test
pnpm --filter @wizards/web test:coverage     # kapsam raporu — asıl veri burada
pnpm typecheck
pnpm lint
pnpm actionlint
```

Kapsam raporu üretiliyorsa **dosya bazlı en düşük 30 dosya** listelenir; bu liste `A4`'ün omurgasıdır. Kapsam aracı yoksa/çalışmıyorsa bu bulgunun kendisi `high`.

Kırılganlık (flake) ölçümü: en kritik iki süiti üç kez koş, sonuç değişiyorsa dosya adıyla bulgu.

## Aranacak kusur sınıfları

### 1. Kapsam boşlukları — davranış düzeyinde

- **Rota × test matrisi**: 228 rotanın kaçının en az bir testi var? Testi olmayanlar arasında `critical` yüzey (kimlik, ödeme/abonelik, admin, davet, mesaj gönderimi) hangileri?
- Test edilemeyen servis: veritabanına doğrudan dokunup DI ayrımı yapmayan modüller (`00 §4.4` deseni). Sayısı ve listesi.
- Hata yolları: testler yalnız mutlu yolu mu kapsıyor? 4xx/5xx, yetkisiz erişim, çakışma, boş sonuç, ağ kopması senaryoları.
- Eşzamanlılık/yarış: iki isteğin aynı kaynağı güncellemesi, socket olayının HTTP yanıtından önce gelmesi gibi senaryoların testi var mı?
- Gerçek zaman: 6 socket handler için olay sözleşmesi testi; oda üyeliği ve yayın hedefi doğrulanıyor mu?
- Mobil: ekran testleri render'ı mı yoksa davranışı mı doğruluyor? Navigasyon, geri tuşu, arka plan/ön plan geçişi, izin reddi yolları.
- Desktop: IPC komutlarının ve updater manifest doğrulamasının testi.
- E2E: 17 spec hangi kullanıcı yolculuklarını kapsıyor; kapsanmayan kritik yolculuklar (kayıt → sunucu kur → davet → mesaj → ses odası) hangileri?

### 2. Test kalitesi — yakalama gücü

Bu bölüm sayıdan çok okuma ister. İncelenen her testte:

- **Tautoloji**: mock'un döndürdüğünü doğrulayan test (üretim kodu silinse de geçer).
- **Aşırı mock**: sınanan birimin tüm işbirlikçileri mock'lanmış, geriye sıralama iddiası kalmış.
- **Zayıf iddia**: `toBeDefined`, `not.toThrow`, `length > 0` gibi davranış doğrulamayan iddialar. Sayısı ölçülebilir: `rg -c 'toBeDefined\(\)|not\.toThrow' `.
- **Snapshot bağımlılığı**: davranış yerine çıktı fotoğrafı; güncellenen snapshot ile sessizce kaybolan gerileme.
- **Kaçırılan async**: RNTL 14'te `await` edilmeyen `render`/`fireEvent` (`00 §4.4`). Bu yalnız kendi testini değil dosyadaki sonraki testleri de bozar; taraması yüksek getirili.
- **Sahte zaman tuzakları**: fake timer ile unmount, temizlenmeyen timer.
- **Sızdıran durum**: testler arası paylaşılan modül seviyesi durum, sıraya bağımlı geçme.
- **`skip`/`todo`/koşullu atlama**: `rg -n "\.skip\(|it\.todo|describe\.skip" ` sayımı ve nedenleri.

### 3. Kapı gücü (CI)

- `ci.yml` içinde gerçekte koşan işler ile kök `ci` script'i uyuşuyor mu?
- Kök `ci` zinciri `test:coverage`'ı yalnız `@wizards/web` için koşuyor. **Mobil (214+129 dosya), types, db, desktop süitleri CI'da koşuyor mu?** Koşmuyorsa bu `critical`: 343 mobil test dosyası kapının dışında demektir.
- Kapsam eşiği var mı, düşünce build kırılıyor mu?
- Lint gerçekten hata mı veriyor yoksa uyarı mı? `eslint .` sıfır uyarı politikası var mı?
- Tip kapısı: `typecheck`, `typecheck:main:ci`, `typecheck:compat`, `typecheck:declarations` neyi ayrı ayrı koruyor? Biri gereksizse ya da biri eksikse yaz.
- E2E kapıda mı, nightly mi, hiç mi? `mobile-redesign-device-gate-nightly.yml` neyi kapsıyor, kırıldığında kim görüyor?
- `pnpm audit` kapıda ama hangi eşikte; `cargo audit` kapıda mı?
- Kırmızı kapının atlanabilirliği: `continue-on-error`, `|| true`, koşullu `if` ile susturulmuş adımlar. `rg -n "continue-on-error|\|\| true" .github/workflows`

### 4. Kod kalitesi (statik)

- Tip kaçakları: `any`, `as unknown as`, `@ts-expect-error`, `@ts-ignore` sayımı ve yoğunlaştığı dosyalar. Yoğunluk bir sonraki hata yerini gösterir.
- Yasaklı desenler: `console.log` üretim yolunda, `TODO`/`FIXME` sayımı ve en eskileri, ölü kod (hiç import edilmeyen dışa aktarım — `graphify` fan-in 0 düğümleri).
- Kopya kod: aynı mantığın web ve mobilde ayrı yaşadığı yerler (`A1 §4` ayrışma listesiyle çakışır — orada kavram, burada satır düzeyi).
- Dosya büyüklüğü dağılımı: 500+ satır dosyaların listesi ve sorumluluk sayısı.
- Karmaşıklık: en derin iç içe koşullu bloklar, 5+ parametreli fonksiyonlar.
- Lint yapılandırmasının kendisi: `apps/web/scripts/eslint-config.test.mjs` neyi zorluyor; kapalı olan önemli kurallar (`react-hooks/exhaustive-deps`, `no-floating-promises`) var mı?
- Yüzen promise / yakalanmayan hata: `rg -n "void [a-z]|\.catch\(\(\) => \{\}\)" ` deseni.

### 5. Test mimarisi

- Test yardımcıları tekrar mı ediyor, tek yerde mi? Fixture/factory var mı?
- Veritabanı gerektirmeyen birim testi kuralı korunuyor mu, yoksa bazı testler gerçek Prisma'ya mı bağlanıyor?
- Süit süresi: hangi dosyalar süitin çoğunu yiyor; kapı maliyeti geliştirici geri bildirim döngüsünü bozuyor mu?
- Mutasyon dayanıklılığı için aday alanlar: kritik saf fonksiyonlar (izin hesaplama, mesaj gruplama, oran sınırı, sayaç mantığı) — mutasyon testi çalıştırılmaz, ancak "bu fonksiyonun bir satırı bozulsa hangi test kırmızıya döner?" sorusu incelenen her kritik fonksiyon için yanıtlanır. Yanıt "hiçbiri" ise bulgu.

## Yapılmayacaklar

- Test yazmak veya var olan testi düzeltmek. Envanter ve boşluk raporu üretilir; testler `A7` planına girer.
- Kapsam yüzdesini tek başına hedef yapmak. "%80'e çıkarın" bulgu değildir; "şu davranış hiç test edilmiyor" bulgudur.
- Stil/format bulgusu (Prettier zaten kapıda).
- Yeni test aracı önermek (mutasyon aracı, yeni runner) — ancak mevcut araçla kapatılamayan somut bir boşluk gösterilirse.

## Teslim

1. `raporlar/A4.findings.json` — `metrics` bölümü zengin olmalı: süit sayıları, süreler, kapsam yüzdeleri, `any` sayısı, `skip` sayısı, testsiz rota sayısı.
2. `raporlar/A4-rapor.md`, ek olarak:
   - **Süit tablosu**: süit, dosya, test, geçen, süre, CI'da koşuyor mu.
   - **Testsiz kritik yüzey listesi**: rota/modül, neden kritik, önerilen ilk test.
   - **Kapı zafiyeti tablosu**: kapı adımı, neyi yakalar, neyi kaçırır.
   - **En düşük kapsamlı 30 dosya** (kapsam raporu varsa).
3. `A7` için hazır girdi: her boşluk için önerilen test tipi (birim / bileşen / sözleşme / e2e) ve efor.

## Kapı

`00 §8` üç kontrol + :

```bash
node -e "const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A4.findings.json');const need=['web birim','mobil birim','mobil bilesen','e2e','testsiz rota'];const names=(f.metrics||[]).map(m=>m.name.toLowerCase()).join('|');console.log(need.map(n=>n+': '+(names.includes(n.split(' ')[0])?'var':'YOK')).join('\n'))"
```

Süit sayıları ve testsiz rota sayısı `metrics` içinde yoksa eksen bitmemiştir.

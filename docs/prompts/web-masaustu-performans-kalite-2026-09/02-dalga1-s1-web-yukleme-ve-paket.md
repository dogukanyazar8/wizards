# D1 / Ş1 — Web yükleme ve paket

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/00-baseline.json` var.
Tür: **salt okuma.** Yalnız `raporlar/S1.findings.json` + `raporlar/S1-rapor.md` yazılır.
Sahiplik: _baytlar ve yükleme sırası_ — hangi kod, hangi rotada, ne zaman indirilip parse ediliyor. Yüklendikten sonraki render maliyeti Ş2'nin; sunucu tarafı veri yükleme Ş3'ün.

## Amaç

Her ana rotanın ilk yükleme maliyetini (`M-BND-*`, `M-LAB-P1/P2/P3`) **modül düzeyinde açıklamak** ve her büyük kalemi "gerekli / ertelenebilir / hiç gerekmiyor" diye sınıflamak. Masaüstü aynı içeriği WebView2'de yükler; WebView2 HTTP önbelleği kalıcı olduğu için masaüstünde ağdan çok **parse/compile/execute** maliyeti belirleyicidir — her bulguda iki yüzeyi ayrı değerlendir.

## Önceki bulgular (priorStatus zorunlu)

F-08 (üç alt madde: bütçe, livekit lazy, zod), principal yol haritası #8–#10, `denetim-2026-08/16` (LiveKit paket bölme), A2-003.

## Tohum

```bash
graphify explain "LiveVoiceProvider()"
graphify explain "AuthenticatedAppProviders()"
graphify path "apps/web/src/components/providers/authenticated-app-providers.tsx" "livekit-client"
graphify explain "locale-provider.tsx"
```

```bash
rg -n "from \"livekit-client\"|from \"@livekit/" apps/web/src --glob '!*.test.*'
rg -n "from \"@wizards/types\"" apps/web/src --glob '!*.test.*' -l
rg -n "^import (?!type)" apps/web/src/lib/locale.ts
rg -n "\"use client\"" apps/web/src/app --glob '*.tsx' -l
rg -n "next/dynamic|React.lazy|import\(" apps/web/src --glob '!*.test.*'
rg -n "localFont\(|preload" apps/web/src/app/layout.tsx
```

`ANALYZE=true pnpm --filter @wizards/web build` analyzer çıktısını ve D0 `bundle-report` çıktısını birlikte kullan. Build sonrası `next-env.d.ts`'yi geri yükle (00 §3).

## Kapsam matrisi

| Birim                                                                                         | Hedef                                                             |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| D0 rota listesi (8 rota)                                                                      | %100 — her rotanın en büyük 10 chunk'ı içerik olarak açıklanır    |
| Ortak kök (`M-BND-root`)                                                                      | %100 modül dökümü                                                 |
| Provider zinciri (`app/layout.tsx` → `(main)/layout.tsx` → `authenticated-app-providers.tsx`) | %100 — her provider'ın statik import ağırlığı                     |
| `"use client"` sınırları, `app/**` altında                                                    | %100 envanter; en üstteki 15 sınır elle                           |
| Üçüncü taraf paketler (`apps/web/package.json` dependencies)                                  | her biri için: hangi rotada, eager mi lazy mi, bayt               |
| Font, CSS, görsel                                                                             | kök layout fontları, rota CSS'i, `next/image` dışı `<img>` sayısı |

## Aranacak kusur sınıfları

1. **Yanlış rotada eager kod.** Kanıt zinciri zorunlu: statik import yolu (dosya:satır → dosya:satır) + chunk içeriği + D0 rota ölçümü. Bilinen adaylar (00 §4.3): LiveKit (`voice-provider.tsx:5` → `authenticated-app-providers.tsx:72`), iki dilin birden istemcide olması (`lib/locale.ts:7-8` + 5 `"use client"` tüketici), kök zod chunk'ı. Diğerlerini ara: `@emoji-mart/data`, `framer-motion` (`LazyMotion` + `m` kullanılıyor mu?), `@dnd-kit/*`, `@tauri-apps/api` (masaüstü olmayan tarayıcıda gereksiz mi?), `@uploadthing/react`, `qrcode`, Sentry istemci entegrasyonları (replay/feedback açık mı?), admin'e özgü kodun ana rotalara sızması.
2. **Tip-yalnız import olması gerekirken değer import'u.** `@wizards/types`'tan istemciye zod şeması çeken dosyalar; `import type` yeterli olanları say. Şema istemcide gerçekten doğrulama için mi kullanılıyor, yoksa yalnız tip için mi?
3. **`"use client"` sınırının gereğinden yukarıda olması.** Layout veya sayfa kökü istemci bileşeniyse, sunucuda kalabilecek ağaç istemciye kayar (hidrasyon + JS). Sınırı aşağı çekmenin mümkün olduğu yerleri kanıtla.
4. **Provider yığını.** Oturumlu ağaçtaki her provider'ın ilk render'da yaptığı iş ve bağımlılık ağırlığı; kullanılmayan rotalarda da açılanlar.
5. **Font ve CSS.** 6 `localFont`'un her sayfada kaç dosyayı preload ettiği (`M-BND-fonts`); kullanıcı yalnız birini seçiyorsa diğerlerinin preload'u. Tasarım token CSS'inin boyutu (23 palet); kullanılmayan palet/tema değişkenlerinin her sayfada inmesi.
6. **Prefetch davranışı.** `<Link>` otomatik prefetch'i ve `channel-sidebar.tsx:1149,1431` `prefetchChannel`: kenar çubuğunda N kanal varken kaç RSC/veri isteği tetikleniyor (D0 P2/P3 ağ kaydından say).
7. **RSC yükü.** Sayfa HTML'indeki satır içi `self.__next_f` yükünün boyutu (`/home`, kanal rotası); istemciye gereksiz serileştirilen veri.
8. **Önbellek ve sıkıştırma.** Özel `server.ts` altında `_next/static` yanıtlarının `Cache-Control: immutable` ve `Content-Encoding` (br/gzip) taşıyıp taşımadığı — `curl -sI` ile ölç, prod build'de. Deploy başına chunk hash kararlılığı (her deploy tüm önbelleği boşaltıyor mu).
9. **Ses katılımında gecikmeli maliyet.** Krisp WASM (1,9 MB gz) ve livekit chunk'larının ilk "katıl" tıklamasında indirilmesi: P9 süresine katkısı; önceden ısıtma (idle prefetch) gerekli mi — yalnız ölçüm destekliyorsa öner.

Her bulguda `expectedGain.basis` dürüst olsun: bayt ölçüldüyse `measured-bytes`; LCP/INP etkisi ölçülmediyse ayrıca `hypothesis` notu.

## Ek ölçüm (izinli, kod değiştirmeden)

- Modül bazlı bayt: source map'ten veya analyzer'dan.
- `M-LAB-P1/P2` koşusunda ana iş parçacığı zaman dağılımı: CDP `Tracing` ile parse/compile/evaluate süresi, en pahalı 10 script (`dusuk` profil). Kazanç tahminini bayta değil bu süreye bağla.
- Masaüstü ikinci açılış: WebView2 önbelleği doluyken P2 eşdeğeri — K2-A ile yalnız oturumsuz yüzeyde.

## Yapılmayacaklar

- Değişiklik. Build öncesi/sonrası dışında dosya yazma.
- "Tree-shaking'i iyileştirin" gibi genel öneri. Her öneri bir import satırına ve ölçülmüş bayta bağlı.
- Mobil paket, Metro.

## Teslim

`raporlar/S1.findings.json` (00 §8) ve `raporlar/S1-rapor.md`; rapora ek olarak:

- **Rota tablosu:** rota, JS gz/br, CSS, font, en büyük 5 kalem (paket adıyla), eager/lazy, bu rotada gerekli mi.
- **Kök chunk dökümü:** `M-BND-root`'u oluşturan modüller ve her birinin neden kökte olduğu (import zinciri).
- **Bütçe önerisi:** rota başına hedef gz (bugün, önerilen, gerekçe = hangi bulgular kapanınca). Ş7 bunu `08-butceler.json`'a taşır.

## Kapı

00 §12'nin dört kontrolü (`S1`). Ek: rota tablosundaki her rota için `M-BND-*` kimliği `00-baseline.json`'da var.

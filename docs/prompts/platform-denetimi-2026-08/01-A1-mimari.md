# A1 — Mimari denetimi

Ön koşul: `00-ortak-baglam.md` okundu, temel ağaç kuruldu.
Çıktı: `raporlar/A1.findings.json` + `raporlar/A1-rapor.md`.

## Amaç

Whispr'ın modül sınırlarını, bağımlılık yönünü ve sözleşme bütünlüğünü ölçmek. Soru: **bu yapı 10× özellik ve 10× ekip büyüklüğünde ayakta kalır mı?** Kalmıyorsa hangi sınır önce çöker, hangi kanıtla.

## Tohum sorgular

```bash
graphify query "module boundaries between apps/web, apps/mobile and packages" --budget 8000
graphify query "shared contract layer packages/types and its consumers" --budget 8000
graphify explain "socket event contract"
graphify explain "realtime provider"
graphify path "apps/mobile/src/realtime" "apps/web/src/lib/socket"
graphify path "packages/db/prisma/schema.prisma" "apps/web/src/app/api"
graphify query "god nodes with highest fan-in" --budget 8000
```

`GRAPH_REPORT.md` yalnız topluluk yapısı ve god node listesi için açılır.

## Kapsam matrisi

Her satır `surfaceCoverage` içinde bir giriş olur. `unitsInspected` gerçek sayıdır, tahmin değil.

| Yüzey                                                     | Birim            | Hedef kapsam                                      |
| --------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| `packages/types/src`                                      | 33 dosya         | %100 — paylaşılan sözleşmenin tamamı              |
| `apps/web/src/lib/**` üst klasörler                       | ~50 alan klasörü | %100 klasör düzeyi, en ağır 15'i dosya düzeyinde  |
| `apps/web/src/app/api/**/route.ts`                        | 228 rota         | %100 dizin/isimlendirme düzeyi, örneklem 25 dosya |
| `apps/mobile/src` üst klasörler                           | 37 alan klasörü  | %100 klasör düzeyi, en ağır 10'u dosya düzeyinde  |
| `apps/desktop/src-tauri/src`                              | 5 dosya          | %100                                              |
| `packages/db` + `schema.prisma`                           | 69 model         | %100 model düzeyi                                 |
| `packages/ui`                                             | 8 dosya          | %100                                              |
| `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | 3 dosya          | %100                                              |

## Aranacak kusur sınıfları

Her başlık altında en az bir kez somut arama yapılır; bulgu yoksa `A1-rapor.md`'de "arandı, bulunmadı" yazılır.

### 1. Katman ihlali ve bağımlılık yönü

- `packages/*` içinden `apps/*`'a ithal (yasak yön). `rg -n "from ['\"](\.\./)*apps/" packages/`
- Web'in mobil dosyalarına, mobilin web dosyalarına doğrudan erişimi.
- `@wizards/db` (Prisma tipleri dahil) istemci paketlerine sızıyor mu? Prisma tipinin React bileşenine kadar yolculuğu `graphify path` ile izlenir.
- Rota dosyasında (`route.ts`) doğrudan `prisma` çağrısı mı var, yoksa `route-logic.ts` deseninde DI'lı servis mi? Oran ölçülür — bu aynı zamanda `A4`'ün test edilebilirlik tabanıdır.

### 2. Sözleşme bütünlüğü (`packages/types`)

- Aynı kavramın iki yerde ayrı tanımı: socket olay payload'ı `packages/types/src/socket.ts` ile web handler ve mobil bridge'de üçe ayrılmış mı?
- Zod şeması olan ama rotada kullanılmayan sözleşmeler; rotada elle parse edilen ama şeması olmayan gövdeler.
- `.strict()` kullanımı tutarlı mı? Tüketici şemasında `.strict()` yokken ayrıcalıklı alan taşınabiliyor mu (`CreateServerSchema` deseni).
- İki istemcinin (web/mobil) aynı uca farklı şekil göndermesi. `apps/mobile/src/api` ile `apps/web/src/lib/api.ts` karşılaştırılır.

### 3. God node ve tek dosya yığılması

- `graphify query "god nodes with highest fan-in"` çıktısındaki ilk 15 düğüm listelenir; her biri için: satır sayısı, fan-in, sorumluluk sayısı.
- Bilinen adaylar (doğrulanacak, varsayılmayacak): `apps/desktop/src-tauri/src/lib.rs` (5.193 satır), `apps/web/src/lib/socket/handlers/*`, mobil `voice-screen.tsx`, `dm-screen.tsx`.
- Ölçüt: bir dosya **birden çok değişim sebebine** hizmet ediyorsa ve fan-in yüksekse bulgu. Yalnız uzun olması bulgu değil.

### 4. Paylaşılan katmanın yokluğu

`packages/ui` 88 satır. Yani web ve mobil, aynı ürün kavramlarını (mesaj balonu, presence rozeti, kanal satırı, ses odası kutucuğu) iki kez, iki farklı sözleşmeyle üretiyor.

- Her iki tarafta paralel yaşayan **kavram** listesi çıkarılır (kod değil kavram: presence durumları, mesaj gruplama kuralı, okundu bilgisi, rozet ailesi, tema token'ları).
- Her kavram için: iki tarafın davranışı ayrışmış mı? Ayrışma kanıtı `file:line` çiftidir (web tarafı X, mobil tarafı Y).
- Bu bölüm `A5`'in UI parite bulgularının kaynağıdır; ayrışma listesi JSON'da `category: "cross-platform-divergence"` ile işaretlenir.

### 5. Gerçek zaman mimarisi

- Socket.IO web sunucusuyla aynı süreçte (`server.ts`). Yatay ölçekte oda üyeliği/yayın nasıl paylaşılıyor? Redis adapter var mı, yoksa tek örnek varsayımı mı var?
- Olay yayınının tek yazıcısı kim? Aynı state'i (presence, unread, typing) hem HTTP rotası hem socket handler yazıyorsa yarış kapısı nerede?
- Outbox worker'ın rolü: hangi olaylar outbox'tan, hangileri doğrudan? İkisinin arasındaki sıralama garantisi ne?
- `fetchSockets`/`socketsLeave` gibi çoklu-örnek davranışı olan çağrılar tek örnek varsayımıyla mı yazılmış?

### 6. Veri modeli sınırları

- 69 model içinde döngüsel bağımlılık, aşırı geniş `User` modeli, alan başına ayrı tablo mu yoksa JSON kolon mu tercih edilmiş.
- Denormalize sayaçlar (`memberCount`, `unreadCount`) — kim yazıyor, telafi (repair) yolu var mı?
- Soft delete tutarlılığı: `deletedAt` taşıyan modeller ile taşımayanlar; sorgu tarafında filtre unutulmuş yer var mı?
- Migration disiplini: 22 migration `rebaseline-migrations` altında; `packages/db/prisma/migrations/` bayat dizininde dosya kalmış mı (kalmışsa kafa karışıklığı bulgusudur).

### 7. Yapı sistemi ve sınır zorlaması

- `turbo.json` görev grafiği doğru mu? `typecheck` `db:generate`'e bağlı mı, cache anahtarları doğru mu?
- Sınırlar **araçla** zorlanıyor mu (eslint import kuralı, `exports` alanı, project references) yoksa yalnız gelenekle mi? Zorlanmıyorsa ihlal kaçınılmazdır — bu tek başına bir `medium` bulgudur.
- `tsconfig.base.json` path alias'ları ile gerçek klasör yapısı uyuşuyor mu?

## Yapılmayacaklar

- Kod düzenleme, yeniden adlandırma, dosya taşıma.
- "Mikroservise bölün", "monorepo'yu polyrepo yapın" gibi ölçüsüz yapı önerisi. Öneri ancak ölçülmüş bir acıya (derleme süresi, ekip çakışması, dağıtım bağımlılığı) bağlıysa yazılır.
- Çerçeve seçimini sorgulamak (Next.js/Expo/Tauri). Seçim veri; denetlenecek olan kullanım biçimidir.
- Performans ve güvenlik bulgusu yazmak — onlar `A2`/`A3`. Mimari kusurun performansa/güvenliğe yol açtığı yerde bulguyu burada yaz ama `category` alanına `architecture` koy ve ilgili ekseni `impact` içinde adıyla an.

## Teslim

1. `raporlar/A1.findings.json` — şema `00 §5`.
2. `raporlar/A1-rapor.md` — düzen `00 §7`, ek olarak:
   - **Bağımlılık yönü tablosu**: hangi paket hangisine bağlı, ihlal var mı.
   - **God node tablosu**: dosya, satır, fan-in, sorumluluk sayısı.
   - **Çapraz platform ayrışma tablosu**: kavram, web `file:line`, mobil `file:line`, ayrışma özeti.
3. Mimari şema **metin olarak** (mermaid `flowchart`) — `A8` bunu HTML'e gömecek. Kutu sayısı ≤ 20; her kutu gerçek bir dizin/süreçtir, kavram değil.

## Kapı

`00 §8`'deki üç kontrol, `A1` için. Ek olarak:

```bash
node -e "const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A1.findings.json');const c=f.surfaceCoverage;console.log(c.map(s=>s.surface+' '+s.unitsInspected+'/'+s.unitsTotal).join('\n'))"
```

Kapsam matrisindeki sekiz satırın sekizi de çıktıda görünmeli.

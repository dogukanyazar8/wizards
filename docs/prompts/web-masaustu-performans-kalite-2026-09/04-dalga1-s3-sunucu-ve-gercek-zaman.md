# D1 / Ş3 — Sunucu ve gerçek zaman (web + masaüstünün arka ucu)

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/00-baseline.json` var.
Tür: **salt okuma.** Yalnız `raporlar/S3.findings.json` + `raporlar/S3-rapor.md`. Ölçüm için yerel süreç başlatmak serbest; repo dosyası değiştirmek değil.
Sahiplik: istek/olay sunucuya vardığı andan yanıt/yayın çıkana kadar — RSC sayfa yükleyicileri, API rotaları, Socket.IO handler'ları, Prisma, Redis, event loop, süreç içi işçiler. Mobil uçları (`/api/v1/mobile/**`) yalnız web/masaüstüyle paylaşılan servis yolu üzerinden kapsamda.

## Amaç

D0'daki `M-SRV-*` ve `M-LAB-P2/P3/P6` sunucu payını **kaleme ayırmak** (DB, Redis, izin, serileştirme, fan-out) ve mesaj gönderim yolunun büyüyen sunucuda nerede duvara çarpacağını ölçümle göstermek. Principal F-10 "şimdilik yalnız ölç" dedi; bu şerit ölçer.

## Önceki bulgular (priorStatus zorunlu)

A2-001 (`fetchSockets` sıcak yolda), A2-002, A2-004, A2-005, A6-001 (okunmamış sayacı `COUNT`), principal F-01/F-04 (WIP'te uygulandı), F-09, F-10, F-14, F-15, `denetim-2026-08/13` (sunucu sıcak yollar, 8 eksik rate limit, bootstrap memo) ve `/14` (10 sınırsız okuma, 10 seri tur, outbox payload).

## Tohum

```bash
graphify explain "initSocketServer()"
graphify explain "emitChannelMessageFanout()"
graphify explain "revalidateSocketSessions()"
graphify path "apps/web/src/lib/socket/handlers/message.ts" "apps/web/src/lib/workspace/channel-message-send-service.ts"
graphify explain "getCurrentUserForSession()"
graphify query "requireAuth getCurrentUserForSession layout loader" --budget 8000
```

```bash
rg -n "fetchSockets\(" apps/web/src --glob '!*.test.*'
rg -n "findMany\(" apps/web/src --glob '!*.test.*' -c
rg -n "\$transaction\(" apps/web/src --glob '!*.test.*'
rg -n "import \{ cache \}|React\.cache|unstable_cache" apps/web/src --glob '!*.test.*'
rg -n "setInterval\(|setTimeout\(" apps/web/server.ts apps/web/src/lib --glob '!*.test.*'
rg -n "JSON\.stringify\(" apps/web/src/lib/socket --glob '!*.test.*'
```

## Kapsam matrisi

| Birim                                                                                                                                | Hedef                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| RSC yükleyiciler: `app/(main)/layout.tsx` (`requireAuth` `:33` + `getCurrentUserForSession` `:34`) ve D0 rotalarının `page.tsx`'leri | %100 — istek başına DB/Redis tur sayısı, şelale, tekrarlanan `auth()` |
| D0 senaryolarında çağrılan API uçları (ağ kaydından)                                                                                 | %100 — Server-Timing kalemleri + Prisma sorgu sayısı                  |
| `lib/socket/handlers/*`                                                                                                              | %100 — olay başına DB/Redis turu, izin kontrolü maliyeti              |
| Mesaj gönderim yolu (socket ve REST)                                                                                                 | uçtan uca %100: doğrulama → yazma → okunmamış → fan-out → emit        |
| Süreç içi işçiler (`server.ts:93,97`, socket `presenceHeartbeat` `lib/socket/server.ts:629`)                                         | %100 — periyot, iş boyutu, event loop'taki payı                       |
| En pahalı 15 Prisma sorgusu (sıklık × süre)                                                                                          | `EXPLAIN (ANALYZE, BUFFERS)` gerçekçi hacimle                         |

## Ölçüm (izinli)

- **Sorgu sayımı:** yerel prod sunucuda Prisma sorgu olaylarını bir preload modülüyle say (scratchpad; `@prisma/instrumentation` zaten bağımlılık). İstek başına sorgu sayısı ve toplam süre — D0 P2/P3/P6 akışlarında.
- **EXPLAIN:** yerel Postgres'te seed hacmi yetersizse scratchpad betiğiyle sentetik hacim üret (≥ 200k mesaj, ≥ 2k üyeli sunucu). Yalnız yerel DB; prod/UAT'a bağlanma (UAT DB'ye dışarıdan erişim yok zaten).
- **Fan-out ölçeği (B4'ün yerel hali):** `socket.io-client` ile scratchpad betiği; 100 / 500 / 1.000 bağlı istemci tek sunucuya, 5 mesaj/sn. `M-SRV-FANOUT-*` (`recordMessageSendFanoutMetric`), `M-SRV-ELD-p99`, süreç CPU. Makine sınırına gelirsen dur ve sınırı raporla.
- **Event loop blokları:** D0 ELD histogramında sıçramaları olaylarla eşle; `--cpu-prof` ile 60 sn profil (P10 akışı sırasında) → en pahalı 10 fonksiyon.
- **bcrypt:** `bcryptjs` saf JS; giriş/parola uçlarında tek `compare`'ın event loop'u ne kadar tuttuğu (`PASSWORD_HASH_ROUNDS` ile) ve aynı anda gelen socket trafiğine etkisi. Ölçmeden bulgu yazma.

## Aranacak kusur sınıfları

1. **İstek başına tekrarlanan iş.** Aynı istekte layout + page + bileşenlerin ayrı ayrı `auth()`/kullanıcı/üyelik sorgusu; `React.cache` ile tekilleştirme yok (repoda `cache` kullanan yalnız 1 dosya).
2. **Şelale.** Bağımsız sorguların sıralı `await`'i (RSC ve route-logic).
3. **Sınırsız/şişkin okuma.** `take`'siz `findMany`, gereksiz `include`, istemcinin kullanmadığı alanları taşıyan DTO (yanıt baytı ölç).
4. **Mesaj yolunda O(üye) iş.** `getActiveServerMemberUserIds`, `readServerAuthorizationRevisions` (`userId IN (N)`), izin cache okuma, `channel:messages:stale` yayını — üye sayısıyla nasıl büyüdüğü **ölçülü** eğri. Discord'un pasif oturum yaklaşımı `[public-ref: discord.com/blog "Maxjourney: Pushing Discord's Limits with a Million+ Online Users in a Single Server"]` yalnız referans — erişilemezse `[assumption]` diye etiketle; öneri Whispr ölçeğine göre.
5. **Küme çapı çağrılar.** `fetchSockets()` her gönderimde iki kez (runbook). Replika sayısıyla büyür; tek replika ölçümü + model.
6. **Kopya iş mantığı** (F-09 sınıfı): socket handler ve REST route-logic'in aynı alan kararını ayrı yazdığı başka yerler (düzenleme, silme, tepki, okundu, sabitleme). Bu şerit _performans_ açısından kaydeder; tasarım boyutu Ş6'nın — Ş6'ya not düş, iki kez bulgulama.
7. **Event loop paylaşımı.** HTTP + Socket.IO + outbox + disappearing + presence heartbeat aynı süreçte; her birinin periyodik maliyeti ve çakışması. Outbox'ın hem ayrı serviste hem web sürecinde koşması (A2-005) bugün hâlâ doğru mu — env kapısıyla mı?
8. **Serileştirme.** Büyük olay yüklerinin her alıcı için ayrı `JSON.stringify`'ı (Socket.IO oda yayını tek serileştirme yapar; kullanıcı başına emit yapmaz) — izin filtreli `user:` odası kararı korunur (00 §9), maliyeti ölçülür.
9. **Sıkıştırma ve önbellek başlıkları** API yanıtlarında (Ş1 statik varlıkları kapsar).
10. **Kapanış ve yeniden bağlanma fırtınası.** F-15 (HTTP drain) durumu; F-01 düzeltmesinden sonra deploy'da 1.000 istemcinin eşzamanlı yeniden bağlanmasının maliyeti (jitter var mı, oturum revalidasyonu toplu mu).

## Yapılmayacaklar

- Değişiklik, migration, indeks ekleme (öneri olarak yaz; indeks önerisi `EXPLAIN` kanıtı + yazma maliyeti notu ister).
- Ölçümsüz cache katmanı önerisi; yeni altyapı (00 §9 "Önerilmeyenler").
- Güvenlik bulgusu avı (başka paket); gözüne çarparsa `openQuestions`.

## Teslim

`raporlar/S3.findings.json` + `raporlar/S3-rapor.md`; rapora ek:

- **Sıcak yol kalem tablosu:** akış (kanal aç, DM aç, mesaj gönder, bootstrap/ana sayfa) → sorgu sayısı, DB ms, Redis tur, izin ms, serileştirme ms, toplam (Server-Timing ile uzlaştırılmış).
- **Fan-out eğrisi:** bağlı istemci sayısı → gönderim p50/p95, ELD p99, CPU. Kırılma noktası ve hangi kalemin büyüdüğü.
- **Sorgu planları:** en pahalı 15 sorgu, plan özeti, önerilen indeks/yeniden yazım ve kanıtı.

## Kapı

00 §12'nin dört kontrolü (`S3`). Ek: fan-out eğrisinde en az üç nokta ölçülmüş olmalı veya neden ölçülemediği `openQuestions`'ta koşulabilir komutla yazılmalı.

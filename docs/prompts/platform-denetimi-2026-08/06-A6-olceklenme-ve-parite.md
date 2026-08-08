# A6 — Ölçeklenme ve endüstri paritesi

Ön koşul: `00-ortak-baglam.md` okundu.
Çıktı: `raporlar/A6.findings.json` + `raporlar/A6-rapor.md`.

## Amaç

İki bölüm:

**(a) Ölçeklenme.** Bugünkü mimarinin nerede duvara çarpacağını **sayıyla** göstermek. Soru soyut değil: 10 bin eşzamanlı sokete kadar ne olur, 100 binde ne kırılır, 1 milyon mesaj/gün veri büyümesinde hangi sorgu düşer, tek Postgres/tek Redis/tek Node süreci hangi sırayla tıkanır?

**(b) Parite.** Discord/Slack/Zoom seviyesinde bir ürünün taşıdığı yetenek ve işletme özelliklerine karşı Whispr'ın nerede olduğunu **yetenek düzeyinde** haritalamak.

Kritik kural: rakip hakkında yalnız kamuya açık, doğrulanabilir davranış yazılır ve `[public-ref]` etiketlenir. Çıkarımlar `[assumption]`. Uydurma iç metrik yasak (`00 §2.4`).

## Tohum sorgular

```bash
graphify query "socket server scaling and redis adapter" --budget 8000
graphify query "outbox worker and background jobs" --budget 8000
graphify explain "notification fan-out"
graphify query "database indexes and table growth" --budget 8000
graphify query "health checks and observability" --budget 8000
```

## Girdi gerçekleri

`00 §4`'teki platform haritası. Ek olarak bu eksende doğrulanacak (varsayılmayacak) noktalar:

- Web sunucusu ve Socket.IO **aynı süreçte** (`apps/web/server.ts`). Çok örnekli çalışmada oda yayını nasıl paylaşılıyor?
- Ayrı `outbox-worker` süreci var (`railway.outbox-worker.toml`). Hangi işler oradan geçiyor, kaç örnek koşuyor, kilitleme/tekilleştirme nasıl?
- Dağıtım Railway; `railway.toml` ve `docker-compose.yml` ölçek varsayımlarını gösterir.
- Ses/video LiveKit üzerinden — SFU kapasitesi ve maliyet modeli Whispr'ın kendi süreçlerinden bağımsız ölçeklenir; sınır ayrı hesaplanır.

## (a) Ölçeklenme analizi

### 1. Kapasite modeli

Her sıcak yol için **iş birimi başına maliyet** çıkar ve büyütme çarpanını yaz. Model basit olmalı, tahmin değil türetme:

| Yol                    | Birim        | Ölçülecek/türetilecek                                      |
| ---------------------- | ------------ | ---------------------------------------------------------- |
| Kanal mesajı gönderimi | 1 mesaj      | DB yazma sayısı, socket emit sayısı, bildirim kaydı sayısı |
| DM/grup DM mesajı      | 1 mesaj      | katılımcı sayısıyla nasıl büyüyor (lineer mi, kare mi)     |
| Presence değişimi      | 1 kullanıcı  | kaç sokete yayılıyor (arkadaş × sunucu × kanal)            |
| Typing                 | 1 tuş vuruşu | throttle var mı, yoksa vuruş başına yayın mı               |
| Sunucu açılışı/giriş   | 1 oturum     | bootstrap'te kaç sorgu, kaç Redis çağrısı                  |
| Bildirim               | 1 olay       | outbox satırı, push isteği, rozet güncellemesi             |
| Ses odası katılımı     | 1 katılım    | token üretimi, presence yazımı, oda durumu yayını          |

Her satır için: **N katılımcıda toplam maliyet formülü** (örn. `emit = üye sayısı`, `DB yazma = 1 + mention sayısı`). Formül kod okumasıyla türetilir, `evidence` ile bağlanır.

### 2. Duvar analizi

Sırayla hangi kaynağın tükeneceği:

- **Node süreci**: Socket.IO bağlantı başına bellek, event loop'u bloke eden iş, tek süreçte CPU tavanı. Yatay ölçek mümkün mü — sticky session gerekiyor mu, gerekiyorsa dağıtım bunu destekliyor mu?
- **Redis**: presence/oda/rate-limit anahtar sayısı büyümesi, `fetchSockets` gibi tüm-örnek çağrılarının maliyeti, TTL disiplini, tek örnek mi.
- **Postgres**: en hızlı büyüyen tablolar (mesaj, okundu durumu, bildirim, audit log), indeks boyutu, `count` sorguları, bağlantı havuzu tavanı, uzun kilit tutan işlemler.
- **Veri büyümesi**: 1 yıl sonra tablo boyutları (satır/gün × gün). Arşivleme/partisyonlama/temizleme (retention) politikası var mı? Yoksa bu tek başına `high`.
- **Migration**: 69 modelde şema değişikliği üretimde nasıl uygulanıyor? Kilitleyen migration (kolon ekleme + default, indeks oluşturma) için `CONCURRENTLY`/iki aşamalı desen var mı?
- **Medya/depolama**: yükleme boyut sınırı, saklama süresi, CDN/imzalı URL, maliyet eğrisi.

### 3. Dayanıklılık ve işletme

- Geri basınç (backpressure): kuyruk dolduğunda ne oluyor — düşürme mi, sonsuz büyüme mi?
- İdempotans: aynı olayın iki kez işlenmesi (retry, çift socket, outbox tekrarı) ürünü bozar mı?
- Kısmi arıza: Redis düştüğünde uygulama ne yapıyor (fail-open mı fail-closed mı — güvenlik kapısıysa fail-open bulgudur, `A3` ile çakışıyorsa orada tut).
- Zarif dağıtım: yeniden başlatmada açık soketler, devam eden yüklemeler, ses odaları ne oluyor?
- Gözlemlenebilirlik: hangi metrikler toplanıyor, SLO tanımı var mı, alarm var mı? `lib/health.ts`, `instrument.ts`, `apps/mobile/src/observability`.
- Çok bölge (multi-region) ve veri yerelliği: bugün tek bölge; parite hedefinde ne gerekir?

## (b) Parite analizi

Yetenek matrisi üret. Kaynak kod okuması + ürün yüzeyi; rakip sütunları yalnız kamuya açık davranış.

Boyutlar (her biri satır grubudur):

1. **Mesajlaşma**: thread, düzenleme/silme geçmişi, tepki, pin, arama (tam metin, filtreli), taslak senkronu, zamanlanmış mesaj, mesaj biçimlendirme, dosya önizleme, bağlantı önizleme.
2. **Ses/video**: oda kapasitesi, ekran paylaşımı (kalite/ses), kamera düzenleri, gürültü bastırma, kayıt, canlı altyazı, sahne/yayın modu, ağ dayanıklılığı göstergeleri.
3. **Kimlik ve organizasyon**: roller/izin matrisi granülaritesi, kategori/kanal izinleri, misafir erişimi, SSO/SCIM, denetim günlüğü, veri saklama politikası, uyum (KVKK/GDPR ihracat ve silme).
4. **Bildirim**: kanal/sunucu bazlı sessize alma, anahtar kelime, uyku saatleri, cihazlar arası okundu senkronu, rozet doğruluğu.
5. **Platform**: web, desktop (otomatik güncelleme, global kısayol, overlay), mobil (arka plan, push, çevrimdışı), erişilebilirlik, yerelleştirme.
6. **Genişletilebilirlik**: bot/webhook/slash komut/uygulama API'si, oran sınırı belgesi, geliştirici portalı.
7. **İşletme**: durum sayfası, SLA, olay yönetimi, yedekleme/geri yükleme tatbikatı, faturalandırma/planlar.

Her satır için sütunlar: `Whispr durumu` (yok / kısmi / var + `file:line` kanıtı), `Discord`, `Slack`, `Zoom` (etiketli), `boşluk` (bir cümle), `efor`, `dalga`.

**Parite boşluğu bulgu olarak yazılır** (`category: "parity-gap"`), ama `severity` ölçüsü kusur değil fırsat maliyetidir: kullanıcıyı bugün kaybettiren boşluk `high`, rekabet için gereken ama acil olmayan `medium`, uzun vadeli `low`.

## Yapılmayacaklar

- Rakip hakkında ölçülmemiş sayı yazmak (gecikme, kullanıcı sayısı, sunucu sayısı).
- "Kubernetes'e geçin", "event sourcing yapın", "CQRS uygulayın" gibi bağlamsız mimari önerisi. Öneri ancak duvar analizinde gösterilen somut sınıra bağlıysa yazılır.
- Bugünkü trafiği bilmeden "yetersiz" demek. Trafik bilinmiyorsa **senaryo bazlı** yaz: "1k eşzamanlıda X, 10k'da Y".
- Yetenek listesini ürün isteği listesine çevirmek. Her parite satırı teknik boşluğa bağlanmalı.

## Teslim

1. `raporlar/A6.findings.json` — ölçeklenme bulguları + parite boşlukları aynı dosyada, `category` ile ayrışır.
2. `raporlar/A6-rapor.md`, ek olarak:
   - **Kapasite tablosu** (yukarıdaki 7 satır, formüllerle).
   - **Duvar sırası**: hangi kaynak hangi eşikte tükenir, gerekçe.
   - **Parite matrisi** (7 boyut, tüm satırlar) — bu tablo `A8`'de HTML raporun ayrı sekmesi olacak, JSON'da da `parityMatrix` adıyla ayrı kök alan olarak yazılır:

```jsonc
"parityMatrix": [
  {
    "dimension": "Mesajlaşma",
    "capability": "Anahtar kelime bildirimi",
    "whispr": "yok",
    "evidence": [{ "file": "apps/web/src/lib/notifications/…", "line": 0, "quote": "" }],
    "discord": { "state": "var", "tag": "public-ref" },
    "slack": { "state": "var", "tag": "public-ref" },
    "zoom": { "state": "ilgisiz", "tag": "assumption" },
    "gap": "Kullanıcı kendi adının geçtiği mesajı yalnız mention ile yakalayabiliyor.",
    "effort": "M",
    "wave": "W3"
  }
]
```

3. Yıllık veri büyümesi projeksiyonu (satır/gün varsayımı açıkça yazılır, tablo boyutu türetilir).

## Kapı

`00 §8` üç kontrol + :

```bash
node -e "const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A6.findings.json');const p=f.parityMatrix||[];const dims=[...new Set(p.map(x=>x.dimension))];const kacak=p.filter(x=>['discord','slack','zoom'].some(k=>x[k]&&!['public-ref','assumption'].includes(x[k].tag)));console.log('parite satiri',p.length,'boyut',dims.length,dims.join('|'),'etiketsiz',kacak.length)"
```

Yedi boyutun yedisi de görünmeli ve `etiketsiz 0` olmalı.

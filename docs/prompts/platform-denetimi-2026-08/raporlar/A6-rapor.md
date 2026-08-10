# A6 — Ölçeklenme ve endüstri paritesi

Temel commit: `5a2b3990733b17672cf65fba631b7ec44a7bf96a` · Tarih: 2026-08-08
Kanonik veri: [`A6.findings.json`](A6.findings.json)

## Kapsam ve yöntem

Kapasite modeli kod okumasıyla **türetildi**, ölçülmedi — UAT veritabanına dışarıdan bağlanılamadığı için gerçek satır sayıları ve sorgu süreleri alınamadı. Bu yüzden bu eksende "ölçülmüş yavaşlık" yok; **yapısal ölçek duvarları** var.

Parite matrisi yetenek işaretçisi taraması + 69 model + 24 izin biti envanteri üzerine kuruldu. Rakip sütunları yalnız kamuya açık ürün davranışı; her hücre `[public-ref]` veya `[assumption]` etiketli.

## Bulgu özeti

critical 0 · high 1 · medium 2 · low 1 — toplam **4**

| id     | Başlık                                                | Sev    | Efor | Dalga |
| ------ | ----------------------------------------------------- | ------ | ---- | ----- |
| A6-001 | Okunmamış sayacı her okumada `COUNT` ile hesaplanıyor | high   | L    | W2    |
| A6-002 | İki şema modeli ölü: `Webhook`, `ScheduledEvent`      | medium | S    | W1    |
| A6-003 | SSO/SAML/SCIM yok — kurumsal kimlik katmanı hiç yok   | medium | XL   | W3    |
| A6-004 | Anahtar kelime bildirimi yok                          | low    | M    | W3    |

## Kapasite modeli

| Yol                      | Birim       | Maliyet formülü                                                                | Not                       |
| ------------------------ | ----------- | ------------------------------------------------------------------------------ | ------------------------- |
| Kanal mesajı gönder      | 1 mesaj     | 1 `message.create` + 1 oda emit + 1 `channel:messages:stale` + mention sorgusu | Emit oda tabanlı — doğru  |
| DM / grup DM mesajı      | 1 mesaj     | 1 katılımcı sorgusu + **katılımcı sayısı × emit** + konuşma güncellemesi       | Lineer, doğru             |
| Okunmamış hesaplama      | 1 okuma     | **görünür kanal sayısı × `COUNT(*)`** üzerinde `Message`                       | **A6-001 — ölçek duvarı** |
| Mobil bootstrap          | 1 açılış    | 7 sorgu, 6'sı `Promise.all` içinde paralel                                     | Verimli                   |
| Bildirim                 | 1 olay      | outbox satırı + 5 s'de bir yoklama × örnek sayısı                              | A2-005                    |
| Aktif izleyici çözümleme | 1 mesaj     | oda genişliğinde `fetchSockets()`                                              | A2-001                    |
| Presence değişimi        | 1 kullanıcı | **ölçülmedi**                                                                  | açık soru                 |

## Duvar sırası

1. **Postgres okuma yükü.** Okunmamış türetilmiş bir okuma modeli: yazma ucuz, okuma pahalı, okuma çok daha sık. `Message` en hızlı büyüyen tablo. Aynı mesaj gönderimi hem `fetchSockets` hem kanal sayısınca `COUNT` tetikliyor.
2. **Node event loop.** Socket.IO ve HTTP aynı süreçte (`server.ts:91-92`); ayrıca her web örneği outbox yokluyor.
3. **Redis.** Ölçülmedi — açık soru.

Yatay ölçek yolu açık: Socket.IO Redis adapter kurulu (A1'de doğrulandı), outbox `FOR UPDATE SKIP LOCKED` ile çok işçili çalışabiliyor.

## Parite matrisi

15 satır, 7 boyut. Tam tablo `A6.findings.json` → `parityMatrix`.

| Boyut               | Yetenek                             | Whispr                   | Discord | Slack | Zoom    |
| ------------------- | ----------------------------------- | ------------------------ | ------- | ----- | ------- |
| Mesajlaşma          | Thread / yanıt zinciri              | **var**                  | var     | var   | kısmi   |
| Mesajlaşma          | Tepki, pin, düzenleme, arama        | **var**                  | var     | var   | kısmi   |
| Mesajlaşma          | Mesaj iletme                        | **kısmi** (yalnız mobil) | var     | var   | ilgisiz |
| Mesajlaşma          | Zamanlanmış mesaj                   | **yok**                  | yok     | var   | ilgisiz |
| Ses/video           | Ekran paylaşımı                     | **var**                  | var     | var   | var     |
| Ses/video           | Kayıt                               | **yok**                  | kısmi   | var   | var     |
| Ses/video           | Canlı altyazı                       | **yok**                  | kısmi   | kısmi | var     |
| Kimlik              | Rol/izin granülaritesi              | **var** (24 bit)         | var     | kısmi | kısmi   |
| Kimlik              | SSO / SAML / SCIM                   | **yok**                  | yok     | var   | var     |
| Kimlik              | Denetim günlüğü + ihracat           | **var**                  | kısmi   | var   | var     |
| Bildirim            | Sessize alma, cihazlar arası okundu | **var**                  | var     | var   | kısmi   |
| Bildirim            | Anahtar kelime                      | **yok**                  | kısmi   | var   | ilgisiz |
| Platform            | Web + desktop + mobil               | **var**                  | var     | var   | var     |
| Genişletilebilirlik | Webhook / bot / slash / API         | **yok**                  | var     | var   | var     |
| İşletme             | Durum sayfası, SLO, olay yönetimi   | **yok**                  | var     | var   | var     |

Tüm rakip hücreleri etiketli; `etiketsiz 0`.

**Okuma:** çekirdek sohbet ve ses yüzeyi rekabetçi. Boşluklar üç kümede toplanıyor — **genişletilebilirlik** (ekosistem), **kurumsal kimlik** (satış önkoşulu), **işletme olgunluğu** (güven).

## Bulgular

**A6-001 — Okunmamış okuma modeli.** `unread-service.ts:169` her görünür kanal için `Message` üzerinde `COUNT(*)`, `:177`'de `LIMIT ${unreadCountCap}` ile sınırlı. 20 sunucu × 15 kanal = 300 sayım, her açılışta ve her yeni mesajda. Desen repoda zaten var: `DMParticipant.unreadCount` yazma zamanlı bir sayaç — kanal tarafında karşılığı yok.

**A6-002 — İki ölü model.** `schema.prisma:1629` `model Webhook`, `:1692` `model ScheduledEvent`. `prisma.webhook` çağrısı kod tabanında sıfır; `scheduledEvent`in tek referansı hesap silme yolundaki `deleteMany`. Şema "webhook altyapısı hazır" sinyali veriyor, davranış hiç çalıştırılmamış.

**A6-003 — Kurumsal kimlik yok.** SAML/SCIM/SSO için ne şema ne kod. Kimlik sağlayıcıları yalnız GitHub + Google OAuth. Slack ile aynı sınıfta yarışmayı engelleyen tek en büyük boşluk; bugün etkisi sıfır, fırsat maliyeti yüksek.

**A6-004 — Anahtar kelime bildirimi yok.** Kod tabanında `keyword` için sıfır eşleşme. Bildirim modeli mention + kanal ayarı ikilisiyle sınırlı.

## Ölçümler

| Metrik                           | Değer                               |
| -------------------------------- | ----------------------------------- |
| Prisma modeli                    | 69                                  |
| Ölü model                        | **2** (`Webhook`, `ScheduledEvent`) |
| İzin biti                        | **24**                              |
| Mobil bootstrap sorgusu          | 7 (6'sı paralel)                    |
| DM emit                          | 2 + katılımcı başına 1              |
| Parite boyutu / satırı           | 7 / 15                              |
| Whispr'da "yok" işaretli yetenek | **6**                               |

## Kapı sonucu

```
findings 4 sema disi 0
kanit hatasi 0        (13 alinti gercek satirlarla degistirildi)
parite satiri 15 boyut 7 etiketsiz 0
metrik 7 eksik 0
```

## Açık sorular

1. **Gerçek satır sayıları alınamadı.** UAT'ye dışarıdan bağlanılamıyor. Ölçüm: son SUCCESS deployment ortamında `SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20`.
2. Presence değişiminin fan-out genişliği ölçülmedi.
3. Redis anahtar büyümesi, TTL disiplini, pipeline kullanımı incelenmedi.
4. Bağlantı havuzu tavanı ve `max_connections` okunmadı.
5. Geri basınç, kısmi arıza (Redis düştüğünde), zarif dağıtım incelenmedi.
6. Medya/depolama maliyet eğrisi incelenmedi.
7. `Emoji` modelinin de ölü olup olmadığı kontrol edilmedi.
8. Parite matrisindeki yeteneklerin **UI derinliği** doğrulanmadı — var/yok düzeyinde kalındı. "var" işaretli bir yeteneğin rakip kalitesinde olup olmadığı ayrı inceleme ister.

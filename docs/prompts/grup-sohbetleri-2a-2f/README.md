# Grup sohbetleri 2a–2f — run-prompt paketi

Whispr mobil **grup sohbetleri**nin tam hâli: gruplu sohbet listesi, iki adımlı grup kurma, grup sohbeti, grup bilgisi, grup ayarları ve izinler.

Tasarım kaynağı: `design_handoff/design_handoff_whispr_mesajlasma/Whispr Mesajlaşma Redesign.dc.html` **satır 32–460** (`section#t2`), eşlik eden metin `PROMPT.md §11` (satır 253–435), ekran görüntüleri `screenshots/2a…2f-*.png`.

## Dosyalar

| Dosya                             | Kapsam                                                                                                                                                             | Ön koşul |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `00-ortak-baglam.md`              | Kurallar, doğrulanmış gerçekler, yüzey haritası, tuzaklar, alınmış kararlar. **Uygulanmaz, okunur.**                                                               | —        |
| `01-faz1-veri-ve-yetki.md`        | Migration (rol, izin, bildirim kademesi, sabitleme, açıklama, renk, geçmiş penceresi), izin guard'ları, DTO genişletmesi, grup yönetim uçları                      | —        |
| `02-faz2-davet-kaybolan-cagri.md` | `GroupInvite` + katılma akışı + **web `/g/[code]` sayfası**, kaybolan mesajlar + purge worker, grup çağrısı sunucu tarafı (LiveKit çok kişili, aktif çağrı durumu) | 01       |
| `03-faz3-mobil-temel-katman.md`   | `theme.groupChat` token grubu, kopya (tr+en), saf model modülü, istemci/query katmanı, rotalar, realtime köprüsü                                                   | 02       |
| `04-faz4-2a-2b-2c.md`             | 2a filtre çipleri + sabitlenen + grup satırı; 2b üye seçimi; 2c grup bilgileri; eski `group-create-screen.tsx` yerine iki gerçek adım; **web grup kurma paritesi** | 03       |
| `05-faz5-2d-2e-2f.md`             | 2d grup sohbeti, 2e grup bilgisi, 2f ayarlar/izinler, grup çağrısı mobil girişi, **web grup yönetim paneli**, paket kabul kriterleri ve cihaz test listesi         | 04       |

Sıra **zorunludur**. Her faz bir öncekinin sözleşmesine dayanır.

## Nasıl koşulur

Her prompt tek geçişte uygulanabilir bir dilimdir. Alt görevlere bölüp görev başına ayrı ajan turu açma.

```
1. 00-ortak-baglam.md oku
2. Faz dosyasını oku
3. graphify query ile dokunulacak yüzeyi doğrula
4. Uygula (test önce)
5. Fazın kapı komutlarını koş
6. docs/prompts/grup-sohbetleri-2a-2f/raporlar/<no>-rapor.md yaz
7. Commit için izin iste — kendiliğinden commit yok
```

## Çalışma koşulları

- Branch **`uat`**
- caveman **ultra** modu
- **graphify** kullanılır: her fazın başında `graphify query`, faz sonunda `graphify update .`
- Kararsız kalınan yerde **kullanıcıya sorulur**, tahmin edilmez
- **Gerçek cihaz testlerini kullanıcı yapar** — her faz sonunda cihaz test listesi üretilir
- Kalite çıtası: en üst düzey kıdemli mühendis işi. Sunucu tarafında zorlanmayan izin, ölçülmemiş sorgu, testsiz yol kabul edilmez.

## Alınmış kararlar (2026-08-11, kullanıcı)

| Konu                       | Karar                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Grup sesli/görüntülü arama | **Tam grup çağrısı** — LiveKit çok kişili, halka fan-out, süregelen çağrıya katılma. Sunucu Faz 2, mobil Faz 5            |
| Davet bağlantısı           | **Tam katılma akışı** — `GroupInvite` modeli, kod üretimi/yenileme, public önizleme, deep link ile katılma                |
| Kaybolan mesajlar          | **Tam özellik** — konuşma penceresi, `DMMessage.expiresAt`, purge worker, realtime silme, istemci filtresi                |
| İzinler + geçmiş penceresi | **İkisi de sunucuda zorlanır** — 4 izin kolonu + tüm yazma yollarında guard; geçmiş penceresi mesaj sorgusunda            |
| Web paritesi               | **Tam** — grup ayarları, izinler, roller, davet bağlantısı, kaybolan mesajlar web'de de yönetilir (Faz 2/4/5'e dağıtıldı) |
| 2a çevrimiçi şeridi        | **Kalkar** — HTML kazanır; arama → filtre çipleri → liste                                                                 |
| 2b "Sık mesajlaştıkların"  | Mevcut sohbet listesinden türetilir (son 30 günde mesajlaşılmış en yeni 5 birebir DM); yeni sayım ucu yok                 |

## Bu paket neden var

Grup DM'in **iskeleti** 2026-08-07'de indi (`ConversationType.GROUP_DM`, `group-service.ts`, `/dm/groups` uçları, mobil tek-rota grup kurma). Tasarım 2a–2f bu iskeletin üstüne **on üç veri parçası** istiyor ve bunların hiçbiri bugün yok: rol, dört izin, bildirim kademesi, sabitlenen sohbet, sabitlenmiş mesaj, açıklama, grup rengi, üye adı rengi, geçmiş penceresi, davet bağlantısı, kaybolan mesaj penceresi, okundu yığını, filtre durumu.

Bunlar ekran yazılırken keşfedilseydi her ekran fazı üç tura çıkardı. Burada tüm veri işi Faz 1'de, üç ağır arka uç özelliği Faz 2'de, tüm ortak mobil katman Faz 3'te kapanıyor; iki ekran fazı yalnız render ediyor.

## Durum

Paket yazıldı, **hiçbir faz uygulanmadı** (2026-08-11).

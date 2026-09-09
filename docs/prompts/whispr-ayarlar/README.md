# Whispr · Bildirimler + Ayarlar paketi

Kaynak tasarım: `design_handoff/ayarlar-paketi/`
Dal: `uat` · Hedef: web + masaüstü
**Durum:** paket yazıldı, hiçbir şerit koşulmadı. Sıradaki: **Dalga 0 · Ş0**.

## Ne yapılıyor

Dört yüzey uçtan uca yeniden inşa ediliyor:

| Yüzey                       | Ölçü             | Tetikleyici               |
| --------------------------- | ---------------- | ------------------------- |
| Bildirimler paneli          | 400 px popover   | Başlıktaki zil            |
| Bildirim ayarları penceresi | 560 px modal     | Panelin dişlisi           |
| Kullanıcı barı menüsü       | 308 px popover   | Kullanıcı barındaki dişli |
| Ana Ayarlar penceresi       | 1180 × 800 modal | Menü › Ayarlar            |

İçerik (referans `SET` dizisinden sayıldı): **6 bölüm · 27 alt sekme · 58 grup · 170 satır ·
13 kontrol tipi · 20 özel blok · 3 riskli blok.**
Gelişmiş bildirim ayarları ayrı pencere değil — Bildirimler bölümünün 7 sekmesinde yaşar.

## Dosyalar

| Dosya                                                                                        | Ne için                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`PLAN.md`](PLAN.md)                                                                         | Kod gerçekleri, 13 karar, veri sözleşmesi, API, bileşen ağacı, dalga planı, kabul kriterleri |
| [`00-ortak-baglam.md`](00-ortak-baglam.md)                                                   | **Her şerit önce bunu okur.** Kararlar, 15 tuzak, 9 sapma, kalite çıtası. Uygulanmaz         |
| [`BASLATMA-PROMPTLARI.md`](BASLATMA-PROMPTLARI.md)                                           | 14 şeridin kopyala-yapıştır başlatma bloğu + eşzamanlılık haritası                           |
| [`01-dalga0-s0-sozlesme.md`](01-dalga0-s0-sozlesme.md)                                       | Migration · tipler · ölçü sözlüğü · içerik ağacı · i18n · parity                             |
| [`02-dalga1-s1-bildirim-tercihleri-api.md`](02-dalga1-s1-bildirim-tercihleri-api.md)         | Tercih ucu + gönderim kapısı                                                                 |
| [`03-dalga1-s2-bildirim-merkezi-api.md`](03-dalga1-s2-bildirim-merkezi-api.md)               | Sekmeler · gün grupları · çevirme · dörtlü sayaç · socket                                    |
| [`04-dalga1-s3-hesap-guvenlik-api.md`](04-dalga1-s3-hesap-guvenlik-api.md)                   | Parola · 2FA · oturumlar · güvenlik günlüğü · veri                                           |
| [`05-dalga1-s4-istisnalar-arama.md`](05-dalga1-s4-istisnalar-arama.md)                       | Üç tablodan tek istisna listesi + arama indeksi                                              |
| [`06-dalga2-s5-pencere-kabugu.md`](06-dalga2-s5-pencere-kabugu.md)                           | Rota · modal · nav · başlık · sekme şeridi · kayıt                                           |
| [`07-dalga2-s6-satir-motoru.md`](07-dalga2-s6-satir-motoru.md)                               | **Paketin belkemiği** — grup · satır · 13 kontrol · menü yönü                                |
| [`08-dalga3-s7-hesabim.md`](08-dalga3-s7-hesabim.md)                                         | 6 sekme · 35 satır · 5 blok · 3 riskli blok                                                  |
| [`09-dalga3-s8-ses-video-gorunum.md`](09-dalga3-s8-ses-video-gorunum.md)                     | 3 + 5 sekme · 55 satır · 6 blok · tema adları                                                |
| [`10-dalga3-s9-bildirimler-bolumu.md`](10-dalga3-s9-bildirimler-bolumu.md)                   | 7 sekme · 50 satır · paylaşılan anahtarlar                                                   |
| [`11-dalga3-s10-masaustu-hakkinda.md`](11-dalga3-s10-masaustu-hakkinda.md)                   | 5 + 1 sekme · 30 satır · Tauri kısayol genişletmesi                                          |
| [`12-dalga4-s11-panel-bildirim-ayarlari.md`](12-dalga4-s11-panel-bildirim-ayarlari.md)       | 400 px panel + 560 px pencere                                                                |
| [`13-dalga4-s12-kullanici-bari-menusu.md`](13-dalga4-s12-kullanici-bari-menusu.md)           | 308 px menü + Rahatsız Etmeyin                                                               |
| [`14-dalga5-s13-a11y-olcek-temizlik-parity.md`](14-dalga5-s13-a11y-olcek-temizlik-parity.md) | Kapanış: a11y · ölçekleme · temizlik · parity QA                                             |
| `raporlar/`                                                                                  | Her şerit çıktısını buraya yazar                                                             |

## Onaylanan kararlar

K1 tam yeniden yazım · K2 `/settings/[section]/[tab]` + intercepting modal · K3 tipli kolon ·
K4 istisnalar mevcut üç tablodan türer · K5 güvenlik günlüğü uçtan uca, bağlı hesaplar ve telefon
`TODO(api)` · K6 23 tema yeniden adlandırılır (kimlik korunur) · K7 5 global kısayol + çakışma ·
K8 DND = presence DND + süre · K9 boşta süresi Gizlilik'e taşınır · K10 `Tüm bildirimleri gör` →
`/mentions` · K11 Web/Masaüstü segmenti üründe yok · K12 mobil sözleşmesi korunur ·
K13 ses/video panelleri satır motoruna taşınır.

Gerekçeler `PLAN.md` §3 ve `00-ortak-baglam.md` §3'te.

## Sıra

```
Dalga 0  Ş0                        tek oturum
Dalga 1  Ş1 · Ş2 · Ş3 · Ş4         dördü aynı anda
Dalga 2  Ş5 · Ş6                   ikisi aynı anda
Dalga 3  Ş7 · Ş8 · Ş9 · Ş10        dördü aynı anda
Dalga 4  Ş11 · Ş12                 ikisi aynı anda
Dalga 5  Ş13                       tek oturum
```

Dalga içi şeritler paralel; dalgalar sıralı. **Kapı geçmeden sonraki dalga başlamaz.**

# Whispr · Sunucu paketi

Sunucu ekranı, kanallar (metin + ses), sağ paneller, altı pencere, sunucu oluşturma ve dokuz
bölümlü sunucu ayarlarının web + masaüstü uygulaması.

Kaynak tasarım: `design_handoff/design_handoff_sunucu/`
Dal: `uat`. Hedef: `apps/web` (Tauri aynı Next.js kabuğunu sarar, ayrı iş yok).

## Nereden başlamalı

1. **`PLAN.md`** — kapsam, bugünkü kod durumu, 12 bağlayıcı karar, 7 dalga / 15 şerit, riskler.
2. **`00-ortak-baglam.md`** — her şeridin işe başlamadan okuyacağı gerçekler, kurallar, tuzaklar.
3. **`BASLATMA-PROMPTLARI.md`** — şerit başına hazır prompt.
4. Şerit dosyaları (`01`–`15`).

## Dosyalar

```
docs/prompts/whispr-sunucu/
├── README.md                                          ← bu dosya
├── PLAN.md                                            ← plan ve kararlar
├── 00-ortak-baglam.md                                 ← okunur, uygulanmaz
├── 01-dalga0-s0-sozlesme.md                           ← kilit şerit
├── 02-dalga1-s1-sunucu-yazma-uclari.md
├── 03-dalga1-s2-uye-moderasyon-api.md
├── 04-dalga1-s3-davet-api.md
├── 05-dalga2-s4-kanal-kenar-cubugu.md
├── 06-dalga2-s5-sag-panel.md
├── 07-dalga3-s6-metin-kanali.md
├── 08-dalga3-s7-ses-kanali.md
├── 09-dalga4-s8-ortak-parcalar-kategori-kanal.md
├── 10-dalga4-s9-davet-bildirim-etkinlik-pencereleri.md
├── 11-dalga4-s10-sunucu-olustur.md
├── 12-dalga5-s11-ayarlar-kabuk-genel-gorunurluk-icerik.md
├── 13-dalga5-s12-kanallar-roller.md
├── 14-dalga5-s13-uyeler-davetler-etkinlikler-tehlike.md
├── 15-dalga6-s14-olcek-a11y-i18n-parity.md
└── raporlar/                                          ← şerit raporları buraya
```

## Dalga sırası

| Dalga | Şeritler                                                                                     | Paralel mi    |
| ----- | -------------------------------------------------------------------------------------------- | ------------- |
| 0     | Ş0 sözleşme + veri + ölçü                                                                    | hayır (kilit) |
| 1     | Ş1 sunucu yazma · Ş2 üye moderasyon · Ş3 davet                                               | evet          |
| 2     | Ş4 kanal kenar çubuğu · Ş5 sağ panel                                                         | evet          |
| 3     | Ş6 metin kanalı · Ş7 ses kanalı                                                              | evet          |
| 4     | Ş8 ortak parçalar + kategori/kanal · Ş9 davet/bildirim/etkinlik · Ş10 sunucu oluştur         | evet          |
| 5     | Ş11 ayarlar kabuğu + 3 bölüm · Ş12 kanallar/roller · Ş13 üyeler/davetler/etkinlikler/tehlike | evet          |
| 6     | Ş14 kapanış                                                                                  | hayır         |

## Bağlayıcı kararların özeti

K1 panel 280 · K2 `iconColor` + sunucu yavaş modu + sahiplik devri uçtan uca ·
K3 ban/timeout/QR/hedefli davet/bekleyen davetler uçtan uca ("yakında" çipleri kalkar) ·
K4 eski ayarlar overlay'i silinir, 9 bölüm dosyaya bölünür · K5 ses yüzeyi yalnız görsel yenilenir ·
K6 sözleşme SPEC'e daraltılır (rol 32, etkinlik 60/180) · K7 `deletedMessageNoticeMinutes` DB
varsayılanı korunur · K8 tek yeni token `--accent-2` · K9 rota değişmez · K10 mobil ekranlar
değişmez, sözleşme opsiyonel · K11 katman sırası 60/70/80 + `Esc` en üstteki · K12 kenar çubuğu ve
ayarlar tek veri kaynağı.

Ayrıntı: `PLAN.md` §3.

## Doğrulama

```bash
pnpm --filter @wizards/types test && pnpm --filter @wizards/db test && pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

# Whispr "Bahsedilmeler" ekranı — paralel run-prompt paketi

Whispr **web + masaüstü** uygulamasının üçüncü büyük ekranı: bahsetme rayı (276), triyaj akışı,
bahsetme kartı ve `⋯` menüsü, satır içi yanıt, bağlam paneli (326), bildirim ayarları modalı (496)
ve boş durum. Toplam **11 durum** (`screens/01…11`).

Tasarım kaynağı (nihai otorite sırasıyla):

1. `design_handoff/bahsedilmeler-paketi/referans/Bahsedilmeler.dc.html` — her elemanın inline `style` değeri
2. `design_handoff/bahsedilmeler-paketi/referans/Bahsedilmeler-referans.html` — çalışan, tıklanabilir kopya
3. `design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md` — ölçü, metin, durum, veri
4. `design_handoff/bahsedilmeler-paketi/screens/*.png` — 11 ekran, 1360×920 (2×)
5. `design_handoff/bahsedilmeler-paketi/SPEC-ANA-SAYFA.md` §1 (token/tipografi) ve §8 (ölçekleme)

Görev tanımı: `design_handoff/bahsedilmeler-paketi/PROMPT.md`.

## Bu paket neden Mesajlar'dan daha derin

Mesajlar paketi çoğunlukla **var olan veriyi yeniden giydirdi**. Bahsedilmeler öyle değil:
tasarımın dört bahsetme türünden **üçünün üründe karşılığı yok**.

| Tasarım                    | Bugünkü ürün                                                                    | Sonuç                                   |
| -------------------------- | ------------------------------------------------------------------------------- | --------------------------------------- |
| `Bana özel` (`@kullanıcı`) | `MessageMention` + `DMMessageMention` satırları var                             | Var, `kind` alanı eklenecek             |
| `Rol` (`@tasarım`)         | **Yok.** `Role.mentionable` kolonu var, ayrıştırıcı/fan-out yok                 | Sıfırdan yazılacak (Ş2)                 |
| `@herkes` / `@burada`      | **Yalnız izin kontrolü** (`assertCanMentionEveryone`); satır/bildirim üretmiyor | Türetilmiş işaret olarak yazılacak (Ş2) |
| `Thread`                   | **Takip modeli yok**; yalnız üst mesajın yazarı bildirim alıyor                 | `ThreadFollow` yazılacak (Ş2)           |

Bu yüzden paket **yazma yolunu** (Ş2) ayrı ve tam bir şerit olarak taşıyor. Ekran şeritleri
(Dalga 2) ona beklemez: Dalga 0'da donan tipler ve Dalga 1'de açılan uçlar üzerinden ilerler.

## Dalga yapısı

Yöntem Mesajlar paketiyle aynı: **sözleşme önce donar, sonra şeritler birbirinin dosyasına
dokunmadan aynı anda ilerler.** Her faz dosyasının §"Sahiplenilen dosyalar" bölümü bağlayıcıdır.

```
Dalga 0  ─┬─ Ş0.1 ölçü sözlüğü + --info token + denetim kapsamı
          ├─ Ş0.2 migration + Prisma şeması (kind, MassMention, MentionState, ThreadFollow, ayarlar)
          ├─ Ş0.3 @wizards/types sözleşmeleri + rota/durum ayrıştırıcıları
          └─ Ş0.4 i18n mentions.* sözlüğü (TR birebir + EN)     ← kapı: typecheck + test + db:generate

Dalga 1  ─┬─ Ş1 kabuk 4. kolon + bahsetme rayı (276)
          ├─ Ş2 üretim katmanı: rol / @herkes / thread takibi / kind yazımı + backfill
          ├─ Ş3 okuma API'si + sayacın tek kaynağa taşınması + socket olayları
          └─ Ş4 bildirim ayarları uçları (sessiz saatler, masaüstü kipi)   ← kapı: şerit testleri

Dalga 2  ─┬─ Ş5 akış başlığı + gruplama + sekmeler + URL durumu + boş durum
          ├─ Ş6 MentionCard + tür pili + ⋯ menüsü
          ├─ Ş7 satır içi yanıt + bağlam paneli (326)
          └─ Ş8 bildirim ayarları modalı (496) + toast altyapısı + geri alma  ← kapı: şerit testleri

Dalga 3  ─── Ş9 parity kapısı, a11y, kırılımlar, performans, e2e, kabul
```

## Dosyalar

| Dosya                                   | Kapsam                                                                                             | Ön koşul                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| `00-ortak-baglam.md`                    | Kurallar, doğrulanmış gerçekler, alınmış 12 karar, 9 tuzak, kalite çıtası. **Uygulanmaz, okunur.** | —                       |
| `01-dalga0-sozlesme.md`                 | 4 paralel şerit: ölçü sözlüğü, migration, tipler, i18n                                             | —                       |
| `02-dalga1-s1-kabuk-bahsetme-rayi.md`   | 4. kolon seçimi, `MentionsSidebar` 276, tür/kaynak satırları, arama, drawer                        | Dalga 0                 |
| `03-dalga1-s2-uretim-katmani.md`        | Rol ayrıştırıcı + izin + fan-out, `MassMention`, `ThreadFollow`, `kind` yazımı, backfill           | Dalga 0                 |
| `04-dalga1-s3-okuma-api-sayac.md`       | `GET /api/v1/mentions*`, okundu/okunmadı/sonra oku/kaldır, socket, sayaç tek kaynağa               | Dalga 0                 |
| `05-dalga1-s4-bildirim-ayarlari-api.md` | `GET/PATCH .../mention-settings`, sessiz saatler, masaüstü kipi, ayar sayfası eşlemesi             | Dalga 0                 |
| `06-dalga2-s5-akis-baslik-gruplama.md`  | Akış başlığı, 4 sekme, gruplama, URL durumu, boş durum, akış altlığı, "yeni bahsetme" şeridi       | Dalga 0 (Ş3 sözleşmesi) |
| `07-dalga2-s6-mention-card-menu.md`     | `MentionCard` anatomisi, tür pili, alıntı, thread satırı, 3 eylem, `⋯` menüsü                      | Dalga 0                 |
| `08-dalga2-s7-yanit-baglam-paneli.md`   | Satır içi yanıt kutusu, `MentionContextPanel` 326, `<1100px` overlay                               | Dalga 0                 |
| `09-dalga2-s8-ayarlar-modali-toast.md`  | `MentionSettingsModal` 496, 4 anahtar + segment + sessiz saatler, toast + geri alma                | Dalga 0 (Ş4 sözleşmesi) |
| `10-dalga3-parity-qa.md`                | 6 çözünürlük × 2 tema parity, a11y, kırılımlar, performans, e2e, kabul kriterleri                  | Dalga 2                 |

## Nasıl koşulur

Her şerit tek geçişte uygulanabilir bir dilimdir.

```
1. 00-ortak-baglam.md oku
2. Şerit dosyasını oku
3. graphify query "<şeridin yüzeyi>" ile dokunulacak dosyaları doğrula
4. Uygula (test önce)
5. Şeridin kapı komutlarını koş
6. docs/prompts/whispr-bahsedilmeler/raporlar/<no>-rapor.md yaz
7. Commit için izin iste — kendiliğinden commit yok
```

Aynı dalganın şeritleri **aynı anda** açılabilir. Farklı dalgalar açılmaz: Dalga 1 başlamadan
Dalga 0 kapısı yeşil olmalı, Dalga 2 başlamadan Dalga 1 kapısı.

Branch: `uat`. Commit yok — kullanıcı açıkça isteyene kadar.

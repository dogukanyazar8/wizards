# Whispr "Keşfet" ekranı — paralel run-prompt paketi

Whispr **web + masaüstü** uygulamasının dördüncü büyük ekranı: 276 px dizin kolonu, dört şerit
(Sunucular · Kişiler · Kanallar · Etkinlikler), öne çıkan sunucu bloğu, dört kart dili, sunucu
profili paneli (326), sunucuya katıl modalı (496), filtre şeridi, katılım onay şeridi, boş ve
hata durumu. Toplam **12 durum** (`screens/01…12`).

Tasarım kaynağı (nihai otorite sırasıyla):

1. `design_handoff/kesfet-paketi/referans/Kesfet-5B.dc.html` — her elemanın inline `style` değeri
2. `design_handoff/kesfet-paketi/referans/Kesfet-referans.html` — çalışan, tıklanabilir kopya
3. `design_handoff/kesfet-paketi/SPEC-KESFET.md` — ölçü, metin, durum, veri, i18n
4. `design_handoff/kesfet-paketi/screens/*.png` — 12 ekran, 1360×920
5. `design_handoff/kesfet-paketi/SPEC-ANA-SAYFA.md` §1 (token/tipografi) ve §8 (ölçekleme)

Görev tanımı: `design_handoff/kesfet-paketi/PROMPT.md`.

## Bu paket neden Bahsedilmeler'den farklı

Bahsedilmeler paketi **eksik bir yazma yolunu** kurdu (rol bahsetmesi, thread takibi, @herkes).
Keşfet'te yazma yolu zaten var — sorun **okuma yüzeyinin dar** olması ve **tek bir sınıflandırma
ekseninin hiç bulunmaması**.

| Tasarımın istediği                        | Bugünkü ürün                                                                                | Sonuç                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| 6 kategori + kategori başına sayaç        | `Server` tablosunda kategori kolonu **yok**                                                 | Yeni enum + kolon + migration (Ş0.2) |
| Sunucu dizini, keyset sayfalama           | **Var** — `server-discovery-service.ts`, `[discoverable,isPublic,memberCount]` + `tags` GIN | Genişletilir, yeniden yazılmaz       |
| Kişi önerileri şeridi                     | **Var** — `GET /friends/suggestions`                                                        | Sarmalanır (Ş2)                      |
| Popüler kanallar şeridi                   | **Yok.** Herkese açık kanal keşfi ucu hiç yok                                               | Yeni uç + saatlik rollup (Ş2)        |
| Herkese açık etkinlikler                  | `ScheduledEvent` + `ScheduledEventInterest` + `interestedCount` **var**                     | Yeni okuma ucu, yeni model yok (Ş3)  |
| Profil panelindeki rol/presence/sesli oda | `ServerPublicProfile` bunları taşımıyor                                                     | Şema genişletilir (Ş0.3 + Ş3)        |
| 276 px dizin kolonu                       | `selectThirdColumn('/discover')` bugün `null`                                               | Kabuğa `"discover"` dalı (Ş4)        |

Bu yüzden paketin ağırlık merkezi **API dalgasında** (Ş1–Ş3), ekran şeritleri ise Dalga 0'da donan
tipler üzerinden onlara beklemeden ilerler.

## Dalga yapısı

Yöntem önceki paketlerle aynı: **sözleşme önce donar, sonra şeritler birbirinin dosyasına
dokunmadan ilerler.** Her faz dosyasının §"Sahiplenilen dosyalar" bölümü bağlayıcıdır.

```
Dalga 0  ─┬─ Ş0.1 ölçü sözlüğü (dc.html birebir) + denetim kapsamı
          ├─ Ş0.2 migration: ServerCategory enum + Server.category + Server.languages + kanal rollup
          ├─ Ş0.3 @wizards/types sözleşmeleri + rota/durum ayrıştırıcıları
          └─ Ş0.4 i18n discover.* sözlüğü (TR birebir + EN) + eski anahtar tasfiyesi
                                                        ← kapı: typecheck + test + db:generate

Dalga 1  ─┬─ Ş1 dizin API'si: kategori + sıralama + arama + sayaçlar + featured
          ├─ Ş2 kişi şeridi + kanal şeridi (rollup üreticisi dâhil)
          └─ Ş3 etkinlik şeridi + profil ucu genişletme + katıl/ayrıl/kod mutasyonları + socket
                                                        ← kapı: şerit testleri

Dalga 2  ─┬─ Ş4 kabuk 3. kolonu + DiscoverSidebar (276)
          ├─ Ş5 akış başlığı + şerit sekmeleri + öne çıkan blok + filtre şeridi
          └─ Ş6 dört kart dili + ızgara + kart boyutu + skeleton
                                                        ← kapı: şerit testleri

Dalga 3  ─┬─ Ş7 sunucu profili paneli (326)
          ├─ Ş8 katıl modalı (496) + onay şeridi + kabuk "Yeni" pili
          └─ Ş9 boş/hata durumu + ölçekleme + kırılımlar + a11y
                                                        ← kapı: şerit testleri

Dalga 4  ─── Ş10 parity kapısı, 12 durum karşılaştırma, e2e, kabul
```

## Dosyalar

| Dosya                                      | Kapsam                                                                                             | Ön koşul |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| `00-ortak-baglam.md`                       | Kurallar, doğrulanmış gerçekler, alınmış 12 karar, 8 tuzak, kalite çıtası. **Uygulanmaz, okunur.** | —        |
| `01-dalga0-sozlesme.md`                    | Ölçü sözlüğü, migration, tipler, rota, i18n                                                        | —        |
| `02-dalga1-s1-dizin-api.md`                | `GET /discover/servers` + kategori sayaçları + featured                                            | Dalga 0  |
| `03-dalga1-s2-kisi-kanal-api.md`           | `GET /discover/people`, `GET /discover/channels` + rollup                                          | Dalga 0  |
| `04-dalga1-s3-etkinlik-profil-katilma.md`  | `GET /discover/events`, profil genişletme, katıl/ayrıl/kod, socket                                 | Dalga 0  |
| `05-dalga2-s4-kabuk-dizin-kolonu.md`       | `selectThirdColumn` + `DiscoverSidebar` (276)                                                      | Dalga 0  |
| `06-dalga2-s5-akis-baslik-featured.md`     | Akış başlığı, şerit sekmeleri, öne çıkan blok, filtre şeridi                                       | Dalga 0  |
| `07-dalga2-s6-kart-dilleri-izgara.md`      | Sunucu/kişi/kanal/etkinlik kartı + ızgara + skeleton                                               | Dalga 0  |
| `08-dalga3-s7-sunucu-profil-paneli.md`     | 326 px panel                                                                                       | Ş5 + Ş6  |
| `09-dalga3-s8-katil-modali-onay-seridi.md` | 496 px modal + onay şeridi + `Yeni` pili                                                           | Ş5 + Ş6  |
| `10-dalga3-s9-durumlar-olcekleme-a11y.md`  | Boş/hata, rem ölçekleme, `<1100/<960/<720`, a11y                                                   | Ş5 + Ş6  |
| `11-dalga4-s10-parity-qa.md`               | Parity kapısı, e2e, kabul kriterleri                                                               | Hepsi    |
| `BASLATMA-PROMPTLARI.md`                   | Her şerit için kopyala-yapıştır başlatma metni                                                     | —        |

## Alınmış kararlar (2026-08-21)

Bu 8 karar kullanıcı tarafından onaylandı ve **tartışmaya kapalıdır**:

1. **Kategori = yeni DB kolonu.** `ServerCategory` enum + `Server.category` + migration + sunucu
   ayarlarında seçim alanı. Etiketten türetme reddedildi (bir sunucu iki kategoriye düşerdi).
2. **Kanal şeridi = yeni uç + saatlik rollup.** Yalnız `discoverable && isPublic` sunucuların
   herkese açık metin kanalları. Canlı `COUNT(*)` reddedildi.
3. **Profil paneli üç alanı da alır:** tanıdıklarda `role` + `presence`, `voiceRoomCount`
   istatistiği ve `Server.languages String[]` kolonu (öne çıkan bloğun dil pili).
4. **`Yeni` etiketi:** sunucuya ilk giriş **veya** 24 saat — hangisi önceyse. Yeni kolon yok;
   `ServerMember.joinedAt` + yerel "görüldü" kaydı.
5. **Kişi etiketleri ortak sunucu `tags`'lerinden türetilir.** `User.interests` kolonu açılmaz.
6. **Arama aktif şeritte arar.** Dört şeritte birden arama reddedildi (tuş başına 4 istek).
7. **Kart boyutu `localStorage`'da,** URL'de değil.
8. **Eski ekran silinir, eski uç kalır.** `server-discovery-screen.tsx` gider;
   `/api/v1/servers/discover` durur ve yeni `/api/v1/discover/servers` onun keyset iskeletini
   devralır. Mobil `/api/v1/mobile/servers/discover` **hiç** etkilenmez.

## Çalışma koşulları

- Dal: `uat`. Commit yok — kullanıcı açıkça istemeden hiçbir şey commit edilmez.
- Doğrulama: `pnpm --filter @wizards/web typecheck`, `... lint`, `... test`
  (typecheck/lint **pnpm üzerinden** koşmalı; npm ile runner sürüm iddiasında ölür).
- Migration: `packages/db/prisma/rebaseline-migrations/` altına yazılır — Prisma bu klasörü okur.
- Sol taraf (74 px ray, 228 px gezinme paneli, kullanıcı barı) **dokunulmaz**; tek istisna
  `Keşfet` satırının aktifliği ve katılınca eklenen `Yeni` satırı.

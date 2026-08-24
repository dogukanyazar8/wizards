# Whispr Ana Sayfa "1a Komuta Merkezi" — run-prompt paketi

Whispr **web + masaüstü** uygulamasının yeni açılış ekranı ve onu ayakta tutan katmanlar: ortak
kabuk, rem tabanlı ölçek motoru, Outfit + Figtree tipografisi, altı bento kartı, dört yeni ekran
(Ana Sayfa, Bahsedilmeler, Etkinlikler, Gelen kutusu) ve ⌘K komut paleti.

Tasarım kaynağı: `design_handoff/app/design/1a-komuta-merkezi.html` (inline stiller — nihai
otorite), eşlik eden metin `design_handoff/app/SPEC-ANA-SAYFA.md`, görev tanımı
`design_handoff/app/PROMPT.md`.

## Dosyalar

| Dosya                                    | Kapsam                                                                                                                             | Ön koşul |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `00-ortak-baglam.md`                     | Kurallar, doğrulanmış gerçekler, kalite/güvenlik/performans çıtası, tuzaklar, alınmış kararlar. **Uygulanmaz, okunur.**            | —        |
| `01-faz0-sozlesme-parity-altyapisi.md`   | Ölçü sözlüğü (`home-metrics.ts`), token denetim testi, arbitrary-px lint kuralı, 6×2 görsel parity matrisi iskeleti                | —        |
| `02-faz1-tipografi-olcek-motoru.md`      | Figtree + Outfit bağlama, `useUiScale` kök font-size adımları, hairline/ikon istisnaları, density değişkenlerinin rem'e çevrilmesi | Faz 0    |
| `03-faz2-kabuk-nav-paneli.md`            | `AppNavPanel` (272), ray 74 hizalaması, rota başına 2. sütun seçimi, tek kaynaklı okunmamış sayaçları                              | Faz 1    |
| `04-faz3-veri-katmani-migration.md`      | Migration (odak modu), 9 yeni uç, DTO + zod + rate limit, görünürlük redaksiyonu, sorgu bütçesi testleri, realtime köprüsü         | Faz 2    |
| `05-faz4-anasayfa-izgara-kartlar.md`     | `HomeCommandCenter` + 6 kart, skeleton/boş durum, ölçek adımına göre satır yoğunluğu                                               | Faz 3    |
| `06-faz5-etkilesim-odak-komut-paleti.md` | Durum çipleri, odak modu geri sayımı, Katıl/Ayrıl, Kabul et, Hatırlat, ⌘K paleti (arama + komut)                                   | Faz 4    |
| `07-faz6-yan-ekranlar.md`                | `/mentions`, `/events` (liste + takvim), `/inbox` — Ana Sayfa'daki her linkin gerçek hedefi                                        | Faz 5    |
| `08-faz7-i18n-a11y-kirilimlar.md`        | `home.*` / `mentions.*` / `events.*` / `inbox.*` / `command.*` anahtarları, erişilebilirlik, 960–1359 ve <960 kırılımları          | Faz 6    |
| `09-faz8-parity-kapisi-qa.md`            | 6 çözünürlük × 2 tema parity, performans bütçesi ölçümü, güvenlik doğrulaması, paket kabul kriterleri                              | Faz 7    |

Sıra **zorunludur**. Her faz bir öncekinin sözleşmesine dayanır.

## Nasıl koşulur

Her prompt tek geçişte uygulanabilir bir dilimdir. Alt görevlere bölüp görev başına ayrı ajan turu
açma.

```
1. 00-ortak-baglam.md oku
2. Faz dosyasını oku
3. graphify query ile dokunulacak yüzeyi doğrula
4. Uygula (test önce)
5. Fazın kapı komutlarını koş
6. docs/prompts/whispr-ana-sayfa-1a/raporlar/<no>-rapor.md yaz
7. Commit için izin iste — kendiliğinden commit yok
```

## Çalışma koşulları

- Branch **`uat`**. Yeni branch, yeni worktree yok.
- caveman **ultra** modu.
- **graphify** kullanılır: her fazın başında `graphify query`, faz sonunda `graphify update .`
- Kararsız kalınan yerde **kullanıcıya sorulur**, tahmin edilmez.
- Kalite çıtası: en üst düzey kıdemli mühendis işi. Sunucu tarafında zorlanmayan yetki, ölçülmemiş
  sorgu, testsiz yol, redaksiyonsuz presence kabul edilmez. Ayrıntı: `00-ortak-baglam.md` §5.

## Alınmış kararlar (2026-08-19, kullanıcı)

| #   | Konu                   | Karar                                                                                                    |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Rota                   | Ana Sayfa `/(main)/home`; giriş sonrası `/` → `/home`                                                    |
| 2   | Tipografi              | Outfit + Figtree **tüm uygulamada**, `--font-display` / `--font-sans` üzerinden                          |
| 3   | Ölçekleme              | Kök font-size adımları app-wide; 1208 arbitrary px değeri **faz faz** rem'e göç eder                     |
| 4   | Odak modu              | Süreli DND katmanı — tek durum makinesi, `statusExpiresAt` + `statusRestoreTo` migration'ı               |
| 5   | Arkadaş durum metni    | Türetilmiş (ses > DND > boşta süresi) + customStatus yedeği. Masaüstü oyun tespiti **yok**               |
| 6   | Canlı oda kapsamı      | Üye olunan sunucuların sesli kanalları **+** arkadaş DM/grup aramaları                                   |
| 7   | Yanıt bekliyor kaynağı | Bahsedilmeler + mesajıma gelen yanıtlar + arkadaşlık istekleri + sunucu davetleri                        |
| 8   | Navigasyon paneli      | 2. sütun **rota başına değişir**: Ana Sayfa → nav paneli, Mesajlar → sohbet rayı, sunucu → kanal listesi |
| 9   | Yan ekranlar           | Bahsedilmeler + Etkinlikler + Gelen kutusu **bu pakette uçtan uca**                                      |
| 10  | ⌘K / Takvim butonu     | Palet = arama + komut. Takvim butonu → uygulama içi Etkinlikler takvim görünümü (harici entegrasyon yok) |

## Kapsam dışı

- **Mesajlar ekranı** (`SPEC-MESAJLAR.md`). Ayrı paket. Bu paketin kabuğu ve ölçek motoru onun da
  zeminidir; Faz 2 sözleşmesi bozulmadan devralınır.
- **React Native mobil uygulama.** Bu paket web + masaüstü (Tauri web'i sarar).
- Harici takvim entegrasyonu (Google/Outlook OAuth), masaüstü oyun/uygulama tespiti.

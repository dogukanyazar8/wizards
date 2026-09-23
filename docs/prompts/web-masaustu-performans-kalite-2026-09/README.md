# Whispr web + masaüstü — performans, kod kalitesi, sistem tasarımı (run-prompt paketi, 2026-09)

Whispr web uygulamasını ve Tauri masaüstü kabuğunu Discord/Slack masaüstü sınıfına taşımak: **ölç → analiz et → sentezle → uygula → kilitle → kanıtla.**

"En üst seviye" bu pakette bir his değil, ölçülen bir hedef:

- Her iddia bir **metrik kimliğine** (`M-…`) bağlanır; metrik D0'da ölçülür, D4'te yeniden ölçülür.
- Her iyileştirme **önce/sonra** sayısıyla kapanır; gürültü içindeki "kazanç" kazanç sayılmaz.
- Kazanılan her sayı D4'te **kapıya** dönüşür; yoksa altı ay sonra geri kaybedilir.

**Temel:** `main` @ `95493d2815b6f2439d79ccf3071380f673860c45` + çalışma ağacında ~207 dosyalık commit'lenmemiş iş (Node 26 geçişi, sürüm yükseltmeleri, ölü kod temizliği, principal incelemenin F-01–F-05 düzeltmeleri). Ayrıntı: `00-ortak-baglam.md` §1.3.

---

## Neden bu paket

Önceki üç çalışma bulgu üretti ama döngüyü kapatmadı:

| Kaynak                                            | Ne verdi                                            | Ne eksik kaldı                                       |
| ------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `docs/prompts/platform-denetimi-2026-08/` (A1–A8) | 23 kanıtlı bulgu, HTML rapor                        | Dinamik ölçüm yok denecek kadar az                   |
| `docs/prompts/denetim-2026-08/` (01–21)           | 147 bulgunun kapatma promptları (15–16 web istemci) | Önce/sonra ölçüm şartı yok                           |
| `docs/denetim/2026-09-21-principal-inceleme/`     | F-01–F-17, B1–B9 benchmark tanımları, yol haritası  | F-08: "bütçe/ölçüm kapısı yok"; B5/B6/B7 hiç koşmadı |

Bu paket yeni bir denetim turu değildir. Önceki bulguları **devralır**, eksik olan üç şeyi ekler: ölçüm temeli (D0), ölçüme bağlı uygulama döngüsü (D3), kalıcı kapılar (D4).

## Dosyalar ve dalgalar

| Dosya                                    | Dalga | Şerit | Tür                                                                              | Ön koşul             |
| ---------------------------------------- | ----- | ----- | -------------------------------------------------------------------------------- | -------------------- |
| `00-ortak-baglam.md`                     | —     | —     | Kurallar, doğrulanmış gerçekler, şemalar. **Okunur, uygulanmaz.**                | —                    |
| `01-dalga0-s0-olcum-temeli.md`           | D0    | Ş0    | Ölçüm araçları + temel çizgi (`M-*` kataloğu)                                    | K1, K2               |
| `02-dalga1-s1-web-yukleme-ve-paket.md`   | D1    | Ş1    | Analiz: ilk yükleme, paket, hidrasyon, font/CSS, önbellek                        | D0                   |
| `03-dalga1-s2-web-calisma-zamani.md`     | D1    | Ş2    | Analiz: render fırtınaları, realtime→önbellek, bellek, liste                     | D0                   |
| `04-dalga1-s3-sunucu-ve-gercek-zaman.md` | D1    | Ş3    | Analiz: RSC yükleyiciler, rotalar, socket, Prisma, event loop                    | D0                   |
| `05-dalga1-s4-masaustu-kabuk.md`         | D1    | Ş4    | Analiz: Tauri açılış, IPC, WebView2 süreçleri, Rust kalitesi                     | D0                   |
| `06-dalga1-s5-kod-kalitesi.md`           | D1    | Ş5    | Analiz: sıcak noktalar, karmaşıklık, tip/hata disiplini, test kalitesi           | D0                   |
| `07-dalga1-s6-sistem-tasarimi.md`        | D1    | Ş6    | Analiz: sınırlar, döngüler, durum mimarisi, süreç modeli, uygunluk fonksiyonları | D0                   |
| `08-dalga2-s7-sentez-ve-plan.md`         | D2    | Ş7    | Birleştirme, önceliklendirme, uygulama şeritleri `U-*`, bütçeler                 | Ş1–Ş6                |
| `09-dalga3-uygulama-seridi.md`           | D3    | `U-*` | **Şablon.** Her `U-*` şeridi bu promptla koşulur                                 | D2 + kullanıcı onayı |
| `10-dalga4-s8-kalici-kapilar.md`         | D4    | Ş8    | Bütçe/mimari kapıları, ratchet'ler, runbook                                      | D3                   |
| `11-dalga4-s9-kapanis.md`                | D4    | Ş9    | Son ölçüm, önce/sonra, bulgu kapanışı, HTML rapor                                | Ş8                   |

```
D0  Ş0 ölçüm temeli ──────────────┐
                                   ▼
D1  Ş1 ─ Ş2 ─ Ş3 ─ Ş4 ─ Ş5 ─ Ş6   (altısı paralel, salt okuma)
                                   ▼
D2  Ş7 sentez → plan.json + kararlar      ■ DUR: kullanıcı planı ve kararları onaylar
                                   ▼
D3  U-01 … U-nn  (plan.json'daki alt dalgalar; aynı alt dalgada dosya çakışması yok)
                                   ▼
D4  Ş8 kalıcı kapılar → Ş9 kapanış + rapor
```

## Nasıl koşulur

Her oturum iki dosyayı okur: ortak bağlam + kendi şeridi.

```bash
cat docs/prompts/web-masaustu-performans-kalite-2026-09/00-ortak-baglam.md docs/prompts/web-masaustu-performans-kalite-2026-09/01-dalga0-s0-olcum-temeli.md
```

D3 şeritleri için şablona `U-*` kimliği verilir:

```text
00-ortak-baglam.md ve 09-dalga3-uygulama-seridi.md dosyalarını oku. Şerit: U-03.
```

D1'in altı şeridi birbirinden bağımsızdır; ayrı oturumlarda aynı anda koşulabilir. Her biri yalnız kendi rapor dosyalarına yazar.

## Kullanıcı kararları

Cevapsız karar varsa ilgili dalga başlamaz. Önerilen seçenek ilk sırada.

| #   | Soru                                                                                                                      | Seçenekler                                                                                                                                                                                                                            | Gerekli olduğu an |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| K1  | Çalışma ağacındaki ~207 dosyalık iş temel çizgiden önce commit'lensin mi?                                                 | **A) Evet, kullanıcı commit'ler, temel = temiz SHA** · B) Hayır, temel = HEAD + WIP parmak izi                                                                                                                                        | D0 başlamadan     |
| K2  | Masaüstü ölçümü hangi içerik kaynağına karşı? (release build HTTPS ister, `lib.rs:5519`)                                  | **A) Release build + çalışma zamanı `WHISPR_DESKTOP_WEB_URL=https://whispr.team`, yalnız oturumsuz `/login` yüzeyi, prod'a yazma yok** · B) Debug build + `localhost:3000` (kabuk sayıları temsil etmez) · C) Masaüstü ölçümü atlanır | D0 başlamadan     |
| K3  | Ölçüm/analiz için yeni geliştirme bağımlılığı eklenebilir mi (`web-vitals`, `dependency-cruiser`, `jscpd`, `size-limit`)? | **A) Hayır — Playwright, CDP, Next manifestleri, graphify ve scratchpad betikleri yeter** · B) Evet, gerekçeli olanlar                                                                                                                | D0 başlamadan     |
| K4  | Dev dosyalar (`live-voice-provider.tsx` 3.306, `lib.rs` 6.476 satır) için derinlik?                                       | **A) Planlı ama davranış koruyan bölme şeritleri (D2 ölçülebilir hedef koyar)** · B) Principal önerisi: yalnız dokunulduğunda fırsatçı                                                                                                | D2 bitince        |
| K5  | Kalıcı kapılar nerede koşar? (Actions faturası 2026-09-20'de kilitliydi — D0'da doğrula)                                  | **A) Yerel gate profili + CI; CI yoksa yerel zorunlu** · B) Yalnız yerel · C) Yalnız CI                                                                                                                                               | D4 başlamadan     |

D2 kendi karar listesini üretir (`raporlar/08-kararlar.md`); D3 onlar cevaplanmadan başlamaz.

## Kapsam

**İçinde:** `apps/web` (istemci + `server.ts` + socket + API/RSC sıcak yolları), `apps/desktop` (Tauri kabuğu, IPC, açılış, bellek, yayın boyutu), bunların kullandığı `packages/types`/`packages/db` parçaları, geliştirme döngüsü (typecheck/test/build süreleri), kalite ve mimari kapıları.

**Dışında — dokunma, yalnız referans ver:**

- Mobil uygulama (`apps/mobile`). Paylaşılan sözleşme değişikliği mobili etkiliyorsa bulguya yaz, değiştirme.
- Ekran paylaşımı iç yapısı: `docs/prompts/ekran-paylasimi-2026-09/` sahibi (encoder, codec, izleyici, Go Live). Ses odasının genel render maliyeti bu paketin; paylaşım yayını değil.
- Güvenlik bulguları (F-05, F-07, F-12, F-13) ve CI/CD fatura/UAT kararları (`project-cicd-denetim` hafızası). Performans işi bunlara dokunursa not düş.
- Yeni ürün özelliği. Framework değişimi, mikroservis, yeni veri deposu (principal "Önerilmeyenler" listesi geçerli).

## Çıktı düzeni

```
docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/
  00-baseline.json   00-baseline-rapor.md   olcum/          (D0 ham çıktılar)
  S1.findings.json   S1-rapor.md          …  S6.findings.json   S6-rapor.md
  08-plan.json       08-yol-haritasi.md    08-kararlar.md    08-butceler.json
  U-01-rapor.md      …                                         (D3, şerit başına)
  10-kapilar-rapor.md
  11-final.json      11-kapanis.md
docs/reports/whispr-web-masaustu-performans-2026-09.html      (Ş9)
docs/operations/web-desktop-performance.md                     (Ş8 runbook)
```

## Kalıcı kurallar (özet — tamamı 00'da)

- **Commit, push, stash, reset, branch değişimi yok.** Değişiklik çalışma ağacında kalır; commit'i kullanıcı atar.
- Kullanıcıya dönen metin **caveman ultra**; rapor dosyaları okunur Türkçe; kod, yorum, commit mesajı normal.
- Ölçülmeyen sayı yazılmaz. Kanıtsız bulgu yazılmaz. Genel tavsiye bulgu değildir.
- Git Bash `sed -i` yasak (EOL'yi bozar). Edit aracı veya EOL koruyan node betiği.

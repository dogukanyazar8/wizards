# Ekran paylaşımı — Discord/Teams seviyesi (Go Live + 4K dahil)

Bu paket 2026-09-17 tarihli ekran paylaşımı analizinin (web + masaüstü + mobil) uygulama planıdır.
Hedef: Discord'un "Yayına geç" (Go Live), 4K/60 kaynak paylaşımı, net/akıcı modu, izleyici
deneyimi ve ölçülebilir kalite. Analiz chat'te verildi; doğrulanmış gerçekler ve kararlar
`00-ortak-baglam.md` içinde kayıt altındadır.

## Bugün ne var, hedef ne

**Uygulama kaydı (2026-09-17):** Dalga 0 yerel kapısı geçti; Dalga 1 Ş1–Ş4 kodu ve kapanış doğrulamaları [devam durumu](raporlar/00-devam-durumu.md) içinde. Aşağıdaki tablo başlangıç analizini anlatır; güncel uygulama durumu değildir. Dalga 2 başlamadı.

| Yetenek          | Bugün (doğrulandı)                                                          | Hedef (bu paket)                                                                                                           |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Capture yolu     | `getDisplayMedia` (web + WebView2), Chromium seçicisi                       | Aynı yol; Go Live için `displaySurface: "window"` ipucu + odak geri verme                                                  |
| Çözünürlük / fps | 720/1080/1440 @60 sabit, 30fps id'leri 60'a alias                           | 720/1080/1440/**2160** × 15/30/60, ayrı iki seçici                                                                         |
| Mod              | `contentHint: "detail"` + `maintain-resolution` her zaman                   | `text` / `motion`; oyun algılanınca `motion` otomatik; canlı geçiş                                                         |
| Codec            | VP9 L3T3_KEY sabit; NVIDIA/AMD'de yazılım libvpx                            | `encodingInfo` probe: AV1 HW > VP9 HW > H264 HW > yazılım; 4K yalnız HW                                                    |
| Oyun algılama    | Var (`get_desktop_detected_game`, 9 oyunluk katalog, presence "Oynuyor")    | **Go Live**: "Yayına geç: {oyun}" CTA, presence "Yayında: {oyun}", oyun kapanınca dur; kayıtlı oyunlar (Discord "Add it!") |
| Telemetri        | Yok (`getStats` yalnız ses; fps çipi preset etiketi)                        | Gerçek fps/bitrate/limit sebebi/encoder; client-health + analytics                                                         |
| İzleyici (web)   | Fullscreen; PiP/pop-out/zoom yok; `videoQualityMode` paylaşıma uygulanmıyor | Fit/zoom/pan, PiP + Document PiP pop-out, çoklu paylaşım, "N izliyor", global bar                                          |
| İzleyici (mobil) | iOS-only zoom prop, portrait kilit, 16:9 clamp                              | Pinch/pan, landscape fullscreen, 21:9, ≤1080p katman                                                                       |
| Mobil paylaşım   | Android tam ekran; arka plan = durdur; **iOS sessizce boş yayın**           | iOS kapısı → Broadcast Extension; Android arka planda sürer, OS durdurma dinlenir                                          |
| Test             | E2E sahte provider; CI'da LiveKit yok; gerçek `getDisplayMedia` hiç yok     | `chromium-real-media` projesi + LiveKit servisi + iki-peer + netem + Maestro                                               |
| Ağ / yetki       | TURN yok, `emptyTimeout` yok, token herkese SCREEN_SHARE                    | Hosting belgesi, TURN kararı, rol bazlı grant                                                                              |

## Dalga grafiği

```
Dalga 0  ─┬─ Ş0.1 sözleşme: @wizards/types şemaları, store alanları, ayar satırları, i18n
          ├─ Ş0.2 telemetri: screen-share-health (web + mobil), gerçek çip, client-health, analytics
          └─ Ş0.3 gerçek-medya test altyapısı: Playwright real-media, LiveKit CI servisi, netem, Maestro
                                    ↓ kapı: typecheck + test + real-media baseline raporu (sayılar kayda geçer)

Dalga 1  ─┬─ Ş1 encoder: codec probe, text/motion modu, fps merdiveni, 4K kapısı, canlı geçiş
          ├─ Ş2 izleyici web: fit/zoom/pan, PiP, pop-out, çoklu paylaşım, "N izliyor", global bar
          ├─ Ş3 izleyen listesi: socket olayı, Redis sayaç, fanout, sidebar, overlay
          └─ Ş4 ağ + yetki: hosting belgesi, TURN, emptyTimeout, rol bazlı grant
                                    ↓ kapı: her şerit kendi testini + real-media suite'ini geçirir

Dalga 2  ─┬─ Ş5 Go Live masaüstü: katalog genişletme, aday çözümü, CTA, presence, otomatik durdurma
          ├─ Ş6 mobil iOS: `unsupported` kapısı (A) → Broadcast Upload Extension (B)
          └─ Ş7 mobil Android + izleyici: arka plan politikası, OS durdurma, consent, zoom/landscape
                                    ↓ kapı

Dalga 3  ─┬─ Ş8 native capture araştırma spike'ı (Windows WGC + WASAPI + LiveKit Rust) — go/no-go raporu
          └─ Ş9 parity / QA kapanışı: metrik protokolü, matris, QA.md, kapanış raporu   ← Ş8 ile paralel
```

Dalga 0 bitmeden hiçbir şerit başlamaz. Dalga 1 ve 2 şeritleri **ayrık dosya kümelerine** sahiptir;
her prompt'un "Sahiplenilen dosyalar" bölümü bağlayıcıdır — orada yazmayan dosyaya **yazma, oku**.
Ş5 Dalga 1'in Ş1 (mod) ve Ş2 (yüzey) çıktısına bindiği için Dalga 2'dedir.

## Dosyalar

| Dosya                                    | Kapsam                                                                                            | Ön koşul         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| `00-ortak-baglam.md`                     | Kurallar, 34 doğrulanmış gerçek, 20 bağlayıcı karar, 18 tuzak, metrikler. **Uygulanmaz, okunur.** | —                |
| `01-dalga0-sozlesme-telemetri-test.md`   | 3 paralel şerit: sözleşme, telemetri, gerçek-medya test altyapısı                                 | —                |
| `02-dalga1-s1-encoder-codec-mod-4k.md`   | Codec probe, mod, fps merdiveni, 4K, canlı geçiş                                                  | Dalga 0          |
| `03-dalga1-s2-izleyici-web.md`           | Viewport, PiP/pop-out, çoklu paylaşım, izleyen çipi, global bar                                   | Dalga 0          |
| `04-dalga1-s3-izleyen-listesi.md`        | `voice:screenshare:watch`, Redis sayaç, fanout, sidebar, overlay                                  | Dalga 0          |
| `05-dalga1-s4-ag-yetki-sfu.md`           | Hosting belgesi, TURN, `emptyTimeout`, rol bazlı `canPublishSources`                              | Dalga 0          |
| `06-dalga2-s5-go-live-masaustu.md`       | Katalog, kayıtlı oyunlar, aday çözümü, CTA, presence `stream`, oyun kapanınca durdurma            | Dalga 1 Ş1+Ş2+Ş3 |
| `07-dalga2-s6-mobil-ios.md`              | iOS kapısı + Broadcast Upload Extension                                                           | Dalga 0          |
| `08-dalga2-s7-mobil-android-izleyici.md` | Arka plan politikası, OS durdurma, consent, gesture, landscape, katman                            | Dalga 1 Ş3       |
| `09-dalga3-s8-native-capture-spike.md`   | Araştırma: WGC + WASAPI loopback + LiveKit Rust, go/no-go                                         | Dalga 2          |
| `10-dalga3-s9-parity-qa-kapanis.md`      | Metrik protokolü, matris, QA.md / README güncellemeleri, kapanış                                  | Dalga 2          |

Her şerit bitişinde `raporlar/NN-rapor.md` yazar: ne yapıldı, ne sapıldı, ne açık kaldı, ölçülen sayılar.

## Kapı komutları

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web e2e:realtime
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
pnpm --filter @wizards/mobile test:components
```

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Kabul metrikleri (Ş0.2 telemetrisiyle ölçülür, Ş9 raporlar)

| Metrik                                | Hedef                                                   |
| ------------------------------------- | ------------------------------------------------------- |
| Tık → uzak ilk kare                   | p95 < 1.5 s (LAN)                                       |
| Metin okunurluk 1080p `text` modu     | SSIM ≥ 0.9 (statik kaynak vs alıcı kare)                |
| `motion` 1080p60 ölçülen fps          | ≥ 55 (HW encoder) / ≥ 28 (yazılım, 30fps'e düşer)       |
| `motion` 2160p60 ölçülen fps          | ≥ 50 (yalnız HW; yazılımda seçenek kapalı)              |
| Glass-to-glass gecikme                | < 300 ms (LAN)                                          |
| `qualityLimitationDurations.cpu` payı | < %5 (referans makine)                                  |
| `freezeCount` 5 dk stabil ağ          | 0                                                       |
| 2 Mbps'e düşüş                        | `text`: çözünürlük korunur, fps ≥ 5; `motion`: fps ≥ 24 |
| Go Live: oyun kapanınca yayın durur   | ≤ 30 s                                                  |

## Kararlar (kullanıcı, 2026-09-17)

Altı karar noktası kapandı. Şeritler bunlara göre yazıldı; `00-ortak-baglam.md` K2, K8, K14, K21–K23
taşır.

1. **4K erişimi** — feature flag `screenShare4k` ile kalır (UAT açık, prod kapalı). Kapı yalnız donanım encoder + kaynak çözünürlüğü.
2. **Özel exe** — Discord gibi: "Oyununu göremiyor musun? Ekle" akışı. Kullanıcı çalışan uygulamalar listesinden seçer, ad exe'den türer, kullanıcı düzenler; presence "Oynuyor: {ad}" ve Go Live "Yayına geç: {ad}". Exe adı yalnız yerelde; ağa yalnız kullanıcının yazdığı etiket gider (Ş5 §9, K22).
3. **Android arka planda paylaşım** — evet. `FOREGROUND_SERVICE_MICROPHONE` + `microphone|mediaProjection` servis tipi; Play Console FGS beyanı Ş7 raporuna (K14).
4. **LiveKit hosting** — **LiveKit Cloud**. TURN/TLS dahili, yalnız doğrulanır; sunucu config'i (`LIVEKIT_CONFIG`) uygulanamaz, `audio` observer ayarı yerel docker'da kalır; egress GB bazlı (Ş4, K21).
5. **Katalog** — Discord gibi: kürated liste + kullanıcı eklemesi. ≈100 oyunluk liste onay beklemeden Ş5'te işlenir; uzun kuyruğu 2 numaralı karar kapatır (K23).
6. **Ş8 spike** — koşar. Discord'un native yolu (özel seçici, uygulama başına ses, exclusive fullscreen) hedef; yalnız DirectX/Vulkan hook yapılmaz (anti-cheat riski, GAME_OVERLAY sözleşmesi). Üretime taşıma go/no-go raporuna bağlı ayrı paket.

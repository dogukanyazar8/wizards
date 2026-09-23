# D1 / Ş4 — Masaüstü kabuğu (Tauri 2 / WebView2 / Rust)

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/00-baseline.json` var (`M-DSK-*`).
Tür: **salt okuma.** Yalnız `raporlar/S4.findings.json` + `raporlar/S4-rapor.md`. Ölçüm için release build almak serbest — **scratchpad `--target-dir`** ile; repodaki `target/` ve dosyalar değişmez.
Sahiplik: Rust kabuğu, pencere/WebView2 yaşam döngüsü, IPC, arka plan iş parçacıkları, yayın boyutu, masaüstüne özgü web köprüsünün _Rust tarafı ve sözleşmesi_. Köprünün web tarafındaki render maliyeti Ş2'nin, baytı Ş1'in.

## Amaç

Masaüstü uygulaması web içeriğinin üstünde ince bir kabuk olmalı: **açılışa, belleğe ve CPU'ya içerik dışında fark edilir maliyet eklememeli**, ana iş parçacığını hiç bloklamamalı, bakımı kolay olmalı. Bugünkü durum: 38 komutun 25'i senkron, `lib.rs` 6.476 satır, release profili ayarsız, açılış ölçülemiyor (D0 bunu açtı). Bu şerit kabuğun kendi payını sayıyla ayırır ve Rust kod kalitesini değerlendirir.

## Önceki bulgular (priorStatus zorunlu)

Principal F-13 (prod capability'de localhost — yalnız durum, güvenlik işi değil), F-16 (`lib.rs` büyüklüğü), `docs/desktop/desktop-native-evolution.md` hedef mimarisi, A1-006 (god node'lar).

## Tohum

```bash
graphify explain "run()"
graphify explain "configured_app_url()"
graphify explain "resolve_webview_data_directory()"
graphify query "tauri command lib.rs" --budget 8000
```

```bash
rg -n "#\[tauri::command" -A2 apps/desktop/src-tauri/src
rg -n "std::fs::|std::thread::|block_on|Mutex<|\.lock\(\)|unwrap\(\)|expect\(" apps/desktop/src-tauri/src/lib.rs
rg -n "WebviewWindowBuilder::new|data_directory\(|additional_browser_args" apps/desktop/src-tauri/src
rg -n "invoke\(|listen\(|emit\(" apps/web/src --glob '!*.test.*' -g '*desktop*'
rg -n "@tauri-apps/api" apps/web/src --glob '!*.test.*' -l
```

## Kapsam matrisi

| Birim                                                                                                                         | Hedef                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 38 `#[tauri::command]`                                                                                                        | %100 — senkron/async, yaptığı iş (IO, ağ, süreç listesi, kripto), tahmini/ölçülen süre, çağrı sıklığı (web tarafındaki çağıran) |
| Pencereler: main (`lib.rs:1113`), ayarlar kontrol düzlemi (`:4625`, CustomProtocol), game overlay (`:4832`), `:4999`, `:5109` | %100 — oluşturma anı, `data_directory`, yüklediği web rotası, süreç maliyeti                                                    |
| Arka plan iş parçacıkları ve yoklamalar (`:3470`, `:5252`, `game_activity.rs` 15 sn önbellek, sysinfo)                        | %100 — periyot, CPU                                                                                                             |
| Açılış yolu `run()` (`lib.rs:928`) → ilk pencere                                                                              | %100 — sıralı işler listesi                                                                                                     |
| Eklentiler (single-instance, global-shortcut, autostart, window-state, updater, deep-link, notification)                      | her birinin açılış ve olay maliyeti                                                                                             |
| Rust kaynağı (12 dosya)                                                                                                       | kalite taraması %100, derin okuma sıcak yollarda                                                                                |

## Ölçüm (izinli)

- **Açılış kırılımı:** D0 `M-DSK-START-T1/T2/T3`. Kabuk payı = T1 (süreç → pencere) ve T1→T2 arası WebView2 oluşturma; içerik payı = T2→T3. Rust tarafı zamanlaması için ürün koduna log eklenmez — `ETW`/Windows Performance Recorder (`wpr -start GeneralProfile`) ile tek açılış kaydı alınabilir; araç makinede yoksa `NOT_RUN`.
- **Süreç ağacı:** `M-DSK-PROCS`, süreç başına WorkingSet/Private Bytes; voice-mini ve overlay açıkken ve kapalıyken fark. Hangi pencere ayrı WebView2 ortamı/renderer açıyor?
- **Boşta CPU:** `M-DSK-CPU-idle`; oyun algılama açık/kapalı (`game_detection_enabled`) farkı.
- **Release profili denemesi (dosya değiştirmeden):** Cargo env override'larıyla scratchpad `--target-dir`'e:
  `CARGO_PROFILE_RELEASE_LTO`, `CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1`, `CARGO_PROFILE_RELEASE_STRIP`, `CARGO_PROFILE_RELEASE_OPT_LEVEL`.
  Her varyant için exe boyutu, derleme süresi, T1. `panic = "abort"` **denenmez** — Sentry panic yakalama unwind ister; etkisini yalnız not et.
- **Komut süresi:** senkron komutların web'den çağrıldığı akışlarda (ayarlar, tepsi, kısayol, tanılama) CDP ile `invoke` başı-sonu süresi (K2-A ortamında, oturumsuz yüzeyde erişilebilenler; erişilemeyenler statik okuma + `probable`).

## Aranacak kusur sınıfları

1. **Ana iş parçacığında iş.** Senkron komut içinde dosya IO, süreç listeleme (`sysinfo`), ağ, JSON büyük serileştirme, `Mutex` beklemesi. Tauri 2 kuralı `[public-ref: v2.tauri.app/develop/calling-rust]`: `async` olmayan komut ana iş parçacığında koşar. Ayrıca **async komut içinde bloklayan çağrı** (`std::fs`, `std::thread::sleep`) tokio işçisini tutar.
2. **Açılışta sıralı iş.** `run()` içinde ilk pencereden önce yapılan: pencere durumu okuma (`:3806`, `:3908` senkron `read_to_string`), güncelleme kontrolü, kısayol kaydı, Sentry init + minidump yardımcı süreci, oyun algılama başlatma. Hangisi pencere göründükten sonraya ertelenebilir?
3. **WebView2 ortamı ve süreç çoğalması.** Pencerelerin çoğu aynı `data_directory`'yi kullanıyor (`:1118`, `:4850`, `:5014`, `:5122`); ayarlar kontrol düzlemi penceresi (`:4625`) kullanıyor mu? Farklı ortam = ayrı tarayıcı süreç grubu = ek bellek. Game overlay tam web rotası yüklüyor (`desktop_app_url_with_path(DESKTOP_GAME_OVERLAY_PATH)`, `:4823`) — overlay için tüm uygulama paketi mi iniyor (Ş1'e bayt notu)?
4. **Arka plan kısması ve görünmez pencere maliyeti.** Gizli/simge durumundaki pencerelerde WebView2 zamanlayıcıları, animasyonlar, ses; overlay kapalıyken süreç yaşıyor mu?
5. **IPC trafiği.** Web'in yüksek frekanslı `invoke`/`emit`'i (tepsi bağlamı `DesktopTrayContext`, ses durumu, pencere durumu): olay başına Rust tarafı iş, gereksiz tekrarlar (değişmeyen durumun yeniden gönderilmesi).
6. **Yayın boyutu ve derleme süresi.** `[profile.release]` yokluğunun ölçülen maliyeti; `sysinfo` gibi ağır crate'lerin yalnız gereken özellikleri açık mı (`default-features = false` — doğru görünüyor, doğrula); ölü bağımlılık.
7. **Rust kod kalitesi.**
   - `lib.rs` sorumluluk haritası: bölüm → satır aralığı → sorumluluk (pencere, tepsi, kısayol, güncelleme, tanılama, kapanış koordinatörü, voice-mini, overlay, oyun, izin, OAuth navigasyon, kontrol düzlemi). **Hedef modül haritası** ve taşıma sırası öner (yalnız taşıma, davranış değişmez); her modülün `pub` yüzeyi.
   - `unwrap()`/`expect()`/`panic!` çalışma zamanı yollarında (D0 `M-KOD-rust-*`); zehirlenmiş `Mutex` davranışı; hata tipi (`String` hataları mı, tipli mi); `cargo clippy -- -W clippy::pedantic` **yalnız rapor** (config değiştirmeden) → kural başına sayı, anlamlı olan ilk 10.
   - Test: 38 `#[test]` hangi sorumlulukları kapsıyor, hangi komutların testi yok.
8. **Web köprüsü sözleşmesi.** Web'deki Tauri çağrıları tipli ve tek modülde mi, yoksa bileşenlere dağılmış mı? Komut adı/argüman sözleşmesi iki tarafta nasıl senkron tutuluyor (`removeUnusedCommands: true` + capability dosyaları)? Masaüstü olmayan tarayıcıda `@tauri-apps/api` yükleniyor mu (Ş1'e bayt notu).

## Yapılmayacaklar

- Değişiklik; `Cargo.toml`/`tauri.conf.json`/capability düzenlemesi (env override ile ölçüm serbest).
- Native medya/ekran yakalama (araştırma kapılı, ekran paylaşımı paketi).
- `windows` crate 0.62 / webview2-com 0.39 önerisi (bloke, 00 §10).
- Güvenlik sınırı değişikliği önerisi — F-13 ve `desktop-native-evolution` kapsamı; performans bulgusu güven sınırına dokunuyorsa `risk: high` ve `behaviorChange: true`.

## Teslim

`raporlar/S4.findings.json` + `raporlar/S4-rapor.md`; rapora ek:

- **Komut tablosu:** 38 komut × (senkron/async, iş türü, ana iş parçacığı riski, çağıran web dosyası, ölçülen/tahmini süre).
- **Açılış zaman çizelgesi:** T0→T3 kalemleri, kabuk payı / içerik payı.
- **Süreç ve bellek tablosu:** pencere durumu kombinasyonları × süreç sayısı × RSS.
- **Release profili tablosu:** varyant × exe MB × NSIS MB × derleme süresi × T1.
- **`lib.rs` hedef modül haritası** ve taşıma sırası (Ş7 bunu K4'e göre şerit yapar).

## Kapı

00 §12'nin dört kontrolü (`S4`). Ek: `pnpm --filter @wizards/desktop lint:rust` ve `pnpm --filter @wizards/desktop test` baseline'da yeşil mi — sonucu rapora yaz (kırmızıysa bu şeridin bulgusu değil, not).

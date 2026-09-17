# Dalga 3 · Ş8 — Native capture araştırma spike'ı (Windows)

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 2 kapısı geçti. Kullanıcı kararı 2026-09-17: **koşar** — Discord'un native
> capture yolu hedef (README karar 6, K3).

---

Whispr monorepo, `uat` dalı. Görev: **araştırma**, üretim değil. Discord'un tarayıcıda
yapılamayan üç şeyi — thumbnail'lı özel seçici, uygulama başına ses, exclusive fullscreen oyun
yakalama — Tauri (Rust) tarafında ne kadar yapılabilir? Çıktı: çalışan PoC bayrak arkasında +
sayılarla go/no-go raporu. `apps/desktop/NATIVE_MEDIA_RESEARCH.md`'nin 7 kapısı bağlayıcı.

Önce oku: `00-ortak-baglam.md` §4 #11, #13, §5 K3; `NATIVE_MEDIA_RESEARCH.md` tamamı;
`GAME_OVERLAY.md`; `lib.rs:1944-1975` (research-gated yetenek raporu), `lib/desktop/native-media.ts`.

## Sahiplenilen dosyalar

- `apps/desktop/src-tauri/src/native_capture/` (yeni modül; `Cargo.toml` bağımlılıkları), `lib.rs`
  yalnız modül kaydı + bayraklı komutlar
- `apps/desktop/NATIVE_MEDIA_RESEARCH.md` (durum tablosu güncellenir)
- `apps/web/src/lib/desktop/native-media.ts` + test (`native_spike_ready` gerçek koşulu)
- `apps/web/src/lib/voice/participant-mapping.ts` + test — **yalnız** companion identity kuralı
- `apps/web/src/lib/livekit/server.ts` + test — **yalnız** companion token grant'ı
- `docs/desktop/desktop-native-evolution.md` (bulgular)

**Yazma:** üretim paylaşım yolu (`screen-share.ts`, provider), mobil, overlay.

## Ne yapılacak (her adım ayrı ölçülür; biri düşerse rapora yazılır, devam edilir)

1. **Kaynak listesi + thumbnail (Rust):** `windows-capture` (WGC) ile pencere/ekran listesi,
   her biri için 1 kare küçük resim (base64 PNG ≤ 40 KB), komut `list_desktop_capture_sources`
   (bayrak `desktop.nativeCapture` + ana pencere). Gizlilik: pencere başlığı yalnız yerel listede,
   telemetriye/sunucuya **asla**.
2. **Kare yakalama:** seçilen HWND/monitör için 30/60 fps BGRA → NV12/I420 dönüşüm; CPU ve GPU
   yükü ölçülür (1080p60, 1440p60, 4K30).
3. **Yayın yolu — iki seçenek, ikisi de PoC:**
   - (a) **LiveKit Rust SDK** (`livekit` crate, `NativeVideoSource`): Rust doğrudan odaya
     "companion" katılımcı olarak bağlanır — identity `<userId>#screen`, token yalnız
     `SCREEN_SHARE`/`SCREEN_SHARE_AUDIO` grant'ı (`server.ts` companion kuralı),
     `participant-mapping.ts` `#screen` sonekini ana kullanıcıya bağlar. Aynı identity iki kez
     bağlanamadığı için bu **zorunlu**.
   - (b) **WebView'e kare aktarımı** (shared memory / `wgpu` texture → `<canvas>` →
     `captureStream()`): IPC maliyeti ölçülür; 1080p60'ta pratik değilse rapora ve bırak.
4. **Sistem / uygulama sesi:** WASAPI loopback (`wasapi` crate); Windows 10 2004+ process-loopback
   (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`) ile **yalnız oyun PID'i** sesi. (a) yoluyla
   `ScreenShareAudio` track'i. Echo: yerel hoparlörden çıkmaya devam eder (istenen).
5. **Exclusive fullscreen:** WGC'nin exclusive modda pencere yakalayamadığı doğrulanır; monitör
   yakalama ile fark ölçülür. DirectX/Vulkan hook (OBS game-capture / Discord'un DLL enjeksiyonu)
   **kod olarak yapılmaz**: imzasız yeni DLL VAC/Vanguard/EAC'de ban riski; Discord bunu imzalı DLL
   ve anti-cheat allowlist anlaşmalarıyla yapıyor (GAME_OVERLAY sözleşmesi). Raporda yalnız
   fizibilite paragrafı; kullanıcı ayrıca isterse ayrı paket.
6. **Kapılar (NATIVE_MEDIA_RESEARCH 1–7):** her biri için kanıt satırı: kullanıcı başlatır;
   izin iptal edilebilir; iptal WebRTC yoluna güvenle döner; seçilen yüzey dışı içerik yok
   (Whispr penceresi hariç tutulur); start/stop/reconnect/quality/page-exit testleri; CPU/RAM/gecikme
   PII'siz ölçüm; encoder iddiası yok.
7. **Karar tablosu:** `getDisplayMedia` (bugün) vs (a) vs (b): CPU %, gecikme ms, kalite (SSIM),
   kurulum karmaşıklığı, risk. Öneri + tahmini iş.

## Test

- Rust: liste komutu boş/dolu; thumbnail boyut sınırı; bayrak kapalıyken komut `Err`.
- TS: companion identity eşleme (`#screen` → ana kullanıcı; roster'da ayrı katılımcı **görünmez**);
  companion grant yalnız iki kaynak; sahte token testi.
- E2E yok. Elle protokol: referans makinede 3 çözünürlük × 2 yol, sayılar rapora.

## Kapı

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

```bash
pnpm --filter @wizards/web test
```

Rapor: `raporlar/09-rapor.md` — go/no-go, sayılar, hangi kapı geçmedi, üretime taşımak için
gereken iş listesi (ayrı paket olur; bu paket PoC'yi bayrak arkasında bırakır).

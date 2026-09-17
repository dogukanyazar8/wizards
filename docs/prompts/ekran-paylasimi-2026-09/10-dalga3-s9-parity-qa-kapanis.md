# Dalga 3 · Ş9 — Parity / QA kapanışı

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 2 kapısı geçti (Ş8 ile paralel; Ş8 raporu varsa okunur).

---

Whispr monorepo, `uat` dalı. Görev: paketin **kanıt** dalgası. README'deki kabul metriklerini
gerçek makinelerde ölç, Discord/Teams matrisini doldur, belgeleri güncelle, açık kalanları
listele. Kod değişikliği yalnız testler, belgeler ve **küçük** düzeltmeler (≤ 20 satır; büyüğü
"açık iş" olur).

Önce oku: `00-ortak-baglam.md` §8 (referans davranışlar), README "Kabul metrikleri";
`raporlar/01-s02-rapor.md` (baseline), `raporlar/02-…08-rapor.md`.

## Sahiplenilen dosyalar

- `docs/prompts/ekran-paylasimi-2026-09/raporlar/10-kapanis.md` (yeni)
- `apps/desktop/QA.md` ("Voice And Screen Share" listesi), `apps/desktop/NATIVE_MEDIA_RESEARCH.md`
  (durum), `apps/web/e2e/README.md` (real-media bölümü), `docs/operations/livekit-hosting.md`
- `apps/web/e2e/specs/voice/screen-share-real-media.spec.ts` — eşiklerin sertleştirilmesi
- `apps/web/src/lib/locale/messages/*.test.ts` / copy sözleşme testi — "NVENC/AMF/QuickSync/
  VideoToolbox" kelimelerinin ürün metninde **olmadığını** kilitleyen test (yeni)
- Küçük düzeltmeler: bulunan sapmanın dosyası (raporda gerekçeli)

## Ne yapılacak

### 1. Metrik protokolü (elle + telemetri çipi + client-health)

Makineler: (M1) Windows + NVIDIA RTX, (M2) Windows + Intel iGPU dizüstü, (M3) Windows + AMD;
tarayıcı: Whispr masaüstü (WebView2) + Chrome + Firefox; izleyici: web (M2), Android orta segment,
iOS (Ş6-B doğrulandıysa). Her hücre 60 s:

| Senaryo                             | Ölçülen                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `text` 1080p30, statik IDE          | SSIM, fps, limit sebebi, encoder impl                        |
| `motion` 1080p60, oyun/video        | fps p50/p95, limit sebebi, encoder impl, CPU %               |
| `motion` 2160p60 (M1 yalnız)        | fps, bitrate, izleyicide alınan katman, izleyici decode fps  |
| Go Live Valorant/CS2 (M1)           | CTA etiketi, presence, odak geri dönüşü, oyun kapanınca süre |
| Bant düşüşü 2 Mbps (netem/`clumsy`) | `text` çözünürlük, `motion` fps                              |
| Tık → uzak ilk kare                 | ms (Ş0.2 `screen_share_first_remote_frame`)                  |
| Glass-to-glass (desen sayfası)      | ms                                                           |
| Android arka plan (Ş7)              | sürüyor mu, süre                                             |

Sonuçlar tablo olarak `10-kapanis.md`'ye; hedefi tutmayan hücre **kırmızı** + neden + öneri.

### 2. Matris

README'deki "Bugün / Hedef" tablosu → "Sonuç" kolonu (Discord ile eşit / eksik / kapsam dışı).

### 3. Belgeler

- `QA.md`: mod, fps, 4K, Go Live, PiP/pop-out, izleyen sayısı, global bar, Android arka plan,
  iOS kapısı için manuel adımlar.
- `e2e/README.md`: real-media projesi, bayraklar, LiveKit servisi, netem nightly, `test.skip` listesi.
- `NATIVE_MEDIA_RESEARCH.md`: Ş8 sonucu (koşulduysa) ya da "atlandı".
- `livekit-hosting.md`: Ş4/Ş3 verileriyle son hâli.

### 4. Eşikler

Real-media spec'indeki soft eşikler (SSIM, gecikme) CI'da ölçülen baseline'a göre sert `expect`
olur (CI yazılım encoder'ı için ayrı, gevşek değerler; referans makine değerleri belgeye).

### 5. Copy kilidi

Ürün metninde donanım encoder markası iddiası yok (yeni sözleşme testi, tr + en + mobil copy).

### 6. Açık işler

Karar noktalarının sonucu, tutmayan metrikler, Ş8 go/no-go, ertelenen özellikler (özel exe,
stream preview, annotation) — her biri bir sonraki paketin girdisi olacak biçimde.

## Kapı

```bash
pnpm --filter @wizards/web test && pnpm --filter @wizards/mobile test
```

```bash
pnpm --filter @wizards/web e2e:real-media
```

Rapor: `raporlar/10-kapanis.md`.

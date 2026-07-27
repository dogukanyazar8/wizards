# RUN PROMPT — Admin Dalga 5: D2 Delil + F Desktop/Mobil

Whispr admin yeniden tasarımının son dalgası:

1. **D2:** İçerik raporu — rapor sözleşmesi `messageId/dmMessageId/attachmentId` taşır, sunucu erişim doğrulayıp delil snapshot'ı yazar, itiraz akışı, 180 gün delil saklama.
2. **F:** Mobil vaka refakatçisi (liste + detay + üç aksiyon) ve desktop konsol penceresi (tepsi rozeti, `?surface=console` kompakt mod).

**Ön koşul:** Dalga 3 (D1 vaka API'leri) tamam. Mobil sözleşme değişikliği istemci deploy'u gerektirir.

## Okuma sırası

1. `docs/superpowers/plans/2026-07-27-admin-wave5-d2-f.md`
2. `docs/superpowers/specs/2026-07-26-admin-moderation-design.md` §D2 + Fazlar bölümündeki sözleşme bloğu
3. `docs/superpowers/specs/2026-07-26-admin-desktop-mobile-design.md` (tamamı — özellikle Tasarım §4 mobil auth)
4. `docs/superpowers/specs/2026-07-27-admin-design-handoff-implementation.md` §9 (üç yüz)
5. Desktop desen referansı: `apps/desktop/src-tauri/capabilities/voice-mini.json` + `lib.rs:3227` (voice-mini pencere kurulumu)

## Bağlayıcı kurallar

- **Commit atma.**
- **D2 güvenlik kuralı (pazarlıksız):** raporcunun **göremediği** mesaj için snapshot yazılmaz — alan yok sayılır, rapor yine kaydedilir. Aksi halde rapor ucu, erişilemeyen mesaj içeriğini sızdıran okuma aracına dönüşür. Bu test önce yazılır.
- `.strict()` şemalar korunur; yeni alanlar opsiyonel — yalnızca `reason`+`details` gönderen eski istemci çalışmaya devam eder.
- Delil temizliği yalnızca `ModerationEvidence` siler; vaka + olaylar + karar kalıcı.
- **Mobil auth:** `requireMobileAdminCapability(request, capability)` — `requireMobileApiSession` (Bearer) + `AdminMembership` + W1 haritası. `requireAdminUser` (çerez) mobil uçlarda KULLANILMAZ — her mobil istekte 401 döner.
- **Mobil aksiyon seti sabit:** üstlen / reddet (neden zorunlu) / web'e yükselt. Ban ve mesaj silme uçları mobilde YOK — rota listesi testle sabitlenir. Kapsam genişletme talebi yeni spec ister.
- İstemcideki `isAdmin` bayrağı yalnızca görünürlük — her uç kendi yetkisini doğrular (bayrak elle `true` → 403 testi).
- Çevrimdışı aksiyon kuyruğu YOK — ağ yokken düğmeler devre dışı.
- Bildirim tekilliği: `dedupeKey` ile vaka başına günde bir.
- Desktop: yeni frontend YOK — konsol penceresi web rotasını `?surface=console` ile yükler; tepsi sayısı sunucudan gelir, desktop hesaplamaz; `admin-console` penceresi ana pencereye ayrılmış Tauri komutlarını çağıramaz.
- Mobil ekranlar mobil uygulamanın kendi tasarım dilinde — web paneli kopyalanmaz.

## Doğrulama

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/db test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web lint
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
graphify update .
```

Desktop değişiklikleri için ayrıca `apps/desktop` test script'leri (`pnpm --filter whispr-desktop test` — paket adını `apps/desktop/package.json`'dan doğrula).

## Rapor formatı

- D2 kanıtı: mobil mesaj raporu → vaka dosyasında delil kartı; kaynak silinince kart içeriği duruyor; erişilemeyen mesaj denemesinde snapshot yazılmadı
- F kanıtı: `URGENT` vaka → telefona bildirim → dokunma vakayı açıyor → "Üstlen" web'de anında görünüyor; mobil uçtan ban denemesi 403; konsol penceresi bağımsız açık, tepsi sayısı canlı
- Değişen dosyalar + sapmalar

# Dalga 3 · Ş10 — Masaüstü (5 sekme · 24 satır) + Hakkında (1 sayfa · 6 satır)

**Ön koşul:** Dalga 2 kapısı yeşil. **Paralel:** Ş7, Ş8, Ş9.

Referans kareler: `screens/07-masaustu-izinler.png`, `screens/08-hakkinda.png`.
Otorite `.dc.html` `SET[4]` ve `SET[5]` dalları.

Bu şerit **Rust tarafına dokunur** (K7). Rust değişikliği kendi commit'inde ve web tarafı
onsuz da derlenir.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/settings/sections/desktop/*.tsx` (5 sekme)
- `apps/web/src/components/settings/sections/about/about-page.tsx` (1 sayfa)
- `apps/web/src/components/settings/blocks/shortcuts-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/permissions-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/diagnostics-block.tsx` (yeni — `DesktopDiagnosticsPanel` sarar)
- `apps/web/src/components/settings/blocks/about-card-block.tsx` · `version-grid-block.tsx` ·
  `whats-new-block.tsx` · `contributors-block.tsx` (yeni)
- `apps/web/src/lib/desktop/shortcuts.ts` (yeni — 5 eylem sözleşmesi + çakışma) + `.test.ts`
- `apps/web/src/lib/desktop/permissions.ts` (yeni — 5 izin okuma) + `.test.ts`
- `apps/desktop/src-tauri/src/lib.rs` (**düzenlenir** — K7)
- `apps/web/src/lib/settings/bootstrap.ts` (**düzenlenir** — sürüm ızgarası verisi)

**Okunur, yazılmaz:** `lib/desktop/{controls,updater,start,privacy,voice-mini,game-overlay-state,performance,runtime}.ts`,
`lib/app-version.ts`, `lib/settings/tree.ts`, satır motoru.

---

## A. Masaüstü (yalnız Tauri çalışma zamanında listede — K11)

### 1. Uygulama sekmesi

**Pencere davranışı:** `Sistem başlangıcında Whispr'ı aç` (`lib/desktop/start.ts`) ·
`Ana pencere kapanınca` (Tepsiye küçült / Uygulamadan çık, `controls.ts`) ·
`Başlangıçta küçültülmüş aç`.

**Yayın ve durum:** `Yayıncı modu` (`privacy.ts`) · `OBS ve XSplit'i otomatik algıla` ·
`Rich presence` · `Rich presence görünürlüğü` (Arkadaşlar / Hiç kimse).

Bu satırların tamamı **gerçek köprüye** yazar. Köprü yoksa (web'de açılmışsa) bölüm zaten
listede değil — ikinci bir koruma gerekmez.

### 2. Kısayollar sekmesi (K7)

Not: `Kısayollar Whispr arka plandayken de çalışır.`

`Global kısayolları etkinleştir` anahtarı + **kısayol bloğu** (5 satır) +
`Kısayol atamaları` eylem satırı (`Kaydet` / `Sıfırla` + `1 çakışma` pili).

| Eylem                   | Varsayılan | Bugün Rust'ta |
| ----------------------- | ---------- | ------------- |
| Mikrofonu aç/kapat      | `⌥M`       | **var**       |
| Sesi sağırlaştır/aç     | `⌥D`       | **var**       |
| Bas-konuş               | `⌥Space`   | **var**       |
| Overlay'i gizle         | `⌥H`       | **yeni**      |
| Moderasyon konsolunu aç | `⌥⇧K`      | **yeni**      |

**Rust tarafı (`src-tauri/src/lib.rs`):**

- `DesktopVoiceShortcutConfig` → `DesktopShortcutConfig`; 3 eylemlik enum 5 eyleme genişler.
  Eski komut adları (`configure_desktop_voice_shortcuts`, `get_desktop_voice_shortcut_status`)
  **korunur** ve yeni komutlara yönlendirir — eski web sürümü kırılmaz.
- Kayıt başarısız olursa (`register` hata döner) o eylem `conflict: true` ile raporlanır;
  uygulama **çökmez** ve diğer kısayollar kaydolmaya devam eder.
- Yeni komut: `get_desktop_shortcut_status` → `{ action, keys, registered, conflict }[]`.

**Yeniden atama:** düğmeye basınca satır "tuş bekleniyor" moduna girer, `keydown` yakalanır
(`Esc` iptal), yeni kombinasyon kaydedilmeye çalışılır. Başarısızsa satır çakışma durumuna geçer:
`H(danger,.05)` satır zemini, tuş kapsülleri `H(danger,.1)`/`H(danger,.35)`, metin
`Başka bir uygulamayla çakışıyor`.

Atamalar **sunucuda** saklanır (`UserSettings` üzerinde JSON değil — `DesktopShortcut` alanları
`UserNotificationSettings` gibi tipli olamaz çünkü değişken sayıda; bu yüzden
`UserSettings.desktopShortcuts Json?` **tek istisna** olarak kabul edilir ve Ş0'a geri
bildirilir). Çakışma durumu **saklanmaz** — her açılışta gerçek kayıttan okunur.

> **Not:** Bu tek JSON kolonu K3'ün istisnasıdır ve gerekçesi burada yazılıdır: kısayol listesi
> sorgulanabilir bir alan değil, cihaz başına okunan bir tercih paketidir. `SPEC_DEVIATIONS`'a 11. kayıt olarak girer.

### 3. Overlay sekmesi

**Voice Mini:** `Voice Mini açık` · `Yalnız konuşanları göster` (`lib/desktop/voice-mini.ts`).

**Oyun overlay'i:** `Oyun overlay'i açık` · `Konum` (4 seçenek) · `Boyut` (3 seçenek) ·
`Oyunları otomatik algıla` · `Oyun bazlı ayarlar` (`nav`, `4 oyun için özel overlay ayarı var`) ·
`Yüzeyler` eylem satırı (`Voice Mini'yi test et` / `Overlay'i test et` / `Yenile`).

`Oyun bazlı ayarlar` hedefi bu pakette **yok** → `TODO(api):` ve düğme `disabled`;
sayı gerçek `game-overlay-state.ts` verisinden okunur, sabit `4` yazılmaz.

### 4. İzinler sekmesi

**İzin bloğu** — 5 satır: Bildirim · Mikrofon · Kamera · Ekran paylaşımı · Global kısayol.
Her satırda durum noktası, `İzin verildi` / `Engellendi` / `Doğrulanamadı` pili, yardım metni ve
duruma göre düğmeler:

| Durum           | Düğmeler                                   |
| --------------- | ------------------------------------------ |
| `İzin verildi`  | `Sistem ayarları`                          |
| `Engellendi`    | `Sistem ayarları` (primary) + `Kontrol et` |
| `Doğrulanamadı` | `İzin iste` (primary) + `Kontrol et`       |

Kaynak: `navigator.permissions` (bildirim, mikrofon, kamera) + Tauri köprüsü
(ekran paylaşımı, global kısayol). Global kısayol izni erişilebilirlik iznine bağlı ve
çoğu platformda **sorgulanamaz** → `Doğrulanamadı` doğru varsayılan.

`Kontrol et` gerçekten yeniden sorgular; iyimser güncelleme yapmaz.

### 5. Güncelleme sekmesi

**Sürüm:** `Mevcut sürüm` (`2.4.1 · build 4812 · bugün 09:12'de kontrol edildi`, `Güncel` pili,
`Güncellemeyi kontrol et`) · `Release kanalı` segmenti (Kararlı / Beta / Canary) ·
`Otomatik güncelleme`.

Kanal seçimi `User.preferredReleaseChannel`'a yazar; **build'in kanalını değiştirmez**, yalnız
hangi akışın önerileceğini belirler (mevcut sözleşme).

**Tanılama:** 2 kolonlu 10 satırlık durum ızgarası (Web sürümü · Masaüstü sürümü · Platform ·
Ağ · Socket · Ses bağlantısı · Bildirim izni · Global kısayollar · Voice Mini · Overlay) +
`Kurtarma` eylem satırı (`Destek paketi` / `Overlay'i onar` / `Pencere konumunu sıfırla`).

Tanılama verisi `DesktopDiagnosticsPanel` + `lib/desktop/performance.ts` + izin bloğunun
okuduğu **aynı** kaynaklardan gelir; ikinci bir sorgu kurulmaz. `Bildirim izni` ve
`Global kısayollar` satırları İzinler ve Kısayollar sekmeleriyle **aynı durumu** gösterir.

Ağır bölüm → ilk açılışta iskelet.

---

## B. Hakkında (tek sayfa, sekme şeridi yok)

### 6. İçerik

- **Whispr kartı** (başlıksız grup, sapma #8): 56 px logo, ürün açıklaması, dört bağlantı
  (Web sitesi · Gizlilik politikası · Kullanım şartları · Lisanslar).
  Bağlantı hedefleri `lib/legal/` ve `lib/privacy-policy.ts` üzerinden; uydurma URL yok.
- **Sürüm bilgileri** — 2 kolonlu 8 satır (Web sürümü · Masaüstü sürümü · Build ID ·
  Build zamanı · Release kanalı · Desktop release ring · Updater durumu · Son kontrol) +
  `Güncellemeleri kontrol et`. Veri `getSettingsBootstrapPayload` + `lib/app-version.ts`.
  Web'de açıldığında masaüstü satırları `—` gösterir, satır **gizlenmez**.
- **Yenilikler · 2.4.1** — üç kart (Bildirimler · Etkinlikler · Keşfet) + `Tüm sürüm notları`.
  Metinler i18n'den; sürüm numarası `app-version.ts`'ten interpolasyonla.
- **Katkıda bulunanlar** — 4 satır rol pilleriyle. `Contributor` tablosundan (mevcut
  `getContributors`); rol bilgisi tabloda yok → **`TODO(api):`**, roller şimdilik
  `Geliştirici` (sahip) ve `Katkıcı` (diğerleri) olarak türetilir. `Öne çıkan katkıcı` rolü
  mevcut `FEATURED_CONTRIBUTOR_NAME` sabitinden gelir (bugünkü panelde var).

---

## Kabul

- [ ] Masaüstü bölümü web'de listede **yok**, Tauri'de var.
- [ ] 5 sekme, 8 grup, 24 satır eksiksiz; Hakkında 4 grup, 6 satır ve sekme şeridi **yok**.
- [ ] Rust: 5 eylem kayıtlı; eski komut adları çalışıyor (eski web sürümü kırılmıyor).
- [ ] Kayıt hatası **çakışma** olarak raporlanıyor, uygulama çökmüyor, diğer kısayollar kaydoluyor.
- [ ] Yeniden atama tuş yakalıyor; `Esc` iptal ediyor; çakışma satırı danger durumunda çiziliyor.
- [ ] Çakışma sayısı pili gerçek kayıt sonucundan; sabit `1` yok.
- [ ] Kısayol atamaları sunucuda saklanıyor; çakışma **saklanmıyor**.
- [ ] `SPEC_DEVIATIONS` 11. kayıt eklendi (`desktopShortcuts Json?` K3 istisnası).
- [ ] 5 izin satırı gerçek kaynaktan; global kısayol izni `Doğrulanamadı` varsayılanı doğru.
- [ ] `Kontrol et` gerçekten yeniden sorguluyor.
- [ ] Tanılama ızgarasındaki `Bildirim izni` ve `Global kısayollar` İzinler/Kısayollar
      sekmeleriyle **aynı** durumu gösteriyor.
- [ ] Tanılama iskeletle geliyor.
- [ ] Release kanalı seçimi build kanalını değiştirmiyor.
- [ ] Hakkında bağlantıları gerçek hedeflere gidiyor; uydurma URL yok.
- [ ] Web'de masaüstü sürüm satırları `—` gösteriyor, gizlenmiyor.
- [ ] Katkıcı rolleri türetilmiş ve `TODO(api):` işaretli.
- [ ] Açık ve koyu temada `screens/07-masaustu-izinler.png` ve `screens/08-hakkinda.png` ile
      karşılaştırma yapıldı.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/11-s10-rapor.md`

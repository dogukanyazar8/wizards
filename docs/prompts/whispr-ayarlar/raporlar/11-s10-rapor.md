# Ş10 — Masaüstü (5 sekme · 24 satır) + Hakkında (1 sayfa · 6 satır)

**Dal:** `uat` · **Commit atılmadı.**

---

## 1. Ne yapıldı

### Rust (`apps/desktop/src-tauri/src/lib.rs`) — K7

- `DesktopVoiceShortcutConfig` → **`DesktopShortcutConfig`**; üç eylemlik enum beş eyleme
  genişledi: `ToggleMute`, `ToggleDeafen`, `PushToTalk`, `HideGameOverlay`, `ToggleAdminConsole`.
- **Eski komut adları korundu** ve yeni komutlara yönlendiriyor:
  `configure_desktop_voice_shortcuts` → `apply_desktop_shortcut_config`,
  `get_desktop_voice_shortcut_status` → aynı registry. Eski web bundle'ı yeni kabukta kırılmıyor;
  eski komutun yanıt şekli (`registered` alanı, yalnız gerçekten kaydolmuş satırlar) donduruldu.
- Yeni komut `get_desktop_shortcut_status` → `{ action, keys, registered, conflict }[]`,
  canlı registry'den.
- **Kayıt hatası çakışma olarak raporlanıyor:** `register` hata döndüğünde o satır
  `conflict: true` ile işaretleniyor, batch iptal edilmiyor, uygulama çökmüyor ve **diğer
  kısayollar kaydolmaya devam ediyor**. İki eylemin aynı kombinasyonu istemesi ikinci satırın
  çakışması sayılıyor.
- **Çakışma saklanmıyor:** registry süreç ömrü boyunca yaşıyor, her açılışta işletim sistemine
  yeniden soruluyor.
- Komut penceresi kontrolü `assert_desktop_control_command_window`: ana pencere OAuth sırasında
  `accounts.google.com`'a gidebiliyor ve o origin'in global kısayol kaydetme hakkı yok.
- `cargo test`: **29/29 yeşil** (`five_shortcut_actions_keep_their_wire_labels`,
  `an_unusable_combination_is_reported_as_that_rows_conflict`,
  `enabling_shortcuts_without_any_assignment_still_fails` dâhil).

### Web — sözleşme katmanı

| Dosya                                      | İş                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `lib/desktop/shortcuts.ts` (+`.test.ts`)   | 5 eylem sözleşmesi, `event.code` tabanlı tuş yakalama, çakışma birleştirme, sunucu istemcisi |
| `lib/desktop/permissions.ts` (+`.test.ts`) | 5 izin okuma, `Kontrol et` / `İzin iste` / `Sistem ayarları` ayrımı, ton token'ları          |
| `lib/desktop/release-channel.ts`           | `Canary` ↔ kolonun `UAT` değeri (sapma #12)                                                  |
| `app/api/v1/users/me/desktop-shortcuts/`   | `GET`/`PATCH` — atamalar sunucuda (sapma #11)                                                |
| `app/api/v1/users/me/release-channel/`     | `PATCH` — `h2`'nin web ucu; mobil uçla **aynı servisi** çağırır                              |
| `lib/settings/bootstrap.ts` + `-types.ts`  | `featuredContributor`, `preferredReleaseChannel`                                             |
| `lib/api-rate-limit.ts`                    | `settings:desktop-shortcuts` bütçesi (60/dk)                                                 |

### Web — yüzey

- **7 blok:** `shortcuts-block`, `permissions-block`, `diagnostics-block`, `about-card-block`,
  `version-grid-block`, `whats-new-block`, `contributors-block`. Kayıt defterinde (`setting-custom-block.tsx`)
  **yalnız kendi 7 anahtarının satırı** değişti.
- **5 sekme dosyası** (`sections/desktop/{app,shortcuts,overlay,permissions,updates}-tab.tsx`) +
  bölüm kökü (`desktop-section.tsx`), köprü eşlemesi (`desktop-settings-bridge.ts`), çalışma
  zamanı türevi (`desktop-tab-defs.ts`), ortak gövde (`desktop-tab-body.tsx`), okuma bağlamı
  (`desktop-settings-context.tsx`).
- **Hakkında** tek sayfa (`sections/about/about-page.tsx`), sekme şeridi yok.

---

## 2. Kabul listesi

| Madde                                                                    | Durum                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Masaüstü bölümü web'de listede yok, Tauri'de var                         | ✅ ağaçtaki `desktopOnly` + `settings-window.tsx:175` filtresi               |
| 5 sekme · 8 grup · 24 satır; Hakkında 4 grup · 6 satır, sekme şeridi yok | ✅ ağaçtan çiziliyor, `deriveDesktopTab` satır sayısını değiştirmiyor (test) |
| Rust: 5 eylem kayıtlı, eski komut adları çalışıyor                       | ✅ `cargo test` 29/29                                                        |
| Kayıt hatası çakışma olarak raporlanıyor, uygulama çökmüyor              | ✅ Rust testi + blok testi                                                   |
| Yeniden atama tuş yakalıyor, `Esc` iptal, çakışma satırı danger          | ✅ `captureDesktopShortcut` + blok testi                                     |
| Çakışma sayısı gerçek kayıttan; sabit `1` yok                            | ✅ `countDesktopShortcutConflicts`; sıfırda pil **düşüyor**                  |
| Atamalar sunucuda, çakışma saklanmıyor                                   | ✅ uç testi: `conflict` gövdesi reddediliyor                                 |
| `SPEC_DEVIATIONS` #11 eklendi                                            | ✅ (+ #12, aşağıda)                                                          |
| 5 izin gerçek kaynaktan; global kısayol `Doğrulanamadı`                  | ✅ blok testi                                                                |
| `Kontrol et` gerçekten yeniden sorguluyor                                | ✅ `readDesktopPermission`, iyimser güncelleme yok                           |
| Tanılama `Bildirim izni` / `Global kısayollar` = İzinler/Kısayollar      | ✅ tek anlık görüntü (`readDesktopRuntimeSnapshot`), test                    |
| Tanılama iskeletle geliyor                                               | ✅ `runtimeQuery.isPending` → hücreler değer uydurmuyor                      |
| 24 satırın hepsi + Hakkında'nın 6 satırı gerçekten çiziliyor             | ✅ `desktop-section.test.tsx` (uçtan uca render)                             |
| Release kanalı build kanalını değiştirmiyor                              | ✅ uç `effectiveFrom: "next-build"`                                          |
| Hakkında bağlantıları gerçek hedeflere gidiyor                           | ✅ `/`, `/privacy`, `/terms`; **Lisanslar** hedefsiz (aşağıda)               |
| Web'de masaüstü sürüm satırları `—`, gizlenmiyor                         | ✅ `buildVersionGridRows` testi                                              |
| Katkıcı rolleri türetilmiş + `TODO(api):`                                | ✅ `resolveContributorRole`                                                  |
| Açık/koyu tema karşılaştırması                                           | ⚠️ **yapılmadı** — aşağıda                                                   |

---

## 3. Kayda geçen sapmalar

- **#11 — `UserSettings.desktopShortcuts Json?` (K3'ün tek istisnası).** Zaten kayıtlıydı,
  gerekçesi `metrics.ts` içinde: kısayol listesi sorgulanabilir bir alan değil, cihaz başına
  okunan beş dizelik bir tercih paketi. Kolonda **yalnız atamalar** durur. **Ş0'a geri
  bildirilmesi gereken madde budur.**
- **#12 — `Canary` çipi kolonun `UAT` değerine yazılır.** Tasarım `Kararlı · Beta · Canary`
  diyor; `ReleaseChannel` enum'u `STABLE · BETA · UAT`. İkisi aynı akış. Etiket birebir korundu,
  saklanan değer kolonun bildiği ad. Enum'a dördüncü değer eklemek şemayı (Ş0'ın dosyası) bu
  şeritten değiştirmek ve hiçbir yayın hattının beslemediği bir kanalı var göstermek olurdu.

---

## 4. `TODO(api):` bırakılanlar

1. **`z7` — Oyun bazlı ayarlar.** Hedef yüzey bu pakette yok → satır `inert` + `TODO(api):`.
   Sayı **gerçek** `desktopGameOverlayGameSettings` verisinden; sabit `4` yazılmadı, sıfırken
   ayrı metin (`Henüz oyun bazlı ayar yok`).
2. **`o5` — Tüm sürüm notları.** Üründe yalnız `admin/releases` var, kullanıcıya açık bir sürüm
   notu rotası yok. Satır çiziliyor, hedefi bağlanmadı.
3. **Hakkında › Lisanslar.** Açık kaynak lisans dökümü bugün yalnız mobilde
   (`apps/mobile/src/legal/`). Uydurma URL yerine satır `aria-disabled` çizildi.
4. **`w1`/`w2`/`w3` — pencere davranışı.** Prompt "hepsi gerçek köprüye yazar" diyor ama
   yazılabilir bir köprü **yok**: autostart yalnız yerel tepsi menüsünden (`set_desktop_autostart_from_native_menu`),
   kapatma davranışı ve küçültülmüş açılış için hiç komut yok. `lib/desktop/start.ts` prompt'un
   varsaydığı şeyi yapmıyor — açılış **hedefini** çözüyor (deep-link), autostart tercihini değil.
   Satırlar çiziliyor ve okunuyor; yazma dalı boş bırakıldı. Rust'a bir tercih deposu eklemek
   K7'nin tarif ettiği değişikliğin (3→5 eylem) dışına çıkardı.
5. **`h4` — Otomatik güncelleme.** `isWhisprDesktopUpdaterEnabled()` derleme zamanı bayrağını
   okuyor; çalışma zamanında değiştirilebilir bir tercih değil.
6. **`h1` — `Güncel` pili.** `desktop_control_check_for_updates` sonucu bu pakette okunmuyor;
   `upToDate` her zaman `true` ve `deriveDesktopTab` pili düşürme yolunu **hazır** tutuyor.
7. **`Sistem ayarları` düğmesi** kabuğun kontrol penceresini açıyor; platformun kendi izin
   panelini (`x-apple.systempreferences:`, `ms-settings:`) açan bir komut yok.
8. **Katkıcı rolleri** `Contributor` tablosunda rol kolonu olmadığı için türetiliyor.

---

## 5. Kod tabanı sürprizleri (prompt'un varsaydığından farklı)

1. **`lib/desktop/start.ts` pencere tercihi tutmuyor** (yukarıda, madde 4).
2. **Masaüstü tercihlerinin çoğu zaten yerel.** Yayıncı modu ve rich presence `lib/store.ts`'de,
   overlay/Voice Mini/global kısayol anahtarı `store/voice-store.ts`'de ve ikisi de kalıcı.
   Bölüm bunlara yazıyor; K3 gereği yeni kolon açılmadı.
3. **`preferredReleaseChannel`'ın web ucu yoktu** — var olan uç `requireMobileApiUserId` ile
   korunuyor ve web oturumu geçemiyor. Yeni uç aynı servisi çağırıyor.
4. **`splitSettingsGroup` `titleData`'yı sözlükten çözmüyor**, olduğu gibi yazıyor (satırların
   `descriptionData`'sı çözülüyor). `Yenilikler · 2.4.1` başlığı bu yüzden çizimden önce
   Hakkında sayfasında çözülüyor.
5. **`SettingNav`'ın `disabled` desteği yok.** Motorun yeni `runtime.disabledRows` alanı
   `input` ve `actions` kontrollerini kapsıyor, `nav`'ı değil; `z7` bu yüzden satırın **dışında**
   `inert` ile kapatıldı (Ş9'un `np3` deseni).
6. **Kabuk ile sözleşme farklı eylem adları konuşuyor** (`hideGameOverlay` ↔ `hideOverlay`);
   eşleme `mergeDesktopShortcutStatus` içinde tek yerde.

---

## 6. Yol üstünde düzeltilen, benim dosyam olmayan iki şey

- `rows/render-settings-tab.test.tsx` — başka bir şerit `SettingsRowRuntime`'a `disabledRows`
  ekledi, kendi testinin iki fikstürünü güncellemedi ve **typecheck kırılıydı**. İki satır
  `disabledRows: {}` eklendi.
- `rows/setting-custom-block.test.tsx` — yer tutucu iddiası defterdeki **her** yuvaya
  bakıyordu; dört şerit bloklarını tek tek devraldıkça her devralma testi kırardı. İddia
  `displayName` üzerinden "sahibi gelmiş / gelmemiş" ayrımına çevrildi (paralel-güvenli).
- `lib/settings/parity.test.ts` — sapma listesi 11 kayıtta sabitti; #12 eklendi.

---

## 7. Kapı

```
pnpm --filter @wizards/web typecheck   ✅ 0 hata
pnpm --filter @wizards/web lint        ✅ 0 hata (10/10 config testi yeşil)
cargo check  --manifest-path apps/desktop/src-tauri/Cargo.toml   ✅
cargo test   --manifest-path apps/desktop/src-tauri/Cargo.toml   ✅ 29/29
```

Yeni testler:

| Dosya                                                                                         | Test |
| --------------------------------------------------------------------------------------------- | ---- |
| `lib/desktop/shortcuts.test.ts` + `permissions.test.ts`                                       | 30   |
| `app/api/v1/users/me/desktop-shortcuts/route-logic.test.ts`                                   | 9    |
| `components/settings/blocks/desktop-blocks.test.tsx`                                          | 24   |
| `sections/desktop/desktop-settings-bridge.test.ts`                                            | 14   |
| `sections/desktop/desktop-section.test.tsx`                                                   | 10   |
| `lib/settings/bootstrap.test.ts` (+2) · `metrics.test.ts` (+1) · `parity.test.ts` (#12 kaydı) | 3    |

Ayarlar + masaüstü alt kümesi (`components/settings/**`, `lib/settings/*`, `lib/desktop/*`):
**746 test · 744 yeşil · 0 kırmızı** (2 `skip`, benim dosyalarım değil).

`pnpm --filter @wizards/web test` tam koşusu arka planda; bu alt küme paketin kapıya bakan
kısmının tamamını kapsıyor.

---

## 8. Yapılmayan

- **Referans kareleriyle açık/koyu tema karşılaştırması yapılmadı.** Bölüm `renderSection`
  yuvasına henüz **hiç kimse tarafından bağlanmadığı** için (Ş5/Ş6'nın `settings-window-route.tsx`
  dosyası bugün hiçbir bölümü bağlamıyor — Hesabım ve Bildirimler şeritleri de aynı borcu
  yazmış) ekran çalışan uygulamada açılamıyor. Bağlama landed olduğunda
  `screens/07-masaustu-izinler.png` ve `screens/08-hakkinda.png` ile karşılaştırma yapılmalı.
  Bölümlerin `renderDesktopSection` / `renderAboutSection` imzaları hazır.

# Faz 4 raporu — 6c: Sunucu "⋯" menüsü + bağlı ayar yüzeyleri

Branch `uat`. Commit yok, her şey uncommitted.

> **İki açık karar kullanıcı tarafından kapatıldı (2026-08-10):** davet adresinin kaynağı
> (**bootstrap özetine `inviteAddress` eklendi**) ve "Sunucu ayarları" satırının izin kapısı
> (**Faz 3'ün `canManageServer || canManageInvites` kapısı korundu**). Ayrıntı §3.1 ve §3.2.

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                      | Satır |
| ---------------------------------------------------------- | ----- |
| `apps/mobile/src/query/mobile-server-user-settings.ts`     | 95    |
| `apps/mobile/src/query/use-mobile-server-user-settings.ts` | 46    |
| `apps/mobile/component-tests/mobile-servers-6c.test.tsx`   | 259   |

`apps/mobile/src/app/screens/workspace-server-menu-sheet.tsx` **yerinde** 6c'ye dönüştü:
169 → **439** satır. İkinci bir menü bileşeni açılmadı.

### Değişen dosyalar

> Δ sütunu `git diff --numstat` (HEAD'e karşı). Faz 1–3 de uncommitted olduğu için, o fazların
> da dokunduğu dosyalarda sayı **kümülatif**tir; "Ne" sütunu yalnız bu fazın işini anlatır.

| Dosya                                                                      | Δ                   | Ne                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/mobile.ts`                                             | 50/−46              | **A0.3-1** `MobileBootstrapServerSummarySchema` + `inviteAddress` / `muted` / `notificationLevel` / `starred` (dördü de `default`'lu) |
| `packages/types/src/mobile.test.ts`                                        | 83/−48              | 6c ön-ayar varsayılanları + `notificationLevel` reddi testi                                                                           |
| `apps/web/src/app/api/v1/mobile/bootstrap/route.ts`                        | 41/−15              | **A0.3-2** `UserServerSettings` tek sorguda; `inviteCode`+`vanityUrlCode` seçimi; `buildServerInviteAddress`                          |
| `apps/web/src/lib/workspace/server-user-settings-service.ts`               | (Faz 1 dosyası)     | `listServerUserSettingsWithDatabase` (tek `IN` sorgusu, boş listede sorgu yok)                                                        |
| `apps/web/src/lib/workspace/server-user-settings-service.test.ts`          | +3 test             | Tek sorgu iddiası, satırsız sunucunun varsayılanda kalması, boş listede sıfır sorgu                                                   |
| `apps/web/src/lib/mobile/bootstrap.test.ts`                                | +14                 | Dört alanın payload'dan geçtiği iddiası                                                                                               |
| `apps/mobile/src/design/palette.ts`                                        | 625 (kümülatif)     | `menuIdentity`, `menuRowCheck`, `quickActionCard` genişletmesi, `sheetHandle.marginBottom/radius`, `sheetPadding` — **açık + koyu**   |
| `apps/mobile/src/design/themes.ts`                                         | 593 (kümülatif)     | Aynı anahtarların `MobileWorkspaceTokens` arayüzü                                                                                     |
| `apps/mobile/src/design/mobile-line-icon-definitions.ts`                   | +25                 | `arrow-up-tray` (6c "Paylaş")                                                                                                         |
| `apps/mobile/src/locale/mobile-copy.ts`                                    | 135 (kümülatif)     | 9 yeni anahtar × 2 dil (toggle hatası, katman geri, 7 etiket anahtarı)                                                                |
| `apps/mobile/src/app/screens/home-screen.styles.ts`                        | 435/−88 (kümülatif) | 6c kabuğu + kimlik + hızlı aksiyon + katman başlığı + satır değeri + YÖNETİCİ çipi stilleri                                           |
| `apps/mobile/src/query/mobile-server-cache.ts`                             | +64                 | `patchMobileServerUserSettingsCaches` (bootstrap + profil)                                                                            |
| `apps/mobile/src/app/screens/workspace-browser.tsx`                        | (Faz 3 dosyası)     | `sortMobileServersByStar`, 6c prop'ları, `Share.share`, `useMobileServerUserSettings`                                                 |
| `apps/mobile/src/app/screens/mobile-workspace-server-switcher-sheet.tsx`   | +7/−2               | 1c listesi `sortMobileServersByStar`                                                                                                  |
| `apps/mobile/src/workspace/mobile-server-settings-screen.tsx`              | 162/−4              | **§E** etiket bölümü (çip listesi + ekleme girişi + limit/hata)                                                                       |
| `apps/mobile/src/workspace/mobile-server-settings-screen.styles.ts`        | +21                 | Etiket kartı stilleri                                                                                                                 |
| `apps/mobile/src/workspace/mobile-server-management-client.ts`             | +24 (kümülatif)     | `UpdateMobileServerInput.tags`                                                                                                        |
| `apps/mobile/component-tests/mobile-server-management.test.tsx`            | +4 test             | Etiket ekleme / kaldırma / doğrulama+limit / yetkisizde gizleme                                                                       |
| `apps/mobile/component-tests/mobile-servers-6a-6b-6f.test.tsx`             | −70                 | "6c minimal server menu" bloğu 6c dosyasına taşındı                                                                                   |
| `apps/mobile/scripts/mobile-server-cache.test.ts`                          | +6 test             | Cache yaması (3) + optimistic/rollback/çift-dokunma (3)                                                                               |
| `apps/mobile/scripts/{mobile-display-model,mobile-realtime-cache}.test.ts` | +4 satır her biri   | Bootstrap fixture'larına dört yeni alan                                                                                               |

---

## 2. Bağlayıcı kararlar (Faz 5'i kısıtlar)

1. **Bootstrap sunucu özeti 6c'nin okuma modelidir.** `starred` / `muted` / `notificationLevel` /
   `inviteAddress` dördü de orada; sheet açılışında **hiçbir istek yok**. Faz 5 profil ekranını
   çizerken bu dört alanı ikinci bir uçtan çekmemeli — profil okuması aynı değerleri zaten
   taşıyor, ikisi `patchMobileServerUserSettingsCaches` ile birlikte güncelleniyor.
2. **Tercih yazımının tek yolu `runMobileServerUserSettingsUpdate`'tir.** Optimistic yazım,
   geri alma, hata toast'ı ve in-flight koruması orada; `useMobileServerUserSettings` yalnız
   React sarmalayıcısıdır. Faz 5 profil ekranında yıldız/sessize alma gösterecekse aynı
   fonksiyonu çağırır, ikinci bir mutasyon yazmaz.
3. **In-flight koruması tercih adı bazındadır** (`Set<"starred"|"muted"|"notificationLevel">`).
   Yıldız kaydedilirken sessize alma serbesttir; aynı tercihin ikinci dokunuşu **düşürülür**,
   kuyruğa alınmaz.
4. **`patchMobileServerUserSettingsCaches` yalnız gönderilen anahtarları yazar.** `muted` ile
   `notificationLevel` birbirine bağlanmadı ve bağlanamaz; testle kilitli.
5. **6c tek panel, iki katmandır.** Bildirim seviyesi seçimi aynı `BottomSheet` içinde
   içerik değişimiyle geliyor — üst üste iki overlay yok. Faz 5 profil "⋯" menüsünü açarken
   aynı bileşeni kullanacaksa bu katman modelini bozmamalı.
6. **Dört testID korundu; ikisi taşındı.** `mobile-server-profile-open-<id>`,
   `mobile-server-members-open-<id>`, `mobile-server-settings-open-<id>` liste kartında;
   **`mobile-server-invite-share-<id>` artık "Davet et" hızlı aksiyon kartında**. Aynı sheet,
   aynı davranış, Maestro adımı değişmedi.
7. **Yeni testID'ler:** `mobile-server-mute-toggle-<id>`, `mobile-server-star-toggle-<id>`,
   `mobile-server-share-<id>`, `mobile-server-profile-view-<id>`,
   `mobile-server-notifications-open-<id>`, `mobile-server-notifications-back`,
   `mobile-server-notification-level-{all,mentions,none}-<id>`, `mobile-workspace-menu-actions`,
   `mobile-workspace-menu-server-name`, `mobile-server-tags-card`, `mobile-server-tag-input`,
   `mobile-server-tag-add`, `mobile-server-tag-remove-<tag>`.
8. **Etiket doğrulaması `ServerTagSchema`'dır, istemcide slugify yoktur.** "Oyun Gecesi" (boşluklu)
   **reddedilir**; kullanıcı tireyi kendisi yazar. Faz 1 §C4 "istemci kendi kuralını yazamaz"
   maddesi boşluk→tire dönüşümünü de kapsıyor kabul edildi.
9. **Rail sırası iki yerde uygulanıyor** (`workspace-browser` memo'su ve 1c sheet'in kendi
   memo'su). Sıralama idempotent; sheet çağıranına güvenmiyor.
10. **`inviteAddress` `null` ise iki yüzey birden gizlenir:** kimlik satırının alt satırı ve
    "Paylaş" kartı. Boş string yazılmıyor, devre dışı kart gösterilmiyor.

---

## 3. Tasarımdan / prompt'tan sapmalar

### 3.1 `inviteAddress` bootstrap'a bindi (kullanıcı kararı, kapandı)

04 §B davet adresini `ServerPublicProfile.inviteAddress`'ten istiyordu, §C ise "sheet açılışında
ek istek yok" diyordu. Profil okuması 5–7 sorgu + 1 Redis; menüyü açmak için tetiklemek A0.3'ün
kendi gerekçesine ters düşüyordu. Kullanıcı kararı: **dördüncü alan olarak bootstrap özetine
eklensin**. Aynı `serverMember.findMany` sorgusunda `inviteCode` + `vanityUrlCode` seçiliyor ve
adres **profilin kullandığı `buildServerInviteAddress`** ile üretiliyor — iki yüzey aynı stringi
basıyor, vanity kodu dâhil. Ek sorgu maliyeti sıfır.

### 3.2 "Sunucu ayarları" kapısı `canManageServer || canManageInvites` kaldı (kullanıcı kararı)

04 §D ve kabul 2 "yalnız `canManageServer`" diyordu; Faz 3 kodu ve
`mobile-phase4-server-management.test.ts` sözleşmesi ise ayarlar ekranının davet yöneticisine de
hizmet ettiğini (davetler satırı onun tek girişi) kaydediyordu. Kullanıcı kararı: **Faz 3 kapısı
korunsun**. `YÖNETİCİ` çipi yine de yalnız `canManageServer` iken çiziliyor — çip ne iddia
ediyorsa o. Üç hesap için ayrı test var (§4 kabul 2).

### 3.3 Diğer sapmalar

| Sapma                                                                             | Gerekçe                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bildirim seviyesi ayrı sheet değil, **aynı panelin ikinci katmanı**               | 04 §D1 ikisine de izin veriyor. Uygulamada tek overlay host var (`OverlaySurface` kayıt defteri); iki açık sheet üst üste bindirmek yeni bir yüzey davranışı demekti. Katman geçişi sürükle-kapatmayı da bozmuyor.                                   |
| Katman başlığı (geri düğmesi + başlık) tasarımda çizili değil                     | Prompt "ikinci bir katman" diyor ama katmandan çıkışı çizmiyor. Geri düğmesi mevcut `headerIconButton` token'ını, başlık `menuRow.labelFontSize/Weight`'i kullanıyor — yeni token açılmadı.                                                          |
| Faz 3'ün `SheetHeader`'ı (ikon + sunucu adı + ✕) kaldırıldı                       | 6c'de sheet başlığı yok; kimlik satırı onun yerine geçiyor (HTML `188–192`).                                                                                                                                                                         |
| "Sessize al" aktifken de aynı `bell` ikonu (çan-üstü-çizgi değil)                 | Handoff "aktifken ikon **ve etiket** primary" diyor, ikon değişimi demiyor. Tasarımda olmayan durum icat edilmedi.                                                                                                                                   |
| `arrow-up-tray` ikonu eklendi                                                     | Kitte açık tepsili yukarı ok yoktu; `arrow-down-tray` kapalı taban çizgisiyle çiziliyor. Yol handoff'tan birebir alındı (Faz 3'ün `dots-horizontal` kararının aynısı).                                                                               |
| `menuRowCheck` yeni token grubu anahtarı                                          | Seçili bildirim seviyesinin işareti; `adminChip.text`'i işaret rengi olarak kullanmak iki anlamı tek anahtara yüklerdi.                                                                                                                              |
| Mobil etiket editörü, sunucu **profilinden** okuyup **`server:update`**'e yazıyor | Etiket alanı workspace detail payload'ında yok; görünürlük kartı da aynı profil okumasını kullanıyor (S3 §C kalıbı). Yazımdan sonra profil cache'i invalidate ediliyor, yoksa çip satırı bayat kalıyor.                                              |
| Etiket kartı yalnız `canManageServer` — üyede **kart hiç yok**                    | 04 §E ve §F3. Salt-okunur çip listesi göstermek de bir "yüzey"; tasarımda yok.                                                                                                                                                                       |
| `use-mobile-server-user-settings.ts` ikiye bölündü                                | Node test koşucusu `react-native`'i içe aktaramıyor (`Unexpected "typeof"`). Saf çalıştırıcı `mobile-server-user-settings.ts` içinde ve testli; hook yalnız `useRef` + `useToast` sarmalayıcısı (Faz 2 §3'ün hook-testsizlik gerekçesiyle aynı hat). |
| 6c bileşen testleri **yeni dosyaya** taşındı                                      | Faz 3'ün `mobile-servers-6a-6b-6f.test.tsx` dosyası artık 6a/6b/6f'e ait; 6c'nin 13 testi `mobile-servers-6c.test.tsx` içinde. Süit sayısı 131 → 132.                                                                                                |

---

## 4. Kapı çıktıları (gerçek çıktı)

```bash
pnpm --filter @wizards/types test
```

```
ℹ tests 213
ℹ pass 213
ℹ fail 0
```

```bash
pnpm --filter @wizards/web test
```

```
ℹ tests 2144
ℹ suites 484
ℹ pass 2144
ℹ fail 0
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=mobile --mode=check
(çıktı yok — temiz, exit 0)
```

```bash
pnpm --filter @wizards/mobile test
```

```
ℹ tests 1729
ℹ suites 302
ℹ pass 1729
ℹ fail 0
```

`apps/mobile` dizininden:

```bash
npx jest
```

```
Test Suites: 132 passed, 132 total
Tests:       1214 passed, 1214 total
```

Kapı listesinde yok ama `packages/types` ve `apps/web` değiştiği için koşuldu:

```bash
pnpm --filter @wizards/web typecheck
```

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
(çıktı yok — temiz)
```

```bash
graphify update .
```

```
[graphify watch] Rebuilt: 23821 nodes, 56142 edges, 1039 communities
Code graph updated.
```

Faz 3 taban çizgisi: types 212, web 2141, mobil node 1723, jest 131/1182→1200.
Şimdi: **213 / 2144 / 1729 / 132 süit / 1214 test**. Hiçbir sayı düşmedi.

### Kabul kriterleri

| #   | Kriter                                                                     | Durum            | Kanıt                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | A0.3 kapandı                                                               | ✅               | Şema dört alanı `default`'lu taşıyor (types testi); backend tek `IN` sorgusu (`listServerUserSettingsWithDatabase` "reads every server's settings in a single query"); boş listede sorgu yok; rail memo'su ve 1c sheet'i `sortMobileServersByStar` çağırıyor |
| 0b  | Dört testID korundu                                                        | ✅               | `mobile-maestro-testid-contract.test.ts` + `mobile-navigation-contract.test.ts` + `mobile-phase4-server-management.test.ts` yeşil; 6c bileşen testi dördünü de basıyor                                                                                       |
| 1   | Kaldırılan üç header aksiyonu menüden erişilebiliyor                       | ✅               | "carries every entry the header buttons used to own": bilgi/üyeler/davet/ayarlar dördü de tek sheet'ten                                                                                                                                                      |
| 2   | Ayarlar satırı ve davet kartı yetki arkasında                              | ✅               | Üç hesap testli: salt-üye (satır yok), davet yöneticisi (satır var, çip yok), yönetici (satır + `YÖNETİCİ`); davet kartı `canManageInvites` olmadan **render edilmiyor**                                                                                     |
| 3   | Toggle'lar yazıyor, optimistic, hata geri alıyor, çift dokunmada tek istek | ✅               | `runMobileServerUserSettingsUpdate` üç testi: istekten önce boyama + sunucunun cevabının yayınlanması, ikinci dokunuşun düşürülmesi, hatada geri alma + `onError`                                                                                            |
| 4   | Yıldızlama sonrası rail sıralaması güncelleniyor                           | ✅               | PATCH başarısı bootstrap cache'ini yamalıyor; `servers` memo'su `sortMobileServersByStar` ile yeniden sıralıyor (model testi Faz 2'de)                                                                                                                       |
| 5   | Bildirim seviyesi 6c'deki değeri güncelliyor; `muted` bağımsız             | ✅               | Katman testi (seçim → menüye dönüş, değer satırda) + "leaves the mute card alone whichever level is selected" + cache yamasının "muted kıpırdamıyor" iddiası                                                                                                 |
| 6   | Ayrılma akışı                                                              | ✅ (kapsam notu) | Satır liste kartının **son satırı**, ayraçsız, danger; sahipte render edilmiyor. Mutasyon/onay Faz 3'ten, yeniden yazılmadı. **Sahibe "devir uyarısı" gösterilmiyor** — 04 §A0.2 bunu kapsam dışı bırakıyor (satır zaten yok)                                |
| 7   | Sürüklenerek kapanma, ≥44px hedefler                                       | ✅ (kısmi kanıt) | Sürükleme `BottomSheet`'in `Gesture.Pan`'i — kendi testinde. Menü satırı 13+13+18 = 44; hızlı aksiyon kartı ≈ 63; 34px geri düğmesi ve "Profili gör" pill'i `hitSlop={8}` ile genişletildi. **Ölçüm cihazda doğrulanacak** (§5-13)                           |

---

## 5. Cihaz test listesi (kullanıcı yapar)

| #   | Hesap / Ekran                         | Adım                                          | Beklenen                                                                                                                                 |
| --- | ------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Yönetici · Sunucular                  | "⋯" dokun                                     | Sheet: tutamaç, kimlik satırı (44px avatar + ad + `whispr.gg/…` + "Profili gör"), **dört** kart, liste kartı                             |
| 2   | Aynı                                  | "Profili gör" dokun                           | Sunucu profili açılıyor; liste kartındaki "Sunucu bilgisi" de aynı yere gidiyor                                                          |
| 3   | Aynı                                  | "Sessize al" dokun                            | Kart anında mor/soft-mor; **toast yok**; sheet'i kapat-aç, durum korunuyor                                                               |
| 4   | Aynı                                  | "Yıldızla" dokun, sheet'i kapat               | Sunucu rayın **en üstüne** çıkıyor; 1c seçici listesinde de en üstte                                                                     |
| 5   | Aynı                                  | Uçağı aç (çevrimdışı), "Yıldızla" dokun       | Kart bir an yanıyor, sonra **eski hâline dönüyor** + kırmızı "Tercih kaydedilemedi" toast'ı                                              |
| 6   | Aynı                                  | "Yıldızla"ya hızlıca iki kez dokun            | Tek istek gidiyor; durum tek adım değişiyor (sunucu logunda tek PATCH)                                                                   |
| 7   | Aynı                                  | "Paylaş" dokun                                | Sistem paylaşım sayfası, içerik `whispr.gg/…`                                                                                            |
| 8   | Aynı                                  | "Bildirim ayarları" dokun                     | Aynı panel içinde üç seçenek; mevcut olanda mor tik; "Bahsetmeler" seç                                                                   |
| 9   | Aynı                                  | Menüye dönüşte satıra bak                     | Değer "Bahsetmeler"; **"Sessize al" kartı kıpırdamamış**                                                                                 |
| 10  | Aynı                                  | Geri düğmesiyle katmandan çık                 | Menüye dönüyor, hiçbir şey yazılmıyor                                                                                                    |
| 11  | Aynı                                  | "Davet et" kartı                              | 2a davet sheet'i açılıyor (eski başlık butonunun yaptığı iş)                                                                             |
| 12  | Aynı                                  | Sheet'i aşağı sürükle                         | Kapanıyor                                                                                                                                |
| 13  | Aynı                                  | Erişilebilirlik › dokunma hedefi              | Kimlik satırındaki "Profili gör" ve katmandaki geri düğmesi rahat basılıyor (hitSlop)                                                    |
| 14  | **Salt üye** (yetkisiz)               | Aynı sunucuda "⋯"                             | "Davet et" kartı **yok**, kalanlar eşit genişlikte; "Sunucu ayarları" satırı **yok**; "Sunucudan ayrıl" var                              |
| 15  | **Davet yetkisi var, yönetici değil** | Aynı                                          | "Davet et" kartı var; "Sunucu ayarları" satırı var ama **`YÖNETİCİ` çipi yok**                                                           |
| 16  | **Sahip**                             | Aynı                                          | "Sunucudan ayrıl" satırı **hiç yok**; kalan satırlar ayraçlı                                                                             |
| 17  | Vanity kodsuz sunucu                  | "⋯"                                           | Adres satırı `whispr.gg/<davet kodu>`; hiç davet kodu yoksa satır ve "Paylaş" kartı gizli, üç kart eşit                                  |
| 18  | Uzun adlı sunucu                      | "⋯"                                           | Kimlik satırındaki ad iki satıra sarıyor, sondan `…`, "Profili gör" yerinden oynamıyor                                                   |
| 19  | Koyu tema                             | 1–18'i tekrarla                               | Kartlar, aktif tint, YÖNETİCİ çipi, tik ve danger satırı koyu varyantta okunur                                                           |
| 20  | Dil (English)                         | "⋯"                                           | "Invite / Mute / Star / Share", "Server info / Members / Notification settings / Server settings / Leave server", "All / Mentions / Off" |
| 21  | Yönetici · Sunucu ayarları            | "ETİKETLER" kartına `turkce-sohbet` yaz, Ekle | Çip görünüyor, "Sunucu ayarları kaydedildi"                                                                                              |
| 22  | Aynı                                  | Çipe dokun                                    | Etiket kalkıyor, kalan liste kaydediliyor                                                                                                |
| 23  | Aynı                                  | `Oyun Gecesi` (boşluklu) yaz, Ekle            | "Etiket yalnızca küçük harf, rakam ve tire içerebilir"; istek gitmiyor. `Oyun-Gecesi` kabul, `oyun-gecesi` olarak kaydediliyor           |
| 24  | Aynı                                  | 5 etikete çık                                 | Giriş alanı ve Ekle **kayboluyor**, alt yazı "En fazla 5 etiket"                                                                         |
| 25  | Salt üye · Sunucu ayarları            | Ekranı aç                                     | "ETİKETLER" bölümü **hiç yok**                                                                                                           |
| 26  | Web paritesi                          | Mobilde yıldızla, web'i yenile                | Sunucu web rayının da en üstünde                                                                                                         |
| 27  | Maestro                               | `phase4-server-management` akışı              | Davet adımı artık menüdeki **kart**tan geçiyor; akış sonuna kadar gidiyor                                                                |

---

## 6. Yetki matrisi

| Öğe                            | Görünürlük koşulu                              |
| ------------------------------ | ---------------------------------------------- |
| Kimlik satırı, "Profili gör"   | Herkes                                         |
| Davet adresi satırı            | `inviteAddress !== null`                       |
| **Davet et** kartı             | `canManageInvites`                             |
| **Sessize al** kartı           | Herkes                                         |
| **Yıldızla** kartı             | Herkes                                         |
| **Paylaş** kartı               | `inviteAddress !== null`                       |
| Sunucu bilgisi satırı          | Herkes                                         |
| Üyeler satırı                  | Herkes                                         |
| Bildirim ayarları satırı       | Herkes                                         |
| Sunucu ayarları satırı         | `canManageServer \|\| canManageInvites` (§3.2) |
| `YÖNETİCİ` çipi                | `canManageServer`                              |
| Sunucudan ayrıl satırı         | Sahip değilse (`canLeaveServer`)               |
| Etiket bölümü (ayarlar ekranı) | `canManageServer`                              |

Hiçbiri `disabled` değil — koşul sağlanmıyorsa öğe **render edilmiyor**.

---

## 7. Optimistic toggle'ların hata yolu nasıl test edildi

Mutasyon bir React hook'una değil, açık bağımlılıklar alan saf bir `async` fonksiyona
(`runMobileServerUserSettingsUpdate`) yazıldı; bu yüzden üç yol da React renderer'ı olmadan
node testinde koşuyor (`apps/mobile/scripts/mobile-server-cache.test.ts`):

1. **Başarı** — sahte istemci PATCH gövdesini kaydediyor. `await`'ten **önce** bootstrap
   cache'inde `starred: true` olduğu iddia ediliyor (optimistic boyama), sonra gövdenin tam
   `{ starred: true }` olduğu ve sunucunun cevabının yayınlandığı.
2. **Çift dokunma** — aynı `inFlight` seti ile iki çağrı ardışık; **tek** gövde kaydediliyor.
   Ardından `starred` çağrısının hâlâ geçtiği iddia ediliyor: koruma tercih adı bazında.
3. **Hata** — istemci `reject` ediyor. Hem bootstrap özeti hem profil girdisi **eski değere**
   dönüyor ve `onError` bir kez çağrılıyor (üretimde bu `showToast({ variant: "error" })`).

Cache yamasının kendisi ayrıca üç testle kilitli: iki cache'e birden yazma, dokunulmayan
sunucunun/tercihin kıpırdamaması, ve değişiklik yoksa **aynı bootstrap nesnesinin** dönmesi
(gereksiz yeniden render yok).

---

## 8. Devredilen borç

1. **Sürükleyerek kapanma ve 44px hedefleri cihazda ölçülmedi.** `BottomSheet`'in pan'i kendi
   testinde; 34px'lik iki kontrol `hitSlop` ile genişletildi ama gerçek dokunma alanı cihaz
   testine bırakıldı (§5-12, §5-13).
2. **Sahibe "önce sahipliği devret" uyarısı yok.** 04 §A0.2 gereği satır sahipte hiç render
   edilmiyor; PROMPT.md §6c'nin uyarı cümlesi karşılıksız kaldı. Ürün kararı istenirse ayrı iş.
3. **`mutedUntil` yazılmıyor.** Şema ve uç destekliyor (`UpdateServerUserSettingsSchema`), 6c'nin
   "Sessize al"ı süresiz. Süreli sessize alma tasarımda yok.
4. **Bildirim seviyesi kanal bazlı override taşımıyor** (04 §G gereği kapsam dışı).
5. **Etiket girişinde slugify yok:** boşluklu metin reddediliyor (§2.8). Ürün "boşluğu tireye
   çevir" isterse kural `ServerTagSchema`'ya, istemciye değil, eklenmeli.
6. **Faz 3'ün 5 numaralı borcu duruyor:** arama açıkken filtre şeridi gizli (04 §A0.4).
7. **Faz 5 uyarısı:** `mobile-servers-6c.test.tsx` `BottomSheet`'i mock'luyor; profil "⋯"
   menüsü aynı bileşeni kullanacaksa aynı mock kalıbı gerekir.
8. **Çözüldü (2026-08-18):** Bu paketle ilgisiz `.railway-config-pull-29632/` çalışma ağacından kaldırıldı.

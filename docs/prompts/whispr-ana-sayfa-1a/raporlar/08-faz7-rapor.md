# Faz 7 raporu — i18n, erişilebilirlik ve küçük ekran kırılımları

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

Paketin dört ekranı artık **sözlükten** konuşuyor, klavye/ekran okuyucu yolu tek tek kapatıldı ve
1360'ın altındaki kompozisyon yazılı hâle geldi. Ön koşul kontrolü: Faz 6 raporunun takvim gün
hücresi kararı **"sağda yan panel"**di, soruldu ve uygulandı; ölü link **kalmadı** (yedi hedefin
yedisi de e2e'de tıklanarak doğrulandı). Faz 6'nın açık maddelerinden bu faza düşen tek şey §6.8
(i18n) idi ve kapandı.

Üç karar kod yazılmadan soruldu; cevapları §8'de. Biri paketin dışına taştı (`--text-muted`
global token), o yüzden bu faz beklenenden geniş.

---

## 1. Yapıldı

### A. i18n sözlüğü (08 §1)

- **126 anahtar** `tr.ts` ve `en.ts`'e eklendi (`home.*`, `mentions.*`, `events.*`, `inbox.*`,
  `screens.*`) + iki `common.*` sayaç etiketi. Düzen mevcut sözlükle aynı: düz nesne,
  `"alan.bölüm.parça"`, blok içinde alfabetik.
- **TR değerleri SPEC'in birebir aynısı.** §1.1'in 52 satırlık tablosu ve §1.2'nin 6 satırlık nav
  tablosu `messages.test.ts` içinde **tek tek** yazılı ve karakter karakter karşılaştırılıyor;
  bir metni "iyileştiren" her değişiklik orada kırmızı veriyor. `İyi akşamlar, {name}` virgülüyle
  duruyor.
- **Çoğul mekanizması sözlüğe girdi** (kullanıcı kararı §8): `resolveMessageTemplate` `count === 1`
  iken `"<anahtar>_one"`, aksi hâlde `"<anahtar>_other"` arar, bulamazsa taban anahtara düşer.
  Taban anahtar **çoğul** biçimdir, yani mevcut 40+ sayaç anahtarının hiçbiri değişmedi.
  Yedi anahtarın `_one` biçimi yazıldı (`{count} reply`, `{count} mention`, `{count} room open`,
  `{count} person attending`, `{count} event`, `{count} person connected`,
  `{name} and {count} other are here`). TR tarafında `_one` taban metinle aynıdır — CLDR Türkçe'de
  iki çoğul kategorisi tanımlar ama biçimler çakışır; anahtar kümeleri de böylece eşit kalıyor.
- `{room}'da` eki **basit kesme işaretiyle** yazıldı; sesli uyum kuralı yok (§1.4).
- **Saf katman anahtar döndürüyor.** `deriveFriendStatusText`, `deriveRoomCaption`,
  `getEventDayLabel`, `formatRelativeTime` ve Faz 6'nın gün başlıkları artık dize değil `HomeCopy`
  (`{ key, values }`) döner; çeviri React katmanında (`resolveHomeCopy`). Kullanıcının kendi
  yazdığı metin (`customStatus`, kanal konusu) `key: null` ile geçer ve **çevrilmez**.
- Komut paletinin arama filtresi kullanıcının **gördüğü** etikette çalışıyor:
  `selectCommandActions` bir `translate` parametresi alıyor ve saf kalıyor.

### B. Sözlük denetimi (08 §1.5)

- **Mevcut bir denetim testi yoktu** (arandı: `Object.keys(TR_MESSAGES)` karşılaştıran tek satır
  bile yok), o yüzden `apps/web/src/lib/locale/messages.test.ts` yazıldı: iki yönlü anahtar
  kümesi eşitliği, boş değer yok, çoğul biçimlerin tabanı iki dilde de var, `_one`/`_other`
  taşıyan her anahtar `{count}` içeriyor.
- **İkinci tarama:** `lib/home/copy-audit.ts` — Faz 0'ın `token-audit.ts`'inin kardeşi. Yorumları
  uzunluk koruyarak maskeleyip kalan `/[çğıöşüÇĞİÖŞÜ]/` karakterlerini satır/sütunla bildiriyor.
  Kapsam paketin dokuz yüzeyi (`components/screens` dâhil); **sonuç sıfır**.

### C. Erişilebilirlik (08 §2 — `00-ortak-baglam` §5.3'ün tek tek kapatılması)

| §5.3 maddesi                             | Durum                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Tıklanabilir her satır `button`/`a`      | Faz 4–6'da sağlanmıştı; değişmedi                                                                      |
| İkon-only butonlarda `aria-label`        | Arama alanına da eklendi (`home.search.placeholder`)                                                   |
| Presence noktasının metin karşılığı      | `PresenceDot` `sr-only` metni sözlükten okuyor                                                         |
| Sayaçlar okunabilir etiket taşır         | `common.unreadMessages` / `common.unreadMentions`                                                      |
| `Esc` kapatır, focus tetikleyiciye döner | Dört overlay'de de; §3'te tur yazılı                                                                   |
| Focus tuzağı / `inert`                   | Palet Tab'ı sahipleniyor, menü Tab'ı döndürüyor, drawer açıkken arka plan `inert`                      |
| Focus stili token'dan                    | Mevcut `focus-visible:ring-[hsl(var(--ring)/0.55)]`; `outline:none` tek başına yok                     |
| `aria-live` yalnız uygun yerde           | Üç yerde: kart uyarısı, sonsuz liste sınırı, okunmamış rozeti. Dakikada değişen odak pill'inde **yok** |

- **Anlamsal yapı.** `AppNavPanel` zaten `nav aria-label` + `ul`/`li` idi. Bu fazda: ana alan
  `section` → **`main`** (uygulamada tek `main`), `HomeCard` `aria-label` yerine
  `aria-labelledby` + gerçek **`h2`** (etiket görsel olarak 10.5px bölüm yazısı, `role="heading"`
  verilmiş `div` değil), etkinlik gün grupları `aria-labelledby` + `h2`.
- **Klavye turu** elle koşuldu (§3.2) ve e2e'ye bağlandı: pozitif `tabindex` yok, DOM sırası
  ray → panel → üst çubuk → kartlar → ayak.
- **`ContextMenu`ye focus yönetimi eklendi**: açılışta ilk `menuitem` odaklanıyor, `Tab` menünün
  içinde dönüyor, kapanışta focus tetikleyiciye dönüyor. Portalda çizilen bir menü focus
  taşınmazsa klavyeyle hiç görülemiyordu.
- **Mobil drawer**: `Esc` zaten kapatıyordu; kapanışta focus tetikleyiciye dönüyor ve açıkken
  arka planın iki sütunu `inert`.
- **Hareket tek yerden.** `globals.css`in mevcut `home-pulse-dot` bloğuna nabız + hover yükselmesi
  (`.home-hover-lift`) + dalga formu geçişleri eklendi. Bileşen başına ikinci bir
  `prefers-reduced-motion` sorgusu yazılmadı.

### D. Küçük ekran kırılımları (08 §3)

- `RESPONSIVE_BREAKPOINTS`e iki eşik eklendi: `commandCenter: 960`, `commandCenterWide: 1360`.
  Kabuğun `mobileMax`/`tablet` eşikleriyle çelişmiyorlar — onlar kabuğun hangi sütunu göstereceğini,
  bunlar ızgaranın kaç kolon olacağını söylüyor.
- `lib/home/layout.ts` üç kırılımın yerleşim tablosunu **açıkça** taşıyor ve CSS'e çeviriyor.
  `grid-auto-flow` hiç kullanılmıyor; her kartın `grid-area`sı üç kırılımda ayrı ayrı yazılı ve
  testte doğrulanıyor (taşma yok, hücre paylaşımı yok, boş hücre yok).
- **Kırılım CSS'te seçiliyor, JavaScript'te değil.** İlk yazım `useResponsiveLayout()` ile
  ölçüyordu; ölçüldü ve geri alındı, gerekçe §3.1'de.
- `< 960`: tek kolon, sıra Kaldığın yer → Şu an canlı → Yanıt bekliyor → Durumun → Sıradaki →
  Arkadaşlar. Nav paneli mevcut `MobileDrawerTrigger` + mevcut drawer'a taşınıyor (yeni drawer
  yazılmadı), arka plan kaydırması `useBodyScrollLock` ile kilitli.
- `960–1359`: iki kolon — Kaldığın yer · Şu an canlı üstte; Yanıt bekliyor solda iki satır boyunca,
  sağında Durumun ve Sıradaki; Arkadaşlar tam genişlik. Dikey kaydırma serbest.
- `≥ 1360`: dört kolon, iki eksende de kaydırma yok (değişmedi).
- Arkadaşlar şeridi `overflow-x: auto` + `snap-x` oldu; **kart sayısı kırpılmıyor**, taşan kısım
  kaydırılıyor. Geniş ekranda `flex-1` kartları eşit bölüyor ve kaydırma hiç doğmuyor.
- Ölçek motoru 960'ın altında zaten ×1'de (`fit = min(w/1360, h/920) < 1`); testle sabitlendi.

---

## 2. Dokunulan dosyalar

| Dosya                                                                                  | Yeni / Değişti      | Neden                                                    |
| -------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------- |
| `apps/web/src/lib/locale/core.ts`                                                      | Değişti (+40)       | `resolveMessageTemplate` — çoğul biçim seçimi            |
| `apps/web/src/lib/locale/core.test.ts`                                                 | Yeni (10 test)      | Çoğul seçimi, geriye uyum, bilinmeyen anahtar            |
| `apps/web/src/components/providers/locale-provider.tsx`                                | Değişti (2 satır)   | `t()` çoğul çözücüden geçiyor                            |
| `apps/web/src/lib/locale/messages/tr.ts`                                               | Değişti (+135)      | §1.1/§1.2/§1.3 metinleri                                 |
| `apps/web/src/lib/locale/messages/en.ts`                                               | Değişti (+133)      | Doğal çeviri + yedi `_one` biçimi                        |
| `apps/web/src/lib/locale/messages.test.ts`                                             | Yeni (9 test)       | Anahtar kümesi eşitliği + SPEC tabloları                 |
| `apps/web/src/lib/home/copy-audit.ts`                                                  | Yeni (185)          | Sabit Türkçe tarayıcısı (yorum maskeli)                  |
| `apps/web/src/lib/home/copy-audit.test.ts`                                             | Yeni (12 test)      | Tarayıcının kendisi + paket yüzeyleri                    |
| `apps/web/src/lib/home/presentation.ts`                                                | Değişti             | `HomeCopy` + `resolveHomeCopy` + `stripGreetingName`     |
| `apps/web/src/lib/home/presentation.test.ts`                                           | Değişti (+5 test)   | Gerçek `tr.ts` ile çeviri; anahtar varlığı               |
| `apps/web/src/lib/home/side-screens.ts`                                                | Değişti             | Gün başlığı `HomeCopy` döndürüyor                        |
| `apps/web/src/lib/home/side-screens.test.ts`                                           | Değişti             | Başlık anahtarı doğrulanıyor                             |
| `apps/web/src/lib/home/command-palette.ts`                                             | Değişti             | `labelKey`/`sublabelKey` + `translate` parametresi       |
| `apps/web/src/lib/home/command-palette.test.ts`                                        | Değişti (+1 test)   | Etiketlerin sözlükte olduğu                              |
| `apps/web/src/lib/home/layout.ts`                                                      | Yeni (170)          | Kırılım tablosu + CSS üreteci                            |
| `apps/web/src/lib/home/layout.test.ts`                                                 | Yeni (20 test)      | Eşikler, yerleşim bütünlüğü, CSS, ölçek ×1               |
| `apps/web/src/lib/responsive.ts`                                                       | Değişti (+2)        | `commandCenter` / `commandCenterWide`                    |
| `apps/web/src/app/globals.css`                                                         | Değişti             | `--text-muted` açık tema 52% → 46%; reduced-motion bloğu |
| `apps/web/src/components/home/home-card.tsx`                                           | Değişti             | `aria-labelledby` + `h2`, `cardId`, hata anahtarı        |
| `apps/web/src/components/home/home-primitives.tsx`                                     | Değişti             | `HomeSectionLabel as`, presence `sr-only` sözlükten      |
| `apps/web/src/components/home/home-command-center.tsx`                                 | Değişti             | Kırılım CSS'i, JS ölçümü kaldırıldı                      |
| `apps/web/src/components/home/home-top-bar.tsx`                                        | Değişti             | Selamlama + alt satır sözlükten                          |
| `apps/web/src/components/home/home-{continue,live,awaiting,presence,up-next}-card.tsx` | Değişti             | `t()` + `cardId`                                         |
| `apps/web/src/components/home/home-friends-strip.tsx`                                  | Değişti             | `t()` + yatay kaydırma + `home-hover-lift`               |
| `apps/web/src/components/home/home-list-row.tsx`                                       | Değişti             | `t()` + `:focus-visible` hover zemini                    |
| `apps/web/src/components/home/home-test-render.tsx`                                    | Yeni (23)           | Testlerin ortak `LocaleProvider` kabuğu                  |
| `apps/web/src/components/home/home-a11y.test.tsx`                                      | Yeni (8 test)       | §2.1–§2.3 işaretleme sözleşmesi                          |
| `apps/web/src/components/home/home-cards.test.tsx`                                     | Değişti             | Türkçe sözlükle render                                   |
| `apps/web/src/components/home/home-interactions.test.tsx`                              | Değişti             | aynı                                                     |
| `apps/web/src/components/screens/*.tsx` (7 dosya)                                      | Değişti             | `t()` + çip/segment etiketleri anahtardan                |
| `apps/web/src/components/screens/side-screens.test.tsx`                                | Değişti             | Türkçe sözlükle render                                   |
| `apps/web/src/components/command/command-palette.tsx`                                  | Değişti             | `t()` + presence listesi karttan                         |
| `apps/web/src/components/ui/context-menu.tsx`                                          | Değişti (+55)       | Açılışta focus, Tab turu, kapanışta dönüş                |
| `apps/web/src/components/shell/wizards-shell.tsx`                                      | Değişti             | 960 altı nav drawer, `inert`, focus dönüşü               |
| `apps/web/src/components/shell/main-channel-panel.tsx`                                 | Değişti             | `section` → `main`, `leadingAlwaysVisible`               |
| `apps/web/src/components/shell/server-rail.tsx`                                        | Değişti (1 sınıf)   | `md:hidden` tetikleyiciden sarmalayıcıya                 |
| `apps/web/src/components/voice/room/voice-room-primitives.tsx`                         | Değişti (1 sınıf)   | Dalga formuna CSS tutamağı                               |
| `apps/web/e2e/fixtures/test.ts`                                                        | Değişti (+12)       | Yerel Türkçe'ye sabitlendi (§3.1)                        |
| `apps/web/e2e/specs/a11y/a11y.spec.ts`                                                 | Değişti (+3 tarama) | Açık tema + 1100 + 720                                   |
| `apps/web/e2e/specs/design/home-responsive.spec.ts`                                    | Yeni (13 test)      | Kırılımlar, drawer, Esc turu, sekme sırası               |
| `docs/prompts/whispr-ana-sayfa-1a/raporlar/kanit/faz7-anasayfa-*.png`                  | Yeni (5)            | 1440 / 1280 / 1100 / 900 / 720                           |
| `graphify-out/**`                                                                      | Değişti             | `graphify update .`                                      |

---

## 3. Kapı çıktıları

| Komut                                                              | Sonuç                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `pnpm --filter @wizards/web test`                                  | ✅ exit 0 — **3269 test / 734 suite, 0 fail** (Faz 6: 3205/716)    |
| `pnpm typecheck`                                                   | ✅ exit 0 — 5/5 paket                                              |
| `pnpm lint`                                                        | ✅ exit 0 — 5/5 paket, 0 hata 0 uyarı                              |
| `pnpm --filter @wizards/web e2e:a11y`                              | ✅ **13 passed / 0 failed** (10 mevcut + 3 yeni)                   |
| `pnpm --filter @wizards/web exec playwright test e2e/specs/design` | ✅ **30 passed / 13 skipped / 0 failed** (19 mevcut + 11 yeni)     |
| `node scripts/quality/count-arbitrary-px.mjs`                      | ✅ `1190 değer / 120 dosya` (Faz 6 ile aynı; bu faz **artırmadı**) |
| `graphify update .`                                                | ✅ 27790 düğüm, 65729 kenar, 1251 topluluk                         |

Yeni testler: layout 20 + copy-audit 12 + messages 9 + locale core 10 + home-a11y 8 +
presentation 5 + command-palette 1 = **65**. (3205 + 65 = 3270; biri mevcut bir testle birleşti
→ 3269 ✓.) E2E tarafında +11 tasarım testi, +3 a11y taraması.

### 3.1 Kapının nasıl koşulduğu — dürüst not

Düzen Faz 4–6 ile aynı: dev sunucusu durduruldu → e2e ortamıyla `pnpm build` → **3100**'de
`node dist/server.js` → `PLAYWRIGHT_SKIP_WEB_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3100` ile
playwright → sunucu kapatıldı → e2e bayrakları olmadan yeniden derlendi → `next-env.d.ts`
`git checkout` ile geri alındı → `pnpm dev` geri başlatıldı.

`apps/web/.env` **değiştirilmedi**. `E2E_TEST_PASSWORD` yerel rastgele bir değerdi, scratchpad'de
tutuldu ve koşu bitince silindi. `.env` bash `source` ile okunamıyor (`TOTP_SECRET_ENCRYPTION_KEYS`
bir JSON değeri ve tırnakları kayboluyor) — değerler tek tırnak kaçışıyla üretilen bir dosyadan
export edildi.

**Üç şey koşu sırasında yalan söyledi, üçü de bulundu:**

1. **Yetim sunucu.** 3100'de kalan bir süreç, yeni derlemenin `.next`'iyle uyuşmayan bir manifest
   servis ediyordu: bütün chunk'lar `500` dönüyor, uygulama "Something went wrong" ile açılıyor ve
   **her test** kırmızıya dönüyordu. Koşu betiğine iki kapı eklendi — başlamadan önce porttaki her
   süreç öldürülüyor, ve testlerden önce HTML'in istediği ilk chunk'ın `200` döndüğü doğrulanıyor.
2. **Yerel.** Metinler artık gerçekten çeviriliyor; Playwright'ın tarayıcısı `en-US` konuşuyor ve
   Türkçe metin arayan mevcut tasarım testleri (palet komutları, çip adları) kırıldı. Yerel
   `e2e/fixtures/test.ts`'te **tek yerden** Türkçe'ye sabitlendi: spec'ler SPEC metnini doğruluyor,
   ve SPEC metni Türkçe.
3. **`/design/whispr-chat` üretimde 404.** Sayfanın kendi kapısı (`NEXT_PUBLIC_WHISPR_CHAT_PREVIEW`)
   üretim derlemesinde kapalı; e2e derlemesinde açıldı. Ürün kodu değişmedi.

### 3.2 Klavye turu — elle koşuldu

1440×960, Ana Sayfa, `Tab` ile baştan sona:

| #   | Durak                                                                                                                                                                                                                                        | Not                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Sunucu rayı — logo / sunucu ikonları / `+`                                                                                                                                                                                                   | Halka `ring-ring`'ten, görünür       |
| 2   | Nav paneli — Ana Sayfa · Mesajlar · Bahsedilmeler · Etkinlikler · Keşfet                                                                                                                                                                     | `aria-current="page"` Ana Sayfa'da   |
| 3   | `Sunucularım` başlığının `+` butonu, sonra sunucu satırları                                                                                                                                                                                  |                                      |
| 4   | Kullanıcı ayağı (avatar/mikrofon/kulaklık/ayarlar)                                                                                                                                                                                           |                                      |
| 5   | Üst çubuk — arama alanı, sonra bildirim zili                                                                                                                                                                                                 | Arama alanı `aria-haspopup="dialog"` |
| 6   | Kartlar soldan sağa, yukarıdan aşağıya: Kaldığın yer satırları + `Tümünü gör` → Şu an canlı `Katıl` → Yanıt bekliyor satırları + `Gelen kutusu` → Durumun dört çipi + toggle → Sıradaki `Hatırlat` + `Takvim` → Arkadaşlar kartları + `Tümü` | Ara durak yok, atlanan öğe yok       |

Pozitif `tabindex` sayısı **0** (e2e'de sabitlendi), yani sekme sırası DOM sırasıdır ve DOM sırası
tasarımın sırasıdır. Takvim ızgarası tek sekme durağıdır (`tabIndex` yalnız odaklı hücrede 0),
içinde ok tuşlarıyla gezilir — Faz 6'da yazıldı, bu turda bozulmadığı doğrulandı.

### 3.3 `Esc` turu — dört overlay

| Overlay                     | `Esc` kapatıyor                   | Focus dönüyor            | Arka plan                               |
| --------------------------- | --------------------------------- | ------------------------ | --------------------------------------- |
| Komut paleti (`⌘K`)         | ✅                                | ✅ `home-command-search` | Tab paletin içinde döner                |
| Paletin presence alt menüsü | ✅ (**önce o**, palet açık kalır) | ✅ palete                | —                                       |
| Arkadaş kartı bağlam menüsü | ✅                                | ✅ `home-friend-card`    | Tab menünün içinde döner                |
| Mobil/dar nav drawer'ı      | ✅                                | ✅ tetikleyiciye         | İki sütun `inert` + `useBodyScrollLock` |

Beşincisi bildirim popover'ı: `Esc` kapatıyor, focus hiç taşınmadığı için zil butonunda kalıyor.
Dördü de e2e'de koşuldu; arkadaş menüsü maddesi tohum veride çevrimiçi arkadaş olmadığı için
`test.skip`e düşüyor ve **elle** doğrulandı (§7.5).

---

## 4. Ölçülen sayılar

| Ölçüm                                           | Değer                      | Bütçe      | Durum |
| ----------------------------------------------- | -------------------------- | ---------- | ----- |
| Pakete eklenen sözlük anahtarı                  | **126** (+2 `common.*`)    | —          | —     |
| `tr.ts` ↔ `en.ts` anahtar farkı                 | **0** (iki yönde)          | 0          | ✅    |
| Paketin dosyalarında kalan sabit Türkçe         | **0**                      | 0          | ✅    |
| Yazılan `_one` biçimi                           | **7** (iki dilde de)       | —          | —     |
| Çoğul mekanizması yüzünden değişen mevcut metin | **0**                      | 0          | ✅    |
| Ana Sayfa'da `h1` sayısı                        | **1**                      | 1          | ✅    |
| `role="heading"` verilmiş `div`                 | **0**                      | 0          | ✅    |
| Uygulamada `main` yer imi                       | **1**                      | 1          | ✅    |
| Pozitif `tabindex`                              | **0**                      | 0          | ✅    |
| Ciddi/kritik WCAG AA ihlali (koyu tema)         | **0**                      | 0          | ✅    |
| Ciddi/kritik WCAG AA ihlali (**açık tema**)     | **0** (düzeltmeden önce 1) | 0          | ✅    |
| Ciddi/kritik WCAG AA ihlali (1100 / 720)        | **0**                      | 0          | ✅    |
| Izgara kolonu — 1440 / 1280 / 1100 / 900 / 720  | **4 / 2 / 2 / 1 / 1**      | §3 tablosu | ✅    |
| Kırılımı seçen JavaScript satırı                | **0** (medya sorgusu)      | —          | —     |
| `grid-auto-flow` kullanımı                      | **0**                      | 0          | ✅    |
| Dar ekranda kırpılan arkadaş kartı              | **0** (yatay kaydırma)     | 0          | ✅    |
| 960 altında ölçek adımı                         | **×1**                     | ×1         | ✅    |
| Yatay kaydırma (dört genişlikte)                | **0**                      | 0          | ✅    |
| Yeni token / hex                                | **0**                      | 0          | ✅    |
| Yeni yüzeylerde arbitrary px                    | **0**                      | 0          | ✅    |

Kalan arbitrary px: **1190 değer / 120 dosya** (Faz 0 tabanı: 1208 / 120). Bu faz sayıyı
artırmadı.

### 4.1 Kontrast tablosu (08 §2.6)

WCAG AA eşiği normal metinde **4,5:1**. Ölçüm `globals.css`in `:root` (açık) ve `html.theme-dark`
bloklarındaki token değerlerinden yapıldı.

**Amber `Takvim` butonu — `bg-amber-400` (#fbbf24) üzerine `text-slate-900` (#0f172a):**

| Oran        | Eşik               | Durum                                                                                  |
| ----------- | ------------------ | -------------------------------------------------------------------------------------- |
| **10,69:1** | 4,5 (AA) · 7 (AAA) | ✅ **AA ve AAA'yı geçiyor** — tasarım istisnası sorun değil, sorulmasına gerek kalmadı |

**Muted ve ikincil metinlerin kart/panel zeminine karşı oranı:**

| Tema | Metin                          | `--surface-card` | `--surface-panel` | `--surface-tertiary` |
| ---- | ------------------------------ | ---------------- | ----------------- | -------------------- |
| Açık | `--text-muted` **önce (52%)**  | **3,97** ❌      | **3,60** ❌       | **3,18** ❌          |
| Açık | `--text-muted` **sonra (46%)** | **4,91** ✅      | **4,45** ⚠️       | **3,93** ❌          |
| Açık | `--text-secondary`             | 6,75 ✅          | 6,12 ✅           | 5,41 ✅              |
| Açık | `--text-primary`               | 16,29 ✅         | 14,77 ✅          | 13,05 ✅             |
| Koyu | `--text-muted`                 | 5,23 ✅          | 5,62 ✅           | 4,51 ✅              |
| Koyu | `--text-secondary`             | 6,18 ✅          | 6,65 ✅           | 5,33 ✅              |
| Koyu | `--text-primary`               | 10,92 ✅         | 11,75 ✅          | 9,41 ✅              |

Aktif çip (Faz 6'nın düzeltmesi, doğrulandı): `--foreground` üzerine `--primary/0.14` →
açık **13,62**, koyu **9,65**. ✅

İki not, ikisi de dürüstlük için:

- **`--surface-panel` 4,45** eşiğin iki yüzde altında. Panelde muted metin yalnız
  `SUNUCULARIM` bölüm etiketi ve sunucu satırının ikincil rengi; 46%'nın altına inmek muted ile
  secondary arasındaki üç kademeli hiyerarşiyi ikiye düşürüyordu (kullanıcı kararı §8).
- **`--surface-tertiary` 3,93** — bu pakette tertiary zemin üzerine muted metin **kullanılmıyor**
  (tertiary yalnız `DM` çipinin ve kısayol çipinin zemini, ikisi de kendi renklerini taşıyor).

---

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1. **Bu faz yeni uç yazmadı, mevcut bir ucun sorgu yüzeyini
genişletmedi ve sunucu tarafında tek satır değiştirmedi.** Liste yine de tek tek işletildi:

- [x] 1. **Kimlik.** Yeni uç yok; `route-contract.test.ts` guard'ı bütün mevcut uçlarda yeşil.
- [x] 2. **Yetki.** Değişen tek şey metnin nereden geldiği. Hiçbir sorgunun filtresi, kapsamı ya
      da `where`i bu fazda değişmedi.
- [x] 3. **Görünürlük redaksiyonu.** Presence yolu açılmadı. Presence noktasının `sr-only` metni
      **redakte edilmiş** DTO'dan geliyor: görünmez kullanıcı `OFFLINE` olarak geliyor ve ekran
      okuyucu da "Çevrimdışı" duyuyor — yeni bir sızıntı yüzeyi değil, aynı verinin sesli hâli.
- [x] 4. **Rate limit.** Yeni anahtar yok.
- [x] 5. **Zod.** Yeni girdi yok. `resolveMessageTemplate` sözlükten okuyor; anahtar kullanıcı
      girdisi değil, kaynak sabiti.
- [x] 6. **Dar DTO.** DTO değişmedi.
- [x] 7. **Metadata / `actionUrl`.** Bu faz `Notification.metadata`'yı ekrana taşımıyor; palet
      sonuçları hâlâ `toRelativeAppHref` kapısından geçiyor (`buildPaletteSections` değişmedi).
- [x] 8. **Komut yetki kontrolü.** Palete komut eklenmedi; `requires` kapıları olduğu gibi duruyor.
      Etiketler artık çeviriliyor ama **filtre** hâlâ aynı yetki kurallarından sonra çalışıyor.

Ek not — `<style dangerouslySetInnerHTML>`: içerik **modül seviyesinde**, sabitlerden üretilen bir
CSS dizesi; kullanıcı girdisi hiç dokunmuyor ve CSP `style-src 'self' 'unsafe-inline'` zaten
satır içi stile izin veriyor (`proxy.ts:166`).

---

## 6. Açık kalan / devreden

1. **`--text-muted` açık temada `--surface-tertiary` üzerinde 3,93** — bu pakette o birleşim
   kullanılmıyor, ama uygulamanın başka ekranlarında olabilir. → **Faz 8 / ayrı denetim**.
2. **Global token değişti, görsel baseline'lar bayatladı.** `--text-muted` açık temada 52% → 46%;
   uygulamanın **bütün** açık-tema ekranlarını etkiliyor. `e2e:visual` bu fazda koşulmadı. →
   **Faz 8**.
3. **Uygulamanın geri kalanı hâlâ tek biçimli çoğul kullanıyor** (40+ anahtar `{count} members`
   gibi). Mekanizma artık var; göç ayrı iş. → **ayrı iş**.
4. **`nav.*` yerine `shell.appNav.*`** — 08 §1.2'nin anahtar adlarından sapıldı, değerler birebir
   aynı (kullanıcı kararı §8). Raporda sapma olarak yazılı.
5. **§1.1 tablosu 52 satır**, prompt "47 satır" diyordu. Tablonun tamamı uygulandı; fark tabloyu
   okumaktan geliyor, atlanan satır yok.
6. **Arkadaş bağlam menüsü e2e'de `skip`** — tohum veride çevrimiçi arkadaş yok. Elle doğrulandı
   (§7.5). → **fikstür genişletmesi**, Faz 8.
7. **44px tıklama hedefi ↔ tasarım çelişkisi** duruyor (Faz 4 §6.2). Bu faz hedef büyütmedi. →
   **Faz 8 kararı**.
8. **`e2e/setup/global-setup.ts` migration koşmuyor** (Faz 6'dan devir). → **CI / araç borcu**.
9. **Parity matrisinin tema ekseni hâlâ kapalı** (11 kombinasyon `test.skip`). → **Faz 8**.
10. Faz 1–6'dan devreden ve bu fazda kapanmayan: linux görsel baseline'ları bayat,
    `Message.replyToId` indeks borcu, `events/upcoming.totalCount` sınırsız `count`,
    `kind: 'game'` ürüne çıkmıyor, takvim gün panelinde `Hatırlat` yok, `awaiting.newCount`
    24 saatlik yaklaşım, odak süresinin sabit 25 dk oluşu.

---

## 7. Kullanıcı doğrulaması gereken maddeler

1. `pnpm --filter @wizards/web test` → **3269 test / 0 fail** (Faz 6: 3205).
2. `pnpm typecheck`, `pnpm lint` → 5/5 paket yeşil, uyarı yok.
3. **Dil anahtarı (elle).** Ayarlar → Görünüm → dil `English` yap: Ana Sayfa'nın **tamamı**
   İngilizce olmalı (selamlama, kart başlıkları, çipler, palet, boş durumlar). Türkçe'ye geri
   dön: metinler SPEC'teki hâline dönmeli — `İyi akşamlar, <adın>`, `Kaldığın yer`,
   `Yanıt bekliyor`, `Bekleyen isteğin yok`.
4. **Kırılımlar (elle).** Tarayıcı penceresini daralt: 1360'ın altında ızgara iki kolona,
   960'ın altında tek kolona inmeli; 960'ın altında sol nav paneli kaybolup sol üstte drawer
   tetikleyicisi çıkmalı. Ekran görüntüleri raporun yanında:
   `raporlar/kanit/faz7-anasayfa-{1440,1280,1100,900,720}.png`.
5. **Arkadaş menüsü klavyesi (elle, çevrimiçi arkadaş gerekir).** Bir arkadaş kartına `Tab` ile
   gel, `Shift+F10` bas: menü açılmalı ve **ilk öğe odaklı** gelmeli, `Tab` menünün içinde
   dönmeli, `Esc` kapatınca focus **karta** dönmeli.
6. **`Esc` turu (elle).** `⌘K`/`Ctrl+K` ile paleti aç → `Esc` kapatmalı ve focus arama alanına
   dönmeli. Palette `Durumu değiştir`i seç → alt menü açılır, ilk `Esc` **yalnız alt menüyü**
   kapatmalı, ikinci `Esc` paleti kapatmalı.
7. **Azaltılmış hareket (elle).** İşletim sisteminde "hareketi azalt"ı aç: `Şu an canlı`
   başlığındaki yeşil nabız durmalı, arkadaş kartına gelince kart **yükselmemeli**, konuşan
   varken dalga formu zıplamamalı.
8. **Ekran okuyucu (elle, isteğe bağlı).** NVDA/VoiceOver ile Ana Sayfa'yı gez: kart başlıkları
   "başlık düzey 2" olarak duyulmalı, avatarların yanındaki noktalar "Çevrimiçi/Boşta/Rahatsız
   etmeyin/Çevrimdışı" demeli, okunmamış rozetleri "3 okunmamış mesaj" demeli.
9. **Açık tema kontrastı (gözle).** Temayı açık yap: bölüm etiketleri (`KALDIĞIN YER`,
   `ŞU AN CANLI`) ve zaman damgaları eskisinden **belirgin şekilde koyu**. Bu değişiklik
   uygulamanın bütün açık-tema ekranlarını etkiliyor — göz gezdirmekte fayda var (§6.2).
10. Dev sunucun **geri başlatıldı** (`pnpm dev`, port 3000). `.next` ve `dist` e2e bayrakları
    olmadan yeniden derlendi; `next-env.d.ts` geri alındı; e2e şifresi silindi.
11. `graphify-out/` güncel: 27790 düğüm / 65729 kenar.

### Kasten bozma denemeleri (koşuldu ve geri alındı)

- `tr.ts`te `home.greeting.evening`i `İyi akşamlar {name}` yap (virgülü sil) → "§1.1 tablosu
  karakter karakter" kırmızı.
- `en.ts`ten `home.subline.mentions_one`i sil → sözlük parite testi değil, **davranış** değişir:
  `resolveMessageTemplate` taban anahtara düşer ve `1 mentions` yazar. `_one`i `tr.ts`ten silmek
  ise parite testini kırar.
- `home-card.tsx`te `h2`yi `div role="heading"` yap → §2.1 kırmızı.
- `PresenceDot`un `sr-only` satırını sil → §2.2 kırmızı.
- `layout.ts`te `medium` kırılımında `awaiting.rowSpan`ı 1 yap → "ızgarada boş hücre bırakılmaz"
  kırmızı.
- `home-card.tsx`te satır içi `gridColumn`u geri koy → 1280'de ızgara dört kolon ölçülüyor
  (`grid-area`nın kolon parçası eziliyor), e2e kırmızı. **Bu gerçek bir hataydı ve böyle
  yakalandı.**
- `HomeCommandCenter`i `useResponsiveLayout` ile ölçmeye geri döndür → sunucu 1280, istemci gerçek
  genişlik; ilk boya yanlış kırılımda çıkıyor ve parity testi iki `home-command-center` görüyor.
  **Bu da gerçek bir hataydı** (§3.1'in ilk yazımı) ve e2e'de yakalandı.
- `globals.css`te `--text-muted`i 52%'ye geri al → açık tema a11y taraması kırmızı.
- `e2e/fixtures/test.ts`ten yerel sabitlemesini kaldır → palet komutlarının Türkçe aramaları
  kırmızı (uygulama İngilizce açılıyor).

---

## 8. Sorulan / sorulacak kararlar

| Konu                                            | Durum                     | Cevap / gerekçe                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nav anahtarları `nav.*` mı, `shell.appNav.*` mı | **Soruldu, cevap alındı** | "Mevcut `shell.appNav.*` kalsın". Faz 2 anahtarları §1.2 tablosuyla **birebir aynı** TR değerleriyle yazmıştı; sözlüğün üç parçalı ad düzenine de uyuyor. Sıfır kod değişikliği, sıfır ölü anahtar. §1.2'nin metinleri `messages.test.ts`te tek tek bağlandı.                                     |
| İngilizce çoğul                                 | **Soruldu, cevap alındı** | "`_one`/`_other` ekle **ve** `interpolateMessage`a çoğul desteği". Mekanizma `resolveMessageTemplate`e girdi; taban anahtar çoğul biçim olduğu için mevcut 40+ sayaç anahtarı hiç değişmedi. Yedi yeni anahtarın tekil biçimi yazıldı.                                                            |
| Açık temada `--text-muted` AA'nın altında       | **Soruldu, cevap alındı** | "52% → 46%". Kart 4,91 · panel 4,45 · tertiary 3,93. Ton ve doygunluk değişmedi, yeni renk eklenmedi. Koyu temalara dokunulmadı. Global token olduğu için uygulamanın tamamını etkiliyor → §6.2.                                                                                                  |
| Amber `Takvim` butonu                           | **Ölçüldü, sorulmadı**    | **10,69:1** — AA'yı da AAA'yı da geçiyor. Sorulacak bir tasarım istisnası çıkmadı.                                                                                                                                                                                                                |
| Kırılım CSS'te mi JS'te mi seçilsin             | Karar verildi, ölçümle    | İlk yazım `useResponsiveLayout` ile ölçüyordu; SSR anlık görüntüsü 1280 olduğu için ilk boya yanlış kırılımda çıkıyor ve hidrasyon uyuşmazlığı doğuyordu (parity testi iki ağaç gördü). Medya sorgusuna geçildi; eşikler yine `RESPONSIVE_BREAKPOINTS`ten, yerleşim yine `layout.ts` tablosundan. |
| Saf fonksiyonlar dize mi anahtar mı döndürsün   | Karar verildi             | `HomeCopy` (`{ key, values }`). Alternatif `t`yi parametre geçmekti; o zaman testler yine metni doğrulardı ama **hangi anahtarın** seçildiğini doğrulamazdı. Kullanıcının kendi yazdığı metin `key: null` ile geçiyor ve çevrilmiyor.                                                             |
| Testler hangi dilde koşsun                      | Karar verildi             | Türkçe. Doğrulanan şey SPEC metni ve SPEC metni Türkçe; sahte bir sözlük "ODAK" aramasının Türkçe etikette çalıştığını kanıtlamazdı. Birim testlerde `renderWithLocale`, e2e'de `fixtures/test.ts`.                                                                                               |
| `ContextMenu`ye focus yönetimi eklendi          | Karar verildi             | `00 §5.3` menülerden "açılışta ilk öğeye focus" ve "kapanışta tetikleyiciye dönüş" istiyor; menü portalda çizildiği için focus taşınmadan klavyeyle hiç görülemiyordu. Paylaşımlı bileşen, ama eksik olan davranış menünün **tanımı**.                                                            |
| Ana alan `section` → `main`                     | Karar verildi             | Uygulamada hiç `main` yer imi yoktu. Tek element, tek satır; bütün `(main)` rotaları kazanıyor.                                                                                                                                                                                                   |
| Ekran görüntüsü perdeyi bekliyor                | Karar verildi             | İlk koşuda açılış perdesinin fotoğrafı çekildi. Yardımcı perdenin saydamlaşmasını bekliyor; testin kendisi zaten DOM'dan ölçüyordu, yanlış olan yalnız kanıttı.                                                                                                                                   |

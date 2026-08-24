# Faz 7 — i18n, erişilebilirlik ve küçük ekran kırılımları

**Ön koşul:** Faz 6. **Sonraki:** Faz 8.
**Önce oku:** `00-ortak-baglam.md` §5.3 (erişilebilirlik çıtası), §1 "Metin birebir" kuralı;
PROMPT §7 (küçük ekranlar).

Dört ekran çalışıyor. Bu faz metinleri sözlüğe taşır, klavye/ekran okuyucu yolunu kapatır ve
1360px altındaki davranışı tanımlar.

---

## 0. Başlangıç

```
graphify query "locale mesaj sözlüğü ve useI18n kullanımı"
graphify query "useResponsiveLayout ve mobil drawer kalıbı"
```

---

## 1. i18n

`apps/web/src/lib/locale/messages/tr.ts` ve `en.ts`. Anahtar düzeni mevcut sözlükle aynı:
`"alan.bölüm.parça"`, düz nesne, alfabetik sıra.

**Kural:** Türkçe değerler SPEC'teki metnin **birebir aynısı**. Kısaltma, "iyileştirme", noktalama
değişikliği yok. İngilizce karşılıklar doğal çeviridir, birebir olmak zorunda değil.

### 1.1 Ana Sayfa sözlüğü

| Anahtar                       | TR değeri                             |
| ----------------------------- | ------------------------------------- |
| `home.greeting.morning`       | `Günaydın, {name}`                    |
| `home.greeting.afternoon`     | `İyi günler, {name}`                  |
| `home.greeting.evening`       | `İyi akşamlar, {name}`                |
| `home.greeting.night`         | `İyi geceler, {name}`                 |
| `home.focus.pill`             | `Odak · {minutes} dk`                 |
| `home.subline.pendingReplies` | `{count} yanıt`                       |
| `home.subline.waiting`        | `seni bekliyor`                       |
| `home.subline.mentions`       | `{count} bahsedilme`                  |
| `home.subline.unread`         | `okunmadı`                            |
| `home.search.placeholder`     | `Ara veya komut çalıştır`             |
| `home.continue.title`         | `Kaldığın yer`                        |
| `home.continue.seeAll`        | `Tümünü gör`                          |
| `home.continue.dmChip`        | `DM`                                  |
| `home.continue.empty`         | `Henüz bir yere uğramadın`            |
| `home.live.title`             | `Şu an canlı`                         |
| `home.live.openRooms`         | `{count} oda açık`                    |
| `home.live.speaking`          | `{name} konuşuyor`                    |
| `home.live.join`              | `Katıl`                               |
| `home.live.leave`             | `Ayrıl`                               |
| `home.live.empty`             | `Şu an açık oda yok`                  |
| `home.awaiting.title`         | `Yanıt bekliyor`                      |
| `home.awaiting.new`           | `{count} yeni`                        |
| `home.awaiting.inbox`         | `Gelen kutusu`                        |
| `home.awaiting.reply`         | `Yanıtla`                             |
| `home.awaiting.accept`        | `Kabul et`                            |
| `home.awaiting.empty`         | `Bekleyen isteğin yok`                |
| `home.presence.title`         | `Durumun`                             |
| `home.presence.online`        | `Çevrimiçi`                           |
| `home.presence.busy`          | `Meşgul`                              |
| `home.presence.idle`          | `Boşta`                               |
| `home.presence.invisible`     | `Görünmez`                            |
| `home.presence.dnd`           | `Rahatsız etmeyin`                    |
| `home.presence.dndAutoOff`    | `{minutes} dk sonra otomatik kapanır` |
| `home.presence.elapsed`       | `{minutes} dk geçti`                  |
| `home.presence.total`         | `{minutes} dk`                        |
| `home.upNext.title`           | `Sıradaki`                            |
| `home.upNext.eventCount`      | `{count} etkinlik`                    |
| `home.upNext.minutesLeft`     | `{minutes} dk kaldı`                  |
| `home.upNext.attendees`       | `{count} kişi katılıyor`              |
| `home.upNext.remind`          | `Hatırlat`                            |
| `home.upNext.reminded`        | `Hatırlatılacak`                      |
| `home.upNext.calendar`        | `Takvim`                              |
| `home.upNext.today`           | `bugün`                               |
| `home.upNext.tomorrow`        | `yarın`                               |
| `home.upNext.empty`           | `Yaklaşan etkinlik yok`               |
| `home.friends.title`          | `Arkadaşlar`                          |
| `home.friends.online`         | `{count} çevrimiçi`                   |
| `home.friends.ofTotal`        | `· {count} kişiden`                   |
| `home.friends.all`            | `Tümü`                                |
| `home.friends.empty`          | `Çevrimiçi arkadaşın yok`             |
| `home.friends.idleFor`        | `{minutes} dk boşta`                  |
| `home.friends.inRoom`         | `{room}'da`                           |

### 1.2 Navigasyon

| Anahtar         | TR değeri       |
| --------------- | --------------- |
| `nav.home`      | `Ana Sayfa`     |
| `nav.messages`  | `Mesajlar`      |
| `nav.mentions`  | `Bahsedilmeler` |
| `nav.events`    | `Etkinlikler`   |
| `nav.discover`  | `Keşfet`        |
| `nav.myServers` | `Sunucularım`   |

### 1.3 Yan ekranlar ve palet

`mentions.*`, `events.*`, `inbox.*`, `command.*` anahtarları aynı düzende. Metinler Faz 6'da
sabitlenen değerlerdir.

### 1.4 Çoğul ve enterpolasyon

- Türkçede çoğul eki sayıyla değişmiyor (`1 yanıt`, `3 yanıt`) — özel çoğul kuralı gerekmez.
- İngilizcede gerekir (`1 reply` / `3 replies`); mevcut sözlüğün çoğul yaklaşımı neyse o kullanılır.
  Sözlükte çoğul mekanizması yoksa iki ayrı anahtar (`…_one` / `…_other`) **uydurmadan önce**
  mevcut örneklere bak.
- `{room}'da` eki sesli uyuma göre değişebilir (`live-room'da`, `stüdyo'da`). Basit kesme işareti
  yeterli; ek uyumu için kural yazma.

### 1.5 Sözlük denetimi

Test: `tr.ts` ve `en.ts` **aynı anahtar kümesine** sahip. Bu paketin eklediği anahtarların hepsi
iki dosyada da var. Mevcut bir denetim testi varsa ona ekle, yenisini yazma.

Ayrıca: bu paketin dosyalarında **sabit Türkçe string kalmadı** — token denetim testine benzer bir
tarama (`/[çğıöşüÇĞİÖŞÜ]/` içeren JSX metin düğümü) ekle.

---

## 2. Erişilebilirlik

`00-ortak-baglam.md` §5.3 zorunlulukları burada tek tek kapatılır.

### 2.1 Anlamsal yapı

- `AppNavPanel` → `nav aria-label`, sunucu listesi `ul`/`li`.
- Ana alan `main`.
- Bento ızgara `section` + `aria-labelledby` (bölüm etiketi id'si).
- Kart başlıkları görsel olarak küçük ama anlamsal olarak başlık: `h2`/`h3` kullan, boyutu CSS
  versin.

### 2.2 Presence

Her presence noktasının metin karşılığı var:

```tsx
<span className="…" aria-hidden="true" />
<span className="sr-only">{t(`home.presence.${status}`)}</span>
```

Renk tek taşıyıcı değil — durum çiplerinde metin zaten var, avatar noktalarında `sr-only`.

### 2.3 Sayaçlar

`Badge` `aria-label` alır: `3 okunmamış mesaj` / `2 okunmamış bahsedilme`. Anahtar:
`common.unreadMessages` / `common.unreadMentions`.

### 2.4 Klavye

- Sekme sırası: ray → panel → üst çubuk → kartlar (soldan sağa, yukarıdan aşağıya) → ayak.
- `Esc` her overlay'i kapatır, focus tetikleyiciye döner.
- Overlay açıkken arka plan `inert` ya da focus tuzağı.
- Focus stili `ring-ring` token'ından; `outline: none` tek başına yok.
- Tıklanabilir satırlarda `:focus-visible` görünür ve hover'la aynı zemini gösterir.

### 2.5 Hareket

`prefers-reduced-motion: reduce` → nabız animasyonu, dalga formu, hover `translateY` kapalı.
Tek yerden: `globals.css` içindeki mevcut reduced-motion bloğuna eklenir.

### 2.6 Kontrast

Amber `Takvim` butonu (`bg-amber-400` üzerine `text-slate-900`) kontrast oranı ölçülür; AA'yı
geçmiyorsa **kullanıcıya sorulur** (tasarım istisnası olduğu için tek taraflı değiştirilmez).
Muted metinlerin kart zeminine karşı oranı iki temada da ölçülür ve raporda tablo hâlinde verilir.

---

## 3. Küçük ekran kırılımları (PROMPT §7)

Ana Sayfa tek ekranlık kompozisyon; 1360'ın altında kompozisyon **değişir**, ölçek değil.

| Genişlik   | Düzen                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1360     | 4 kolon bento, kaydırma yok                                                                                                                               |
| 960 – 1359 | **2 kolon**: Kaldığın yer · Şu an canlı üstte; Yanıt bekliyor · (Durumun + Sıradaki) altta; Arkadaşlar tam genişlik. Dikey kaydırma serbest               |
| < 960      | **tek kolon**, sıra: Kaldığın yer → Şu an canlı → Yanıt bekliyor → Durumun → Sıradaki → Arkadaşlar. Nav paneli `MobileDrawerTrigger` ile drawer'a taşınır |

- Kırılımlar `RESPONSIVE_BREAKPOINTS` ile çelişmemeli; gerekiyorsa yeni bir eşik eklenir
  (`commandCenter: 960`, `commandCenterWide: 1360`) — sihirli sayı JSX'e yazılmaz.
- Arkadaşlar şeridi dar ekranda yatay kaydırmalı olur (`overflow-x:auto`, snap), kart sayısı
  kırpılmaz.
- Mobil drawer mevcut bileşenle açılır; yeni drawer yazma.
- `< 960` altında ölçek motoru ×1'de kalır.

---

## 4. Kapı

```bash
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
pnpm --filter @wizards/web e2e:a11y
```

**Geçme koşulları:**

- [ ] Bu paketin dosyalarında sabit Türkçe string yok (tarama testi yeşil).
- [ ] `tr.ts` / `en.ts` anahtar kümeleri eşit; yeni anahtarların hepsi iki dosyada.
- [ ] TR metinler SPEC ile **karakter karakter** aynı — §1.1 tablosu tek tek karşılaştırıldı.
- [ ] `e2e:a11y` yeşil; yeni ekranlar spec'lere eklendi.
- [ ] Klavye turu: ray → panel → üst çubuk → 6 kart → ayak, hepsi erişilebilir (elle doğrulama).
- [ ] `Esc` dört overlay'i de kapatıyor, focus geri dönüyor.
- [ ] `prefers-reduced-motion` açıkken hareket yok.
- [ ] Kontrast tablosu raporda; AA'yı geçmeyen varsa kullanıcıya soruldu.
- [ ] 1280 / 1100 / 900 / 720 genişliklerinde ekran görüntüsü raporda; kırpma yok.

## 5. Tuzaklar

- Metni "daha iyi" yapma. `İyi akşamlar, Doğukan` yerine `İyi akşamlar Doğukan` yazmak bile sapma.
- `aria-live` sayaçları saniyede bir güncellenen alanlara koyma; ekran okuyucu sürekli konuşur.
- Kart başlıklarını `div` yapıp `role="heading"` verme — gerçek `h2`/`h3` kullan.
- Dar ekranda bento'yu `grid-auto-flow` ile kendiliğinden akıtma; sıra tasarımda tanımlı, açıkça
  yaz.
- Drawer açıkken arka plan kaydırması kilitlenmeli (`useBodyScrollLock` mevcut).

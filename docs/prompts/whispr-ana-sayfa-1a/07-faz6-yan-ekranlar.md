# Faz 6 — Yan ekranlar: Bahsedilmeler, Etkinlikler, Gelen kutusu

**Ön koşul:** Faz 5. **Sonraki:** Faz 7.
**Önce oku:** `00-ortak-baglam.md`; karar #9 ve #10.

Ana Sayfa'daki her link gerçek bir hedefe gitmek zorunda. Bu faz üç ekranı yazar. Üçü de aynı
kabuğu, aynı token'ları, aynı ölçek motorunu kullanır ve **Ana Sayfa'da yazılmış uçları** tüketir —
yeni veri katmanı yok.

Tasarım kaynağı: bu üç ekranın ayrı handoff'u **yok**. Bu yüzden kural: **Ana Sayfa'nın görsel
dilinden türet.** Yeni kart tipi, yeni yarıçap, yeni gölge, yeni tipografi rolü icat etme. Emin
olunamayan düzen kararında kullanıcıya sorulur.

---

## 0. Başlangıç

```
graphify query "mevcut liste ekranlarının boş durum ve sayfalama kalıpları"
```

---

## 1. Ortak kabuk

- Üçü de `(main)` altında, 2. sütun `AppNavPanel` (karar #8).
- Ana alan: Ana Sayfa'nınkiyle aynı üst çubuk **yapısı** — sol başlık + açıklama satırı, sağda
  arama alanı + bildirim butonu. Selamlama yerine ekran adı.
- İçerik alanı tek kolon liste ya da ızgara; Ana Sayfa'nın `HomeCard` kabuğu yeniden kullanılır.
- Üçü de tek ekranlık değil — **kaydırma serbest**. Ana Sayfa'nın "kaydırma yok" kuralı yalnız
  komuta merkezine aittir.

---

## 2. `/mentions` — Bahsedilmeler

Kaynak: `GET /api/v1/mentions` (Faz 3 §3.7).

### 2.1 Düzen

- Başlık: `Bahsedilmeler` + alt satır `<n> okunmamış`.
- Filtre çipleri: `Tümü` · `Okunmamış` · `Sunucular` · `Mesajlar`. Çip stili `Durumun` kartındaki
  çiple aynı (padding `8 10`, radius 11).
- Liste satırı — "Yanıt bekliyor" satırının aynısı:
  36px avatar + presence noktası · ad 600/14 · bağlam 11.5 muted · zaman sağa yaslı ·
  alıntı satırı 13 `--text-secondary`, **iki satıra kadar** (`line-clamp: 2`).
- Okunmamış satırın sol kenarında 3px `--primary` şerit.
- Satır tıklanınca ilgili mesaja gider (kanal/DM + mesaj kimliği) ve okundu işaretlenir.
- Sağ üstte `Tümünü okundu işaretle` butonu (mevcut `read-all` davranışına bağlanır).

### 2.2 Sayfalama

Cursor tabanlı sonsuz liste. `IntersectionObserver` ile alt sınıra gelince sonraki sayfa. Sayfa
boyutu 25. **Sanallaştırma bu ekranda gerekmiyor** — 25'lik sayfalar ve sonlu kullanım.

### 2.3 Boş durum

`Henüz kimse senden bahsetmedi` + tek satır açıklama.

---

## 3. `/events` — Etkinlikler

Kaynaklar: `GET /api/v1/events/upcoming` (liste) ve `GET /api/v1/events/calendar` (takvim).

### 3.1 İki görünüm

Üst çubuğun altında segment: `Liste` · `Takvim`. Seçim URL'de tutulur (`?view=calendar`) ki
Ana Sayfa'daki amber `Takvim` butonu doğrudan takvim görünümüne gidebilsin (karar #10).

### 3.2 Liste görünümü

- Gün başlıklarıyla gruplu (`Bugün`, `Yarın`, `<tarih>`).
- Satır: 38px saat kolonu + dikey ayırıcı + başlık 600/14.5 + bağlam 12 muted + sağda katılımcı
  avatarları (3 + sayı) ve `Hatırlat` butonu.
- `Hatırlat` Faz 5'teki davranışın aynısı — mantık paylaşılır, kopyalanmaz.

### 3.3 Takvim görünümü

- Ay ızgarası: 7 kolon, hafta satırları. Gün hücresi: gün numarası + en fazla 3 etkinlik çipi +
  `+<n>` fazlası.
- Bugünün hücresi `--primary/0.13` zemin.
- Ay değiştirme: sol/sağ ok butonları + `Bugün` butonu. Klavye: `PageUp`/`PageDown`.
- Gün hücresine tıklama → o günün etkinlik listesi (yan panel ya da satır içi genişleme —
  **karar gerektirir, kullanıcıya sor**).
- Veri aralığı görünen aya göre çekilir; ay değişince yeni aralık istenir (`from`–`to`).
- `dynamic()` ile kod bölünür — liste görünümü kullanıcıları takvim kodunu indirmez.

### 3.4 Boş durum

`Bu ayda etkinlik yok` / `Yaklaşan etkinlik yok`.

---

## 4. `/inbox` — Gelen kutusu

Kaynak: `GET /api/v1/app/awaiting` — Ana Sayfa kartının **tam listesi**, `limit` yüksek.

### 4.1 Düzen

- Başlık `Gelen kutusu` + alt satır `<n> bekleyen`.
- Kaynak filtresi çipleri: `Tümü` · `Bahsedilmeler` · `Yanıtlar` · `Arkadaşlık istekleri` ·
  `Sunucu davetleri`.
- Satır: Ana Sayfa'daki "Yanıt bekliyor" satırı — aynı bileşen, `variant="full"` ile daha geniş
  hâli. **İkinci bir satır bileşeni yazma.**
- Aksiyonlar aynı (`Yanıtla` / `Kabul et`) ve aynı optimistic mantığı kullanır.
- Toplu işlem yok (kapsam dışı; istenirse ayrı iş).

### 4.2 Boş durum

`Gelen kutun boş`.

---

## 5. Bağlantıların kapatılması

Faz 2 §2.2'de geçici hedefe bağlanmış nav satırları varsa **burada gerçek hedefe** çevrilir:

| Kaynak                           | Hedef                      |
| -------------------------------- | -------------------------- |
| Nav `Bahsedilmeler`              | `/mentions`                |
| Nav `Etkinlikler`                | `/events`                  |
| Kart `Gelen kutusu`              | `/inbox`                   |
| Kart `Takvim`                    | `/events?view=calendar`    |
| Kart `Tümünü gör` (Kaldığın yer) | `/channels`                |
| Kart `Tümü` (Arkadaşlar)         | mevcut arkadaşlar görünümü |
| Palet komutları                  | ilgili rotalar             |

Kapıda "ölü link kalmadı" maddesi bunu doğrular.

---

## 6. Performans

- Üç ekran da `dynamic()` gerektirmez (takvim görünümü hariç).
- Liste sorguları cursor tabanlı; offset yok.
- Filtre çipleri sunucuya yeni istek atar (istemci filtresi değil) — yoksa "okunmamış" filtresi
  yalnız yüklenmiş sayfada çalışır ve yanlış sayı gösterir.
- Ay değişiminde önceki ay cache'te kalır (`keepPreviousData`), takvim boş ekrana düşmez.

---

## 7. Erişilebilirlik

- Segment kontrolü `role="tablist"` / `role="tab"` + `aria-selected`.
- Takvim ızgarası `role="grid"`, gün hücreleri `role="gridcell"`, ok tuşlarıyla gezinme.
- Filtre çipleri `button` + `aria-pressed`.
- Sonsuz listede "daha fazla yükleniyor" durumu `aria-live="polite"`.

---

## 8. Kapı

```bash
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
pnpm --filter @wizards/web e2e:a11y
pnpm --filter @wizards/web exec playwright test e2e/specs/design
```

**Geçme koşulları:**

- [ ] Üç rota da render oluyor, `AppNavPanel` ile geliyor.
- [ ] **Ana Sayfa'da ölü link yok** — 7 hedefin hepsi doğrulandı (e2e ile tıklama turu).
- [ ] `/events?view=calendar` doğrudan takvim görünümünü açıyor.
- [ ] Bahsedilmeler cursor sayfalaması çalışıyor; ikinci sayfa yükleniyor.
- [ ] Filtreler sunucuya gidiyor (network kaydı raporda).
- [ ] "Yanıt bekliyor" satırı tek bileşen — Ana Sayfa ve Gelen kutusu aynı dosyayı kullanıyor.
- [ ] Takvim ızgarası klavyeyle geziliyor.
- [ ] Yeni token/hex yok; lint ve token denetimi yeşil.

## 9. Tuzaklar

- Bu üç ekranın handoff'u yok — **yeni görsel dil icat etme**. Kararsız kalınan düzen sorusu
  kullanıcıya gider (§1).
- Gelen kutusu için ikinci bir satır bileşeni yazma; varyant ekle.
- Takvim veri aralığını 62 günle sınırlayan zod kuralı var (Faz 3 §3.6) — yıl görünümü isteniyorsa
  ayrı iş.
- Filtreyi istemcide uygulama; sayfalanmış listede yanlış sonuç verir.
- `?view=` parametresi bilinmeyen değer taşıyorsa listeye düş, hata verme.

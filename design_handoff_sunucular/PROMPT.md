# Whispr Mobile — Sunucular Redesign: Claude Code Uygulama Promptu

Bu paket, Whispr mobil uygulamasının **Sunucular** bölümünün yeniden tasarımını birebir uygulaman için hazırlandı. `screenshots/` klasöründeki 5 ekran görüntüsü ve `Whispr Sunucular Redesign.dc.html` kaynak dosyası tasarımın tek doğrusudur — piksel piksel bu görünüme sadık kal. Aşağıdaki spesifikasyon her ekranın yapısını, ölçülerini, renklerini, durumlarını ve davranışlarını tanımlar.

## 0. Genel kurallar

- Hedef: mevcut Whispr mobil uygulamasındaki Sunucular ekranı, sunucu seçici sheet ve kanal oluşturma akışının bu tasarımla değiştirilmesi.
- Ekran genişliği referansı: **390×844** (iPhone benzeri). Tüm layout responsive olmalı; ölçüler bu referanstan orantılanır.
- Görüntülerdeki durum çubuğu ve telefon çerçevesi mockup içindir — uygulamada native status bar / safe-area kullan.
- Metinler Türkçe, buradaki kopya birebir kullanılacak (örn. "Kanallarda ara", "Katıl / Kur", "Kaçırdıkların", "Vazgeç").

### 0.1 Design token'ları

| Token          | Değer                     | Kullanım                                              |
| -------------- | ------------------------- | ----------------------------------------------------- |
| `bg`           | `#F6F7FB`                 | Ekran zemini                                          |
| `card`         | `#FFFFFF`                 | Kart/satır zemini                                     |
| `border`       | `#E7E9F4`                 | Kart kenarlıkları (1px)                               |
| `text`         | `#1E2235`                 | Birincil metin                                        |
| `muted`        | `#6B7194`                 | İkincil metin                                         |
| `faint`        | `#9AA0BC`                 | Zaman/ipucu metni                                     |
| `label`        | `#8A90B0`                 | Kategori başlıkları (uppercase, letter-spacing .12em) |
| `primary`      | `#4F46E5`                 | Vurgu, aktif durum, CTA                               |
| `primary-soft` | `#EEF0FE`                 | Aktif satır zemini, soft buton                        |
| `success`      | `#22A366`, soft `#E7F6EE` | Ses kanalı / canlı durum                              |
| `warning`      | `#D97706`, soft `#FEF0E8` | Avatar/kategori aksanı                                |
| `danger`       | `#E5484D`                 | Bahsetme (@) rozetleri                                |
| `dashed`       | `#C9CDE4`                 | "Yeni ekle" kesikli kenarlıklar                       |

- Font: **Plus Jakarta Sans** (400/500/600/700/800).
- Köşe yarıçapları: kartlar/satırlar 14–18px, sheet üst köşeleri 28px, ikon kutuları 10–16px, rozetler tam yuvarlak.
- Gölgeler: primary buton `0 6–8px 14–18px rgba(79,70,229,.35)`, FAB `0 10px 24px rgba(79,70,229,.42)`, sheet `0 -12px 40px rgba(20,23,42,.25)`.
- Sheet arkası karartma: `rgba(20,23,42,.45)`; arkadaki içerik ~%45 opaklıkta görünür.

### 0.2 Yetki modeli

`isAdmin` (kanal yönetimi yetkisi — sunucu sahibi veya "Kanalları Yönet" izni olan roller):

- `true` → kategori başlıklarındaki **+** butonları, header'daki **+** butonu (1a), **+ FAB** (1b) ve oluşturma akışları (1d, 1e) görünür/erişilir.
- `false` → bu butonların hiçbiri render edilmez (disable değil, tamamen gizli).

### 0.3 Ortak alt gezinme (tab bar)

4 sekme: **Sunucular** (2×2 yuvarlak kare grid ikonu, aktif: primary + font-weight 800), **Mesajlar** (konuşma balonu), **Bildirimler** (zil + kırmızı sayaç rozeti, örn. 4), **Profil** (kişi). Pasif renk `#6B7194`, ikon 21px stroke 2, etiket 11px. Beyaz zemin, üstte 1px `border` çizgisi.

---

## 1a — Sunucular, sol rail görünümü (`1a-sol-rail.png`)

İki sütun: **rail (66px)** + **içerik**.

### Rail

- Sunucu avatarları 44×44, radius 16, dikey 12px aralık.
- Okunmamış bahsetme olan sunucu: sağ üstte kırmızı sayaç rozeti (17px, 2px zemin-rengi kenarlık, örn. "2").
- Okunmamış mesaj olan sunucu: sağ üstte küçük primary nokta (11px).
- **Aktif sunucu**: solda 4px genişlik, 30px yükseklik primary bar (sağ köşeleri yuvarlak) + avatar çevresinde `0 0 0 2px #F6F7FB, 0 0 0 4px #4F46E5` ring.
- En altta 44×44 kesikli kenarlıklı beyaz **+** (yeni sunucu → 1c'deki "Katıl / Kur" akışı).

### İçerik başlığı

- Satır 1: sunucu adı (18px, 800) + aşağı chevron (dokunınca 1c sheet açılır) — sağda 36×36 ikon butonları: **ara** (arama alanını açar), **üye davet et**, ve yetkiliyse **+** (primary dolgulu, gölgeli → 1d menüsü).
- Satır 2 meta: `5 üye · 5 kanal · ● 2 seste` (11.5px; "seste" kısmı success renkli, yeşil nokta ile).
- Eski tasarımdaki kalıcı büyük arama kutusu kaldırıldı — arama ikonu ile açılır (daha fazla içerik alanı).

### Kategori başlığı

- `chevron(11px) + KATEGORİ ADI (10.5px, 800, uppercase, #8A90B0) + spacer + [+ butonu]`.
- **+** butonu: 22×22, radius 8, beyaz, border — dokununca 1d menüsü o kategori ön-seçili açılır. Yalnız yetkilide.
- Chevron'a dokunmak kategoriyi daraltır/açar (daraltılınca yalnız okunmamış kanallar görünür).

### Kanal satırları (48–52px, radius 14)

- Sol ikon kutusu 30×30 radius 10: metin kanalı `#` (beyaz kutu + border), ses kanalı hoparlör (success soft kutu).
- Orta: kanal adı 14px + altta tek satır son mesaj önizlemesi 11.5px (taşan `ellipsis`). Önizleme `showPreviews` ayarıyla kapatılabilir.
- Sağ: zaman (10.5px `faint`) + altında rozet.
- **Durumlar:**
  - _Aktif kanal_ (welcome-chat): zemin `#EEF0FE`, ad primary 800.
  - _Okunmamış_ (harman): ad 800, primary sayaç rozeti (18px, örn. "3").
  - _Bahsetme_ (development): ad 800, önizlemede `@kullanıcı` primary 700, kırmızı `@1` rozeti.
  - _Okunmuş_ (test): ad 600 `muted`, önizleme `faint`.
  - _Canlı ses kanalı_ (live-room): beyaz kart + border, adı 700, altında success "Canlı · 2 kişi", sağda üst üste binen 22px katılımcı avatarları (-7px margin) + success **Katıl** pill butonu (dokununca sesli kanala bağlanır).

### Davranış

- Kanal satırı → kanal ekranına gider. Uzun basma → kanal menüsü (bu pakette yok, mevcut davranış korunur).
- Rail'de sunucuya dokunma → sunucu değişir; rail dikey kaydırılabilir.

---

## 1b — Sunucular, compakt görünüm (`1b-compakt.png`)

Rail yok; aynı kanal listesi tam genişlik. Farklar:

- **Sunucu pili** (header solunda, beyaz kart radius 18): 38×38 avatar (üstünde toplam okunmamış kırmızı rozet, örn. "6" — diğer sunucuların toplamı), ad 15px 800, alt satır `5 üye · 2 seste`, sağda aşağı chevron. **Dokununca 1c sunucu seçici sheet açılır.**
- Sağda 42×42 iki ikon buton: üye davet, sunucu ayarları (dişli).
- Kalıcı arama kutusu: beyaz, radius 15, `Kanallarda ara` placeholder (compakt görünümde kalır).
- Kanal satırları 1a ile aynı; ikon kutuları 32×32, ad 14.5px.
- **FAB** (yalnız yetkili): sağ altta tab bar'ın 18px üzerinde, 54×54 radius 20 primary, beyaz + ikonu, gölgeli → 1d menüsü.

---

## 1c — Sunucu seçici + bildirimler sheet (`1c-sunucu-secici-sheet.png`)

Alttan açılan sheet (radius 28 üst köşeler, tutamaç: 44×5px `#DDE0F0`). Arka plan karartılır.

### Başlık

- Sol: **"Sunucuların"** (19px, 800). Sağ: **"+ Katıl / Kur"** soft primary buton (`#EEF0FE` zemin, primary metin 13px 800, radius 13).

### Sunucu satırları (avatar 46×46 radius 16)

Her satır sunucunun bildirim durumunu gösterir:

- _Bahsetmeli_ (Mobile Notification): avatarda kırmızı sayaç rozeti; alt satır kırmızı `2 bahsetme · #genel`; sağda kırmızı `@2` pill.
- _Okunmamışlı_ (Test): alt satır `1 kanalda yeni mesaj`; sağda primary `5` pill.
- _Seçili_ (Mobile Test): zemin `#EEF0FE`, 1.5px primary border, ad primary; alt satır `5 üye · 5 kanal · şu an buradasın`; sağda primary check ikonu.
- _Yeni sunucu_: kesikli kenarlıklı satır, `+` ikon kutusu, "Yeni sunucu / Davet koduyla katıl veya kur".
- Dokununca sunucuya geçilir ve sheet kapanır.

### "KAÇIRDIKLARIN" bölümü

- Bölüm başlığı: 10.5px 800 uppercase `label` + sağa uzanan 1px ayraç + sağda **"Tümü"** linki (Bildirimler sekmesine gider).
- En fazla 2–3 kompakt bildirim kartı (`#F6F7FB` zemin, radius 15): 34×34 ikon/avatar, başlık 12.5px 700 (örn. "aysegul_dev seni bahsetti"), alt satır 11px `muted` (`Sunucu · #kanal — "mesaj…"`), sağda saat. Dokununca ilgili kanala/mesaja gider.
- Veri kaynağı: son bildirimler (bahsetmeler + ses kanalı başlangıçları), sunucular arası birleşik, en yeni üstte.

---

## 1d — Oluştur menüsü (`1d-olustur-menusu.png`)

Alttan sheet. Yalnız yetkili kullanıcı açabilir (1a header +, 1b FAB, kategori + butonları).

- Başlık: **"Oluştur"** (19px 800); altında `Mobile Test · [★ Yönetici]` — Yönetici çipi: `#EEF0FE` zemin, yıldız ikonu, 10.5px 800 primary. Kullanıcının yetki kaynağını gösterir.
- 3 seçenek kartı (`#F6F7FB` zemin, 1px border, radius 18, 14px padding, sağda chevron):
  1. **Metin kanalı** — `#` ikonu, primary-soft kutu — "Mesaj, görsel ve bağlantı paylaşımı" → 1e (Metin sekmesi seçili)
  2. **Ses kanalı** — hoparlör, success-soft kutu — "Sesli sohbet ve ekran paylaşımı" → 1e (Ses sekmesi seçili)
  3. **Kategori** — klasör, warning-soft kutu — "Kanalları gruplamak için başlık" → kategori adı formu (tek input + Oluştur)
- Altta tam genişlik **"Vazgeç"** (soft gri buton).
- Kategori başlığındaki + ile açıldıysa, 1e'de o kategori ön-seçili gelir.

---

## 1e — Kanal oluştur formu (`1e-kanal-olustur-formu.png`)

Alttan sheet; başlık **"Kanal oluştur"** + alt satır `Sunucu · Kategori` bağlamı, sağda ✕ kapat.

1. **Tip seçici** (segmented control): `#F6F7FB` ray, 4px padding; seçili segment beyaz + hafif gölge + primary ikon/metin (13px 800); diğeri `muted`. Segmentler: **Metin** (`#`) / **Ses** (hoparlör). Ses seçilirse form aynı, yalnız ad alanındaki `#` yerine hoparlör ve slug kuralı ipucu kalkar.
2. **KANAL ADI**: label 10.5px 700 uppercase; input `#F6F7FB` zemin, odakta 1.5px primary border + `0 0 0 3px rgba(79,70,229,.12)` halka; başında `#` ikonu. Altta ipucu: "Küçük harf, rakam ve tire kullanılır". Metin kanalında ad otomatik slug'lanır (boşluk→`-`, küçük harf).
3. **KATEGORİ**: yatay çip listesi — mevcut kategoriler (seçili: `#EEF0FE` + 1.5px primary border + primary 800 metin) + kesikli **"+ Yeni"** çipi (dokununca inline yeni kategori adı girişi).
4. **Özel kanal** satırı: kilit ikonu kutusu, "Özel kanal / Yalnız seçili roller görebilir", sağda toggle (kapalı: `#DDE0F0` ray, beyaz top; açık: primary ray, top sağda). Açılınca altında rol seçimi satırı belirir (mevcut rol seçici bileşeni kullan).
5. **CTA**: tam genişlik primary **"Kanalı oluştur"** (radius 16, gölgeli, + ikonu). Ad boşken disabled (%50 opaklık).
6. Alt bilgi satırı: ⓘ "Kanal ayarlarını sonradan değiştirebilirsin".

### İşlevsel gereksinimler

- Oluşturma başarılıysa sheet kapanır, liste güncellenir, yeni kanal vurgulanıp (kısa `#EEF0FE` flash) kanala gidilir.
- Ad çakışması → input altında kırmızı hata metni ("Bu ad zaten kullanılıyor"), border `danger`.
- Kategori oluşturma aynı sheet kalıbıyla tek input'luk formdur; yeni kategori listede en alta eklenir.

---

## Kabul kriterleri

1. 5 ekran da ekran görüntüleriyle piksel düzeyinde eşleşiyor (renk, radius, boşluk, tipografi, rozetler).
2. Yetkisiz kullanıcı hiçbir oluşturma butonu görmüyor; yetkili tüm giriş noktalarından (header +, FAB, kategori +) 1d→1e akışını tamamlayabiliyor.
3. Sunucu seçici sheet sunucu başına doğru okunmamış/bahsetme rozetlerini ve "Kaçırdıkların" bildirimlerini canlı veriden gösteriyor.
4. Rozet öncelik mantığı: bahsetme (kırmızı, `@n`) > okunmamış (primary, `n`) > yok.
5. Ses kanalı satırı canlı katılımcıları gerçek zamanlı gösteriyor; "Katıl" doğrudan bağlanıyor.
6. Kategori daralt/aç durumu kalıcı (kullanıcı başına saklanır).
7. Tüm dokunma hedefleri ≥ 44px; sheet'ler sürüklenerek kapatılabiliyor.

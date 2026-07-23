# Handoff / Uygulama Prompt'u: Whispr Profil Ekranları

> Bu dosyayı olduğu gibi Claude Code'a veya Codex'e verebilirsin. Yanındaki
> `Whispr Profil Ekranı.dc.html` dosyası **HTML ile hazırlanmış tasarım referansıdır**
> (10 ekranlık hi-fi mock, 390×844). Görev bu HTML'i kopyalamak değil; bu tasarımları
> **mevcut Whispr mobil kod tabanının kendi ortamında** (mevcut framework, navigasyon,
> state ve API katmanıyla) **birebir, hiçbir görsel fark olmadan** yeniden inşa etmektir.
>
> **Gerçek kaynak `Whispr Profil Ekranı.dc.html` dosyasıdır** — tüm ölçü, renk ve yazı
> değerleri orada inline style olarak yazılıdır; tereddütte kaldığın her değeri HTML'den
> oku, tahmin etme. `screenshots/` klasöründeki PNG'ler hızlı görsel referanstır;
> piksel değerleri için HTML esas alınır.
>
> Bu paket, daha önce teslim edilen **Whispr Mobile Redesign** handoff'unun devamıdır ve
> aynı tasarım token setini kullanır. O paketteki TabBar, Avatar(squircle), BottomSheet,
> SettingsRow, SegmentChip gibi ortak bileşenler burada da aynen geçerlidir.

---

## GÖREV

Kullanıcı profili özelliğini uçtan uca uygula:

1. **Hızlı profil kartı (popup):** Uygulamanın herhangi bir yerinde bir kullanıcının
   avatarına/adına dokununca ortada **yüzen kart** açılır (Discord web tarzı; bottom
   sheet DEĞİL). Arka plan %45 koyu overlay ile kararır, karta dokunmadan overlay'e
   dokunmak kartı kapatır. Açılış animasyonu: hafif scale+fade (~200ms ease-out).
2. **Tam profil sayfası:** Karttaki "Profili görüntüle" butonu tam ekran profil
   sayfasına gider (push navigation).
3. **Kendi profilin:** Kullanıcı kendi avatarına dokunursa aynı kart, aksiyon butonları
   yerine "Profili düzenle" + durum seçici ile açılır.
4. **Profil düzenleme, not yazma, durum seçici, paylaşılan medya galerisi** ekranları.

**Kesin kurallar:**

1. **Dummy / sahte veri YASAK.** Tüm alanlar gerçek kaynaklardan gelir: kullanıcı
   profili, presence, roller, ortak sunucular/arkadaşlar, DM medya geçmişi, rozetler,
   üyelik tarihleri — hepsi mevcut API / store / websocket katmanından. Mock'taki
   isimler ("aysegul_dev", "UAT ENV" vb.) yalnızca görsel referanstır.
2. Mevcut kod tabanını önce keşfet; yeni ekranları mevcut navigasyon/tema/i18n
   mimarisine entegre et.
3. Her ekran için **loading / empty / error** durumları (aşağıda tanımlı).
4. **Açık + koyu tema** birlikte; token setleri aşağıda. Tema tercihi mevcut
   mekanizmayla kalıcı.
5. Metinler Türkçe; mevcut i18n altyapısına eklenir.
6. Not alanı **yalnızca yazan kullanıcıya görünür** (sunucu tarafında da öyle saklanır).

## FIDELITY

**High-fidelity, birebir.** Renk, tipografi, boşluk, köşe yarıçapı ve bileşen ölçüleri
piksel piksel uygulanmalı. Referans: `Whispr Profil Ekranı.dc.html` (390×844, 10 ekran).

## REFERANS DOSYALAR

- `Whispr Profil Ekranı.dc.html` — kanonik tasarım kaynağı (tarayıcıda aç, DevTools ile ölç)
- `screenshots/1a-hizli-profil-kanal.png` — Hızlı profil kartı, kanal bağlamı (arkadaş)
- `screenshots/1b-hizli-profil-dm-arkadas-degil.png` — DM bağlamı, arkadaş değil + Engelle/Bildir menüsü
- `screenshots/1c-tam-profil.png` — Tam profil sayfası (açık tema)
- `screenshots/1d-kendi-profil-popup.png` — Kendi profil kartı (Düzenle)
- `screenshots/1e-koyu-hizli-profil.png` — Koyu tema hızlı profil
- `screenshots/1f-koyu-tam-profil.png` — Koyu tema tam profil
- `screenshots/2a-profil-duzenleme.png` — Profili düzenle
- `screenshots/2b-not-yazma.png` — Not yazma sheet'i + klavye
- `screenshots/2c-durum-secici.png` — Durum seçici bottom sheet
- `screenshots/2d-medya-galerisi.png` — Paylaşılan medya galerisi

---

## TASARIM TOKEN'LARI

Tipografi: **Plus Jakarta Sans** (400/500/600/700/800).

### Açık tema
- Arkaplan `#F6F7FB` · Kart `#FFFFFF` · Kenarlık `#E7E9F4` · İnce ayraç `#F0F1F8`
- Metin `#1E2235` · İkincil `#6B7194` · Soluk `#8A90B0` / placeholder `#9AA0BC`
- Birincil (indigo) `#4F46E5` · koyu tonu `#3F38C9` · lavanta yüzey `#EEF0FE` · lavanta kenarlık `#DFE2FC`
- Başarı `#22C55E` (metin `#22A366` / `#1B8A55`, yüzey `#E8F8EE`) · Hata `#E05252` (yüzey `#FCE9E9`)
- Turuncu `#FDEBD7`/`#C77A2B` · Mavi `#E0F0FA`/`#2B7AC7` · Mor `#F3E8FA`/`#8A46C7` · Turuncu avatar `#FEF0E8`/`#D97706`
- Overlay `rgba(20,23,42,.45)` · Kart gölgesi (popup) `0 24px 60px rgba(20,23,42,.35)`
- Birincil buton gölgesi `0 6px 14px rgba(79,70,229,.35)`

### Koyu tema
- Arkaplan `#131529` · Kart `#1C1F3A` · Kenarlık `#2B2F52` · Ayraç `#232644` · İç yüzey `#161936`
- Metin `#ECEEFA` · İkincil `#9BA1C7` · Soluk `#6E7398`
- Birincil buton `#6D66F0` · vurgu metin/ikon `#A5A8F5` · seçili yüzey `#2A2D55` (kenarlık `#3B3F73`)
- Başarı `#34D399` (yüzey `rgba(52,211,153,.12)`) · Turuncu avatar `#3A2E1B`/`#E8B36A`
- Overlay `rgba(8,10,22,.55)` · Banner her iki temada `#4F46E5` kalır

### Ölçüler
- Popup kart: genişlik 330px, radius 28, banner 92px, avatar 76px squircle (r26, 4px kart-zemin kenarlığı)
- Tam sayfa: banner 148px (status bar + nav butonları içinde), kimlik kartı radius 24, avatar 84px (r28)
- Ayar/satır kartları radius 24, iç input/chip radius 14, rol chip'leri radius 10
- Aksiyon butonları 44px yüksek (radius 14); ikon kare butonlar 44×44
- Rozet kutuları 28×28 (r10) · durum noktası 18-19px (3px kenarlık) · dokunma hedefleri ≥44px
- İkonlar stroke tabanlı 1.8–2px, round cap/join

---

## EKRANLAR

### 1a — Hızlı profil kartı (kanal bağlamı, arkadaş)
Kanal sohbetinde avatara dokununca açılır.
- **Kart:** 330px, ortada. Banner 92px (kullanıcının banner rengi; yoksa `#4F46E5`).
  Banner sağ üstte 32px üç-nokta butonu (`rgba(255,255,255,.18)`, r12) → bağlam menüsü (1b'deki).
- Avatar 76px squircle, 4px kart-zemin kenarlığı, sağ-alt 18px durum noktası.
- Avatar hizasında sağda **rozet chip'leri** (28px, r10): erken üye (yıldız, lavanta),
  destekçi (şimşek, turuncu), davetçi (kişi+, yeşil) — kullanıcının gerçek rozetleri.
- Ad 19px/800 + @kullanıcıadı 13px ikincil.
- **Durum satırı:** 9px renk noktası + "Çevrimiçi — {durum mesajı}" 12.5px/600, tek satır ellipsis.
- **"{SUNUCU} — ROLLER"** başlığı (10.5px/700, ls .1em) + rol chip'leri: 8px renkli nokta
  + rol adı 12px/700. Roller **yalnızca sunucu bağlamından** açıldığında görünür.
- **Ortak özet satırı** (`#F6F7FB` yüzey, r14): üst üste binen 22px mini sunucu avatarları
  + "N ortak sunucu · M ortak arkadaş" + chevron → tam profildeki ilgili bölüme gider.
- **Butonlar:** "Mesaj" (birincil indigo, flex:1, balon ikonu) + 44px sesli arama + 44px
  görüntülü arama (beyaz kart yüzey, indigo ikon). Altında tam genişlik **"Profili görüntüle"**
  (lavanta yüzey + kenarlık, indigo 13px/700, chevron).
- Sesli/görüntülü arama mevcut DM arama akışını başlatır; Mesaj DM konuşmasını açar/oluşturur.

### 1b — Hızlı profil kartı (DM bağlamı, arkadaş DEĞİL)
- Banner nötr `#6B7194` (arkadaş olmayanlarda kişisel banner gösterilmez).
- Durum: gri nokta + "Çevrimdışı — Son görülme {zaman}" (gizlilik ayarına saygı göster;
  kapalıysa yalnız "Çevrimdışı").
- Rol bölümü YOK (DM bağlamı). Ortak satırı: "1 ortak sunucu · Ortak arkadaş yok".
- **Butonlar:** "Arkadaş ekle" birincil (kişi+ ikonu) + 44px Mesaj kare butonu.
  Arama butonları yok; altta bilgi satırı: "Arkadaş olmadığınız için sesli arama kapalı".
- **Üç-nokta menüsü açık gösterilmiştir** (196px, r16, gölgeli): "Not ekle" (kalem) /
  "Engelle" (kırmızı, yasak ikonu) / "Bildir" (kırmızı, bayrak). Engelle ve Bildir onay
  diyaloğuyla mevcut moderasyon API'sine bağlanır.
- Arkadaş ekle → istek gönderilir, buton "İstek gönderildi" pasif durumuna döner.

### 1c — Tam profil sayfası (arkadaş, açık tema)
- **Banner 148px** (`#4F46E5` veya kullanıcı banner'ı); içinde status bar (beyaz) ve
  nav satırı: 36px geri butonu (sol) + 36px üç-nokta (sağ), `rgba(255,255,255,.18)` r13.
- **Kimlik kartı** (margin `-30px 16px 0`, r24, padding üstü 48px): sol üstte -40px
  taşan 84px avatar (r28, 4px kart kenarlığı, 19px durum noktası); sağ üstte rozet
  chip'leri; ad 20px/800 + @kullanıcıadı; durum satırı; rol chip'leri; buton satırı
  (Mesaj birincil + sesli + görüntülü — 1a ile aynı ölçüler).
- **HAKKINDA kartı:** bio 13.5px/1.5; ayraç; takvim ikonu + "{Ay Yıl}'te Whispr'a katıldı";
  grid ikonu + "{Ay Yıl}'te {sunucu}'ya katıldı" (sunucu bağlamından gelindiyse).
- **NOT kartı:** `#F6F7FB` input görünümü, kalem ikonu + "Not ekle (yalnız sana görünür)"
  placeholder; not varsa metni gösterir. Dokununca 2b sheet'i açılır.
- **ORTAK SUNUCULAR — N** kartı + sağda "Tümünü gör": satır = 40px squircle sunucu
  avatarı + ad 14px/700 + "{üye} üye · {karşı tarafın rolü}" + chevron. Satır o sunucuya gider.
- **ORTAK ARKADAŞLAR — N** kartı + "Tümünü gör": üst üste binen 30px avatarlar (+X
  taşma rozeti) + "isim, isim ve N kişi daha".
- **PAYLAŞILAN MEDYA — N** kartı + "Tümünü gör" → 2d galerisi. 3'lü kare önizleme
  (r14); gerçek DM medyası thumbnail olarak yüklenir. Sayfa dikey scroll eder.
- Arkadaş olmayan kullanıcıda: butonlar 1b setine döner; roller/medya yalnızca izin
  verilen veriyle.

### 1d — Kendi profilin (popup)
- Kanalda/üye listesinde kendi avatarına dokununca aynı kart açılır.
- Banner sağ üstte **"Düzenle" chip'i** (kalem + metin, `rgba(255,255,255,.18)`) → 2a.
- Rozetler kendi rozetlerin. Ad + @kullanıcıadı.
- **Durum seçici satırı** (`#F6F7FB`, r14): yeşil nokta + "Çevrimiçi" + aşağı chevron → 2c sheet'i.
- **"Durum mesajı ekle"** kesikli satır (1.5px dashed `#DDE0EE`, artı ikonu) → durum mesajı girişi.
- Butonlar: "Profili düzenle" birincil + "Profili görüntüle" ikincil.

### 1e / 1f — Koyu tema
1a ve 1c'nin koyu eşlenikleri; koyu token tablosu birebir uygulanır. Kart zemin
`#1C1F3A` + `#2B2F52` kenarlık; avatar kenarlığı kart zeminine döner; iç yüzeyler
`#161936`; seçili/lavanta yüzeyler `#2A2D55`/`#3B3F73`; birincil buton `#6D66F0`;
"Profili görüntüle" metni `#A5A8F5`. **Tüm ekranların** (1a–2d) koyu karşılığı bu
setle uygulanır; 1e/1f referans örneklerdir.

### 2a — Profili düzenle
- Başlık satırı: 36px geri butonu + "Profili düzenle" 17px/800 + sağda **"Kaydet"**
  birincil chip (9×16 padding, r12). Kaydet yalnızca değişiklik varken aktif.
- **Önizleme kartı:** banner 88px + sağ üstte 34px kamera butonu (banner görseli seç);
  avatar 76px + sağ-alt 28px indigo kamera rozeti (3px beyaz kenarlık) → foto seç/çek.
  Altında **BANNER RENGİ**: 34px renk daireleri (`#4F46E5` seçili — 2px beyaz + 2px
  indigo halka, `#22A366`, `#C77A2B`, `#8A46C7`, `#1E2235`). Görsel banner seçiliyse
  renk seçimi pasifleşir.
- **Form kartı:** GÖRÜNEN AD input · KULLANICI ADI (kilit ikonu, altında "Kullanıcı adı
  30 günde bir değiştirilebilir" 11px) · HAKKINDA textarea + sağ-alt karakter sayacı
  "62/190". Input'lar: `#F6F7FB` zemin, `#E7E9F4` kenarlık, r14, 11×14 padding, 14px/600.
- **DURUM MESAJI kartı:** emoji + metin + temizle (×) butonu; altında "4 saat sonra
  otomatik temizlenir" (kullanıcının seçtiği süre).
- Altta bilgi: "Profilin tüm sunucularda aynı görünür".
- Kullanıcı adı benzersizlik kontrolü gerçek API ile; hata durumu input altında kırmızı metin.

### 2b — Not yazma
- 1c'deki NOT kartına dokununca açılır: %45 overlay + **alt sheet** (r28 üst köşeler,
  tutamaç 44×5px) klavyenin üstüne oturur.
- Başlık "Not — {kullanıcı}" 16px/800 + sağda "Kaydet" (indigo 13px/700, boşken pasif).
- **Textarea:** `#F6F7FB` zemin, odak durumunda `1.5px #4F46E5` kenarlık + `0 0 0 3px
  rgba(79,70,229,.12)` halka; sağ-alt sayaç "49/256".
- Altında kilit ikonu + "Yalnız sana görünür — {kullanıcı} bunu göremez" 11.5px.
- Klavye mock'ta çizilidir; gerçek uygulamada native klavye kullanılır (sheet klavye
  yüksekliğine göre yukarı iter). Kaydet → not API'sine yazar, 1c'deki NOT kartı güncellenir.

### 2c — Durum seçici (bottom sheet)
- 1d'deki durum satırından açılır. Overlay + beyaz sheet (üst r28), tutamaç, başlık
  "Durum" 19px/800.
- Satırlar (36px ikon kutusu r13 + etiket 15px + varsa alt metin 11.5px):
  - **Çevrimiçi** — yeşil dolu nokta; seçiliyse satır lavanta zemin + `#DFE2FC` kenarlık
    r16, etiket indigo 700, sağda indigo check.
  - **Boşta** — turuncu ay ikonu.
  - **Rahatsız etmeyin** — kırmızı eksi-daire; alt metin "Tüm bildirimler susturulur".
  - **Görünmez** — içi boş gri halka; alt metin "Çevrimdışı görünürsün, her şeyi kullanabilirsin".
- Ayraç; **"Durum mesajı ekle"** satırı (kalem, lavanta kutu) + mevcut durum mesajı
  önizlemesi + chevron.
- Seçim anında gerçek presence'a yazılır ve sheet kapanır.

### 2d — Paylaşılan medya galerisi
- 1c "Tümünü gör"den açılır. Başlık: geri butonu + "Paylaşılan medya" 17px/800 +
  "{kullanıcı} ile · N öğe" 12px.
- **Segment chip'leri:** Medya (aktif: koyu `#1E2235` zemin, beyaz 700) / Dosyalar /
  Bağlantılar — gerçek sekme davranışı.
- **Ay başlıkları** (11.5px/700, ls .12em): "TEMMUZ 2026" vb. gerçek tarihlerden.
- **3 sütun grid** (6px gap, r14 kare thumbnail'ler); videolarda sağ-alt süre rozeti
  (`rgba(30,34,53,.75)` hap, 10px/700 beyaz). Thumbnail'ler gerçek DM medyasından;
  dokununca lightbox açılır. Sonsuz scroll / sayfalama gerçek geçmişle.
- Dosyalar sekmesi: dosya ikonu + ad + boyut satırları; Bağlantılar: link önizleme satırları.

---

## ETKİLEŞİM ÖZETİ

- Avatar/isim dokunuşu (kanal mesajı, üye listesi, DM başlığı, tepki listesi…) → hızlı
  profil kartı. Overlay dokunuşu veya aşağı kaydırma → kapanır.
- Kart açılışı ~200ms scale(.96→1)+fade; sheet'ler alttan yay (~250–300ms ease-out).
- "Profili görüntüle" → tam sayfa (push). Tam sayfadaki geri → kaynağa döner.
- Üç-nokta → Not ekle / Engelle / Bildir. Engelle onay diyaloğu; engellenince kart
  kapanır, DM listesi güncellenir.
- Kendi avatarın → 1d; Düzenle → 2a; durum satırı → 2c.
- Derin bağlantı: `whispr://user/{id}` profili açar.

## DURUMLAR (her ekran için zorunlu)

- **Loading:** kart/sheet iskeleti — gerçek satır geometrisiyle aynı boyutta, hafif parlama.
- **Empty:** ortak sunucu yoksa satır gizlenir; medya yoksa "Henüz paylaşılan medya yok";
  bio yoksa HAKKINDA yalnız katılım tarihlerini gösterir.
- **Error / çevrimdışı:** kart içinde ince uyarı + yeniden dene; profil yüklenemezse
  kart "Profil yüklenemedi" durumuyla açık kalır.
- **Engellenmiş kullanıcı:** kart kısıtlı görünür (avatar + ad + "Engeli kaldır").

## KABUL KRİTERLERİ

1. Avatar dokunuşu her bağlamda (kanal, DM, üye listesi, tepki sheet'i) aynı kartı açıyor.
2. Kanal bağlamında roller görünür, DM bağlamında görünmez; arkadaş/arkadaş-değil
   buton setleri spec'e uygun.
3. Not yalnızca yazana görünür, kalıcı ve 1c–2b arasında senkron.
4. Durum seçimi gerçek presence'a yazıyor; tüm ekranlarda anında güncelleniyor.
5. Profil düzenleme alanları gerçek API'ye bağlı; kullanıcı adı kuralı uygulanıyor.
6. Açık/koyu tema piksel uyumlu; hiçbir ekranda hardcode veri yok.
7. Tüm dokunma hedefleri ≥44px; metinler ellipsis'leniyor; 390pt genişlikte referans
   mock ile birebir örtüşüyor.
8. Her ekran bittiğinde 390×844'te çalıştırıp ilgili `screenshots/*.png` ve HTML
   referansıyla yan yana karşılaştır; fark varsa düzelt. "Yaklaşık aynı" kabul edilmez.

## ÖNERİLER (görsel sonucu değiştirmeden)

1. Ortak bileşenler: ProfileCard, BadgeChip, RoleChip, MutualRow, ActionButtonRow,
   StatusDot, NoteSheet, StatusPickerSheet, MediaGrid. Mobile Redesign paketindeki
   Avatar/BottomSheet/SegmentChip bileşenleriyle aynı ölçüler paylaşılır.
2. Rozet ve rol renkleri id'den deterministik türetilsin (aynı rol her yerde aynı renk).
3. Hızlı kart verisi cache'lensin: kart anında iskeletle açılır, veri geldiğinde doldurulur.
4. Erişilebilirlik: kart `role="dialog"`, odak tuzağı; tüm ikon butonlara etiket.
5. Haptik: arkadaş ekle, engelle ve durum değişiminde hafif geri bildirim.
